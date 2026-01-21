/**
 * Remote Config System - Type Definitions
 * Comprehensive TypeScript types for config models, rules, and business logic
 */

// ============================================================================
// Core Data Types
// ============================================================================

/**
 * Supported config data types for runtime validation
 */
export type ConfigDataType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Environment targeting for configs
 */
export type ConfigEnvironment = 'development' | 'staging' | 'production';

/**
 * Platform targeting for rule conditions
 */
export type Platform = 'iOS' | 'Android' | 'Web';

/**
 * Version comparison operators
 */
export type VersionOperator =
  | 'equal'
  | 'not_equal'
  | 'greater_than'
  | 'greater_or_equal'
  | 'less_than'
  | 'less_or_equal';

/**
 * Segment types for user targeting
 */
export type SegmentType = 'new_users' | 'all_users' | string; // string for custom segment IDs

/**
 * History change types
 */
export type ConfigChangeType = 'created' | 'updated' | 'deleted' | 'rollback';
export type RuleAction = 'created' | 'updated' | 'deleted' | 'reordered';

/**
 * Validation rule types
 */
export type ValidationRuleType = 'min' | 'max' | 'regex' | 'maxLength';

// ============================================================================
// Database Models (aligned with Prisma schema)
// ============================================================================

/**
 * RemoteConfig model
 */
export interface RemoteConfig {
  id: string;
  gameId: string;
  key: string;
  value: unknown; // JSON type - actual type depends on dataType
  dataType: ConfigDataType;
  environment: ConfigEnvironment;
  enabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  rules?: RuleOverwrite[];
  history?: ConfigHistory[];
  validationRules?: ValidationRule[];
}

/**
 * RuleOverwrite model
 */
export interface RuleOverwrite {
  id: string;
  configId: string;
  priority: number;
  enabled: boolean;
  overrideValue: unknown; // Must match parent config dataType
  
  // Conditions (all nullable, null = "any")
  platformCondition: Platform | null;
  versionOperator: VersionOperator | null;
  versionValue: string | null; // Semantic version string
  countryCondition: string | null; // ISO 3166-1 alpha-2 code
  segmentCondition: SegmentType | null;
  activeAfter: Date | null;
  activeBetweenStart: Date | null;
  activeBetweenEnd: Date | null;
  
  createdAt: Date;
  updatedAt: Date;
  config?: RemoteConfig;
  history?: RuleHistory[];
}

/**
 * ConfigHistory model
 */
export interface ConfigHistory {
  id: string;
  configId: string;
  changeType: ConfigChangeType;
  previousValue: unknown | null;
  newValue: unknown;
  changedBy: string;
  changedAt: Date;
  config?: RemoteConfig;
}

/**
 * RuleHistory model
 */
export interface RuleHistory {
  id: string;
  ruleId: string | null;
  configId: string;
  action: RuleAction;
  previousState: unknown | null;
  newState: unknown | null;
  changedBy: string;
  changedAt: Date;
  rule?: RuleOverwrite;
}

/**
 * ValidationRule model
 */
export interface ValidationRule {
  id: string;
  configId: string;
  ruleType: ValidationRuleType;
  ruleValue: string;
  config?: RemoteConfig;
}

// ============================================================================
// Business Logic Types
// ============================================================================

/**
 * Rule evaluation context provided by client request
 */
export interface RuleEvaluationContext {
  platform?: Platform;
  version?: string; // Semantic version
  country?: string; // ISO 3166-1 alpha-2 code
  segment?: SegmentType;
  serverTime?: Date; // UTC server time for date conditions
}

/**
 * Result of rule evaluation for a single config
 */
export interface ConfigEvaluationResult {
  key: string;
  value: unknown;
  dataType: ConfigDataType;
  source: 'default' | 'rule' | 'ab_test'; // Where the value came from
  matchedRuleId?: string; // If source is 'rule'
  matchedRulePriority?: number;
}

/**
 * Complete fetch response for public endpoint
 */
