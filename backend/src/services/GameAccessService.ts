import { PrismaClient, AccessLevel, DashboardRole } from '@prisma/client';
import auditLogService, { AUDIT_ACTIONS } from './AuditLogService';
import prisma from '../prisma';

interface GrantAccessInput {
    gameId?: string;
    allGames?: boolean;
    teamId?: string;
    userId?: string;
    accessLevel: AccessLevel;
    grantedBy: string;
    expiresAt?: Date;
}

export class GameAccessService {
    /**
     * Grant game access to a team or user
     */
    async grantAccess(input: GrantAccessInput) {
        // Validate input
        if (!input.teamId && !input.userId) {
            throw new Error('Either teamId or userId must be provided');
        }

        if (input.teamId && input.userId) {
            throw new Error('Cannot grant access to both team and user simultaneously');
        }

        if (!input.gameId && !input.allGames) {
            throw new Error('Either gameId or allGames must be specified');
        }

        if (input.gameId && input.allGames) {
            throw new Error('Cannot specify both gameId and allGames');
        }

        // Check if access already exists
        const existing = await prisma.gameAccess.findFirst({
            where: {
                teamId: input.teamId,
                userId: input.userId,
                gameId: input.gameId,
                allGames: input.allGames || false,
            },
        });

        if (existing) {
            throw new Error('Access already granted');
        }

        const gameAccess = await prisma.gameAccess.create({
            data: {
                teamId: input.teamId,
                userId: input.userId,
                gameId: input.gameId,
                allGames: input.allGames || false,
                accessLevel: input.accessLevel,
                grantedBy: input.grantedBy,
                expiresAt: input.expiresAt,
            },
        });

        // Log audit
        await auditLogService.log({
            userId: input.grantedBy,
            action: AUDIT_ACTIONS.GAME_ACCESS_GRANTED,
            resource: input.gameId ? `Game:${input.gameId}` : 'AllGames',
            details: {
                teamId: input.teamId,
                userId: input.userId,
                accessLevel: input.accessLevel,
                allGames: input.allGames,
            },
        });

        return gameAccess;
    }

    /**
     * Revoke game access
     */
    async revokeAccess(accessId: string, revokedBy: string): Promise<void> {
        const access = await prisma.gameAccess.findUnique({
            where: { id: accessId },
        });

        if (!access) {
            throw new Error('Access not found');
        }

        await prisma.gameAccess.delete({
            where: { id: accessId },
        });

        // Log audit
        await auditLogService.log({
            userId: revokedBy,
            action: AUDIT_ACTIONS.GAME_ACCESS_REVOKED,
            resource: access.gameId ? `Game:${access.gameId}` : 'AllGames',
            details: {
                teamId: access.teamId,
                userId: access.userId,
                accessLevel: access.accessLevel,
            },
        });
    }

    /**
     * Update access level
     */
    async updateAccessLevel(
        accessId: string,
        newAccessLevel: AccessLevel,
        updatedBy: string
    ) {
        const access = await prisma.gameAccess.update({
            where: { id: accessId },
            data: { accessLevel: newAccessLevel },
        });

        // Log audit
        await auditLogService.log({
            userId: updatedBy,
            action: AUDIT_ACTIONS.GAME_ACCESS_UPDATED,
            resource: access.gameId ? `Game:${access.gameId}` : 'AllGames',
            details: {
                accessId,
                newAccessLevel,
            },
        });

        return access;
    }

