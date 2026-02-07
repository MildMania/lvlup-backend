import logger from './logger';

function isEnabled(value?: string): boolean {
  return value === '1' || value === 'true';
}

export function isAnalyticsMemoryLogEnabled(): boolean {
  return isEnabled(process.env.ANALYTICS_MEMORY_LOG);
}

export function logAnalyticsMetrics(message: string, meta?: Record<string, unknown>): void {
  if (!isAnalyticsMemoryLogEnabled()) {
    return;
  }

  if (meta) {
    logger.warn(message, meta);
    return;
  }

  logger.warn(message);
}
