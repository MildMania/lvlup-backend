import { Response } from 'express';
import teamService from '../services/TeamService';
import { DashboardAuthRequest } from '../middleware/dashboardAuth';
import { ApiResponse } from '../types/api';
import { DashboardRole } from '@prisma/client';

export class TeamController {
    /**
     * Create a new team
     */
    async createTeam(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { name, description, slug } = req.body;

            if (!name || !slug) {
                return res.status(400).json({
                    success: false,
                    error: 'Team name and slug are required',
                });
            }

            const team = await teamService.createTeam({
                name,
                description,
                slug,
                createdBy: req.dashboardUser.id,
            });

            return res.status(201).json({
                success: true,
                data: team,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to create team',
            });
        }
    }

    /**
     * Get user's teams
     */
    async getUserTeams(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const teams = await teamService.getUserTeams(req.dashboardUser.id);

            return res.json({
                success: true,
                data: teams,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get teams',
            });
        }
    }

    /**
     * List all teams (admin only)
     */
    async listAllTeams(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;

            const result = await teamService.listAllTeams(limit, offset);

            return res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to list teams',
            });
        }
    }

    /**
     * Get team by ID
     */
    async getTeamById(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { id } = req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Team ID is required',
                });
            }

            const team = await teamService.getTeamById(id);

            if (!team) {
                return res.status(404).json({
                    success: false,
                    error: 'Team not found',
                });
            }

            return res.json({
                success: true,
                data: team,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get team',
            });
        }
    }

    /**
     * Update team
     */
    async updateTeam(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id } = req.params;
            const { name, description, slug } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Team ID is required',
                });
            }

            const team = await teamService.updateTeam(
                id,
                { name, description, slug },
                req.dashboardUser.id
            );

            return res.json({
                success: true,
                data: team,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to update team',
            });
        }
    }

    /**
     * Delete team
     */
    async deleteTeam(req: DashboardAuthRequest, res: Response<ApiResponse>) {
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
                    error: 'Team ID is required',
                });
            }

            await teamService.deleteTeam(id, req.dashboardUser.id);

            return res.json({
                success: true,
                data: { message: 'Team deleted successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to delete team',
            });
        }
    }

    /**
     * Get team members
     */
    async getTeamMembers(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { id } = req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Team ID is required',
                });
            }

            const members = await teamService.getTeamMembers(id);

            return res.json({
                success: true,
                data: members,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get team members',
            });
        }
    }

    /**
     * Add member to team
     */
    async addMember(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id } = req.params;
            const { userId, role } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Team ID is required',
                });
            }

            if (!userId || !role) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID and role are required',
                });
            }

            const member = await teamService.addMember({
                teamId: id,
                userId,
                role: role as DashboardRole,
                addedBy: req.dashboardUser.id,
            });

            return res.status(201).json({
                success: true,
                data: member,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to add member',
            });
        }
    }

    /**
     * Update member role
     */
    async updateMemberRole(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id, userId } = req.params;
            const { role } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Team ID is required',
                });
            }

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

            if (!role) {
                return res.status(400).json({
                    success: false,
                    error: 'Role is required',
                });
            }

            const member = await teamService.updateMemberRole(
                id,
                userId,
                role as DashboardRole,
                req.dashboardUser.id
            );

            return res.json({
                success: true,
                data: member,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to update member role',
            });
        }
    }

    /**
     * Remove member from team
     */
    async removeMember(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { id, userId } = req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Team ID is required',
                });
            }

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

            await teamService.removeMember(id, userId, req.dashboardUser.id);

            return res.json({
                success: true,
                data: { message: 'Member removed successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to remove member',
            });
        }
    }
}

export default new TeamController();

