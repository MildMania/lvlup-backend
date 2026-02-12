import prisma from '../prisma';
import logger from '../utils/logger';

type FxApiResponse = {
  success?: boolean;
  base?: string;
  rates?: Record<string, number>;
};

export class FxRateService {
  private cache = new Map<string, number>();
  private readonly baseUrl: string;
  private readonly sourceName: string;

  constructor() {
    this.baseUrl = (process.env.FX_RATES_API_BASE_URL || 'https://api.exchangerate.host').replace(/\/+$/, '');
    this.sourceName = process.env.FX_RATES_SOURCE_NAME || 'exchangerate.host';
  }

  async getRateToUsd(currency: string, atDate: Date): Promise<number | null> {
    const code = currency.toUpperCase().trim();
    if (!code) return null;
    if (code === 'USD') return 1;

    const date = new Date(atDate);
    date.setUTCHours(0, 0, 0, 0);
    const dateKey = date.toISOString().split('T')[0] || '';
    const cacheKey = `${code}|${dateKey}`;

    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const exact = await prisma.fxRateDaily.findUnique({
      where: {
        unique_fx_rate_daily: {
          date,
          currency: code
        }
      },
      select: { rateToUsd: true }
    });
    if (exact?.rateToUsd) {
      this.cache.set(cacheKey, exact.rateToUsd);
      return exact.rateToUsd;
    }

    const backfillOnMiss = process.env.FX_RATES_SYNC_ON_MISS !== '0';
    if (backfillOnMiss) {
      await this.syncDate(date);
      const synced = await prisma.fxRateDaily.findUnique({
        where: {
          unique_fx_rate_daily: {
            date,
            currency: code
          }
        },
        select: { rateToUsd: true }
      });
      if (synced?.rateToUsd) {
        this.cache.set(cacheKey, synced.rateToUsd);
        return synced.rateToUsd;
      }
    }

    const prior = await prisma.fxRateDaily.findFirst({
      where: { currency: code, date: { lte: date } },
      orderBy: { date: 'desc' },
      select: { rateToUsd: true, date: true }
    });
    if (prior?.rateToUsd) {
      this.cache.set(cacheKey, prior.rateToUsd);
      logger.warn(`[FX] Using fallback prior-day rate for ${code} on ${dateKey}`);
      return prior.rateToUsd;
    }

    return null;
  }

  async syncToday(): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return this.syncDate(today);
  }

  async syncDate(date: Date): Promise<number> {
    const target = new Date(date);
    target.setUTCHours(0, 0, 0, 0);
    const day = target.toISOString().split('T')[0];
    if (!day) return 0;

    const url = `${this.baseUrl}/${day}?base=USD`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        logger.warn(`[FX] Failed to fetch rates for ${day}: HTTP ${response.status}`);
        return 0;
      }

      const data = (await response.json()) as FxApiResponse;
      if (!data?.rates || typeof data.rates !== 'object') {
        logger.warn(`[FX] Invalid rates payload for ${day}`);
        return 0;
      }

      const rows: Array<{ date: Date; currency: string; rateToUsd: number; source: string }> = [];
      rows.push({ date: target, currency: 'USD', rateToUsd: 1, source: this.sourceName });

      for (const [currency, usdToCurrency] of Object.entries(data.rates)) {
        const code = currency.toUpperCase().trim();
        if (!code || code === 'USD') continue;
        if (!usdToCurrency || usdToCurrency <= 0) continue;

        const rateToUsd = 1 / usdToCurrency;
        rows.push({ date: target, currency: code, rateToUsd, source: this.sourceName });
      }

      if (!rows.length) return 0;

      await prisma.$transaction(
        rows.map((row) =>
          prisma.fxRateDaily.upsert({
            where: {
              unique_fx_rate_daily: {
                date: row.date,
                currency: row.currency
              }
            },
            create: row,
            update: {
              rateToUsd: row.rateToUsd,
              source: row.source
            }
          })
        )
      );

      for (const row of rows) {
        const key = `${row.currency}|${day}`;
        this.cache.set(key, row.rateToUsd);
      }

      logger.info(`[FX] Synced ${rows.length} FX rates for ${day}`);
      return rows.length;
    } catch (error) {
      logger.warn(`[FX] Error syncing rates for ${day}`, error);
      return 0;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default new FxRateService();
