import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { UserPlus, Shield, Lock, Unlock, AlertCircle, User as UserIcon } from 'lucide-react';
import './UserManagement.css';

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    isLocked: boolean;
    lastLogin?: string;
    teamMemberships?: Array<{
        role: string;
        team: {
            name: string;
        };
    }>;
}

interface Team {
    id: string;
    name: string;
    slug: string;
}

interface UserManagementProps {
    isCollapsed?: boolean;
}

const UserManagement: React.FC<UserManagementProps> = ({ isCollapsed = false }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        teamId: '',
        role: 'VIEWER',
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, teamsRes] = await Promise.all([
                apiClient.get('/users'),
                apiClient.get('/teams'),
            ]);
            setUsers(usersRes.data.data.users);
            setTeams(teamsRes.data.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            await apiClient.post('/users', formData);
            setShowCreateForm(false);
            setFormData({
                email: '',
                password: '',
                firstName: '',
                lastName: '',
                teamId: '',
                role: 'VIEWER',
            });
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create user');
        }
    };

    const handleUnlock = async (userId: string) => {
        try {
            await apiClient.post(`/users/${userId}/unlock`);
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to unlock user');
        }
    };

    const handleToggleActive = async (userId: string, isActive: boolean) => {
        try {
            if (isActive) {
                await apiClient.delete(`/users/${userId}`);
            } else {
                await apiClient.post(`/users/${userId}/activate`);
            }
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to update user');
        }
    };

    if (loading) {
        return (
            <div className="loading-spinner">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className={`user-management ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
            <div className="user-header">
                <h1>User Management</h1>
                <p>Manage dashboard users and their permissions</p>
            </div>

            <div className="user-actions">
                <div></div>
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="btn btn-primary"
                >
                    <UserPlus size={18} />
                    Create User
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
                    <h3>Create New User</h3>
                    <form onSubmit={handleCreate}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="form-group">
                                <label>First Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.firstName}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            firstName: e.target.value,
                                        })
                                    }
                                    placeholder="John"
                                />
                            </div>
                            <div className="form-group">
                                <label>Last Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.lastName}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            lastName: e.target.value,
                                        })
                                    }
                                    placeholder="Doe"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) =>
                                    setFormData({ ...formData, email: e.target.value })
                                }
                                placeholder="john.doe@example.com"
                            />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input
                                type="password"
                                required
                                value={formData.password}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        password: e.target.value,
                                    })
                                }
                                placeholder="••••••••"
                            />
                        </div>
                        <div className="form-group">
                            <label>Team</label>
                            <select
                                value={formData.teamId}
                                onChange={(e) =>
                                    setFormData({ ...formData, teamId: e.target.value })
                                }
                            >
                                <option value="">No Team</option>
                                {teams.map((team) => (
                                    <option key={team.id} value={team.id}>
                                        {team.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Role</label>
                            <select
                                value={formData.role}
                                onChange={(e) =>
                                    setFormData({ ...formData, role: e.target.value })
                                }
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
                                onClick={() => setShowCreateForm(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                            >
                                Create User
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {users.length === 0 ? (
                <div className="empty-users-state">
                    <UserIcon className="empty-users-icon" />
                    <h3>No users yet</h3>
                    <p>Get started by creating your first user</p>
                </div>
            ) : (
                <div className="users-table-container">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Teams & Roles</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="user-info">
                                            <div className="user-avatar">
                                                {user.firstName[0]}{user.lastName[0]}
                                            </div>
                                            <div className="user-details">
                                                <div className="user-name">
                                                    {user.firstName} {user.lastName}
                                                </div>
                                                <div className="user-email">
                                                    {user.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="user-teams">
                                            {user.teamMemberships?.map((membership, idx) => (
                                                <span key={idx} className="team-badge">
                                                    {membership.team.name} - {membership.role}
                                                </span>
                                            ))}
                                            {(!user.teamMemberships || user.teamMemberships.length === 0) && (
                                                <span className="team-badge" style={{ opacity: 0.5 }}>
                                                    No team
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="status-badges">
                                            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                                {user.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                            {user.isLocked && (
                                                <span className="status-badge locked">
                                                    <Lock size={12} />
                                                    Locked
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="user-actions-cell">
                                            {user.isLocked && (
                                                <button
                                                    onClick={() => handleUnlock(user.id)}
                                                    className="action-btn unlock"
                                                    title="Unlock"
                                                >
                                                    <Unlock size={16} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() =>
                                                    handleToggleActive(user.id, user.isActive)
                                                }
                                                className={`action-btn ${user.isActive ? 'deactivate' : 'activate'}`}
                                                title={user.isActive ? 'Deactivate' : 'Activate'}
                                            >
                                                <Shield size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default UserManagement;

