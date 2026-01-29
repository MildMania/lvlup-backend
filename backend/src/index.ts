import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import apiRoutes from './routes';
import logger from './utils/logger';
import { sessionHeartbeatService } from './services/SessionHeartbeatService';
import dataRetentionService from './services/DataRetentionService';
import { startLevelMetricsAggregationJob } from './jobs/levelMetricsAggregation';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

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
app.use(express.json({ limit: '2mb' })); // Increased limit for batch events
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('combined')); // HTTP request logging

// Health check endpoint for Railway (root level)
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Root endpoint - API info
app.get('/', (_req: Request, res: Response) => {
    res.send(`
        <h1>LvlUp Backend API</h1>
        <p>Version: 1.0.0</p>
        <p>Health: <a href="/health">/health</a></p>
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
    logger.error(`Error: ${err.message}`, { stack: err.stack });
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`LvlUp server running at http://0.0.0.0:${PORT}`);
    
    // Start session heartbeat monitoring service
    sessionHeartbeatService.start();
    logger.info('Session heartbeat service started');
    
    // Start data retention service
    dataRetentionService.start();
    logger.info('Data retention service started');
    
    // Start level metrics aggregation cron job
    startLevelMetricsAggregationJob();
    logger.info('Level metrics aggregation cron job started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    sessionHeartbeatService.stop();
    dataRetentionService.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    sessionHeartbeatService.stop();
    dataRetentionService.stop();
    process.exit(0);
});