export interface ConfigFetchResponse {
  configs: Record<string, unknown>; // key -> evaluated value
  metadata: {
    gameId: string;
    environment: ConfigEnvironment;
    fetchedAt: string; // ISO timestamp
    cacheUntil: string; // ISO timestamp (5 min from fetch)
    totalConfigs: number;
  };
  debug?: {
    evaluations: ConfigEvaluationResult[];
    context: RuleEvaluationContext;
  };
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Rule evaluation performance metrics
 */
export interface RuleEvaluationMetrics {
  totalRules: number;
  evaluatedRules: number;
  matchedRule: number | null;
  evaluationTimeMs: number;
  cacheHit: boolean;
}

// ============================================================================
// Service Layer Types
// ============================================================================

/**
 * Config creation input
 */
export interface CreateConfigInput {
  gameId: string;
  key: string;
  value: unknown;
  dataType: ConfigDataType;
  environment: ConfigEnvironment;
  enabled?: boolean;
  description?: string;
  validationRules?: CreateValidationRuleInput[];
}

/**
 * Config update input
 */
export interface UpdateConfigInput {
  value?: unknown;
  enabled?: boolean;
  description?: string;
  validationRules?: CreateValidationRuleInput[];
}

/**
 * Rule creation input
 */
export interface CreateRuleInput {
  configId: string;
  priority: number;
  enabled?: boolean;
  overrideValue: unknown;
  platformCondition?: Platform;
  versionOperator?: VersionOperator;
  versionValue?: string;
  countryCondition?: string;
  segmentCondition?: SegmentType;
  activeAfter?: Date;
  activeBetweenStart?: Date;
  activeBetweenEnd?: Date;
}

/**
 * Rule update input
 */
export interface UpdateRuleInput {
  priority?: number;
  enabled?: boolean;
  overrideValue?: unknown;
  platformCondition?: Platform | null;
  versionOperator?: VersionOperator | null;
  versionValue?: string | null;
  countryCondition?: string | null;
  segmentCondition?: SegmentType | null;
  activeAfter?: Date | null;
  activeBetweenStart?: Date | null;
  activeBetweenEnd?: Date | null;
}

/**
 * Validation rule creation input
 */
export interface CreateValidationRuleInput {
  ruleType: ValidationRuleType;
  ruleValue: string;
}

/**
 * Rule reorder operation
 */
export interface ReorderRulesInput {
  configId: string;
  ruleOrder: Array<{ ruleId: string; newPriority: number }>;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache key components for Redis
 */
export interface CacheKeyComponents {
  gameId: string;
  environment: ConfigEnvironment;
  platform?: Platform;
  version?: string;
  country?: string;
  segment?: SegmentType;
}

/**
 * Cached config data structure
 */
export interface CachedConfigData {
  configs: Record<string, unknown>;
  cachedAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
}

// ============================================================================
// Error Types
// ============================================================================

export class ConfigNotFoundError extends Error {
  constructor(configId: string) {
    super(`Config not found: ${configId}`);
    this.name = 'ConfigNotFoundError';
  }
}

export class RuleNotFoundError extends Error {
  constructor(ruleId: string) {
    super(`Rule not found: ${ruleId}`);
    this.name = 'RuleNotFoundError';
  }
}

export class DuplicateConfigKeyError extends Error {
  constructor(key: string, environment: string) {
    super(`Config key already exists: ${key} (environment: ${environment})`);
    this.name = 'DuplicateConfigKeyError';
  }
}

export class DuplicateRulePriorityError extends Error {
  constructor(priority: number, configId: string) {
    super(`Rule priority ${priority} already exists for config ${configId}`);
    this.name = 'DuplicateRulePriorityError';
  }
}

export class InvalidVersionFormatError extends Error {
  constructor(version: string) {
    super(`Invalid semantic version format: ${version}`);
    this.name = 'InvalidVersionFormatError';
  }
}

export class MaxRulesExceededError extends Error {
  constructor(configId: string, maxRules: number = 30) {
    super(`Config ${configId} has reached maximum of ${maxRules} rules`);
    this.name = 'MaxRulesExceededError';
  }
}

export class ConfigValueTooLargeError extends Error {
  constructor(size: number, maxSize: number = 102400) {
    super(`Config value size ${size} bytes exceeds maximum ${maxSize} bytes`);
    this.name = 'ConfigValueTooLargeError';
  }
}

