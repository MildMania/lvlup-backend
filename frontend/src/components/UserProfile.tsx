import React, { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { User, Save, Mail, Shield, Lock, Eye, EyeOff } from 'lucide-react';
import './UserProfile.css';

interface TeamMembership {
    role: string;
    team: {
        name: string;
        slug: string;
    };
}

interface UserProfileData {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isEmailVerified: boolean;
    isActive: boolean;
    lastLogin?: string;
    createdAt: string;
    teamMemberships?: TeamMembership[];
}

interface UserProfileProps {
    isCollapsed?: boolean;
}

const UserProfile: React.FC<UserProfileProps> = ({ isCollapsed = false }) => {
    const [user, setUser] = useState<UserProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
    });
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [passwordError, setPasswordError] = useState('');

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const response = await apiClient.get('/users/me');
            const userData = response.data.data;
            setUser(userData);
            setFormData({
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
            });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch profile');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            await apiClient.put('/users/me', formData);
            setSuccess('Profile updated successfully');
            setEditing(false);
            await fetchProfile();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to update profile');
        }
    };

    const handleCancel = () => {
        if (user) {
            setFormData({
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
            });
        }
        setEditing(false);
        setError('');
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setSuccess('');

        // Validate passwords match
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }

        // Validate password strength
        if (passwordData.newPassword.length < 8) {
            setPasswordError('New password must be at least 8 characters long');
            return;
        }

        try {
            await apiClient.put('/auth/change-password', {
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword,
            });
            
            setSuccess('Password changed successfully');
            setChangingPassword(false);
            setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setPasswordError(err.response?.data?.error || 'Failed to change password');
        }
    };

    const handleCancelPasswordChange = () => {
        setChangingPassword(false);
        setPasswordData({
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        });
        setPasswordError('');
    };

    if (loading) {
        return (
            <div className={`user-profile-container ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="loading">Loading profile...</div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className={`user-profile-container ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="error-message">Failed to load profile</div>
            </div>
        );
    }

    return (
        <div className={`user-profile-container ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="user-profile-header">
                <div className="header-icon">
                    <User size={32} />
                </div>
                <h1>My Profile</h1>
                <p>View and manage your account information</p>
            </div>

            {error && (
                <div className="error-message" style={{ marginBottom: '20px' }}>
                    {error}
                </div>
            )}

            {success && (
                <div className="success-message" style={{ marginBottom: '20px' }}>
                    {success}
                </div>
            )}

            <div className="user-profile-content">
                {/* Profile Information Card */}
                <div className="profile-card">
                    <div className="card-header">
                        <h2>Personal Information</h2>
                        {!editing && (
                            <button
                                className="btn-edit"
                                onClick={() => setEditing(true)}
                            >
                                Edit Profile
                            </button>
                        )}
                    </div>

                    {editing ? (
                        <form onSubmit={handleUpdate} className="profile-form">
                            <div className="form-group">
                                <label>First Name</label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) =>
                                        setFormData({ ...formData, firstName: e.target.value })
                                    }
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Last Name</label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) =>
                                        setFormData({ ...formData, lastName: e.target.value })
                                    }
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    <Mail size={16} style={{ marginRight: '8px' }} />
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) =>
                                        setFormData({ ...formData, email: e.target.value })
                                    }
                                    required
                                />
                            </div>

                            <div className="form-actions">
                                <button type="submit" className="btn-primary">
                                    <Save size={16} />
                                    Save Changes
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={handleCancel}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="profile-info">
                            <div className="info-row">
                                <div className="info-label">First Name</div>
                                <div className="info-value">{user.firstName}</div>
                            </div>
                            <div className="info-row">
                                <div className="info-label">Last Name</div>
                                <div className="info-value">{user.lastName}</div>
                            </div>
                            <div className="info-row">
                                <div className="info-label">
                                    <Mail size={16} style={{ marginRight: '8px' }} />
                                    Email
                                </div>
                                <div className="info-value">{user.email}</div>
                            </div>
                            <div className="info-row">
                                <div className="info-label">Email Verified</div>
                                <div className="info-value">
                                    <span className={`status-badge ${user.isEmailVerified ? 'verified' : 'unverified'}`}>
                                        {user.isEmailVerified ? 'Verified' : 'Not Verified'}
                                    </span>
                                </div>
                            </div>
                            <div className="info-row">
                                <div className="info-label">Account Status</div>
                                <div className="info-value">
                                    <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                        {user.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>
                            {user.lastLogin && (
                                <div className="info-row">
                                    <div className="info-label">Last Login</div>
                                    <div className="info-value">
                                        {new Date(user.lastLogin).toLocaleString()}
                                    </div>
                                </div>
                            )}
                            <div className="info-row">
                                <div className="info-label">Member Since</div>
                                <div className="info-value">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Password Change Card */}
                <div className="profile-card">
                    <div className="card-header">
                        <h2>
                            <Lock size={20} style={{ marginRight: '8px' }} />
                            Password & Security
                        </h2>
                        {!changingPassword && (
                            <button
                                className="btn-edit"
                                onClick={() => setChangingPassword(true)}
                            >
                                Change Password
                            </button>
                        )}
                    </div>

                    {passwordError && (
                        <div className="error-message" style={{ marginBottom: '16px' }}>
                            {passwordError}
                        </div>
                    )}

                    {changingPassword ? (
                        <form onSubmit={handlePasswordChange} className="profile-form">
                            <div className="form-group">
                                <label>Current Password</label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showCurrentPassword ? 'text' : 'password'}
                                        value={passwordData.currentPassword}
                                        onChange={(e) =>
                                            setPasswordData({ ...passwordData, currentPassword: e.target.value })
                                        }
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    >
                                        {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>New Password</label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={passwordData.newPassword}
                                        onChange={(e) =>
                                            setPasswordData({ ...passwordData, newPassword: e.target.value })
                                        }
                                        required
                                        minLength={8}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                    >
                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                    Must be at least 8 characters long
                                </small>
                            </div>

                            <div className="form-group">
                                <label>Confirm New Password</label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={passwordData.confirmPassword}
                                        onChange={(e) =>
                                            setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                                        }
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    >
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-actions">
                                <button type="submit" className="btn-primary">
                                    <Lock size={16} />
                                    Change Password
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={handleCancelPasswordChange}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="password-info">
                            <p style={{ color: 'var(--text-secondary)' }}>
                                Keep your account secure by using a strong password and changing it regularly.
                            </p>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '8px' }}>
                                Last changed: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Never'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Teams Card */}
                <div className="profile-card">
                    <div className="card-header">
                        <h2>
                            <Shield size={20} style={{ marginRight: '8px' }} />
                            Teams & Roles
                        </h2>
                    </div>
                    <div className="teams-list">
                        {user.teamMemberships && user.teamMemberships.length > 0 ? (
                            user.teamMemberships.map((membership, idx) => (
                                <div key={idx} className="team-item">
                                    <div className="team-info">
                                        <div className="team-name">{membership.team.name}</div>
                                        <div className="team-slug">@{membership.team.slug}</div>
                                    </div>
                                    <div className="team-role">
                                        <span className={`role-badge role-${membership.role.toLowerCase()}`}>
                                            {membership.role.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="no-teams">
                                <p>You are not a member of any teams yet.</p>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                                    Contact an administrator to be added to a team.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserProfile;

