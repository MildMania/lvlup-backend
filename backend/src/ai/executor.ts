import prisma from '../prisma';
import { AnalyticsDataSource, Breakdown, ExecutorOutput, Granularity, Metric, PlannerOutput } from './types';

type MetricSource = {
  table: 'monetization_daily_rollups' | 'active_users_daily' | 'cohort_retention_daily';
  dateColumn: 'date' | 'installDate';
  valueExpr: string;
  extraWhere?: string;
};

const toUtcDate = (date: Date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const formatDate = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString().slice(0, 10);
};

const truncUnit = (granularity: Granularity) => (granularity === 'week' ? 'week' : 'day');

const metricSource = (metric: Metric): MetricSource => {
  switch (metric) {
    case 'revenue':
      return {
        table: 'monetization_daily_rollups',
        dateColumn: 'date',
        valueExpr: 'SUM("totalRevenueUsd")::double precision'
      };
    case 'dau':
      return {
        table: 'active_users_daily',
        dateColumn: 'date',
        valueExpr: 'SUM("dau")::double precision'
      };
    case 'installs':
      return {
        table: 'cohort_retention_daily',
        dateColumn: 'installDate',
        valueExpr: 'SUM("cohortSize")::double precision',
        extraWhere: 'AND "dayIndex" = 0'
      };
    case 'd1_retention':
      return {
        table: 'cohort_retention_daily',
        dateColumn: 'installDate',
        valueExpr:
          'CASE WHEN SUM("cohortSize") = 0 THEN 0 ELSE (SUM("retainedUsers")::double precision / NULLIF(SUM("cohortSize"), 0)) * 100 END',
        extraWhere: 'AND "dayIndex" = 1'
      };
    case 'd7_retention':
      return {
        table: 'cohort_retention_daily',
        dateColumn: 'installDate',
        valueExpr:
          'CASE WHEN SUM("cohortSize") = 0 THEN 0 ELSE (SUM("retainedUsers")::double precision / NULLIF(SUM("cohortSize"), 0)) * 100 END',
        extraWhere: 'AND "dayIndex" = 7'
      };
    case 'arpdau':
      // handled in dedicated query
      return {
        table: 'active_users_daily',
        dateColumn: 'date',
        valueExpr: '0'
      };
  }
};

const breakdownColumn = (breakdown: Breakdown): 'countryCode' | 'platform' => {
  if (breakdown === 'country') {
    return 'countryCode';
  }
  return 'platform';
};

class PrismaAnalyticsDataSource implements AnalyticsDataSource {
  async fetchMetricTimeseries(params: {
    tenantId: string;
    metric: Metric;
    startDate: Date;
    endDate: Date;
    granularity: Granularity;
    breakdowns: Breakdown[];
  }): Promise<Array<Record<string, string | number>>> {
    if (params.metric === 'arpdau') {
      return this.fetchArpdauTimeseries(params);
    }

    if (params.metric === 'revenue' && params.breakdowns.length > 0) {
      return this.fetchRevenueByDauShare(params);
    }

    const source = metricSource(params.metric);
    const unit = truncUnit(params.granularity);
    const dateExpr = `date_trunc('${unit}', "${source.dateColumn}")::date`;

    const breakdownSelect = params.breakdowns
      .map((b) => `"${breakdownColumn(b)}" AS "${b}"`)
      .join(', ');
    const breakdownGroup = params.breakdowns
      .map((b) => `"${breakdownColumn(b)}"`)
      .join(', ');

    const selectParts = [
      `${dateExpr} AS "date"`,
      `${source.valueExpr} AS "value"`,
      breakdownSelect
    ]
      .filter(Boolean)
      .join(', ');

    const groupByParts = [dateExpr, breakdownGroup].filter(Boolean).join(', ');

    const sql = `
      SELECT ${selectParts}
      FROM "${source.table}"
      WHERE "gameId" = $1
        AND "${source.dateColumn}" >= $2
        AND "${source.dateColumn}" <= $3
        ${source.extraWhere || ''}
      GROUP BY ${groupByParts}
      ORDER BY ${groupByParts}
    `;

    return prisma.$queryRawUnsafe<Array<Record<string, string | number>>>(
      sql,
      params.tenantId,
      params.startDate,
      params.endDate
    );
  }

