import { Router } from 'express';
import authController from '../controllers/AuthController';
import { dashboardAuth } from '../middleware/dashboardAuth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5'),
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Public routes
router.post('/register', authLimiter, authController.register.bind(authController));
router.post('/login', authLimiter, authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.post('/forgot-password', authLimiter, authController.forgotPassword.bind(authController));
router.post('/reset-password/:token', authController.resetPassword.bind(authController));
router.post('/verify-email/:token', authController.verifyEmail.bind(authController));

// Protected routes
router.post('/logout', dashboardAuth, authController.logout.bind(authController));
router.get('/me', dashboardAuth, authController.me.bind(authController));
router.put('/me', dashboardAuth, authController.updateProfile.bind(authController));
router.put('/change-password', dashboardAuth, authController.changePassword.bind(authController));

// Session management
router.get('/sessions', dashboardAuth, authController.getSessions.bind(authController));
router.delete('/sessions/:sessionId', dashboardAuth, authController.revokeSession.bind(authController));

export default router;

