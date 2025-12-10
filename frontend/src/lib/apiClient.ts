import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!apiBaseUrl) {
  // Surfacing misconfiguration early helps during local dev
  console.warn('VITE_API_BASE_URL is not defined. Requests may fail.');
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
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

apiClient.interceptors.request.use((config) => {
  if (currentApiKey) {
    config.headers['X-API-Key'] = currentApiKey;
  }
  return config;
});

export default apiClient;
