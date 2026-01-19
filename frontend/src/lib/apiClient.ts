import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!apiBaseUrl) {
  // Surfacing misconfiguration early helps during local dev
  console.warn('VITE_API_BASE_URL is not defined. Requests may fail.');
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true, // Enable sending cookies (for refresh token)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Global variable to store current API key
let currentApiKey = import.meta.env.VITE_API_KEY || 'pqa_api_key_12345';

export const setApiKey = (apiKey: string) => {
  currentApiKey = apiKey;
};

export const getApiKey = () => currentApiKey;

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// Request interceptor - add auth token
apiClient.interceptors.request.use((config) => {
  // First, check for dashboard authentication token
  const accessToken = localStorage.getItem('accessToken');
  
  if (accessToken) {
    // Use dashboard authentication (Bearer token)
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  } else if (currentApiKey) {
    // Fall back to API key authentication (for old analytics or game SDKs)
    config.headers['X-API-Key'] = currentApiKey;
  }
  
  return config;
});

// Response interceptor - handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't try to refresh on login/register endpoints
      if (originalRequest.url?.includes('/auth/login') || 
          originalRequest.url?.includes('/auth/register')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            // Retry with new token
            const accessToken = localStorage.getItem('accessToken');
            if (accessToken && originalRequest.headers) {
              originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
            }
            return apiClient(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Try to refresh the token
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (!refreshToken) {
          // No refresh token, user needs to log in again
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(error);
        }

        const response = await axios.post(
          `${apiBaseUrl}/auth/refresh`,
          { refreshToken },
          { withCredentials: true }
        );

        const { accessToken: newAccessToken } = response.data.data;
        
        // Store new token
        localStorage.setItem('accessToken', newAccessToken);

        // Process queued requests with new token
        processQueue(null, newAccessToken);

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        }
        
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        processQueue(refreshError as Error, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        
        // Only redirect if we're not already on login page
        if (!window.location.pathname.includes('/login')) {
          console.error('Token refresh failed, redirecting to login');
          window.location.href = '/login';
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
