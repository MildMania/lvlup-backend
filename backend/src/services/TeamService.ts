import { PrismaClient, DashboardRole, Team, TeamMember } from '@prisma/client';
import auditLogService, { AUDIT_ACTIONS } from './AuditLogService';

const prisma = new PrismaClient();

interface CreateTeamInput {
    name: string;
    description?: string;
    slug: string;
    createdBy: string;
}

interface AddMemberInput {
    teamId: string;
    userId: string;
    role: DashboardRole;
    addedBy: string;
}

export class TeamService {
    /**
     * Create a new team
     */
    async createTeam(input: CreateTeamInput): Promise<Team> {
        // Check if slug already exists
        const existing = await prisma.team.findUnique({
            where: { slug: input.slug },
        });

        if (existing) {
            throw new Error('Team slug already exists');
        }

        const team = await prisma.team.create({
            data: {
                name: input.name,
                description: input.description,
                slug: input.slug,
            },
        });

        // Log audit
        await auditLogService.log({
            userId: input.createdBy,
            action: AUDIT_ACTIONS.TEAM_CREATED,
            resource: `Team:${team.id}`,
            details: { teamName: team.name, slug: team.slug },
        });

        return team;
    }

    /**
     * Get team by ID
     */
    async getTeamById(teamId: string) {
        return prisma.team.findUnique({
            where: { id: teamId },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                                isActive: true,
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
            },
        });
    }

    /**
     * Get all teams for a user
     */
    async getUserTeams(userId: string) {
        return prisma.team.findMany({
            where: {
                members: {
                    some: {
                        userId,
                    },
                },
                isActive: true,
            },
            include: {
                members: {
                    where: {
                        userId,
                    },
                    select: {
                        role: true,
                    },
                },
                _count: {
                    select: {
                        members: true,
                        gameAccesses: true,
                    },
                },
            },
        });
    }

    /**
     * List all teams (admin only)
     */
    async listAllTeams(limit: number = 50, offset: number = 0) {
        const [teams, total] = await Promise.all([
            prisma.team.findMany({
                include: {
                    _count: {
                        select: {
                            members: true,
                            gameAccesses: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.team.count(),
        ]);

        return { teams, total, limit, offset };
    }

    /**
     * Update team
     */
    async updateTeam(
        teamId: string,
        data: { name?: string; description?: string; slug?: string },
        updatedBy: string
    ): Promise<Team> {
        // If slug is being updated, check if it's available
        if (data.slug) {
            const existing = await prisma.team.findFirst({
                where: {
                    slug: data.slug,
                    id: { not: teamId },
                },
            });

            if (existing) {
                throw new Error('Team slug already exists');
            }
        }

        const team = await prisma.team.update({
            where: { id: teamId },
            data,
        });

        // Log audit
        await auditLogService.log({
            userId: updatedBy,
            action: AUDIT_ACTIONS.TEAM_UPDATED,
            resource: `Team:${teamId}`,
            details: data,
        });

        return team;
    }

    /**
     * Delete team (soft delete)
     */
    async deleteTeam(teamId: string, deletedBy: string): Promise<void> {
        await prisma.team.update({
            where: { id: teamId },
            data: { isActive: false },
        });

        // Log audit
        await auditLogService.log({
            userId: deletedBy,
            action: AUDIT_ACTIONS.TEAM_DELETED,
            resource: `Team:${teamId}`,
        });
    }

    /**
     * Add member to team
     */
    async addMember(input: AddMemberInput): Promise<TeamMember> {
        // Check if user is already a member
        const existing = await prisma.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId: input.teamId,
                    userId: input.userId,
                },
            },
        });

        if (existing) {
            throw new Error('User is already a member of this team');
        }

        const member = await prisma.teamMember.create({
            data: {
                teamId: input.teamId,
                userId: input.userId,
                role: input.role,
            },
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
        });

        // Log audit
        await auditLogService.log({
            userId: input.addedBy,
            action: AUDIT_ACTIONS.TEAM_MEMBER_ADDED,
            resource: `Team:${input.teamId}`,
            details: {
                addedUserId: input.userId,
                role: input.role,
            },
        });

        return member;
    }

    /**
     * Remove member from team
     */
    async removeMember(teamId: string, userId: string, removedBy: string): Promise<void> {
        await prisma.teamMember.delete({
            where: {
                teamId_userId: {
                    teamId,
                    userId,
                },
            },
        });

        // Log audit
        await auditLogService.log({
            userId: removedBy,
            action: AUDIT_ACTIONS.TEAM_MEMBER_REMOVED,
            resource: `Team:${teamId}`,
            details: { removedUserId: userId },
        });
    }

    /**
     * Update member role
     */
    async updateMemberRole(
        teamId: string,
        userId: string,
        newRole: DashboardRole,
        updatedBy: string
    ): Promise<TeamMember> {
        const member = await prisma.teamMember.update({
            where: {
                teamId_userId: {
                    teamId,
                    userId,
                },
            },
            data: { role: newRole },
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
        });

        // Log audit
        await auditLogService.log({
            userId: updatedBy,
            action: AUDIT_ACTIONS.TEAM_MEMBER_ROLE_CHANGED,
            resource: `Team:${teamId}`,
            details: {
                targetUserId: userId,
                newRole,
            },
        });

        return member;
    }

    /**
     * Get team members
     */
    async getTeamMembers(teamId: string) {
        return prisma.teamMember.findMany({
            where: { teamId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        isActive: true,
                        lastLogin: true,
                    },
                },
            },
            orderBy: {
                joinedAt: 'asc',
            },
        });
    }

    /**
     * Get user's role in a team
     */
    async getUserRoleInTeam(teamId: string, userId: string): Promise<DashboardRole | null> {
        const member = await prisma.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId,
                    userId,
                },
            },
            select: {
                role: true,
            },
        });

        return member?.role || null;
    }

    /**
     * Check if user is a team admin (ADMIN or SUPER_ADMIN role)
     */
    async isTeamAdmin(teamId: string, userId: string): Promise<boolean> {
        const member = await prisma.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId,
                    userId,
                },
            },
            select: {
                role: true,
            },
        });

        return member?.role === 'ADMIN' || member?.role === 'SUPER_ADMIN';
    }
}

export default new TeamService();

