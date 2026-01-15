import { Router } from 'express';
import userManagementController from '../controllers/UserManagementController';
import { dashboardAuth, requireAdmin } from '../middleware/dashboardAuth';

const router = Router();

// All routes require authentication and admin role
router.use(dashboardAuth);
router.use(requireAdmin);

// User management routes
router.post('/', userManagementController.createUser.bind(userManagementController));
router.get('/', userManagementController.listUsers.bind(userManagementController));
router.get('/stats', userManagementController.getUserStats.bind(userManagementController));
router.get('/:id', userManagementController.getUserById.bind(userManagementController));
router.put('/:id', userManagementController.updateUser.bind(userManagementController));
router.delete('/:id', userManagementController.deactivateUser.bind(userManagementController));
router.post('/:id/activate', userManagementController.activateUser.bind(userManagementController));
router.post('/:id/unlock', userManagementController.unlockUser.bind(userManagementController));
router.post('/:id/reset-password', userManagementController.resetUserPassword.bind(userManagementController));

export default router;

