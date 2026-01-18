import React, { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Shield, Lock, Unlock, AlertCircle, Edit, Trash2, Key, RefreshCw } from 'lucide-react';
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
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [passwordResetUserId, setPasswordResetUserId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        teamId: '',
        role: 'VIEWER',
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [showGeneratedPassword, setShowGeneratedPassword] = useState(false);

    // Get current user's highest role
    const getCurrentUserRole = (): string => {
        if (!currentUser?.teamMemberships || currentUser.teamMemberships.length === 0) {
            return 'VIEWER';
        }
        
        const roleHierarchy = ['VIEWER', 'EDITOR', 'GAME_OWNER', 'ADMIN', 'SUPER_ADMIN'];
        let highestRole = 'VIEWER';
        
        currentUser.teamMemberships.forEach(membership => {
            if (roleHierarchy.indexOf(membership.role) > roleHierarchy.indexOf(highestRole)) {
                highestRole = membership.role;
            }
        });
        
        return highestRole;
    };

    // Get user's highest role
    const getUserHighestRole = (user: User): string => {
        if (!user.teamMemberships || user.teamMemberships.length === 0) {
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

    // Check if current user can modify another user
    const canModifyUser = (targetUser: User): boolean => {
        // Users cannot modify themselves
        if (currentUser && targetUser.id === currentUser.id) {
            return false;
        }
        
        const currentRole = getCurrentUserRole();
        const targetRole = getUserHighestRole(targetUser);
        
        const roleHierarchy = ['VIEWER', 'EDITOR', 'GAME_OWNER', 'ADMIN', 'SUPER_ADMIN'];
        const currentRoleIndex = roleHierarchy.indexOf(currentRole);
        const targetRoleIndex = roleHierarchy.indexOf(targetRole);
        
        // Super admins can modify anyone except other super admins at same level
        if (currentRole === 'SUPER_ADMIN') {
            // Super admins can only modify users with lower roles, not other super admins
            return targetRole !== 'SUPER_ADMIN';
        }
        
        // Users can only modify users with LOWER roles, not same or higher
        // Admins cannot modify other admins or super admins
        // Editors cannot modify other editors, game owners, admins, or super admins
        return currentRoleIndex > targetRoleIndex;
    };

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
            const response = await apiClient.post('/users', formData);
            
            // Show generated password to admin
            if (response.data.data.generatedPassword) {
                setGeneratedPassword(response.data.data.generatedPassword);
                setShowGeneratedPassword(true);
            }
            
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
            
            // Send all editable fields to backend
            const updateData: any = {
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                teamId: formData.teamId, // Always send teamId (empty string means remove team)
                role: formData.role, // Always send role
            };

            console.log('[UserManagement] Sending update data:', updateData);

            const response = await apiClient.put(`/users/${editingUser.id}`, updateData);
            console.log('[UserManagement] Update response:', response.data);
            
            setSuccess('User updated successfully');
            setTimeout(() => setSuccess(''), 3000);
            
            setEditingUser(null);
            setFormData({
                email: '',
                password: '',
                firstName: '',
                lastName: '',
                teamId: '',
                role: 'VIEWER',
            });
            
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
                await apiClient.post(`/users/${userId}/deactivate`);
            } else {
                await apiClient.post(`/users/${userId}/activate`);
            }
            setSuccess(isActive ? 'User deactivated successfully' : 'User activated successfully');
            setTimeout(() => setSuccess(''), 3000);
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to update user');
        }
    };

    const handlePasswordReset = async (userId: string) => {
        setPasswordResetUserId(userId);
        setShowPasswordReset(true);
        setError('');
    };

    const handlePasswordResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordResetUserId) return;

        try {
            const response = await apiClient.post(`/users/${passwordResetUserId}/reset-password`);
            
            // Show generated password to admin
            if (response.data.data.generatedPassword) {
                setGeneratedPassword(response.data.data.generatedPassword);
                setShowGeneratedPassword(true);
            }
            
            setSuccess('Password reset successfully');
            setTimeout(() => setSuccess(''), 3000);
            setShowPasswordReset(false);
            setPasswordResetUserId(null);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to reset password');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (deleteConfirm !== userId) {
            setDeleteConfirm(userId);
            return;
        }

        try {
            await apiClient.delete(`/users/${userId}`);
            setSuccess('User permanently deleted');
            setTimeout(() => setSuccess(''), 3000);
            setDeleteConfirm(null);
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to delete user');
        }
    };

    const cancelDelete = () => {
        setDeleteConfirm(null);
    };

    if (loading) {
        return (
            <div className="loading-container">
                <RefreshCw size={48} className="spinning" />
                <p>Loading users...</p>
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

            {success && (
                <div className="success-banner">
                    <span>✓ {success}</span>
                </div>
            )}

            {/* Password Reset Modal */}
            {showPasswordReset && (
                <div className="modal-overlay" onClick={() => setShowPasswordReset(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Reset User Password</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                            This will generate a new random password for the user. You'll be shown the password once to share with the user.
                        </p>
                        <form onSubmit={handlePasswordResetSubmit}>
                            <div className="form-actions">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowPasswordReset(false);
                                        setPasswordResetUserId(null);
                                    }}
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    <Key size={18} />
                                    Generate New Password
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Generated Password Modal */}
            {showGeneratedPassword && generatedPassword && (
                <div className="modal-overlay" onClick={() => setShowGeneratedPassword(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>✅ Password Generated</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                            Please share this password with the user. It will not be shown again.
                        </p>
                        <div style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '2px solid #10b981',
                            borderRadius: '8px',
                            padding: '20px',
                            marginBottom: '20px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                Generated Password:
                            </div>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 'bold',
                                color: '#10b981',
                                fontFamily: 'monospace',
                                letterSpacing: '2px'
                            }}>
                                {generatedPassword}
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(generatedPassword);
                                    setSuccess('Password copied to clipboard!');
                                    setTimeout(() => setSuccess(''), 2000);
                                }}
                                style={{
                                    marginTop: '12px',
                                    padding: '8px 16px',
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                }}
                            >
                                📋 Copy to Clipboard
                            </button>
                        </div>
                        <div style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '20px',
                            fontSize: '0.875rem',
                            color: '#f59e0b'
                        }}>
                            ⚠️ <strong>Important:</strong> This password will not be shown again. Make sure to save it or share it with the user before closing this dialog.
                        </div>
                        <div className="form-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowGeneratedPassword(false);
                                    setGeneratedPassword(null);
                                }}
                                className="btn btn-primary"
                            >
                                I've Saved the Password
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(showCreateForm || editingUser) && (
                <div className="team-form-card">
                    <h3>{editingUser ? 'Edit User' : 'Create New User'}</h3>
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
                        {!editingUser && (
                            <div style={{ 
                                padding: '12px', 
                                background: 'rgba(59, 130, 246, 0.1)', 
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                color: '#3b82f6',
                                marginBottom: '16px'
                            }}>
                                🔒 A secure random password will be automatically generated and shown to you after creating the user.
                            </div>
                        )}
                        {editingUser && (
                            <div style={{ 
                                padding: '12px', 
                                background: 'rgba(245, 158, 11, 0.1)', 
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                color: '#f59e0b',
                                marginBottom: '16px'
                            }}>
                                💡 To change password, use the "Reset Password" button in the actions column.
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="form-group">
                                <label>Team {editingUser?.teamMemberships?.some(m => m.role === 'SUPER_ADMIN') && '(locked for super admin)'}</label>
                                <select
                                    value={formData.teamId}
                                    onChange={(e) =>
                                        setFormData({ ...formData, teamId: e.target.value })
                                    }
                                    disabled={editingUser?.teamMemberships?.some(m => m.role === 'SUPER_ADMIN')}
                                    style={editingUser?.teamMemberships?.some(m => m.role === 'SUPER_ADMIN') ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
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
                                <label>Role {editingUser?.teamMemberships?.some(m => m.role === 'SUPER_ADMIN') && '(locked for super admin)'}</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) =>
                                        setFormData({ ...formData, role: e.target.value })
                                    }
                                    disabled={editingUser?.teamMemberships?.some(m => m.role === 'SUPER_ADMIN')}
                                    style={editingUser?.teamMemberships?.some(m => m.role === 'SUPER_ADMIN') ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                                >
                                    <option value="VIEWER">Viewer</option>
                                    <option value="EDITOR">Editor</option>
                                    <option value="GAME_OWNER">Game Owner</option>
                                    <option value="ADMIN">Admin</option>
                                    <option value="SUPER_ADMIN">Super Admin</option>
                                </select>
                            </div>
                        </div>
                        {editingUser?.teamMemberships?.some(m => m.role === 'SUPER_ADMIN') && (
                            <div style={{ 
                                padding: '12px', 
                                background: 'rgba(239, 68, 68, 0.1)', 
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                color: '#ef4444',
                                marginTop: '12px',
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <Shield size={16} />
                                <span><strong>Super Admin Protection:</strong> Team and role cannot be changed for super admin users to maintain system security.</span>
                            </div>
                        )}
                        {editingUser && !editingUser.teamMemberships?.some(m => m.role === 'SUPER_ADMIN') && (
                            <div style={{ 
                                padding: '12px', 
                                background: 'rgba(107, 114, 128, 0.1)', 
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                color: 'var(--text-secondary)',
                                marginTop: '16px'
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
                    <UserPlus className="empty-users-icon" />
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
                                                title={canModifyUser(user) ? "Edit user" : "Insufficient permissions"}
                                                disabled={!canModifyUser(user)}
                                                style={!canModifyUser(user) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                onClick={() => handlePasswordReset(user.id)}
                                                className="action-btn password"
                                                title={canModifyUser(user) ? "Reset password" : "Insufficient permissions"}
                                                disabled={!canModifyUser(user)}
                                                style={!canModifyUser(user) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                            >
                                                <Key size={16} />
                                            </button>
                                            {user.isLocked && (
                                                <button
                                                    onClick={() => handleUnlock(user.id)}
                                                    className="action-btn unlock"
                                                    title={canModifyUser(user) ? "Unlock" : "Insufficient permissions"}
                                                    disabled={!canModifyUser(user)}
                                                    style={!canModifyUser(user) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                                >
                                                    <Unlock size={16} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() =>
                                                    handleToggleActive(user.id, user.isActive)
                                                }
                                                className={`action-btn ${user.isActive ? 'deactivate' : 'activate'}`}
                                                title={canModifyUser(user) ? (user.isActive ? 'Deactivate' : 'Activate') : "Insufficient permissions"}
                                                disabled={!canModifyUser(user)}
                                                style={!canModifyUser(user) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                            >
                                                <Shield size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id)}
                                                onDoubleClick={() => handleDeleteUser(user.id)}
                                                className={`action-btn delete ${deleteConfirm === user.id ? 'confirm' : ''}`}
                                                title={canModifyUser(user) ? (deleteConfirm === user.id ? 'Click again to confirm' : 'Delete user') : "Insufficient permissions"}
                                                disabled={!canModifyUser(user)}
                                                style={!canModifyUser(user) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            {deleteConfirm === user.id && (
                                                <button
                                                    onClick={cancelDelete}
                                                    className="action-btn cancel"
                                                    title="Cancel delete"
                                                >
                                                    ✕
                                                </button>
                                            )}
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

