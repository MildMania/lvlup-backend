import { PrismaClient, DashboardRole, AccessLevel } from '@prisma/client';
import authService from './AuthService';
import teamService from './TeamService';
import gameAccessService from './GameAccessService';
import auditLogService, { AUDIT_ACTIONS } from './AuditLogService';

const prisma = new PrismaClient();

interface CreateUserInput {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    teamId?: string;
    role?: DashboardRole;
    gameAccess?: Array<{
        gameId?: string;
        allGames?: boolean;
        accessLevel: AccessLevel;
    }>;
    createdBy: string;
}

export class UserManagementService {
    /**
     * Create a new user (Admin only)
     */
    async createUser(input: CreateUserInput) {
        // Register the user
        const user = await authService.register({
            email: input.email,
            password: input.password,
            firstName: input.firstName,
            lastName: input.lastName,
            createdBy: input.createdBy,
        });

        // Add to team if specified
        if (input.teamId && input.role) {
            await teamService.addMember({
                teamId: input.teamId,
                userId: user.id,
                role: input.role,
                addedBy: input.createdBy,
            });
        }

        // Grant game access if specified
        if (input.gameAccess && input.gameAccess.length > 0) {
            for (const access of input.gameAccess) {
                await gameAccessService.grantAccess({
                    userId: user.id,
                    gameId: access.gameId,
                    allGames: access.allGames,
                    accessLevel: access.accessLevel,
                    grantedBy: input.createdBy,
                });
            }
        }

        // Log audit
        await auditLogService.log({
            userId: input.createdBy,
            action: AUDIT_ACTIONS.USER_CREATED,
            resource: `DashboardUser:${user.id}`,
            details: {
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                teamId: input.teamId,
                role: input.role,
            },
        });

        return user;
    }

    /**
     * List all dashboard users
     */
    async listUsers(filters?: {
        isActive?: boolean;
        isLocked?: boolean;
        teamId?: string;
        limit?: number;
        offset?: number;
    }) {
        const where: any = {};

        if (filters?.isActive !== undefined) {
            where.isActive = filters.isActive;
        }

        if (filters?.isLocked !== undefined) {
            where.isLocked = filters.isLocked;
        }

        if (filters?.teamId) {
            where.teamMemberships = {
                some: {
                    teamId: filters.teamId,
                },
            };
        }

        const [users, total] = await Promise.all([
            prisma.dashboardUser.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    isEmailVerified: true,
                    isActive: true,
                    isLocked: true,
                    lastLogin: true,
                    createdAt: true,
                    teamMemberships: {
                        include: {
                            team: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                    twoFactorAuth: {
                        select: {
                            isEnabled: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: filters?.limit || 50,
                skip: filters?.offset || 0,
            }),
            prisma.dashboardUser.count({ where }),
        ]);

        return {
            users,
            total,
            limit: filters?.limit || 50,
            offset: filters?.offset || 0,
        };
    }

    /**
     * Get user details by ID
     */
    async getUserById(userId: string) {
        const user = await prisma.dashboardUser.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                isEmailVerified: true,
                isActive: true,
                isLocked: true,
                lockReason: true,
                lastLogin: true,
                lastLoginIp: true,
                failedLoginAttempts: true,
                createdAt: true,
                updatedAt: true,
                createdBy: true,
                teamMemberships: {
                    include: {
                        team: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                },
                gameAccesses: {
                    include: {
                        game: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                twoFactorAuth: {
                    select: {
                        isEnabled: true,
                        lastUsedAt: true,
                    },
                },
            },
        });

        if (!user) {
            throw new Error('User not found');
        }

        return user;
    }

    /**
     * Update user details
     */
    async updateUser(
        userId: string,
        data: {
            firstName?: string;
            lastName?: string;
            isActive?: boolean;
        },
        updatedBy: string
    ) {
        const user = await prisma.dashboardUser.update({
            where: { id: userId },
            data,
        });

        // Log audit
        await auditLogService.log({
            userId: updatedBy,
            action: AUDIT_ACTIONS.USER_UPDATED,
            resource: `DashboardUser:${userId}`,
            details: data,
        });

        return user;
    }

    /**
     * Deactivate user
     */
    async deactivateUser(userId: string, deactivatedBy: string) {
        await authService.deactivateAccount(userId);

        // Log audit
        await auditLogService.log({
            userId: deactivatedBy,
            action: AUDIT_ACTIONS.USER_DEACTIVATED,
            resource: `DashboardUser:${userId}`,
        });
    }

    /**
     * Activate user
     */
    async activateUser(userId: string, activatedBy: string) {
        await prisma.dashboardUser.update({
            where: { id: userId },
            data: { isActive: true },
        });

        // Log audit
        await auditLogService.log({
            userId: activatedBy,
            action: AUDIT_ACTIONS.USER_ACTIVATED,
            resource: `DashboardUser:${userId}`,
        });
    }

    /**
     * Unlock user account
     */
    async unlockUser(userId: string, unlockedBy: string) {
        await authService.unlockAccount(userId);

        // Log audit
        await auditLogService.log({
            userId: unlockedBy,
            action: AUDIT_ACTIONS.USER_UNLOCKED,
            resource: `DashboardUser:${userId}`,
        });
    }

    /**
     * Reset user password (Admin only)
     */
    async resetUserPassword(userId: string, newPassword: string, resetBy: string) {
        const bcrypt = require('bcrypt');
        const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
        const passwordHash = await bcrypt.hash(newPassword, bcryptRounds);

        await prisma.dashboardUser.update({
            where: { id: userId },
            data: {
                passwordHash,
                failedLoginAttempts: 0,
                isLocked: false,
                lockReason: null,
            },
        });

        // Revoke all existing tokens
        const tokenService = require('./TokenService').default;
        await tokenService.revokeAllUserTokens(userId);

        // Log audit
        await auditLogService.log({
            userId: resetBy,
            action: AUDIT_ACTIONS.PASSWORD_RESET,
            resource: `DashboardUser:${userId}`,
            details: { resetByAdmin: true },
        });
    }

    /**
     * Get user statistics
     */
    async getUserStats() {
        const [
            totalUsers,
            activeUsers,
            lockedUsers,
            users2FA,
        ] = await Promise.all([
            prisma.dashboardUser.count(),
            prisma.dashboardUser.count({ where: { isActive: true } }),
            prisma.dashboardUser.count({ where: { isLocked: true } }),
            prisma.twoFactorAuth.count({ where: { isEnabled: true } }),
        ]);

        return {
            totalUsers,
            activeUsers,
            lockedUsers,
            inactiveUsers: totalUsers - activeUsers,
            users2FA,
        };
    }
}

export default new UserManagementService();

