import React, { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { Users, Plus, Trash2, Edit, AlertCircle, X, UserPlus, Shield, ChevronLeft, RefreshCw } from 'lucide-react';
import './TeamManagement.css';

interface Team {
    id: string;
    name: string;
    slug: string;
    description?: string;
    _count?: {
        members: number;
        gameAccesses: number;
    };
}

interface TeamMember {
    id: string;
    userId: string;
    role: string;
    joinedAt: string;
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    };
}

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
}

interface TeamManagementProps {
    isCollapsed?: boolean;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ isCollapsed = false }) => {
    const { user } = useAuth();
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [viewingTeam, setViewingTeam] = useState<Team | null>(null);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [showAddMember, setShowAddMember] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedRole, setSelectedRole] = useState('VIEWER');
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        description: '',
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Check if user has admin privileges (for UI features)
    const isAdmin = user?.teamMemberships?.some(
        membership => ['ADMIN', 'SUPER_ADMIN'].includes(membership.role)
    ) || false;

    // Check if user is SUPER_ADMIN specifically (for seeing all teams)
    const isSuperAdmin = user?.teamMemberships?.some(
        membership => membership.role === 'SUPER_ADMIN'
    ) || false;

    // Get current user's highest role
    const getCurrentUserRole = (): string => {
        if (!user?.teamMemberships || user.teamMemberships.length === 0) {
            return 'VIEWER';
        }
        
        const roleHierarchy = ['VIEWER', 'EDITOR', 'GAME_OWNER', 'ADMIN', 'SUPER_ADMIN'];
        let highestRole = 'VIEWER';
        
        user.teamMemberships.forEach(membership => {
            if (roleHierarchy.indexOf(membership.role) > roleHierarchy.indexOf(highestRole)) {
                highestRole = membership.role;
            }
        });
        
        return highestRole;
    };

    // Check if current user can modify a team member's role
    const canModifyMemberRole = (memberUserId: string, memberRole: string): boolean => {
        // Cannot modify yourself
        if (user && memberUserId === user.id) {
            return false;
        }

        // Only admins can modify roles
        if (!isAdmin) {
            return false;
        }

        const currentRole = getCurrentUserRole();
        const roleHierarchy = ['VIEWER', 'EDITOR', 'GAME_OWNER', 'ADMIN', 'SUPER_ADMIN'];
        const currentRoleIndex = roleHierarchy.indexOf(currentRole);
        const memberRoleIndex = roleHierarchy.indexOf(memberRole);
        
        // Super admins can modify anyone except other super admins
        if (currentRole === 'SUPER_ADMIN') {
            return memberRole !== 'SUPER_ADMIN';
        }
        
        // Users can only modify users with LOWER roles, not same or higher
        return currentRoleIndex > memberRoleIndex;
    };

    // Check if current user can remove a team member
    const canRemoveMember = (memberUserId: string, memberRole: string): boolean => {
        // Cannot remove yourself
        if (user && memberUserId === user.id) {
            return false;
        }

        // Only admins can remove members
        if (!isAdmin) {
            return false;
        }

        // Same role hierarchy rules apply
        return canModifyMemberRole(memberUserId, memberRole);
    };

    useEffect(() => {
        fetchTeams();
    }, []);

    const fetchTeams = async () => {
        try {
            console.log('[TeamManagement] Fetching teams...');
            
            // Only SUPER_ADMIN sees all teams, everyone else (including regular admins) sees only their teams
            const endpoint = isSuperAdmin ? '/teams/all' : '/teams';
            const response = await apiClient.get(endpoint);
            console.log('[TeamManagement] API response:', response.data);
            
            // Handle different response structures
            let teamsData;
            if (isSuperAdmin) {
                // Super admin endpoint: { success: true, data: { teams: [...], total: number } }
                teamsData = response.data.data.teams || response.data.data;
            } else {
                // User endpoint (includes regular admins): { success: true, data: { teams: [...] } }
                teamsData = response.data.data.teams || response.data.data;
            }
            console.log('[TeamManagement] Teams data:', teamsData);
            
            setTeams(Array.isArray(teamsData) ? teamsData : []);
        } catch (err: any) {
            console.error('[TeamManagement] Error fetching teams:', err);
            console.error('[TeamManagement] Error response:', err.response?.data);
            setError(err.response?.data?.error || 'Failed to fetch teams');
        } finally {
            setLoading(false);
        }
    };

    const fetchTeamMembers = async (teamId: string) => {
        setLoadingMembers(true);
        try {
            const response = await apiClient.get(`/teams/${teamId}/members`);
            console.log('[TeamManagement] Members response:', response.data);
            // Backend returns array directly in data, not nested in data.members
            const membersData = Array.isArray(response.data.data) 
                ? response.data.data 
                : (response.data.data.members || []);
            console.log('[TeamManagement] Members data:', membersData);
            setTeamMembers(membersData);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch team members');
        } finally {
            setLoadingMembers(false);
        }
    };

    const fetchAllUsers = async () => {
        try {
            const response = await apiClient.get('/users');
            setAllUsers(response.data.data.users || []);
        } catch (err: any) {
            console.error('Failed to fetch users:', err);
        }
    };

    const handleViewTeam = async (team: Team) => {
        // Check if user has permission to view this team
        // Admins can view all teams, regular users can only view teams they're members of
        if (!isAdmin) {
            // For non-admin users, we need to verify they're a member of this team
            // The teams list already shows only their teams, but add extra check for security
            const userTeams = teams.map(t => t.id);
            if (!userTeams.includes(team.id)) {
                setError('You do not have permission to view this team');
                return;
            }
        }
        
        setViewingTeam(team);
        setShowCreateForm(false);
        setEditingTeam(null);
        await fetchTeamMembers(team.id);
        
        // Only fetch all users if admin (needed for adding members)
        if (isAdmin) {
            await fetchAllUsers();
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!viewingTeam || !selectedUserId) return;

        setError('');
        setSuccess('');

        try {
            await apiClient.post(`/teams/${viewingTeam.id}/members`, {
                userId: selectedUserId,
                role: selectedRole,
            });
            
            setSuccess('Member added successfully');
            setShowAddMember(false);
            setSelectedUserId('');
            setSelectedRole('VIEWER');
            
            await fetchTeamMembers(viewingTeam.id);
            await fetchTeams(); // Refresh team counts
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to add member');
        }
    };

    const handleUpdateMemberRole = async (userId: string, newRole: string) => {
        if (!viewingTeam) return;

        setError('');
        setSuccess('');

        try {
            await apiClient.put(`/teams/${viewingTeam.id}/members/${userId}`, {
                role: newRole,
            });
            
            setSuccess('Member role updated successfully');
            await fetchTeamMembers(viewingTeam.id);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to update member role');
        }
    };

    const handleRemoveMember = async (userId: string, memberName: string) => {
        if (!viewingTeam) return;

        if (!window.confirm(`Remove ${memberName} from ${viewingTeam.name}?`)) {
            return;
        }

        setError('');
        setSuccess('');

        try {
            await apiClient.delete(`/teams/${viewingTeam.id}/members/${userId}`);
            
            setSuccess('Member removed successfully');
            await fetchTeamMembers(viewingTeam.id);
            await fetchTeams(); // Refresh team counts
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to remove member');
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            console.log('[TeamManagement] Creating team:', formData);
            const response = await apiClient.post('/teams', formData);
            console.log('[TeamManagement] Team created successfully:', response.data);
            
            setShowCreateForm(false);
            setFormData({ name: '', slug: '', description: '' });
            
            // Refetch teams to show the new one
            await fetchTeams();
        } catch (err: any) {
            console.error('[TeamManagement] Error creating team:', err);
            console.error('[TeamManagement] Error response:', err.response?.data);
            setError(err.response?.data?.error || 'Failed to create team');
        }
    };

    const handleEdit = (team: Team) => {
        setEditingTeam(team);
        setFormData({
            name: team.name,
            slug: team.slug,
            description: team.description || '',
        });
        setShowCreateForm(false);
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTeam) return;
        
        setError('');

        try {
            console.log('[TeamManagement] Updating team:', editingTeam.id, formData);
            const response = await apiClient.put(`/teams/${editingTeam.id}`, formData);
            console.log('[TeamManagement] Team updated successfully:', response.data);
            
            setEditingTeam(null);
            setFormData({ name: '', slug: '', description: '' });
            
            // Refetch teams to show the updated one
            await fetchTeams();
        } catch (err: any) {
            console.error('[TeamManagement] Error updating team:', err);
            console.error('[TeamManagement] Error response:', err.response?.data);
            setError(err.response?.data?.error || 'Failed to update team');
        }
    };

    const handleDelete = async (team: Team) => {
        // Prevent deletion of System Administrators team
        if (team.slug === 'system-admins' || team.name === 'System Administrators') {
            setError('Cannot delete System Administrators team');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete "${team.name}"? This action cannot be undone.`)) {
            return;
        }

        try {
            console.log('[TeamManagement] Deleting team:', team.id);
            await apiClient.delete(`/teams/${team.id}`);
            console.log('[TeamManagement] Team deleted successfully');
            
            // Refetch teams
            await fetchTeams();
        } catch (err: any) {
            console.error('[TeamManagement] Error deleting team:', err);
            console.error('[TeamManagement] Error response:', err.response?.data);
            setError(err.response?.data?.error || 'Failed to delete team');
        }
    };

    const handleCancelEdit = () => {
        setEditingTeam(null);
        setFormData({ name: '', slug: '', description: '' });
    };

    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    };

    if (loading) {
        return (
            <div className="loading-container">
                <RefreshCw size={48} className="spinning" />
                <p>Loading teams...</p>
            </div>
        );
    }

    return (
        <div className={`team-management ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
            {!viewingTeam ? (
                <>
                    <div className="team-header">
                        <h1>Team Management</h1>
                        <p>Manage your organization's teams and members</p>
                    </div>

                    <div className="team-actions">
                        <div></div>
                        {isAdmin && (
                            <button
                                onClick={() => setShowCreateForm(true)}
                                className="btn btn-primary"
                            >
                                <Plus size={18} />
                                Create Team
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="error-banner">
                            <AlertCircle size={20} />
                            <span>{error}</span>
                        </div>
                    )}

                    {(showCreateForm || editingTeam) && (
                        <div className="team-form-card">
                            <h3>{editingTeam ? 'Edit Team' : 'Create New Team'}</h3>
                            <form onSubmit={editingTeam ? handleUpdate : handleCreate}>
                                {/* ...existing code... */}
                                <div className="form-group">
                                    <label>Team Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => {
                                            setFormData({
                                                ...formData,
                                                name: e.target.value,
                                                slug: editingTeam ? formData.slug : generateSlug(e.target.value),
                                            });
                                        }}
                                        placeholder="e.g., Engineering Team"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Slug</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.slug}
                                        onChange={(e) =>
                                            setFormData({ ...formData, slug: e.target.value })
                                        }
                                        placeholder="e.g., engineering-team"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description (Optional)</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                description: e.target.value,
                                            })
                                        }
                                        placeholder="Describe the team's purpose and responsibilities"
                                    />
                                </div>
                                <div className="form-actions">
                                    <button
                                        type="button"
                                        onClick={editingTeam ? handleCancelEdit : () => setShowCreateForm(false)}
                                        className="btn btn-secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                    >
                                        {editingTeam ? 'Update Team' : 'Create Team'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {teams.length === 0 ? (
                        <div className="empty-state">
                            <Users className="empty-state-icon" />
                            <h3>No teams yet</h3>
                            <p>Get started by creating your first team</p>
                        </div>
                    ) : (
                        <div className="teams-grid">
                            {teams.map((team) => {
                                const isSystemTeam = team.slug === 'system-admins' || team.name === 'System Administrators';
                                
                                return (
                                    <div 
                                        key={team.id} 
                                        className="team-card"
                                        onClick={() => handleViewTeam(team)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="team-card-header">
                                            <div className="team-icon">
                                                <Users size={24} />
                                            </div>
                                            {isAdmin && (
                                                <div className="team-actions-buttons">
                                                    <button 
                                                        className="icon-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEdit(team);
                                                        }}
                                                        title="Edit team"
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                    {!isSystemTeam && (
                                                        <button 
                                                            className="icon-btn icon-btn-danger"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDelete(team);
                                                            }}
                                                            title="Delete team"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <h3>{team.name}</h3>
                                        <p className="team-slug">@{team.slug}</p>
                                        {team.description && (
                                            <p className="team-description">{team.description}</p>
                                        )}
                                        <div className="team-stats">
                                            <div className="team-stat">
                                                <div className="team-stat-value">
                                                    {team._count?.members || 0}
                                                </div>
                                                <div className="team-stat-label">Members</div>
                                            </div>
                                            <div className="team-stat">
                                                <div className="team-stat-value">
                                                    {team._count?.gameAccesses || 0}
                                                </div>
                                                <div className="team-stat-label">Games</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                /* Team Details View */
                <div className="team-details-view">
                    <div className="team-details-header">
                        <button
                            onClick={() => {
                                setViewingTeam(null);
                                setTeamMembers([]);
                                setError('');
                                setSuccess('');
                            }}
                            className="btn btn-secondary"
                        >
                            <ChevronLeft size={18} />
                            Back to Teams
                        </button>
                        <div>
                            <h1>{viewingTeam.name}</h1>
                            <p className="team-slug">@{viewingTeam.slug}</p>
                        </div>
                    </div>

                    {error && (
                        <div className="error-banner">
                            <AlertCircle size={20} />
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="success-banner">
                            <span>{success}</span>
                        </div>
                    )}

                    {viewingTeam.description && (
                        <div className="team-description-box">
                            <p>{viewingTeam.description}</p>
                        </div>
                    )}

                    <div className="team-members-section">
                        <div className="section-header">
                            <h2>Team Members ({teamMembers.length})</h2>
                            {isAdmin && (
                                <button
                                    onClick={() => setShowAddMember(true)}
                                    className="btn btn-primary"
                                >
                                    <UserPlus size={18} />
                                    Add Member
                                </button>
                            )}
                        </div>

                        {showAddMember && (
                            <div className="add-member-form">
                                <div className="form-header">
                                    <h3>Add Team Member</h3>
                                    <button
                                        onClick={() => {
                                            setShowAddMember(false);
                                            setSelectedUserId('');
                                            setSelectedRole('VIEWER');
                                        }}
                                        className="icon-btn"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                <form onSubmit={handleAddMember}>
                                    <div className="form-group">
                                        <label>Select User</label>
                                        <select
                                            value={selectedUserId}
                                            onChange={(e) => setSelectedUserId(e.target.value)}
                                            required
                                        >
                                            <option value="">Choose a user...</option>
                                            {allUsers
                                                .filter(user => !teamMembers.some(m => m.user.id === user.id))
                                                .map(user => (
                                                    <option key={user.id} value={user.id}>
                                                        {user.firstName} {user.lastName} ({user.email})
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Role</label>
                                        <select
                                            value={selectedRole}
                                            onChange={(e) => setSelectedRole(e.target.value)}
                                        >
                                            <option value="VIEWER">Viewer</option>
                                            <option value="EDITOR">Editor</option>
                                            <option value="GAME_OWNER">Game Owner</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                    </div>
                                    <div className="form-actions">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowAddMember(false);
                                                setSelectedUserId('');
                                                setSelectedRole('VIEWER');
                                            }}
                                            className="btn btn-secondary"
                                        >
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary">
                                            Add Member
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {loadingMembers ? (
                            <div className="loading-container">
                                <RefreshCw size={48} className="spinning" />
                                <p>Loading members...</p>
                            </div>
                        ) : teamMembers.length === 0 ? (
                            <div className="empty-state">
                                <Users className="empty-state-icon" />
                                <h3>No members yet</h3>
                                <p>Add members to this team to get started</p>
                            </div>
                        ) : (
                            <div className="members-list">
                                {teamMembers.map((member) => (
                                    <div key={member.id} className="member-card">
                                        <div className="member-info">
                                            <div className="member-avatar">
                                                <Users size={20} />
                                            </div>
                                            <div className="member-details">
                                                <h4>{member.user.firstName} {member.user.lastName}</h4>
                                                <p>{member.user.email}</p>
                                                <p className="member-joined">
                                                    Joined {new Date(member.joinedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        {isAdmin ? (
                                            <div className="member-actions">
                                                <div className="role-selector">
                                                    <Shield size={16} />
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => handleUpdateMemberRole(member.user.id, e.target.value)}
                                                        className="role-select"
                                                        disabled={!canModifyMemberRole(member.user.id, member.role)}
                                                        style={!canModifyMemberRole(member.user.id, member.role) ? { 
                                                            opacity: 0.5, 
                                                            cursor: 'not-allowed' 
                                                        } : {}}
                                                        title={!canModifyMemberRole(member.user.id, member.role) ? 
                                                            (user && member.user.id === user.id ? 
                                                                "Cannot modify your own role" : 
                                                                "Insufficient permissions") : 
                                                            "Change member role"}
                                                    >
                                                        <option value="VIEWER">Viewer</option>
                                                        <option value="EDITOR">Editor</option>
                                                        <option value="GAME_OWNER">Game Owner</option>
                                                        <option value="ADMIN">Admin</option>
                                                        <option value="SUPER_ADMIN">Super Admin</option>
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveMember(
                                                        member.user.id,
                                                        `${member.user.firstName} ${member.user.lastName}`
                                                    )}
                                                    className="icon-btn icon-btn-danger"
                                                    disabled={!canRemoveMember(member.user.id, member.role)}
                                                    style={!canRemoveMember(member.user.id, member.role) ? { 
                                                        opacity: 0.5, 
                                                        cursor: 'not-allowed' 
                                                    } : {}}
                                                    title={!canRemoveMember(member.user.id, member.role) ? 
                                                        (user && member.user.id === user.id ? 
                                                            "Cannot remove yourself" : 
                                                            "Insufficient permissions") : 
                                                        "Remove from team"}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="member-role-badge">
                                                <Shield size={16} />
                                                <span className={`role-badge role-${member.role.toLowerCase()}`}>
                                                    {member.role.replace('_', ' ')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamManagement;
