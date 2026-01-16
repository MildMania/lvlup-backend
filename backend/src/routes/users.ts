import { Router } from 'express';
import userManagementController from '../controllers/UserManagementController';
import { dashboardAuth, requireAdmin } from '../middleware/dashboardAuth';

const router = Router();

// Routes accessible to all authenticated users
router.get('/me', dashboardAuth, userManagementController.getMyProfile.bind(userManagementController));
router.put('/me', dashboardAuth, userManagementController.updateMyProfile.bind(userManagementController));

// Admin-only routes - require authentication and admin role
router.use(dashboardAuth);
router.use(requireAdmin);

// User management routes (admin only)
router.post('/', userManagementController.createUser.bind(userManagementController));
router.get('/', userManagementController.listUsers.bind(userManagementController));
router.get('/stats', userManagementController.getUserStats.bind(userManagementController));
router.get('/:id', userManagementController.getUserById.bind(userManagementController));
router.put('/:id', userManagementController.updateUser.bind(userManagementController));
router.delete('/:id', userManagementController.deleteUser.bind(userManagementController));
router.post('/:id/activate', userManagementController.activateUser.bind(userManagementController));
router.post('/:id/deactivate', userManagementController.deactivateUser.bind(userManagementController));
router.post('/:id/unlock', userManagementController.unlockUser.bind(userManagementController));
router.post('/:id/reset-password', userManagementController.resetUserPassword.bind(userManagementController));

export default router;

