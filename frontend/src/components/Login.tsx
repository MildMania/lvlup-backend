import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GamepadIcon, AlertCircle } from 'lucide-react';
import './Login.css';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, user } = useAuth();
    const navigate = useNavigate();

    // Redirect to dashboard if already logged in
    useEffect(() => {
        if (user) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-logo">
                        <GamepadIcon size={40} />
                    </div>
                    <h1 className="login-title">Welcome to LvlUp</h1>
                    <p className="login-subtitle">Sign in to access your analytics dashboard</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="error-alert">
                            <AlertCircle size={20} />
                            <p className="error-alert-text">{error}</p>
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="email" className="form-label">
                            Email Address
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            className="form-input"
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password" className="form-label">
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            className="form-input"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="submit-button"
                    >
                        {loading && <span className="spinner"></span>}
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <div className="login-footer">
                    <p className="login-footer-text">
                        Don't have an account? Contact your administrator
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;

