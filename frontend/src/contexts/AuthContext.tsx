import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isEmailVerified: boolean;
    isActive: boolean;
    teamMemberships?: Array<{
        role: string;
        team: {
            id: string;
            name: string;
            slug: string;
        };
    }>;
    twoFactorAuth?: {
        isEnabled: boolean;
    };
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
    refreshToken: () => Promise<void>;
    updateProfile: (firstName: string, lastName: string) => Promise<void>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Configure axios defaults
axios.defaults.withCredentials = true; // Enable cookies

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [accessToken, setAccessToken] = useState<string | null>(
        localStorage.getItem('accessToken')
    );

    // Set up axios interceptor for access token
    useEffect(() => {
        const requestInterceptor = axios.interceptors.request.use(
            (config) => {
                if (accessToken) {
                    config.headers.Authorization = `Bearer ${accessToken}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        const responseInterceptor = axios.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;

                // If token expired, try to refresh (but not for login/refresh endpoints)
                if (
                    error.response?.status === 401 && 
                    !originalRequest._retry &&
                    !originalRequest.url?.includes('/auth/login') &&
                    !originalRequest.url?.includes('/auth/refresh')
                ) {
                    originalRequest._retry = true;

                    try {
                        await refreshToken();
                        return axios(originalRequest);
                    } catch (refreshError) {
                        // Refresh failed, clear auth state
                        setUser(null);
                        setAccessToken(null);
                        localStorage.removeItem('accessToken');
                        // Don't logout here to avoid redirect loop
                        return Promise.reject(refreshError);
                    }
                }

                return Promise.reject(error);
            }
        );

        return () => {
            axios.interceptors.request.eject(requestInterceptor);
            axios.interceptors.response.eject(responseInterceptor);
        };
    }, [accessToken]);

    // Fetch current user on mount
    useEffect(() => {
        const fetchUser = async () => {
            if (!accessToken) {
                setLoading(false);
                return;
            }

            try {
                const response = await axios.get(`${API_URL}/auth/me`);
                setUser(response.data.data);
            } catch (error) {
                console.error('Failed to fetch user:', error);
                localStorage.removeItem('accessToken');
                setAccessToken(null);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, [accessToken]);

    const login = async (email: string, password: string) => {
        try {
            const response = await axios.post(`${API_URL}/auth/login`, {
                email,
                password,
            });

            if (response.data.success) {
                const { accessToken: token, user: userData } = response.data.data;
                setAccessToken(token);
                localStorage.setItem('accessToken', token);
                setUser(userData);
            } else {
                throw new Error(response.data.error || 'Login failed');
            }
        } catch (error: any) {
            // Better error handling to show actual backend error
            const errorMessage = error.response?.data?.error || error.message || 'Login failed';
            console.error('Login error:', errorMessage);
            throw new Error(errorMessage);
        }
    };

    const logout = async () => {
        try {
            await axios.post(`${API_URL}/auth/logout`);
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
            setAccessToken(null);
            localStorage.removeItem('accessToken');
        }
    };

    const register = async (
        email: string,
        password: string,
        firstName: string,
        lastName: string
    ) => {
        const response = await axios.post(`${API_URL}/auth/register`, {
            email,
            password,
            firstName,
            lastName,
        });

        if (!response.data.success) {
            throw new Error(response.data.error || 'Registration failed');
        }
    };

    const refreshToken = async () => {
        const response = await axios.post(`${API_URL}/auth/refresh`);

        if (response.data.success) {
            const { accessToken: token } = response.data.data;
            setAccessToken(token);
            localStorage.setItem('accessToken', token);
        } else {
            throw new Error('Token refresh failed');
        }
    };

    const updateProfile = async (firstName: string, lastName: string) => {
        const response = await axios.put(`${API_URL}/auth/me`, {
            firstName,
            lastName,
        });

        if (response.data.success) {
            // Refresh user data
            const userResponse = await axios.get(`${API_URL}/auth/me`);
            setUser(userResponse.data.data);
        }
    };

    const changePassword = async (currentPassword: string, newPassword: string) => {
        await axios.put(`${API_URL}/auth/change-password`, {
            currentPassword,
            newPassword,
        });

        // After password change, user needs to login again
        await logout();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                logout,
                register,
                refreshToken,
                updateProfile,
                changePassword,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

