import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        description: '',
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchTeams();
    }, []);

    const fetchTeams = async () => {
        try {
            const response = await apiClient.get('/teams');
            setTeams(response.data.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch teams');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            await apiClient.post('/teams', formData);
            setShowCreateForm(false);
            setFormData({ name: '', slug: '', description: '' });
            fetchTeams();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create team');
        }
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

            {showCreateForm && (
                <div className="team-form-card">
                    <h3>Create New Team</h3>
                    <form onSubmit={handleCreate}>
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
                                        slug: generateSlug(e.target.value),
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
                                onClick={() => setShowCreateForm(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                            >
                                Create Team
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
                    {teams.map((team) => (
                        <div key={team.id} className="team-card">
                            <div className="team-card-header">
                                <div className="team-icon">
                                    <Users size={24} />
                                </div>
                                <div className="team-actions-buttons">
                                    <button className="icon-btn">
                                        <Edit size={16} />
                                    </button>
                                    <button className="icon-btn">
                                        <Trash2 size={16} />
                                    </button>
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
                    ))}
                </div>
            )}
        </div>
    );
};

export default TeamManagement;