  private async fetchArpdauTimeseries(params: {
    tenantId: string;
    startDate: Date;
    endDate: Date;
    granularity: Granularity;
  }): Promise<Array<Record<string, string | number>>> {
    const unit = truncUnit(params.granularity);
    const dateExpr = `date_trunc('${unit}', "date")::date`;

    const sql = `
      WITH revenue AS (
        SELECT ${dateExpr} AS "date", SUM("totalRevenueUsd")::double precision AS revenue
        FROM "monetization_daily_rollups"
        WHERE "gameId" = $1
          AND "date" >= $2
          AND "date" <= $3
        GROUP BY ${dateExpr}
      ), dau AS (
        SELECT ${dateExpr} AS "date", SUM("dau")::double precision AS dau
        FROM "active_users_daily"
        WHERE "gameId" = $1
          AND "date" >= $2
          AND "date" <= $3
        GROUP BY ${dateExpr}
      )
      SELECT revenue."date" AS "date",
             CASE WHEN dau.dau = 0 THEN 0 ELSE revenue.revenue / dau.dau END AS "value"
      FROM revenue
      JOIN dau ON revenue."date" = dau."date"
      ORDER BY revenue."date"
    `;

    return prisma.$queryRawUnsafe<Array<Record<string, string | number>>>(
      sql,
      params.tenantId,
      params.startDate,
      params.endDate
    );
  }

  private async fetchRevenueByDauShare(params: {
    tenantId: string;
    startDate: Date;
    endDate: Date;
    granularity: Granularity;
    breakdowns: Breakdown[];
  }): Promise<Array<Record<string, string | number>>> {
    const unit = truncUnit(params.granularity);
    const dateExpr = `date_trunc('${unit}', "date")::date`;

    const breakdownSelect = params.breakdowns
      .map((b) => `"${breakdownColumn(b)}" AS "${b}"`)
      .join(', ');
    const dauBreakdownGroup = params.breakdowns
      .map((b) => `"${breakdownColumn(b)}"`)
      .join(', ');

    const dauBreakdownSelectPart = breakdownSelect ? `, ${breakdownSelect}` : '';
    const dauBreakdownGroupPart = dauBreakdownGroup ? `, ${dauBreakdownGroup}` : '';
    const finalBreakdownPart = breakdownSelect ? `${breakdownSelect},` : '';

    const sql = `
      WITH revenue AS (
        SELECT ${dateExpr} AS "date", SUM("totalRevenueUsd")::double precision AS revenue
        FROM "monetization_daily_rollups"
        WHERE "gameId" = $1
          AND "date" >= $2
          AND "date" <= $3
        GROUP BY ${dateExpr}
      ), dau AS (
        SELECT ${dateExpr} AS "date"${dauBreakdownSelectPart}, SUM("dau")::double precision AS dau
        FROM "active_users_daily"
        WHERE "gameId" = $1
          AND "date" >= $2
          AND "date" <= $3
        GROUP BY ${dateExpr}${dauBreakdownGroupPart}
      ), dau_totals AS (
        SELECT "date", SUM(dau) AS total_dau
        FROM dau
        GROUP BY "date"
      )
      SELECT dau."date" AS "date",
             ${finalBreakdownPart}
             CASE WHEN dau_totals.total_dau = 0
                  THEN 0
                  ELSE revenue.revenue * (dau.dau / dau_totals.total_dau)
             END AS "value"
      FROM dau
      JOIN revenue ON revenue."date" = dau."date"
      JOIN dau_totals ON dau_totals."date" = dau."date"
      ORDER BY dau."date"
    `;

    return prisma.$queryRawUnsafe<Array<Record<string, string | number>>>(
      sql,
      params.tenantId,
      params.startDate,
      params.endDate
    );
  }
}

const aggregateValue = (metric: Metric, values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  if (metric === 'd1_retention' || metric === 'd7_retention' || metric === 'arpdau') {
    const sum = values.reduce((acc, value) => acc + value, 0);
    return sum / values.length;
  }

  return values.reduce((acc, value) => acc + value, 0);
};

const summarizeTimeseries = (metric: Metric, rows: Array<{ date: string; value: number }>) => {
  return aggregateValue(
    metric,
    rows.map((row) => row.value)
  );
};

const buildBreakdownTable = (
  metric: Metric,
  breakdowns: Breakdown[],
  rows: Array<Record<string, string | number>>
) => {
  if (breakdowns.length === 0) {
    return [];
  }

  const keyForRow = (row: Record<string, string | number>) =>
    breakdowns.map((breakdown) => String(row[breakdown] ?? '')).join('|');

  const buckets = new Map<string, { key: Record<string, string | number>; values: number[] }>();

  for (const row of rows) {
    const key = keyForRow(row);
    if (!buckets.has(key)) {
      const keyFields: Record<string, string | number> = {};
      for (const breakdown of breakdowns) {
        keyFields[breakdown] = row[breakdown] ?? '';
      }
      buckets.set(key, { key: keyFields, values: [] });
    }

    const bucket = buckets.get(key)!;
    bucket.values.push(Number(row.value || 0));
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket.key,
      value: aggregateValue(metric, bucket.values)
    }))
    .sort((a, b) => Number(b.value) - Number(a.value));
};

