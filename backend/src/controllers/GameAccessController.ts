import { Response } from 'express';
import gameAccessService from '../services/GameAccessService';
import { DashboardAuthRequest } from '../middleware/dashboardAuth';
import { ApiResponse } from '../types/api';
import { AccessLevel } from '@prisma/client';

export class GameAccessController {
    /**
     * Grant game access
     */
    async grantAccess(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { gameId } = req.params;
            const { teamId, userId, allGames, accessLevel, expiresAt } = req.body;

            if (!accessLevel) {
                return res.status(400).json({
                    success: false,
                    error: 'Access level is required',
                });
            }

            const access = await gameAccessService.grantAccess({
                gameId: allGames ? undefined : gameId,
                allGames,
                teamId,
                userId,
                accessLevel: accessLevel as AccessLevel,
                grantedBy: req.dashboardUser.id,
                expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            });

            return res.status(201).json({
                success: true,
                data: access,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to grant access',
            });
        }
    }

    /**
     * Revoke game access
     */
    async revokeAccess(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { accessId } = req.params;

            await gameAccessService.revokeAccess(accessId, req.dashboardUser.id);

            return res.json({
                success: true,
                data: { message: 'Access revoked successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message || 'Failed to revoke access',
            });
        }
    }

    /**
     * Update access level
     */
    async updateAccessLevel(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { accessId } = req.params;
            const { accessLevel } = req.body;

            if (!accessLevel) {
                return res.status(400).json({
                    success: false,
                    error: 'Access level is required',
                });
            }

            const access = await gameAccessService.updateAccessLevel(
                accessId,
                accessLevel as AccessLevel,
                req.dashboardUser.id
            );

            return res.json({
                success: true,
                data: access,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to update access level',
            });
        }
    }

    /**
     * Get game access list
     */
    async getGameAccess(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { gameId } = req.params;

            const accesses = await gameAccessService.getGameAccess(gameId);

            return res.json({
                success: true,
                data: accesses,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get game access',
            });
        }
    }

    /**
     * Get user's accessible games
     */
    async getUserAccessibleGames(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { userId } = req.params;

            const result = await gameAccessService.getUserAccessibleGames(userId);

            return res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get accessible games',
            });
        }
    }
}

export default new GameAccessController();

