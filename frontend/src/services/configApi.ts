/**
 * Remote Config API Service
 * Handles all API calls for configs, rules, and history
 */

import { apiClient } from '../lib/apiClient';
import type {
  RemoteConfig,
  CreateConfigInput,
  UpdateConfigInput,
  RuleOverwrite,
  CreateRuleInput,
  UpdateRuleInput,
  ReorderRulesInput,
  ConfigFilters,
  ApiResponse,
  ConfigListResponse,
  RuleListResponse,
  HistoryResponse,
} from '../types/config.types';

// ============================================================================
// CONFIG API ENDPOINTS
// ============================================================================

export const configApi = {
  /**
   * List all configs for a game with optional filtering
   */
  listConfigs: async (
    gameId: string,
    environment?: string,
    filters?: ConfigFilters
  ): Promise<ConfigListResponse> => {
    const params = new URLSearchParams();
    if (environment) params.append('environment', environment);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.enabled !== undefined) params.append('enabled', String(filters.enabled));
    if (filters?.dataType) params.append('dataType', filters.dataType);

    const response = await apiClient.get<ApiResponse<ConfigListResponse>>(
      `/config/configs/${gameId}?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Get a single config by ID
   */
  getConfig: async (configId: string): Promise<RemoteConfig> => {
    const response = await apiClient.get<ApiResponse<RemoteConfig>>(
      `/config/configs/${configId}`
    );
    return response.data.data;
  },

  /**
   * Create a new config
   */
  createConfig: async (input: CreateConfigInput): Promise<RemoteConfig> => {
    const response = await apiClient.post<ApiResponse<RemoteConfig>>(
      '/config/configs',
      input
    );
    return response.data.data;
  },

  /**
   * Update an existing config
   */
  updateConfig: async (configId: string, input: UpdateConfigInput): Promise<RemoteConfig> => {
    const response = await apiClient.put<ApiResponse<RemoteConfig>>(
      `/config/configs/${configId}`,
      input
    );
    return response.data.data;
  },

  /**
   * Delete a config
   */
  deleteConfig: async (configId: string): Promise<void> => {
    await apiClient.delete(`/config/configs/${configId}`);
  },

  /**
   * Toggle config enabled status
   */
  toggleConfig: async (configId: string): Promise<RemoteConfig> => {
    const response = await apiClient.patch<ApiResponse<RemoteConfig>>(
      `/config/configs/${configId}/toggle`
    );
    return response.data.data;
  },

  // ============================================================================
  // RULE API ENDPOINTS
  // ============================================================================

  /**
   * List all rules for a config
   */
  listRules: async (configId: string): Promise<RuleListResponse> => {
    const response = await apiClient.get<ApiResponse<RuleListResponse>>(
      `/config/configs/${configId}/rules`
    );
    return response.data.data;
  },

  /**
   * Get a single rule by ID
   */
  getRule: async (configId: string, ruleId: string): Promise<RuleOverwrite> => {
    const response = await apiClient.get<ApiResponse<RuleOverwrite>>(
      `/config/configs/${configId}/rules/${ruleId}`
    );
    return response.data.data;
  },

  /**
   * Create a new rule
   */
  createRule: async (configId: string, input: CreateRuleInput): Promise<RuleOverwrite> => {
    const response = await apiClient.post<ApiResponse<RuleOverwrite>>(
      `/config/configs/${configId}/rules`,
      input
    );
    return response.data.data;
  },

  /**
   * Update an existing rule
   */
  updateRule: async (
    configId: string,
    ruleId: string,
    input: UpdateRuleInput
  ): Promise<RuleOverwrite> => {
    const response = await apiClient.put<ApiResponse<RuleOverwrite>>(
      `/config/configs/${configId}/rules/${ruleId}`,
      input
    );
    return response.data.data;
  },

  /**
   * Delete a rule
   */
  deleteRule: async (configId: string, ruleId: string): Promise<void> => {
    await apiClient.delete(`/config/configs/${configId}/rules/${ruleId}`);
  },

  /**
   * Reorder rules (batch update priorities)
   */
  reorderRules: async (configId: string, input: ReorderRulesInput): Promise<RuleOverwrite[]> => {
    const response = await apiClient.put<ApiResponse<RuleOverwrite[]>>(
      `/config/configs/${configId}/rules/reorder`,
      input
    );
    return response.data.data;
  },

  /**
   * Toggle rule enabled status
   */
  toggleRule: async (configId: string, ruleId: string): Promise<RuleOverwrite> => {
    const response = await apiClient.patch<ApiResponse<RuleOverwrite>>(
      `/config/configs/${configId}/rules/${ruleId}/toggle`
    );
    return response.data.data;
  },

  // ============================================================================
  // HISTORY API ENDPOINTS
  // ============================================================================

  /**
   * Get config history (version timeline)
   */
  getConfigHistory: async (gameId: string, configKey: string): Promise<HistoryResponse> => {
    const response = await apiClient.get<ApiResponse<HistoryResponse>>(
      `/config/configs/${gameId}/history/${configKey}`
    );
    return response.data.data;
  },

  /**
   * Rollback a config to a previous version
   */
  rollbackConfig: async (configId: string): Promise<RemoteConfig> => {
    const response = await apiClient.post<ApiResponse<RemoteConfig>>(
      `/config/configs/${configId}/rollback`
    );
    return response.data.data;
  },
};

export default configApi;

