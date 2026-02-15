/**
 * Game Config Bundles - Type Definitions
 * Separate from Remote Config: spreadsheet-style, versioned sections + bundle releases.
 */

export type ToolEnvironment = 'development' | 'staging' | 'production';

export type GameConfigFieldType =
  | 'string'
  | 'int'
  | 'float'
  | 'bool'
  | 'json'
  | 'list'
  | 'ref';

export type GameConfigSectionType = 'array' | 'object';

export type RelationMode = 'error' | 'warn';

export type DeployAction = 'deploy' | 'rollback';

export interface GameConfigFieldConstraints {
  enum?: unknown[];
  min?: number;
  max?: number;
  regex?: string;
  maxLength?: number;
}

export type GameConfigFieldConstraintsExtended = GameConfigFieldConstraints & {
  // Structures
  structureRef?: string; // when type=json and referencing a structure
  elementType?: GameConfigFieldType; // when type=list
  elementStructureRef?: string; // when list elements are structures
  elementModelRef?: string; // when list elements follow a model/template schema

  // Models
  refTemplate?: string; // when type=ref, referencing another model/template by name
  refPath?: string; // default: "ID"

  // Enums
  enumRef?: string; // when using a named enum from schema revision
};

export interface CreateSchemaRevisionRequest {
  gameId: string;
  name: string;
  enums?: Array<{
    name: string;
    values: unknown[]; // v1: typically string[]
  }>;
  structures?: Array<{
    name: string;
    description?: string;
    fields: Array<{
      name: string;
      type: GameConfigFieldType;
      required?: boolean;
      constraints?: GameConfigFieldConstraintsExtended;
    }>;
  }>;
  templates: Array<{
    name: string;
    description?: string;
    sectionType?: GameConfigSectionType; // default: "array"
    primaryKey?: string[]; // e.g. ["ID","VariantID"]
    fields: Array<{
      name: string;
      type: GameConfigFieldType;
      required?: boolean;
      defaultValue?: unknown;
      constraints?: GameConfigFieldConstraintsExtended;
    }>;
  }>;
  relations?: Array<{
    fromTemplate: string;
    fromPath: string;
    toTemplate: string;
    toPath: string; // e.g. "ID" or "ID,VariantID"
    mode?: RelationMode;
  }>;
}

export interface OverwriteSchemaRevisionRequest extends CreateSchemaRevisionRequest {
  forceDeleteChannels?: boolean;
}

export interface DeleteSchemaRevisionRequest {
  gameId: string;
  forceDeleteChannels?: boolean;
}

export interface CreateChannelRequest {
  gameId: string;
  toolEnvironment: ToolEnvironment;
  envName: string;
  schemaRevisionId: string;
}

export interface ResetChannelRequest {
  schemaRevisionId?: string; // optional rebind (dev only)
}

export interface UpdateSectionDraftRequest {
  rows: unknown; // expected: array of row objects
}

export interface FreezeSectionRequest {
  label?: string;
}

export interface UpdateBundleDraftRequest {
  selection: Record<string, string>; // templateName -> sectionVersionId
}

export interface DeployRequest {
  gameId: string;
  envName: string;
  fromToolEnvironment: ToolEnvironment;
  toToolEnvironment: Exclude<ToolEnvironment, 'development'>; // staging | production
}

export interface RollbackRequest {
  gameId: string;
  envName: string;
  toolEnvironment: Exclude<ToolEnvironment, 'development'>; // staging | production
  toReleaseId: string;
}

export interface PublicVersionResponse {
  version: number;
  env: string;
}

export type PublicConfigsResponse = Record<string, unknown>;

export interface ValidationIssue {
  severity: 'error' | 'warn';
  template: string;
  rowRef: string; // pk or row index
  path: string; // field path
  message: string;
}
