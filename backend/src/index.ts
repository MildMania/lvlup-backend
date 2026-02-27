import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import apiRoutes from './routes';
import logger from './utils/logger';
import prismaInstance from './prisma';
import { sessionHeartbeatService } from './services/SessionHeartbeatService';
import dataRetentionService from './services/DataRetentionService';
import { startLevelMetricsAggregationJob, startLevelMetricsHourlyTodayJob } from './jobs/levelMetricsAggregation';
import { startActiveUsersAggregationJob, startActiveUsersHourlyTodayJob } from './jobs/activeUsersAggregation';
import { startCohortAggregationJob, startCohortHourlyTodayJob } from './jobs/cohortAggregation';
import { startMonetizationAggregationJob, startMonetizationHourlyTodayJob } from './jobs/monetizationAggregation';
import { startFxRatesSyncJob } from './jobs/fxRatesSync';
import { eventBatchWriter } from './services/EventBatchWriter';
import { revenueBatchWriter } from './services/RevenueBatchWriter';
import { sessionHeartbeatBatchWriter } from './services/SessionHeartbeatBatchWriter';

const runApi = process.env.RUN_API !== 'false';
const runJobs = process.env.RUN_JOBS !== 'false';
const enableLevelMetricsHourlyJob = process.env.ENABLE_LEVEL_METRICS_HOURLY === '1' || process.env.ENABLE_LEVEL_METRICS_HOURLY === 'true';
const enableActiveUsersHourlyJob = process.env.ENABLE_ACTIVE_USERS_HOURLY === '1' || process.env.ENABLE_ACTIVE_USERS_HOURLY === 'true';
const enableCohortHourlyJob = process.env.ENABLE_COHORT_HOURLY === '1' || process.env.ENABLE_COHORT_HOURLY === 'true';
const enableMonetizationHourlyJob = process.env.ENABLE_MONETIZATION_HOURLY === '1' || process.env.ENABLE_MONETIZATION_HOURLY === 'true';

// In worker-only mode, keep externally provided env (e.g. PM2/.worker.env) ahead of .env.
// In other modes, keep prior behavior where .env overrides inherited shell vars.
dotenv.config({ override: !(runJobs && !runApi) });

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '2mb';

let apiStarted = false;
let jobsStarted = false;

if (!runApi && !runJobs) {
    logger.error('Invalid runtime configuration: RUN_API and RUN_JOBS are both false');
    process.exit(1);
}

// Apply middleware
const allowedOrigins = [
    'http://localhost:5173', // Local development (Vite default)
    'http://localhost:5174', // Alternative local port
    'https://lvlup.mildmania.com', // Production frontend
    process.env.FRONTEND_URL, // Additional custom origin from env
].filter(Boolean); // Remove undefined values

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true, // Allow cookies
}));
app.use(helmet());
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use(cookieParser());

const enableHttpAccessLog =
    process.env.HTTP_ACCESS_LOG === '1' ||
    process.env.HTTP_ACCESS_LOG === 'true' ||
    process.env.NODE_ENV !== 'production';

if (enableHttpAccessLog) {
    app.use(morgan('combined'));
} else {
    // In production, log only error responses unless explicitly enabled
    app.use(
        morgan('combined', {
            skip: (_req, res) => res.statusCode < 400
        })
    );
}

if (process.env.ANALYTICS_TRACE === '1' || process.env.ANALYTICS_TRACE === 'true') {
    app.use((req, res, next) => {
        const path = req.path;
        const isHeavyAnalytics =
            req.method === 'GET' &&
            (path.startsWith('/api/analytics/summary') ||
                path.startsWith('/api/analytics/level-funnel') ||
                path.startsWith('/api/analytics/cohort') ||
                path.startsWith('/api/analytics/metrics'));

        if (!isHeavyAnalytics) {
            return next();
        }

        const start = Date.now();
        const memStart = process.memoryUsage();
        const rssStart = memStart.rss;
        const heapStart = memStart.heapUsed;

        res.on('finish', () => {
            const memEnd = process.memoryUsage();
            const rssEnd = memEnd.rss;
            const heapEnd = memEnd.heapUsed;
            logger.warn('[AnalyticsTrace] request', {
                method: req.method,
                path: req.originalUrl,
                status: res.statusCode,
                durationMs: Date.now() - start,
                rssStart,
                rssEnd,
                heapStart,
                heapEnd,
                rssDelta: rssEnd - rssStart,
                heapDelta: heapEnd - heapStart,
            });
        });

        next();
    });
}

