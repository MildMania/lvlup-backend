import { Request, Response, NextFunction } from 'express';
import { DashboardRole, AccessLevel } from '@prisma/client';
import tokenService from '../services/TokenService';
import gameAccessService from '../services/GameAccessService';
import { ApiResponse } from '../types/api';

export interface DashboardAuthRequest extends Request {
    dashboardUser?: {
        id: string;
        email: string;
        role?: DashboardRole;
    };
}

/**
 * Authenticate dashboard user via JWT token
 */
export const dashboardAuth = async (
    req: DashboardAuthRequest,
    res: Response<ApiResponse>,
    next: NextFunction
) => {
    try {
        // Get token from header or cookie
        let token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token && req.cookies?.accessToken) {
            token = req.cookies.accessToken;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please provide a valid access token.',
            });
        }

        // Verify token
        const payload = tokenService.verifyAccessToken(token);

        // Attach user info to request
        req.dashboardUser = {
            id: payload.userId,
            email: payload.email,
        };

        next();
    } catch (error: any) {
        return res.status(401).json({
            success: false,
            error: error.message || 'Invalid or expired token',
        });
    }
};

/**
 * Check if user has required role
 */
export const requireRole = (...roles: DashboardRole[]) => {
    return async (
        req: DashboardAuthRequest,
        res: Response<ApiResponse>,
        next: NextFunction
    ) => {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                });
            }

            // Get user's highest role from team memberships
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();

            const memberships = await prisma.teamMember.findMany({
                where: { userId: req.dashboardUser.id },
                select: { role: true },
            });

            if (memberships.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'User has no team memberships',
                });
            }

            // Check if user has any of the required roles
            const userRoles = memberships.map((m: any) => m.role);
            
            // SUPER_ADMIN can access everything
            if (userRoles.includes('SUPER_ADMIN')) {
                req.dashboardUser.role = 'SUPER_ADMIN';
                return next();
            }

            const hasRequiredRole = roles.some((role) => userRoles.includes(role));

            if (!hasRequiredRole) {
                return res.status(403).json({
                    success: false,
                    error: `Access denied. Required role: ${roles.join(' or ')}`,
                });
            }

            // Attach user's highest role
            const roleHierarchy = ['VIEWER', 'EDITOR', 'GAME_OWNER', 'ADMIN', 'SUPER_ADMIN'];
            let highestRole: DashboardRole = 'VIEWER';
            userRoles.forEach((role: DashboardRole) => {
                if (roleHierarchy.indexOf(role) > roleHierarchy.indexOf(highestRole)) {
                    highestRole = role;
                }
            });
            req.dashboardUser.role = highestRole;

            next();
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Error checking user role',
            });
        }
    };
};

/**
 * Check if user has access to a specific game with required access level
 */
export const requireGameAccess = (requiredLevel?: AccessLevel) => {
    return async (
        req: DashboardAuthRequest,
        res: Response<ApiResponse>,
        next: NextFunction
    ) => {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                });
            }

            // Get gameId from params or query
            const gameId = req.params.gameId || req.params.id || req.query.gameId as string;

            if (!gameId) {
                return res.status(400).json({
                    success: false,
                    error: 'Game ID is required',
                });
            }

            // Check access
            const access = await gameAccessService.hasGameAccess(
                req.dashboardUser.id,
                gameId,
                requiredLevel
            );

            if (!access.hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have access to this game',
                });
            }

            next();
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Error checking game access',
            });
        }
    };
};

/**
 * Require SUPER_ADMIN role
 */
export const requireSuperAdmin = requireRole('SUPER_ADMIN');

/**
 * Require ADMIN or SUPER_ADMIN role
 */
export const requireAdmin = requireRole('ADMIN', 'SUPER_ADMIN');

/**
 * Require GAME_OWNER, ADMIN, or SUPER_ADMIN role
 */
export const requireGameOwner = requireRole('GAME_OWNER', 'ADMIN', 'SUPER_ADMIN');

/**
 * Check if user is team admin
 */
export const requireTeamAdmin = async (
    req: DashboardAuthRequest,
    res: Response<ApiResponse>,
    next: NextFunction
) => {
    try {
        if (!req.dashboardUser) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const teamId = req.params.teamId || req.params.id;

        if (!teamId) {
            return res.status(400).json({
                success: false,
                error: 'Team ID is required',
            });
        }

        const teamService = require('../services/TeamService').default;
        const isAdmin = await teamService.isTeamAdmin(teamId, req.dashboardUser.id);

        if (!isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'You must be a team admin to perform this action',
            });
        }

        next();
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            error: 'Error checking team admin status',
        });
    }
};

/**
 * Optional dashboard auth - doesn't fail if no token provided
 */
export const optionalDashboardAuth = async (
    req: DashboardAuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        let token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token && req.cookies?.accessToken) {
            token = req.cookies.accessToken;
        }

        if (token) {
            try {
                const payload = tokenService.verifyAccessToken(token);
                req.dashboardUser = {
                    id: payload.userId,
                    email: payload.email,
                };
            } catch (error) {
                // Ignore token errors for optional auth
            }
        }

        next();
    } catch (error) {
        next();
    }
};

