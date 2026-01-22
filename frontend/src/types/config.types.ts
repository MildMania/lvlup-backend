/**
 * Remote Config System TypeScript Types
 * Defines all types for configs, rules, and history
 */

// ============================================================================
// CONFIG TYPES
// ============================================================================

export type DataType = 'string' | 'number' | 'boolean' | 'json';
export type Environment = 'development' | 'staging' | 'production';

export interface RemoteConfig {
  id: string;
  gameId: string;
  key: string;
  value: any;
  dataType: DataType;
  environment: Environment;
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConfigInput {
  gameId: string;
  key: string;
  value: any;
  dataType: DataType;
  environment: Environment;
  description?: string;
  enabled?: boolean;
}

export interface UpdateConfigInput {
  value?: any;
  description?: string;
  enabled?: boolean;
}

// ============================================================================
// RULE TYPES
// ============================================================================

export type VersionOperator = '=' | '!=' | '>' | '>=' | '<' | '<=';
export type SegmentCondition = 'all_users' | 'new_users' | string; // string for custom segments

/**
 * Platform condition with version range
 */
export interface PlatformCondition {
  platform: string; // "iOS", "Android", "Web"
  minVersion?: string; // Minimum version (inclusive)
  maxVersion?: string; // Maximum version (inclusive)
}

export interface RuleOverwrite {
  id: string;
  configId: string;
  priority: number;
  enabled: boolean;
  overrideValue: any;
  platformConditions?: PlatformCondition[]; // Array of platforms with version ranges
  countryConditions?: string[];
  segmentConditions?: SegmentCondition[];
  activeBetweenStart?: string; // ISO datetime
  activeBetweenEnd?: string; // ISO datetime
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRuleInput {
  priority: number;
  enabled?: boolean;
  overrideValue: any;
  platformConditions?: PlatformCondition[]; // Array of platforms with version ranges
  countryConditions?: string[]; // Array of ISO country codes
  segmentConditions?: SegmentCondition[]; // Array of segment IDs
  activeBetweenStart?: string;
  activeBetweenEnd?: string;
}

export interface UpdateRuleInput {
  priority?: number;
  enabled?: boolean;
  overrideValue?: any;
  platformConditions?: PlatformCondition[] | null; // Array of platforms with version ranges
  countryConditions?: string[] | null; // Array of ISO country codes
  segmentConditions?: SegmentCondition[] | null; // Array of segment IDs
  activeBetweenStart?: string | null;
  activeBetweenEnd?: string | null;
}

export interface ReorderRulesInput {
  ruleOrder: Array<{
    ruleId: string;
    newPriority: number;
  }>;
}

// ============================================================================
// HISTORY TYPES
// ============================================================================

export type ConfigChangeType = 'created' | 'updated' | 'deleted' | 'rollback';
export type RuleAction = 'created' | 'updated' | 'deleted' | 'reordered';

export interface ConfigHistory {
  id: string;
  configId: string;
  changeType: ConfigChangeType;
  previousValue?: any;
  newValue: any;
  changedBy: string;
  changedAt: string;
}

export interface RuleHistory {
  id: string;
  ruleId?: string;
  configId: string;
  action: RuleAction;
  previousState?: any;
  newState?: any;
  changedBy: string;
  changedAt: string;
}

export interface ConfigHistoryWithChanges extends ConfigHistory {
  changes?: string[];
}

// ============================================================================
// DRAFT TYPES
// ============================================================================

export type DraftStatus = 'draft' | 'pending' | 'deployed' | 'rejected';

export interface ConfigDraft {
  id: string;
  configId: string;
  gameId: string;
  key: string;
  value: any;
  dataType: DataType;
  environment: Environment;
  enabled: boolean;
  description?: string;
  changes?: Record<string, any>;
  status: DraftStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deployedAt?: string;
  deployedBy?: string;
  rejectionReason?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: 'success' | 'error';
}

export interface ConfigListResponse {
  configs: RemoteConfig[];
  total: number;
  filtered: number;
}

export interface RuleListResponse {
  rules: RuleOverwrite[];
  total: number;
}

export interface HistoryResponse {
  history: ConfigHistory[];
  total: number;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface RuleSummary {
  conditions: string[];
  description: string;
}

export interface RuleFormState {
  priority: number;
  enabled: boolean;
  overrideValue: any;
  platformCondition?: string | null;
  minVersion?: string | null;
  maxVersion?: string | null;
  activeBetweenStart?: string | null;
  activeBetweenEnd?: string | null;
}

export interface RuleDragItem {
  id: string;
  priority: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface FormError {
  message: string;
  field?: string;
}

// ============================================================================
// FILTER & SEARCH TYPES
// ============================================================================

export interface ConfigFilters {
  search?: string;
  environment?: Environment;
  enabled?: boolean;
  dataType?: DataType;
}

export interface RuleFilterOptions {
  platform?: string;
  country?: string;
  dateFrom?: string;
  dateTo?: string;
  enabled?: boolean;
}

