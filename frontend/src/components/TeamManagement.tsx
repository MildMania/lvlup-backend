import React, { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Users, Plus, Trash2, Edit, AlertCircle } from 'lucide-react';
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

interface TeamManagementProps {
    isCollapsed?: boolean;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ isCollapsed = false }) => {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        description: '',
    });
    const [error, setError] = useState('');

    useEffect(() => {
        fetchTeams();
    }, []);

    const fetchTeams = async () => {
        try {
            console.log('[TeamManagement] Fetching teams...');
            const response = await apiClient.get('/teams/all');
            console.log('[TeamManagement] API response:', response.data);
            
            // Backend returns { success: true, data: { teams: [...], total: number } }
            const teamsData = response.data.data.teams || response.data.data;
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
            <div className="loading-spinner">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className={`team-management ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
            <div className="team-header">
                <h1>Team Management</h1>
                <p>Manage your organization's teams and members</p>
            </div>

            <div className="team-actions">
                <div></div>
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="btn btn-primary"
                >
                    <Plus size={18} />
                    Create Team
                </button>
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
                            <div key={team.id} className="team-card">
                                <div className="team-card-header">
                                    <div className="team-icon">
                                        <Users size={24} />
                                    </div>
                                    <div className="team-actions-buttons">
                                        <button 
                                            className="icon-btn"
                                            onClick={() => handleEdit(team)}
                                            title="Edit team"
                                        >
                                            <Edit size={16} />
                                        </button>
                                        {!isSystemTeam && (
                                            <button 
                                                className="icon-btn icon-btn-danger"
                                                onClick={() => handleDelete(team)}
                                                title="Delete team"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
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
        </div>
    );
};

export default TeamManagement;
