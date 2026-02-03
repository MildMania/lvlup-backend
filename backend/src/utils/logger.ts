import winston from 'winston';

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Configure transports based on environment
// In production (Railway), only use Console transport (Railway captures stdout)
// In development, also write to files for debugging
const transports: winston.transport[] = [
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    })
];

// Only add file transports in non-production environments
if (process.env.NODE_ENV !== 'production') {
    transports.push(
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 2 // Reduced from 5 to save disk space
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 2 // Reduced from 5 to save disk space
        })
    );
}

const logger = winston.createLogger({
    // Default to 'warn' in production, 'info' in development
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
    format: logFormat,
    defaultMeta: { service: 'lvlup-backend' },
    transports
});

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

export default logger;