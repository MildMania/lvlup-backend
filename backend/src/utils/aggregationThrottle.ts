import logger from './logger';

const forceGc =
  process.env.AGGREGATION_FORCE_GC === '1' ||
  process.env.AGGREGATION_FORCE_GC === 'true';

const pauseMs = Math.max(0, Number(process.env.AGGREGATION_PAUSE_MS || 0));

let gcCapabilityLogged = false;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Optional memory-pressure relief hook for long-running aggregation loops.
 * - AGGREGATION_FORCE_GC=1: call global.gc() if available (requires --expose-gc)
 * - AGGREGATION_PAUSE_MS=N: sleep N ms between iterations to reduce resource spikes
 */
export async function maybeThrottleAggregation(context: string): Promise<void> {
  if (forceGc) {
    const gcFn = (global as any).gc;
    if (typeof gcFn === 'function') {
      gcFn();
    } else if (!gcCapabilityLogged) {
      gcCapabilityLogged = true;
      logger.warn(
        '[AggregationThrottle] AGGREGATION_FORCE_GC enabled but global.gc is unavailable (start node with --expose-gc to enable)'
      );
    }
  }

  if (pauseMs > 0) {
    logger.debug(`[AggregationThrottle] pausing ${pauseMs}ms (${context})`);
    await sleep(pauseMs);
  }
}