    /**
     * Get all access entries for a game
     */
    async getGameAccess(gameId: string) {
        return prisma.gameAccess.findMany({
            where: {
                OR: [
                    { gameId },
                    { allGames: true },
                ],
            },
            include: {
                team: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
    }

    /**
     * Get all games a user can access (directly or through teams)
     */
    async getUserAccessibleGames(userId: string) {
        // Get user's team memberships
        const teamMemberships = await prisma.teamMember.findMany({
            where: { userId },
            select: { teamId: true },
        });

        const teamIds = teamMemberships.map((tm) => tm.teamId);

        // Get all game accesses (direct user access + team access)
        const accesses = await prisma.gameAccess.findMany({
            where: {
                OR: [
                    { userId },
                    { teamId: { in: teamIds } },
                ],
            },
            include: {
                game: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        createdAt: true,
                    },
                },
                team: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        // If user has "all games" access, fetch all games
        const hasAllGamesAccess = accesses.some((access) => access.allGames);

        if (hasAllGamesAccess) {
            const allGames = await prisma.game.findMany({
                select: {
                    id: true,
                    name: true,
                    description: true,
                    createdAt: true,
                },
            });

            return {
                hasAllGamesAccess: true,
                games: allGames,
                accesses,
            };
        }

        // Return unique games
        const gameMap = new Map();
        accesses.forEach((access) => {
            if (access.game && !gameMap.has(access.game.id)) {
                gameMap.set(access.game.id, {
                    ...access.game,
                    accessLevel: access.accessLevel,
                    accessSource: access.teamId ? 'team' : 'direct',
                    teamName: access.team?.name,
                });
            }
        });

        return {
            hasAllGamesAccess: false,
            games: Array.from(gameMap.values()),
            accesses,
        };
    }

    /**
     * Check if user has access to a specific game
     */
    async hasGameAccess(
        userId: string,
        gameId: string,
        requiredLevel?: AccessLevel
    ): Promise<{ hasAccess: boolean; accessLevel?: AccessLevel }> {
        // Get user's team memberships
        const teamMemberships = await prisma.teamMember.findMany({
            where: { userId },
            select: { teamId: true, role: true },
        });

        const teamIds = teamMemberships.map((tm) => tm.teamId);

        // Check for SUPER_ADMIN role (has access to everything)
        const hasSuperAdminRole = teamMemberships.some((tm) => tm.role === 'SUPER_ADMIN');
        if (hasSuperAdminRole) {
            return { hasAccess: true, accessLevel: 'OWNER' };
        }

        // Find applicable game accesses
        const accesses = await prisma.gameAccess.findMany({
            where: {
                OR: [
                    { userId, gameId },
                    { userId, allGames: true },
                    { teamId: { in: teamIds }, gameId },
                    { teamId: { in: teamIds }, allGames: true },
                ],
            },
        });

        if (accesses.length === 0) {
            return { hasAccess: false };
        }

        // Find the highest access level
        const accessLevels = ['VIEWER', 'EDITOR', 'OWNER'];
        let highestLevel: AccessLevel = 'VIEWER';

        accesses.forEach((access) => {
            const currentIndex = accessLevels.indexOf(access.accessLevel);
            const highestIndex = accessLevels.indexOf(highestLevel);
            if (currentIndex > highestIndex) {
                highestLevel = access.accessLevel;
            }
        });

        // Check if user meets required level
        if (requiredLevel) {
            const requiredIndex = accessLevels.indexOf(requiredLevel);
            const userIndex = accessLevels.indexOf(highestLevel);
            return {
                hasAccess: userIndex >= requiredIndex,
                accessLevel: highestLevel,
            };
        }

        return { hasAccess: true, accessLevel: highestLevel };
    }

    /**
     * Get user's access level for a game
     */
    async getUserAccessLevel(userId: string, gameId: string): Promise<AccessLevel | null> {
        const result = await this.hasGameAccess(userId, gameId);
        return result.accessLevel || null;
    }

    /**
     * Bulk grant access to multiple users
     */
    async bulkGrantAccess(
        inputs: Array<Omit<GrantAccessInput, 'grantedBy'>>,
        grantedBy: string
    ) {
        const results = await Promise.allSettled(
            inputs.map((input) => this.grantAccess({ ...input, grantedBy }))
        );

        const successful = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        return { successful, failed, results };
    }

    /**
     * Clean up expired accesses
     */
    async cleanupExpiredAccesses(): Promise<number> {
        const result = await prisma.gameAccess.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });

        return result.count;
    }
}

export default new GameAccessService();

