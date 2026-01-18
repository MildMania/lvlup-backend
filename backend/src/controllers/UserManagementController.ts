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

            const { email, firstName, lastName, teamId, role, gameAccess } = req.body;

            if (!email || !firstName || !lastName) {
                return res.status(400).json({
                    success: false,
                    error: 'Email, first name, and last name are required',
                });
            }

            const result = await userManagementService.createUser({
                email,
                password: '', // Password is auto-generated in service, this field is ignored
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
                    userId: result.user.id,
                    generatedPassword: result.generatedPassword, // Return password for admin to share
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
            const { firstName, lastName, email, isActive, teamId, role } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

            await userManagementService.updateUser(
                id,
                { firstName, lastName, email, isActive, teamId, role },
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

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

            await userManagementService.deactivateUser(id, req.dashboardUser.id);

            return res.json({
                success: true,
                data: { message: 'User deactivated successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message || 'Failed to deactivate user',
            });
        }
    }

    /**
     * Permanently delete user (Admin only)
     */
    async deleteUser(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id } = req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

            await userManagementService.deleteUser(id, req.dashboardUser.id);

            return res.json({
                success: true,
                data: { message: 'User permanently deleted' },
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to delete user',
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

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

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

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

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

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

            // Generate automatic password - no longer accept password from request
            const result = await userManagementService.resetUserPassword(
                id,
                req.dashboardUser.id
            );

            return res.json({
                success: true,
                data: { 
                    message: 'Password reset successfully',
                    generatedPassword: result.generatedPassword, // Return password for admin to share
                },
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

    /**
     * Get current user's own profile (any authenticated user)
     */
    async getMyProfile(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const user = await userManagementService.getUserById(req.dashboardUser.id);

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
     * Update current user's own profile (any authenticated user)
     * Users can only update their own firstName, lastName, and email
     * They cannot change their role or team
     */
    async updateMyProfile(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { firstName, lastName, email } = req.body;

            // Users can only update their own basic info, not role/team/status
            await userManagementService.updateUser(
                req.dashboardUser.id,
                { firstName, lastName, email },
                req.dashboardUser.id
            );

            return res.json({
                success: true,
                data: { message: 'Profile updated successfully' },
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to update profile',
            });
        }
    }
}

export default new UserManagementController();

