import { PrismaClient, DashboardRole, AccessLevel } from '@prisma/client';
import authService from './AuthService';
import teamService from './TeamService';
import gameAccessService from './GameAccessService';
import auditLogService, { AUDIT_ACTIONS } from './AuditLogService';
import prisma from '../prisma';

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
     * Generate a secure random password
     */
    private generatePassword(): string {
        const crypto = require('crypto');
        const length = 12;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        const randomBytes = crypto.randomBytes(length);
        
        for (let i = 0; i < length; i++) {
            password += charset[randomBytes[i] % charset.length];
        }
        
        // Ensure at least one of each type
        password = 'Aa1!' + password.substring(4);
        return password;
    }

    /**
     * Create a new user (Admin only)
     */
    async createUser(input: CreateUserInput) {
        // Generate automatic password instead of using provided one
        const generatedPassword = this.generatePassword();
        
        // Register the user with generated password
        const user = await authService.register({
            email: input.email,
            password: generatedPassword,
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

        return {
            user,
            generatedPassword, // Return the password so admin can share it with the user
        };
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
                        select: {
                            role: true,
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
                    select: {
                        role: true,
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
            email?: string;
            isActive?: boolean;
            teamId?: string;
            role?: string;
        },
        updatedBy: string
    ) {
        // Get user to check if they are a super admin
        const userToUpdate = await prisma.dashboardUser.findUnique({
            where: { id: userId },
            include: {
                teamMemberships: true,
            },
        });

        if (!userToUpdate) {
            throw new Error('User not found');
        }

        // Check if user is a SUPER_ADMIN
        const isSuperAdmin = userToUpdate.teamMemberships.some(
            membership => membership.role === 'SUPER_ADMIN'
        );

        // Prevent changing super admin's role or team
        if (isSuperAdmin && (data.teamId || data.role)) {
            throw new Error('Cannot change role or team for SUPER_ADMIN users. Super admins must maintain their elevated privileges.');
        }

        // Check if email is being changed and if it already exists
        if (data.email) {
            const existingUser = await prisma.dashboardUser.findUnique({
                where: { email: data.email },
            });
            
            if (existingUser && existingUser.id !== userId) {
                throw new Error('Email already in use by another user');
            }
        }

        // Update basic user info
        const updateData: any = {};
        if (data.firstName !== undefined) updateData.firstName = data.firstName;
        if (data.lastName !== undefined) updateData.lastName = data.lastName;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;

        const user = await prisma.dashboardUser.update({
            where: { id: userId },
            data: updateData,
        });

        // Handle team/role update if provided (already checked not super admin above)
        // Check if teamId or role were explicitly provided (even if empty)
        const teamIdProvided = data.teamId !== undefined;
        const roleProvided = data.role !== undefined;
        
        // Normalize empty strings to undefined for actual values
        const normalizedTeamId = data.teamId && data.teamId.trim() !== '' ? data.teamId : undefined;
        const normalizedRole = data.role && data.role.trim() !== '' ? data.role : undefined;

        console.log('[UserManagementService] Update role/team:', {
            rawTeamId: data.teamId,
            rawRole: data.role,
            teamIdProvided,
            roleProvided,
            normalizedTeamId,
            normalizedRole,
            userId
        });

        // Only process team/role changes if at least one was provided
        if (teamIdProvided || roleProvided) {
            // Get user's current team memberships
            const currentMemberships = await prisma.teamMember.findMany({
                where: { userId },
            });

            console.log('[UserManagementService] Current memberships:', currentMemberships);

            // Case 1: User wants to remove team (teamId is empty/undefined)
            if (teamIdProvided && !normalizedTeamId) {
                console.log('[UserManagementService] Removing all team memberships');
                await prisma.teamMember.deleteMany({
                    where: { userId },
                });
            }
            // Case 2: Both team and role are being set - replace membership
            else if (normalizedTeamId && normalizedRole) {
                console.log('[UserManagementService] Replacing membership with new team and role');
                await prisma.teamMember.deleteMany({
                    where: { userId },
                });

                await prisma.teamMember.create({
                    data: {
                        userId,
                        teamId: normalizedTeamId,
                        role: normalizedRole as any,
                    },
                });
            }
            // Case 3: Only role is being changed - update existing membership
            else if (normalizedRole && currentMemberships.length > 0) {
                console.log('[UserManagementService] Updating role in existing membership');
                await prisma.teamMember.updateMany({
                    where: { userId },
                    data: { role: normalizedRole as any },
                });
            }
            // Case 4: Only team is being changed (and it's not empty) - keep same role, change team
            else if (normalizedTeamId && currentMemberships.length > 0) {
                console.log('[UserManagementService] Changing team, keeping role');
                const currentMembership = currentMemberships[0];
                if (!currentMembership) {
                    throw new Error('User has no team membership to update');
                }
                const currentRole = currentMembership.role;
                await prisma.teamMember.deleteMany({
                    where: { userId },
                });
                
                await prisma.teamMember.create({
                    data: {
                        userId,
                        teamId: normalizedTeamId,
                        role: currentRole,
                    },
                });
            }
            // Case 5: User has no team membership and we only have a role - ERROR
            else if (normalizedRole && currentMemberships.length === 0) {
                console.log('[UserManagementService] ERROR: Cannot assign role without team');
                throw new Error('Cannot assign a role without assigning the user to a team. Please select a team first.');
            }
            else {
                console.log('[UserManagementService] No action taken - conditions not met');
            }
        }

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
     * Permanently delete user (Admin only)
     */
    async deleteUser(userId: string, deletedBy: string) {
        // Check if user is trying to delete themselves
        if (userId === deletedBy) {
            throw new Error('Cannot delete your own account');
        }

        // Check if user is a super admin
        const user = await prisma.dashboardUser.findUnique({
            where: { id: userId },
            include: {
                teamMemberships: true,
            },
        });

        if (!user) {
            throw new Error('User not found');
        }

        const isSuperAdmin = user.teamMemberships.some(
            membership => membership.role === 'SUPER_ADMIN'
        );

        if (isSuperAdmin) {
            throw new Error('Cannot delete SUPER_ADMIN users for security reasons');
        }

        // Log audit before deleting
        await auditLogService.log({
            userId: deletedBy,
            action: AUDIT_ACTIONS.USER_DELETED,
            resource: `DashboardUser:${userId}`,
            details: {
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
            },
        });

        // Delete user (cascade will handle related records)
        await prisma.dashboardUser.delete({
            where: { id: userId },
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
    async resetUserPassword(userId: string, resetBy: string) {
        // Generate new automatic password
        const generatedPassword = this.generatePassword();
        
        const bcrypt = require('bcrypt');
        const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
        const passwordHash = await bcrypt.hash(generatedPassword, bcryptRounds);

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

        return {
            generatedPassword, // Return the password so admin can share it with the user
        };
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

