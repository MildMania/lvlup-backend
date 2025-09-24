import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import apiRoutes from './routes';
import logger from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Apply middleware
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '2mb' })); // Increased limit for batch events
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined')); // HTTP request logging

// Root endpoint - API info
app.get('/', (_req: Request, res: Response) => {
    res.send(`
        <h1>LvlUp Backend API</h1>
        <p>Version: 1.0.0</p>
        <p>API Documentation: <a href="/docs">View Docs</a></p>
    `);
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
app.listen(PORT, () => {
    logger.info(`LvlUp server running at http://localhost:${PORT}`);
});
