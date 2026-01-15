import { Response } from 'express';
import authService from '../services/AuthService';
import tokenService from '../services/TokenService';
import auditLogService, { AUDIT_ACTIONS } from '../services/AuditLogService';
import { DashboardAuthRequest } from '../middleware/dashboardAuth';
import { ApiResponse } from '../types/api';

export class AuthController {
    /**
     * Register a new user
     */
    async register(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { email, password, firstName, lastName } = req.body;

            // Validate input
            if (!email || !password || !firstName || !lastName) {
                return res.status(400).json({
                    success: false,
                    error: 'Email, password, first name, and last name are required',
                });
            }

            // Validate password strength
            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters long',
                });
            }

            const user = await authService.register({
                email,
                password,
                firstName,
                lastName,
            });

            // Generate email verification token
            const verificationToken = await authService.generateEmailVerificationToken(user.id);

            // TODO: Send verification email
            // await emailService.sendVerificationEmail(user.email, verificationToken);

            // Log audit
            await auditLogService.log({
                userId: user.id,
                action: AUDIT_ACTIONS.USER_REGISTER,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });

            return res.status(201).json({
                success: true,
                data: {
                    message: 'Registration successful. Please check your email to verify your account.',
                    userId: user.id,
                },
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Registration failed',
            });
        }
    }

    /**
     * Login
     */
    async login(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and password are required',
                });
            }

            const result = await authService.login(
                email,
                password,
                req.get('user-agent'),
                req.ip
            );

            // If 2FA is required
            if (result.require2FA) {
                return res.json({
                    success: true,
                    data: {
                        require2FA: true,
                        userId: result.user.id,
                        message: 'Please enter your 2FA code',
                    },
                });
            }

            // Log audit
            await auditLogService.log({
                userId: result.user.id,
                action: AUDIT_ACTIONS.USER_LOGIN,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });

            // Set refresh token as httpOnly cookie
            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });

            return res.json({
                success: true,
                data: {
                    accessToken: result.accessToken,
                    user: result.user,
                },
            });
        } catch (error: any) {
            return res.status(401).json({
                success: false,
                error: error.message || 'Login failed',
            });
        }
    }

    /**
     * Logout
     */
    async logout(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const refreshToken = req.cookies?.refreshToken;

            if (refreshToken) {
                await tokenService.revokeRefreshToken(refreshToken);
            }

            // Log audit
            if (req.dashboardUser) {
                await auditLogService.log({
                    userId: req.dashboardUser.id,
                    action: AUDIT_ACTIONS.USER_LOGOUT,
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                });
            }

            res.clearCookie('refreshToken');

            return res.json({
                success: true,
                data: { message: 'Logged out successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Logout failed',
            });
        }
    }

    /**
     * Refresh access token
     */
    async refresh(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

            if (!refreshToken) {
                return res.status(401).json({
                    success: false,
                    error: 'Refresh token is required',
                });
            }

            const result = await tokenService.verifyAndRotateRefreshToken(
                refreshToken,
                req.get('user-agent'),
                req.ip
            );

            if (!result) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired refresh token',
                });
            }

            // Set new refresh token as httpOnly cookie
            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });

            return res.json({
                success: true,
                data: {
                    accessToken: result.accessToken,
                },
            });
        } catch (error: any) {
            return res.status(401).json({
                success: false,
                error: 'Token refresh failed',
            });
        }
    }

    /**
     * Get current user
     */
    async me(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const user = await authService.getUserById(req.dashboardUser.id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.json({
                success: true,
                data: user,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get user info',
            });
        }
    }

    /**
     * Update profile
     */
    async updateProfile(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { firstName, lastName } = req.body;

            await authService.updateProfile(req.dashboardUser.id, {
                firstName,
                lastName,
            });

            return res.json({
                success: true,
                data: { message: 'Profile updated successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to update profile',
            });
        }
    }

    /**
     * Change password
     */
    async changePassword(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Current password and new password are required',
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'New password must be at least 8 characters long',
                });
            }

            await authService.changePassword(
                req.dashboardUser.id,
                currentPassword,
                newPassword
            );

            // Log audit
            await auditLogService.log({
                userId: req.dashboardUser.id,
                action: AUDIT_ACTIONS.PASSWORD_CHANGE,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });

            return res.json({
                success: true,
                data: { message: 'Password changed successfully. Please log in again.' },
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Failed to change password',
            });
        }
    }

    /**
     * Request password reset
     */
    async forgotPassword(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is required',
                });
            }

            const resetToken = await authService.generatePasswordResetToken(email);

            // TODO: Send password reset email
            // await emailService.sendPasswordResetEmail(email, resetToken);

            // Log audit
            await auditLogService.log({
                action: AUDIT_ACTIONS.PASSWORD_RESET_REQUEST,
                details: { email },
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });

            return res.json({
                success: true,
                data: {
                    message: 'If the email exists, a password reset link has been sent.',
                },
            });
        } catch (error: any) {
            // Don't reveal if email exists
            return res.json({
                success: true,
                data: {
                    message: 'If the email exists, a password reset link has been sent.',
                },
            });
        }
    }

    /**
     * Reset password with token
     */
    async resetPassword(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { token } = req.params;
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

            await authService.resetPassword(token, newPassword);

            // Log audit
            await auditLogService.log({
                action: AUDIT_ACTIONS.PASSWORD_RESET,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });

            return res.json({
                success: true,
                data: { message: 'Password reset successfully. Please log in.' },
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Password reset failed',
            });
        }
    }

    /**
     * Verify email
     */
    async verifyEmail(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            const { token } = req.params;

            await authService.verifyEmail(token);

            return res.json({
                success: true,
                data: { message: 'Email verified successfully' },
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: error.message || 'Email verification failed',
            });
        }
    }

    /**
     * Get user sessions
     */
    async getSessions(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const sessions = await tokenService.getUserSessions(req.dashboardUser.id);

            return res.json({
                success: true,
                data: sessions,
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get sessions',
            });
        }
    }

    /**
     * Revoke a session
     */
    async revokeSession(req: DashboardAuthRequest, res: Response<ApiResponse>) {
        try {
            if (!req.dashboardUser) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }

            const { sessionId } = req.params;

            const success = await tokenService.revokeSession(
                req.dashboardUser.id,
                sessionId
            );

            if (!success) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found',
                });
            }

            return res.json({
                success: true,
                data: { message: 'Session revoked successfully' },
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: 'Failed to revoke session',
            });
        }
    }
}

export default new AuthController();

