import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../types/api';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
    game?: {
        id: string;
        name: string;
        apiKey: string;
    };
}

export const authenticateApiKey = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>,
    next: NextFunction
) => {
    try {
        const apiKey = req.header('X-API-Key') || req.query.api_key as string;

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API key is required. Provide it in X-API-Key header or api_key query parameter.'
            });
        }

        const game = await prisma.game.findUnique({
            where: { apiKey: apiKey as string },
            select: { id: true, name: true, apiKey: true }
        });

        if (!game) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key.'
            });
        }

        req.game = game;
        next();
    } catch (error) {
        console.error('API Key authentication error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error during authentication.'
        });
    }
};