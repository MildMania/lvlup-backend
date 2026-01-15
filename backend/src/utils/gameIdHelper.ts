import { Request } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';

/**
 * Helper function to extract gameId from either:
 * 1. req.game.id (when authenticated with API key)
 * 2. req.query.gameId (when authenticated with dashboard Bearer token)
 * 3. req.body.gameId (for POST requests with dashboard auth)
 * 
 * @param req The request object
 * @returns gameId string or null if not found
 */
export function getGameId(req: AuthenticatedRequest | any): string | null {
    // Priority 1: From authenticated game (API key auth)
    if (req.game?.id) {
        return req.game.id;
    }
    
    // Priority 2: From query parameter (dashboard auth for GET requests)
    if (req.query?.gameId && typeof req.query.gameId === 'string') {
        return req.query.gameId;
    }
    
    // Priority 3: From request body (dashboard auth for POST requests)
    if (req.body?.gameId && typeof req.body.gameId === 'string') {
        return req.body.gameId;
    }
    
    return null;
}

/**
 * Helper function to get gameId or throw an error if not found
 * @param req The request object
 * @returns gameId string
 * @throws Error if gameId is not found
 */
export function requireGameId(req: AuthenticatedRequest | any): string {
    const gameId = getGameId(req);
    
    if (!gameId) {
        throw new Error('gameId is required. Provide it as a query parameter (?gameId=xxx) or in the request body.');
    }
    
    return gameId;
}