// Health check endpoint for Railway (root level)
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Memory metrics endpoint for monitoring
app.get('/api/metrics', async (_req: Request, res: Response) => {
    try {
        const memUsage = process.memoryUsage();
        
        // Get database connection count (PostgreSQL only)
        let dbConnections: any = null;
        try {
            if (process.env.DATABASE_URL?.includes('postgresql')) {
                const result = await prismaInstance.$queryRaw`
                    SELECT count(*) as count 
                    FROM pg_stat_activity 
                    WHERE datname = current_database()
                `;
                dbConnections = result;
            }
        } catch (error) {
            logger.debug('Could not fetch DB connections:', error);
        }
        
        res.json({
            timestamp: new Date().toISOString(),
            memory: {
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
                arrayBuffers: `${Math.round(memUsage.arrayBuffers / 1024 / 1024)}MB`,
            },
            uptime: `${Math.round(process.uptime() / 60)} minutes`,
            dbConnections: dbConnections,
            batchWriters: {
                events: eventBatchWriter.getMetrics(),
                revenue: revenueBatchWriter.getMetrics(),
                heartbeats: sessionHeartbeatBatchWriter.getMetrics(),
            },
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version,
        });
    } catch (error) {
        logger.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// Root endpoint - API info
app.get('/', (_req: Request, res: Response) => {
    res.send(`
        <h1>LvlUp Backend API</h1>
        <p>Version: 1.0.0</p>
        <p>Health: <a href="/health">/health</a></p>
        <p>Metrics: <a href="/api/metrics">/api/metrics</a></p>
        <p>API Documentation: <a href="/docs">View Docs</a></p>
    `);
});

// Debug endpoint to see all registered routes
app.get('/debug/routes', (_req, res) => {
    // Instead of trying to extract routes from Express internals, 
    // let's manually enumerate our known routes for clarity

    // Root routes
    const rootRoutes = [
        { path: "/", methods: "GET" },
        { path: "/debug/routes", methods: "GET" },
    ];

    // API routes from our defined routes
    const apiPaths = [
        // Health check
        { path: "/api/health", methods: "GET" },

        // Analytics routes
        { path: "/api/analytics/events", methods: "POST" },
        { path: "/api/analytics/events/batch", methods: "POST" },
        { path: "/api/analytics/session/start", methods: "POST" },
        { path: "/api/analytics/session/end", methods: "PUT" },
        { path: "/api/analytics/game/:gameId", methods: "GET" },

        // Enhanced Analytics routes
        { path: "/api/analytics/enhanced/metrics/retention", methods: "GET" },
        { path: "/api/analytics/enhanced/metrics/active-users", methods: "GET" },
        { path: "/api/analytics/enhanced/metrics/playtime", methods: "GET" },
        { path: "/api/analytics/enhanced/metrics/session-count", methods: "GET" },
        { path: "/api/analytics/enhanced/metrics/session-length", methods: "GET" },

        // Journey Analytics routes
        { path: "/api/analytics/enhanced/journey/checkpoints", methods: "GET" },
        { path: "/api/analytics/enhanced/journey/record", methods: "POST" },
        { path: "/api/analytics/enhanced/journey/progress", methods: "GET" },
        { path: "/api/analytics/enhanced/journey/user/:userId", methods: "GET" },

        // Game management routes
        { path: "/api/games", methods: "GET, POST" },
        { path: "/api/games/:gameId", methods: "GET, DELETE" },
        { path: "/api/games/:gameId/apikey", methods: "PUT" }
    ];

    // We can return either JSON or HTML based on the request's Accept header
    const allRoutes = [...rootRoutes, ...apiPaths];

    // Check if the request accepts HTML
    const acceptHeader = _req.headers.accept || '';
    if (acceptHeader.includes('text/html')) {
        // Return HTML for browser requests
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>LvlUp Backend API Routes</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                tr:nth-child(even) { background-color: #f9f9f9; }
            </style>
        </head>
        <body>
            <h1>LvlUp Backend API Routes</h1>
            <table>
                <tr>
                    <th>Path</th>
                    <th>Methods</th>
                </tr>
        `;

        allRoutes.forEach(route => {
            html += `
                <tr>
                    <td>${route.path}</td>
                    <td>${route.methods}</td>
                </tr>
            `;
        });

        html += `
            </table>
        </body>
        </html>
        `;

        res.send(html);
    } else {
        // Return JSON for API requests
        res.status(200).json(allRoutes);
    }
});

// API Routes - all under /api prefix
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
        logger.warn('Request entity too large', {
            method: req.method,
            path: req.originalUrl || req.path,
            contentLength: req.headers['content-length'] || null,
            userAgent: req.headers['user-agent'] || null,
            requestBodyLimit: REQUEST_BODY_LIMIT,
        });
        return res.status(413).json({
            success: false,
            error: 'Request entity too large'
        });
    }

    logger.error(`Error: ${err.message}`, { stack: err.stack });
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
    });
});

function startJobs(): void {
    // Start session heartbeat monitoring service
    sessionHeartbeatService.start();
    logger.info('Session heartbeat service started');

    // Start data retention service
    dataRetentionService.start();
    logger.info('Data retention service started');

    // Start level metrics aggregation cron job
    startLevelMetricsAggregationJob();
    logger.info('Level metrics aggregation cron job started');

    // Start hourly aggregation for today (partial day)
    // Disabled by default to reduce DB load/cost; enable explicitly with ENABLE_LEVEL_METRICS_HOURLY=1
    if (enableLevelMetricsHourlyJob) {
        startLevelMetricsHourlyTodayJob();
        logger.info('Level metrics hourly aggregation job started');
    } else {
        logger.info('Level metrics hourly aggregation job skipped (ENABLE_LEVEL_METRICS_HOURLY not enabled)');
    }

    // Start active users aggregation jobs
    startActiveUsersAggregationJob();
    logger.info('Active users aggregation cron job started');

    if (enableActiveUsersHourlyJob) {
        startActiveUsersHourlyTodayJob();
        logger.info('Active users hourly aggregation job started');
    } else {
        logger.info('Active users hourly aggregation job skipped (ENABLE_ACTIVE_USERS_HOURLY not enabled)');
    }

    // Start cohort aggregation jobs
    startCohortAggregationJob();
    logger.info('Cohort aggregation cron job started');

    if (enableCohortHourlyJob) {
        startCohortHourlyTodayJob();
        logger.info('Cohort hourly aggregation job started');
    } else {
        logger.info('Cohort hourly aggregation job skipped (ENABLE_COHORT_HOURLY not enabled)');
    }

    // Start monetization aggregation jobs
    startMonetizationAggregationJob();
    logger.info('Monetization aggregation cron job started');

    if (enableMonetizationHourlyJob) {
        startMonetizationHourlyTodayJob();
        logger.info('Monetization hourly aggregation job started');
    } else {
        logger.info('Monetization hourly aggregation job skipped (ENABLE_MONETIZATION_HOURLY not enabled)');
    }

    startFxRatesSyncJob();
    logger.info('FX rates sync cron job started');
    jobsStarted = true;
}

if (runApi) {
    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`LvlUp server running at http://0.0.0.0:${PORT}`);
        apiStarted = true;

        if (runJobs) {
            startJobs();
        }
    });
} else if (runJobs) {
    startJobs();
}

// Graceful shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} signal received: closing process`);

    if (apiStarted || jobsStarted) {
        // Flush remaining events, revenue records, and heartbeats before shutdown
        await Promise.all([
            eventBatchWriter.shutdown(),
            revenueBatchWriter.shutdown(),
            sessionHeartbeatBatchWriter.shutdown()
        ]);
    }

    if (jobsStarted) {
        sessionHeartbeatService.stop();
        dataRetentionService.stop();
    }

    process.exit(0);
};

process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});
