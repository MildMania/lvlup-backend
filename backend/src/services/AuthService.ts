import bcrypt from 'bcrypt';
import { PrismaClient, DashboardUser } from '@prisma/client';
import crypto from 'crypto';
import tokenService from './TokenService';
import prisma from '../prisma';

interface RegisterInput {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    createdBy?: string; // Admin who created this account
}

interface LoginResult {
    user: Omit<DashboardUser, 'passwordHash'>;
    accessToken: string;
    refreshToken: string;
    require2FA?: boolean;
}

export class AuthService {
    private bcryptRounds: number;

    constructor() {
        this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    }

    /**
     * Register a new dashboard user
     */
    async register(input: RegisterInput): Promise<DashboardUser> {
        // Check if email already exists
        const existingUser = await prisma.dashboardUser.findUnique({
            where: { email: input.email.toLowerCase() },
        });

        if (existingUser) {
            throw new Error('Email already registered');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, this.bcryptRounds);

        // Create user
        const user = await prisma.dashboardUser.create({
            data: {
                email: input.email.toLowerCase(),
                passwordHash,
                firstName: input.firstName,
                lastName: input.lastName,
                createdBy: input.createdBy,
                isEmailVerified: input.createdBy ? true : false, // Auto-verify if created by admin
            },
        });

        return user;
    }

    /**
     * Login with email and password
     */
    async login(
        email: string,
        password: string,
        userAgent?: string,
        ipAddress?: string
    ): Promise<LoginResult> {
        // Find user
        const user = await prisma.dashboardUser.findUnique({
            where: { email: email.toLowerCase() },
            include: {
                twoFactorAuth: true,
            },
        });

        if (!user) {
            throw new Error('Invalid email or password');
        }

        // Check if account is active
        if (!user.isActive) {
            throw new Error('Account is deactivated. Please contact an administrator.');
        }

        // Check if account is locked
        if (user.isLocked) {
            throw new Error('Account is locked due to multiple failed login attempts. Please contact an administrator.');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
            // Increment failed login attempts
            await this.incrementFailedLoginAttempts(user.id);
            throw new Error('Invalid email or password');
        }

        // Check if 2FA is enabled
        if (user.twoFactorAuth && user.twoFactorAuth.isEnabled) {
            // Return without tokens - require 2FA verification
            const { passwordHash, ...userWithoutPassword } = user;
            return {
                user: userWithoutPassword,
                accessToken: '',
                refreshToken: '',
                require2FA: true,
            };
        }

        // Reset failed login attempts
        await prisma.dashboardUser.update({
            where: { id: user.id },
            data: {
                failedLoginAttempts: 0,
                lastLogin: new Date(),
                lastLoginIp: ipAddress,
            },
        });

        // Generate tokens
        const { accessToken, refreshToken } = await tokenService.generateTokenPair(
            user.id,
            user.email,
            userAgent,
            ipAddress
        );

        const { passwordHash, ...userWithoutPassword } = user;

        return {
            user: userWithoutPassword,
            accessToken,
            refreshToken,
        };
    }

    /**
     * Increment failed login attempts and lock account if needed
     */
    private async incrementFailedLoginAttempts(userId: string): Promise<void> {
        const user = await prisma.dashboardUser.findUnique({
            where: { id: userId },
            select: { failedLoginAttempts: true },
        });

        if (!user) return;

        const newAttempts = user.failedLoginAttempts + 1;
        const maxAttempts = 5;

        await prisma.dashboardUser.update({
            where: { id: userId },
            data: {
                failedLoginAttempts: newAttempts,
                lastFailedLogin: new Date(),
                isLocked: newAttempts >= maxAttempts,
                lockReason: newAttempts >= maxAttempts ? 'Too many failed login attempts' : undefined,
            },
        });
    }

    /**
     * Unlock a locked account (Admin only)
     */
    async unlockAccount(userId: string): Promise<void> {
        await prisma.dashboardUser.update({
            where: { id: userId },
            data: {
                isLocked: false,
                lockReason: null,
                failedLoginAttempts: 0,
            },
        });
    }

    /**
     * Generate password reset token
     */
    async generatePasswordResetToken(email: string): Promise<string> {
        const user = await prisma.dashboardUser.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            // Don't reveal if email exists
            throw new Error('If the email exists, a reset link has been sent');
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.dashboardUser.update({
            where: { id: user.id },
            data: {
                passwordResetToken: resetTokenHash,
                passwordResetExpires: resetExpires,
            },
        });

        return resetToken; // Return unhashed token to send via email
    }

    /**
     * Reset password using token
     */
    async resetPassword(token: string, newPassword: string): Promise<void> {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const user = await prisma.dashboardUser.findFirst({
            where: {
                passwordResetToken: tokenHash,
                passwordResetExpires: {
                    gt: new Date(),
                },
            },
        });

        if (!user) {
            throw new Error('Invalid or expired reset token');
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);

        // Update password and clear reset token
        await prisma.dashboardUser.update({
            where: { id: user.id },
            data: {
                passwordHash,
                passwordResetToken: null,
                passwordResetExpires: null,
                failedLoginAttempts: 0,
                isLocked: false,
                lockReason: null,
            },
        });

        // Revoke all existing tokens
        await tokenService.revokeAllUserTokens(user.id);
    }

    /**
     * Change password (when logged in)
     */
    async changePassword(
        userId: string,
        currentPassword: string,
        newPassword: string
    ): Promise<void> {
        const user = await prisma.dashboardUser.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

        if (!isPasswordValid) {
            throw new Error('Current password is incorrect');
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);

        // Update password
        await prisma.dashboardUser.update({
            where: { id: userId },
            data: { passwordHash },
        });

        // Revoke all existing tokens (force re-login)
        await tokenService.revokeAllUserTokens(userId);
    }

    /**
     * Generate email verification token
     */
    async generateEmailVerificationToken(userId: string): Promise<string> {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await prisma.dashboardUser.update({
            where: { id: userId },
            data: {
                emailVerificationToken: tokenHash,
                emailVerificationExpires: expires,
            },
        });

        return token;
    }

    /**
     * Verify email using token
     */
    async verifyEmail(token: string): Promise<void> {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const user = await prisma.dashboardUser.findFirst({
            where: {
                emailVerificationToken: tokenHash,
                emailVerificationExpires: {
                    gt: new Date(),
                },
            },
        });

        if (!user) {
            throw new Error('Invalid or expired verification token');
        }

        await prisma.dashboardUser.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                emailVerificationToken: null,
                emailVerificationExpires: null,
            },
        });
    }

    /**
     * Get user by ID (without password)
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
                lastLogin: true,
                createdAt: true,
                updatedAt: true,
                teamMemberships: {
                    include: {
                        team: true,
                    },
                },
                twoFactorAuth: {
                    select: {
                        isEnabled: true,
                    },
                },
            },
        });

        return user;
    }

    /**
     * Update user profile
     */
    async updateProfile(
        userId: string,
        data: { firstName?: string; lastName?: string }
    ): Promise<void> {
        await prisma.dashboardUser.update({
            where: { id: userId },
            data,
        });
    }

    /**
     * Deactivate user account
     */
    async deactivateAccount(userId: string): Promise<void> {
        await prisma.dashboardUser.update({
            where: { id: userId },
            data: { isActive: false },
        });

        // Revoke all tokens
        await tokenService.revokeAllUserTokens(userId);
    }
}

export default new AuthService();

