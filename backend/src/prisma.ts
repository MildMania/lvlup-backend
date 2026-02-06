import { Prisma, PrismaClient } from '@prisma/client';
import logger from './utils/logger';

/**
 * Singleton Prisma Client instance to prevent connection pool exhaustion
 * 
 * IMPORTANT: Always import prisma from this file, never create new PrismaClient() instances
 * 
 * Connection pool configuration:
 * - connection_limit: Controls max connections to database
 * - pool_timeout: How long to wait for a connection before timing out (default: 10s)
 * 
 * For PostgreSQL in production, add these params to DATABASE_URL:
 * postgresql://user:pass@host:port/db?connection_limit=10&pool_timeout=20&connect_timeout=10
 */

// Add connection pool limits if not already present (safety mechanism)
function ensureConnectionLimits(databaseUrl: string): string {
  if (!databaseUrl) {
    logger.error('DATABASE_URL is not set');
    return databaseUrl;
  }

  // Check if connection limits are already configured
  if (databaseUrl.includes('connection_limit')) {
    logger.info('Database connection limits already configured');
    return databaseUrl;
  }

  // Add connection limits to the URL
  try {
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '10');
    url.searchParams.set('pool_timeout', '20');
    url.searchParams.set('connect_timeout', '10');
    
    const updatedUrl = url.toString();
    logger.info('Added connection pool limits to DATABASE_URL');
    return updatedUrl;
  } catch (error) {
    logger.error('Failed to parse DATABASE_URL, using as-is:', error);
    return databaseUrl;
  }
}

// Apply connection limits
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = ensureConnectionLimits(process.env.DATABASE_URL);
}

// Prevent multiple instances in hot-reload scenarios (development)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const enableAnalyticsTrace = process.env.ANALYTICS_TRACE === '1' || process.env.ANALYTICS_TRACE === 'true';

const prismaLogConfig: Prisma.LogDefinition[] = [
  { level: 'warn', emit: 'event' },
  { level: 'error', emit: 'event' },
  ...(enableAnalyticsTrace ? [{ level: 'query', emit: 'event' } as Prisma.LogDefinition] : []),
];

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: prismaLogConfig,
  });

// Log Prisma warnings and errors
(prisma as any).$on('warn', (e: any) => {
  logger.warn('Prisma warning:', e);
});

(prisma as any).$on('error', (e: any) => {
  logger.error('Prisma error:', e);
});

if (enableAnalyticsTrace) {
  const slowMs = Number(process.env.ANALYTICS_TRACE_SLOW_MS || 300);
  (prisma as any).$on('query', (e: any) => {
    if (typeof e?.duration === 'number' && e.duration < slowMs) {
      return;
    }
    logger.warn('[AnalyticsTrace] Slow query', {
      durationMs: e.duration,
      query: e.query,
    });
  });
}

// Store in global for hot-reload in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, closing Prisma connection...`);
  try {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error disconnecting Prisma client:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Prisma client disconnected on beforeExit');
});

export default prisma;
