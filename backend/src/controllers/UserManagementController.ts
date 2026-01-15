import { Response } from 'express';
import userManagementService from '../services/UserManagementService';
import { DashboardAuthRequest } from '../middleware/dashboardAuth';
import { ApiResponse } from '../types/api';
import { DashboardRole, AccessLevel } from '@prisma/client';

export class UserManagementController {
    /**
     * Create a new user (Admin only)
     */
    async createUser(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { email, password, firstName, lastName, teamId, role, gameAccess } = req.body;

            if (!email || !password || !firstName || !lastName) {
                return res.status(400).json({
                    success: false,
                    error: 'Email, password, first name, and last name are required',
                });
            }

            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters long',
                });
            }

            const user = await userManagementService.createUser({
                email,
                password,
                firstName,
                lastName,
                teamId,
                role: role as DashboardRole,
                gameAccess,
                createdBy: req.dashboardUser.id,
            });

            return res.status(201).json({
                success: true,
                data: {
                    message: 'User created successfully',
                    userId: user.id,
                },
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to create user',
            });
        }
    }

    /**
     * List all dashboard users
     */
    async listUsers(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const filters = {
                isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
                isLocked: req.query.isLocked === 'true' ? true : req.query.isLocked === 'false' ? false : undefined,
                teamId: req.query.teamId as string,
                limit: parseInt(req.query.limit as string) || 50,
                offset: parseInt(req.query.offset as string) || 0,
            };

            const result = await userManagementService.listUsers(filters);

            return res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to list users',
            });
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { id } = req.params;

            const user = await userManagementService.getUserById(id);

            return res.json({
                success: true,
                data: user,
            });
        } catch (error: any) {
            return res.status(404).json({
                success: false,
                error: error.message || 'User not found',
            });
        }
    }

    /**
     * Update user
     */
    async updateUser(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id } = req.params;
            const { firstName, lastName, isActive } = req.body;

            await userManagementService.updateUser(
                id,
                { firstName, lastName, isActive },
                req.dashboardUser.id
            );

            return res.json({
                success: true,
                data: { message: 'User updated successfully' },
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to update user',
            });
        }
    }

    /**
     * Deactivate user
     */
    async deactivateUser(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id } = req.params;

            await userManagementService.deactivateUser(id, req.dashboardUser.id);

            return res.json({
                success: true,
                data: { message: 'User deactivated successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to deactivate user',
            });
        }
    }

    /**
     * Activate user
     */
    async activateUser(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id } = req.params;

            await userManagementService.activateUser(id, req.dashboardUser.id);

            return res.json({
                success: true,
                data: { message: 'User activated successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to activate user',
            });
        }
    }

    /**
     * Unlock user account
     */
    async unlockUser(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id } = req.params;

            await userManagementService.unlockUser(id, req.dashboardUser.id);

            return res.json({
                success: true,
                data: { message: 'User unlocked successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to unlock user',
            });
        }
    }

    /**
     * Reset user password (Admin only)
     */
    async resetUserPassword(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id } = req.params;
            const { newPassword } = req.body;

            if (!newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'New password is required',
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters long',
                });
            }

            await userManagementService.resetUserPassword(
                id,
                newPassword,
                req.dashboardUser.id
            );

            return res.json({
                success: true,
                data: { message: 'Password reset successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to reset password',
            });
        }
    }

    /**
     * Get user statistics
     */
    async getUserStats(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const stats = await userManagementService.getUserStats();

            return res.json({
                success: true,
                data: stats,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get user statistics',
            });
        }
    }
}

export default new UserManagementController();

