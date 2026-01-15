import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import tokenService from '../services/TokenService';

const prisma = new PrismaClient();

/**
 * Middleware that accepts BOTH API key authentication (for games) 
 * AND dashboard authentication (for dashboard users)
 */
export const authenticateEither = async (
    req: any,
    res: Response,
    next: NextFunction
) => {
    try {
        // Check for API key first
        const apiKey = req.header('X-API-Key') || req.query.api_key;
        
        if (apiKey) {
            // Validate API key (for game authentication)
            const game = await prisma.game.findUnique({
                where: { apiKey: String(apiKey) },
            });

            if (!game) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid API key',
                });
            }

            // Attach game to request
            req.game = game;
            return next();
        }

        // Check for dashboard authentication token
        let token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token && req.cookies?.refreshToken) {
            // Note: Access token should be in Authorization header, not cookies
            // Cookies are only for refresh tokens
            token = null;
        }

        if (token) {
            try {
                // Verify JWT token (for dashboard authentication)
                const payload = tokenService.verifyAccessToken(token);

                // Attach dashboard user to request
                req.dashboardUser = {
                    id: payload.userId,
                    email: payload.email,
                };

                return next();
            } catch (error: any) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired token',
                });
            }
        }

        // No authentication provided
        return res.status(401).json({
            success: false,
            error: 'Authentication required. Provide either X-API-Key header or Authorization bearer token.',
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            error: 'Authentication error: ' + error.message,
        });
    }
};

