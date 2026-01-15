import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { UserPlus, Shield, Lock, Unlock, AlertCircle, User as UserIcon, Edit } from 'lucide-react';
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
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        teamId: '',
        role: 'VIEWER',
    });
    const [error, setError] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, teamsRes] = await Promise.all([
                apiClient.get('/users'),
                apiClient.get('/teams/all'),
            ]);
            setUsers(usersRes.data.data.users);
            // Backend returns { success: true, data: { teams: [...], total: number } }
            const teamsData = teamsRes.data.data.teams || teamsRes.data.data;
            setTeams(Array.isArray(teamsData) ? teamsData : []);
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

    const handleEdit = (user: User) => {
        setEditingUser(user);
        // Get the user's first team membership for now (backend limitation)
        const teamMembership = user.teamMemberships?.[0];
        
        console.log('[UserManagement] Editing user:', user);
        console.log('[UserManagement] User team memberships:', user.teamMemberships);
        
        setFormData({
            email: user.email,
            password: '', // Don't show password
            firstName: user.firstName,
            lastName: user.lastName,
            teamId: teamMembership?.team ? teams.find(t => t.name === teamMembership.team.name)?.id || '' : '',
            role: teamMembership?.role || 'VIEWER',
        });
        setShowCreateForm(false);
        setError(''); // Clear any previous errors
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        
        setError('');

        try {
            console.log('[UserManagement] Updating user:', editingUser.id);
            console.log('[UserManagement] Form data:', formData);
            
            // Backend currently only supports updating firstName, lastName, and isActive
            // Email, password, team, and role updates need backend enhancement
            const updateData: any = {
                firstName: formData.firstName,
                lastName: formData.lastName,
            };

            const response = await apiClient.put(`/users/${editingUser.id}`, updateData);
            console.log('[UserManagement] Update response:', response.data);
            
            setEditingUser(null);
            setFormData({
                email: '',
                password: '',
                firstName: '',
                lastName: '',
                teamId: '',
                role: 'VIEWER',
            });
            
            // Show success message
            setError('');
            
            // Refetch data
            await fetchData();
        } catch (err: any) {
            console.error('[UserManagement] Error updating user:', err);
            console.error('[UserManagement] Error response:', err.response?.data);
            setError(err.response?.data?.error || 'Failed to update user');
        }
    };

    const handleCancelEdit = () => {
        setEditingUser(null);
        setFormData({
            email: '',
            password: '',
            firstName: '',
            lastName: '',
            teamId: '',
            role: 'VIEWER',
        });
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

            {(showCreateForm || editingUser) && (
                <div className="team-form-card">
                    <h3>{editingUser ? 'Edit User' : 'Create New User'}</h3>
                    {editingUser && (
                        <div style={{ 
                            padding: '12px', 
                            background: 'rgba(59, 130, 246, 0.1)', 
                            borderRadius: '8px', 
                            marginBottom: '16px',
                            fontSize: '0.875rem',
                            color: 'var(--text-secondary)'
                        }}>
                            ℹ️ Currently you can only edit name. Email, password, team, and role editing coming soon.
                        </div>
                    )}
                    <form onSubmit={editingUser ? handleUpdate : handleCreate}>
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
                            <label>Email {editingUser && '(read-only for now)'}</label>
                            <input
                                type="email"
                                required={!editingUser}
                                value={formData.email}
                                onChange={(e) =>
                                    setFormData({ ...formData, email: e.target.value })
                                }
                                placeholder="john.doe@example.com"
                                disabled={!!editingUser}
                                style={editingUser ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                            />
                        </div>
                        {!editingUser && (
                            <>
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
                            </>
                        )}
                        {editingUser && (
                            <div style={{ 
                                padding: '12px', 
                                background: 'rgba(107, 114, 128, 0.1)', 
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                color: 'var(--text-secondary)'
                            }}>
                                <strong>Current Teams:</strong>
                                <div style={{ marginTop: '8px' }}>
                                    {editingUser.teamMemberships && editingUser.teamMemberships.length > 0 ? (
                                        editingUser.teamMemberships.map((membership, idx) => (
                                            <div key={idx} style={{ marginBottom: '4px' }}>
                                                • {membership.team.name} ({membership.role})
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ opacity: 0.6 }}>No team memberships</div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="form-actions">
                            <button
                                type="button"
                                onClick={editingUser ? handleCancelEdit : () => setShowCreateForm(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                            >
                                {editingUser ? 'Update User' : 'Create User'}
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
                                            <button
                                                onClick={() => handleEdit(user)}
                                                className="action-btn edit"
                                                title="Edit user"
                                            >
                                                <Edit size={16} />
                                            </button>
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

