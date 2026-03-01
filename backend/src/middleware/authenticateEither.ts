import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import tokenService from '../services/TokenService';
import prisma from '../prisma';

type CachedGameEntry = {
    game: any;
    expiresAt: number;
};

type CachedInvalidEntry = {
    expiresAt: number;
};

const authGameCache = new Map<string, CachedGameEntry>();
const authInvalidKeyCache = new Map<string, CachedInvalidEntry>();
const AUTH_GAME_CACHE_TTL_MS = Math.max(
    1,
    Number(process.env.AUTH_GAME_CACHE_TTL_SECONDS || 60)
) * 1000;
const AUTH_GAME_NEG_CACHE_TTL_MS = Math.max(
    1,
    Number(process.env.AUTH_GAME_NEG_CACHE_TTL_SECONDS || 10)
) * 1000;
const AUTH_GAME_CACHE_MAX_ENTRIES = Math.max(
    100,
    Number(process.env.AUTH_GAME_CACHE_MAX_ENTRIES || 10000)
);

function evictIfCacheTooLarge(): void {
    if (authGameCache.size <= AUTH_GAME_CACHE_MAX_ENTRIES) {
        return;
    }

    // FIFO eviction based on insertion order.
    const keysToDelete = authGameCache.size - AUTH_GAME_CACHE_MAX_ENTRIES;
    let deleted = 0;
    for (const key of authGameCache.keys()) {
        authGameCache.delete(key);
        deleted++;
        if (deleted >= keysToDelete) break;
    }
}

function getValidCachedGame(apiKey: string): any | null {
    const cached = authGameCache.get(apiKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        authGameCache.delete(apiKey);
        return null;
    }
    return cached.game;
}

function setCachedGame(apiKey: string, game: any): void {
    authGameCache.set(apiKey, {
        game,
        expiresAt: Date.now() + AUTH_GAME_CACHE_TTL_MS
    });
    evictIfCacheTooLarge();
}

function isCachedInvalidApiKey(apiKey: string): boolean {
    const cached = authInvalidKeyCache.get(apiKey);
    if (!cached) return false;
    if (cached.expiresAt <= Date.now()) {
        authInvalidKeyCache.delete(apiKey);
        return false;
    }
    return true;
}

function setCachedInvalidApiKey(apiKey: string): void {
    authInvalidKeyCache.set(apiKey, {
        expiresAt: Date.now() + AUTH_GAME_NEG_CACHE_TTL_MS
    });
}

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
            const apiKeyString = String(apiKey);
            const cachedGame = getValidCachedGame(apiKeyString);
            if (cachedGame) {
                req.game = cachedGame;
                return next();
            }

            if (isCachedInvalidApiKey(apiKeyString)) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid API key',
                });
            }

            // Validate API key (for game authentication)
            const game = await prisma.game.findUnique({
                where: { apiKey: apiKeyString },
            });

            if (!game) {
                setCachedInvalidApiKey(apiKeyString);
                return res.status(401).json({
                    success: false,
                    error: 'Invalid API key',
                });
            }

            // Attach game to request
            req.game = game;
            setCachedGame(apiKeyString, game);
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