const computeAttribution = (
  breakdowns: Breakdown[],
  current: Array<Record<string, string | number>>,
  previous: Array<Record<string, string | number>>
) => {
  if (breakdowns.length === 0) {
    return [];
  }

  const keyForRow = (row: Record<string, string | number>) =>
    breakdowns.map((breakdown) => String(row[breakdown] ?? '')).join('|');

  const previousMap = new Map<string, number>();
  for (const row of previous) {
    previousMap.set(keyForRow(row), Number(row.value || 0));
  }

  const results: Array<Record<string, string | number>> = [];
  for (const row of current) {
    const key = keyForRow(row);
    const previousValue = previousMap.get(key) || 0;
    const currentValue = Number(row.value || 0);

    const entry: Record<string, string | number> = {
      current: currentValue,
      previous: previousValue,
      delta: currentValue - previousValue
    };

    for (const breakdown of breakdowns) {
      entry[breakdown] = row[breakdown] ?? '';
    }

    results.push(entry);
  }

  return results.sort((a, b) => Math.abs(Number(b.delta)) - Math.abs(Number(a.delta)));
};

export class AnalyticsExecutor {
  private dataSource: AnalyticsDataSource;

  constructor(dataSource: AnalyticsDataSource = new PrismaAnalyticsDataSource()) {
    this.dataSource = dataSource;
  }

  async execute(question: string, tenantId: string, plan: PlannerOutput): Promise<ExecutorOutput> {
    const now = toUtcDate(new Date());
    const endDate = now;
    const startDate = addDays(endDate, -(plan.time_range.n - 1));

    const baseParams = {
      tenantId,
      metric: plan.metric,
      granularity: plan.granularity,
      startDate,
      endDate
    };

    const timeseriesRows = await this.dataSource.fetchMetricTimeseries({
      ...baseParams,
      breakdowns: []
    });

    const breakdownRows = plan.breakdowns.length
      ? await this.dataSource.fetchMetricTimeseries({
          ...baseParams,
          breakdowns: plan.breakdowns
        })
      : [];

    const timeseries: Array<{ date: string; value: number }> = timeseriesRows.map((row) => ({
      date: formatDate(row.date),
      value: Number(row.value || 0)
    }));

    const summaryValue = summarizeTimeseries(plan.metric, timeseries);

    let previous: number | null = null;
    let change: number | null = null;
    let changePct: number | null = null;
    let attribution: Array<Record<string, string | number>> = [];

    if (plan.comparison.type === 'previous_period') {
      const previousEndDate = addDays(startDate, -1);
      const previousStartDate = addDays(previousEndDate, -(plan.time_range.n - 1));

      const previousTimeseriesRows = await this.dataSource.fetchMetricTimeseries({
        ...baseParams,
        startDate: previousStartDate,
        endDate: previousEndDate,
        breakdowns: []
      });

      const previousTimeseries: Array<{ date: string; value: number }> = previousTimeseriesRows.map(
        (row) => ({
          date: formatDate(row.date),
          value: Number(row.value || 0)
        })
      );

      previous = summarizeTimeseries(plan.metric, previousTimeseries);
      change = summaryValue - previous;
      changePct = previous === 0 ? null : Number(((change / previous) * 100).toFixed(2));

      if (plan.breakdowns.length > 0) {
        const previousBreakdownRows = await this.dataSource.fetchMetricTimeseries({
          ...baseParams,
          startDate: previousStartDate,
          endDate: previousEndDate,
          breakdowns: plan.breakdowns
        });

        const currentTable = buildBreakdownTable(plan.metric, plan.breakdowns, breakdownRows);
        const previousTable = buildBreakdownTable(plan.metric, plan.breakdowns, previousBreakdownRows);
        attribution = computeAttribution(plan.breakdowns, currentTable, previousTable);
      }
    }

    const breakdownTable = buildBreakdownTable(plan.metric, plan.breakdowns, breakdownRows);

    return {
      question,
      context: {
        tenant_id: tenantId,
        plan
      },
      summary: {
        value: Number(summaryValue.toFixed(2)),
        previous,
        change,
        changePct
      },
      timeseries,
      breakdown_table: breakdownTable,
      attribution,
      confidence: plan.breakdowns.length > 0 && attribution.length === 0 ? 'low' : 'high',
      response_mode: plan.response_mode
    };
  }
}
