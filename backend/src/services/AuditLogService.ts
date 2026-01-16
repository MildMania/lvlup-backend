import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuditLogInput {
    userId?: string;
    action: string;
    resource?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
}

export class AuditLogService {
    /**
     * Create an audit log entry
     */
    async log(input: AuditLogInput): Promise<void> {
        try {
            await prisma.auditLog.create({
                data: {
                    userId: input.userId,
                    action: input.action,
                    resource: input.resource,
                    details: input.details || {},
                    ipAddress: input.ipAddress,
                    userAgent: input.userAgent,
                },
            });
        } catch (error) {
            // Don't throw errors for audit logging failures
            // Log to error monitoring service instead
            console.error('Failed to create audit log:', error);
        }
    }

    /**
     * Get audit logs with filtering
     */
    async getLogs(filters: {
        userId?: string;
        action?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    }) {
        const where: any = {};

        if (filters.userId) {
            where.userId = filters.userId;
        }

        if (filters.action) {
            where.action = filters.action;
        }

        if (filters.startDate || filters.endDate) {
            where.createdAt = {};
            if (filters.startDate) {
                where.createdAt.gte = filters.startDate;
            }
            if (filters.endDate) {
                where.createdAt.lte = filters.endDate;
            }
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: filters.limit || 50,
                skip: filters.offset || 0,
            }),
            prisma.auditLog.count({ where }),
        ]);

        return {
            logs,
            total,
            limit: filters.limit || 50,
            offset: filters.offset || 0,
        };
    }

    /**
     * Get user's audit trail
     */
    async getUserAuditTrail(userId: string, limit: number = 50) {
        return prisma.auditLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /**
     * Clean up old audit logs (for scheduled cleanup jobs)
     */
    async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await prisma.auditLog.deleteMany({
            where: {
                createdAt: {
                    lt: cutoffDate,
                },
            },
        });

        return result.count;
    }
}

// Audit action constants
export const AUDIT_ACTIONS = {
    // Authentication
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    USER_REGISTER: 'USER_REGISTER',
    PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
    PASSWORD_RESET: 'PASSWORD_RESET',
    PASSWORD_CHANGE: 'PASSWORD_CHANGE',
    EMAIL_VERIFIED: 'EMAIL_VERIFIED',
    
    // 2FA
    TWO_FACTOR_ENABLED: 'TWO_FACTOR_ENABLED',
    TWO_FACTOR_DISABLED: 'TWO_FACTOR_DISABLED',
    TWO_FACTOR_VERIFIED: 'TWO_FACTOR_VERIFIED',
    
    // User Management
    USER_CREATED: 'USER_CREATED',
    USER_UPDATED: 'USER_UPDATED',
    USER_DEACTIVATED: 'USER_DEACTIVATED',
    USER_DELETED: 'USER_DELETED',
    USER_ACTIVATED: 'USER_ACTIVATED',
    USER_UNLOCKED: 'USER_UNLOCKED',
    
    // Team Management
    TEAM_CREATED: 'TEAM_CREATED',
    TEAM_UPDATED: 'TEAM_UPDATED',
    TEAM_DELETED: 'TEAM_DELETED',
    TEAM_MEMBER_ADDED: 'TEAM_MEMBER_ADDED',
    TEAM_MEMBER_REMOVED: 'TEAM_MEMBER_REMOVED',
    TEAM_MEMBER_ROLE_CHANGED: 'TEAM_MEMBER_ROLE_CHANGED',
    
    // Game Access
    GAME_ACCESS_GRANTED: 'GAME_ACCESS_GRANTED',
    GAME_ACCESS_REVOKED: 'GAME_ACCESS_REVOKED',
    GAME_ACCESS_UPDATED: 'GAME_ACCESS_UPDATED',
    
    // Game Management
    GAME_CREATED: 'GAME_CREATED',
    GAME_UPDATED: 'GAME_UPDATED',
    GAME_DELETED: 'GAME_DELETED',
    GAME_API_KEY_REGENERATED: 'GAME_API_KEY_REGENERATED',
};

export default new AuditLogService();

