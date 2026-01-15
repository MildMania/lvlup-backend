import { Router } from 'express';
import teamController from '../controllers/TeamController';
import { dashboardAuth, requireAdmin, requireTeamAdmin } from '../middleware/dashboardAuth';

const router = Router();

// All routes require authentication
router.use(dashboardAuth);

// Team routes
router.get('/', teamController.getUserTeams.bind(teamController));
router.post('/', requireAdmin, teamController.createTeam.bind(teamController));
router.get('/all', requireAdmin, teamController.listAllTeams.bind(teamController));
router.get('/:id', teamController.getTeamById.bind(teamController));
router.put('/:id', requireTeamAdmin, teamController.updateTeam.bind(teamController));
router.delete('/:id', requireTeamAdmin, teamController.deleteTeam.bind(teamController));

// Team member routes
router.get('/:id/members', teamController.getTeamMembers.bind(teamController));
router.post('/:id/members', requireTeamAdmin, teamController.addMember.bind(teamController));
router.put('/:id/members/:userId', requireTeamAdmin, teamController.updateMemberRole.bind(teamController));
router.delete('/:id/members/:userId', requireTeamAdmin, teamController.removeMember.bind(teamController));

export default router;

