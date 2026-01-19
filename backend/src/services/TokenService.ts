import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

interface TokenPayload {
    userId: string;
    email: string;
    role?: string;
}

interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

export class TokenService {
    private accessSecret: string;
    private refreshSecret: string;
    private accessExpires: string;
    private refreshExpires: string;

    constructor() {
        this.accessSecret = process.env.JWT_ACCESS_SECRET || 'default-access-secret-change-me';
        this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-me';
        this.accessExpires = process.env.JWT_ACCESS_EXPIRES || '1h'; // Increased from 15m to 1h
        this.refreshExpires = process.env.JWT_REFRESH_EXPIRES || '7d';
    }

    /**
     * Generate access and refresh token pair
     */
    async generateTokenPair(
        userId: string,
        email: string,
        userAgent?: string,
        ipAddress?: string
    ): Promise<TokenPair> {
        const payload: TokenPayload = { userId, email };

        // Generate access token (short-lived)
        const accessToken = jwt.sign(payload, this.accessSecret, {
            expiresIn: this.accessExpires,
        } as jwt.SignOptions);

        // Generate refresh token (long-lived)
        const refreshToken = crypto.randomBytes(64).toString('hex');

        // Calculate expiration date for refresh token
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        // Store refresh token in database
        await prisma.refreshToken.create({
            data: {
                userId,
                token: refreshToken,
                expiresAt,
                ...(userAgent && { userAgent }),
                ...(ipAddress && { ipAddress }),
            },
        });

        return { accessToken, refreshToken };
    }

    /**
     * Verify access token
     */
    verifyAccessToken(token: string): TokenPayload {
        try {
            const payload = jwt.verify(token, this.accessSecret) as TokenPayload;
            return payload;
        } catch (error) {
            throw new Error('Invalid or expired access token');
        }
    }

    /**
     * Verify and rotate refresh token
     */
    async verifyAndRotateRefreshToken(
        refreshToken: string,
        userAgent?: string,
        ipAddress?: string
    ): Promise<TokenPair | null> {
        // Find refresh token in database
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });

        if (!storedToken) {
            return null;
        }

        // Check if token has expired
        if (storedToken.expiresAt < new Date()) {
            // Delete expired token
            await prisma.refreshToken.delete({
                where: { id: storedToken.id },
            });
            return null;
        }

        // Delete old refresh token
        await prisma.refreshToken.delete({
            where: { id: storedToken.id },
        });

        // Generate new token pair
        return this.generateTokenPair(
            storedToken.userId,
            storedToken.user.email,
            userAgent,
            ipAddress
        );
    }

    /**
     * Revoke all refresh tokens for a user
     */
    async revokeAllUserTokens(userId: string): Promise<void> {
        await prisma.refreshToken.deleteMany({
            where: { userId },
        });
    }

    /**
     * Revoke specific refresh token
     */
    async revokeRefreshToken(refreshToken: string): Promise<void> {
        await prisma.refreshToken.deleteMany({
            where: { token: refreshToken },
        });
    }

    /**
     * Clean up expired refresh tokens (for scheduled cleanup jobs)
     */
    async cleanupExpiredTokens(): Promise<number> {
        const result = await prisma.refreshToken.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });
        return result.count;
    }

    /**
     * Get all active sessions for a user
     */
    async getUserSessions(userId: string) {
        return prisma.refreshToken.findMany({
            where: {
                userId,
                expiresAt: {
                    gt: new Date(),
                },
            },
            select: {
                id: true,
                createdAt: true,
                userAgent: true,
                ipAddress: true,
                expiresAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    /**
     * Revoke a specific session
     */
    async revokeSession(userId: string, sessionId: string): Promise<boolean> {
        const result = await prisma.refreshToken.deleteMany({
            where: {
                id: sessionId,
                userId, // Ensure user can only revoke their own sessions
            },
        });
        return result.count > 0;
    }
}

export default new TokenService();

