import prisma from '../../prisma';
import {
  CreateChannelRequest,
  CreateSchemaRevisionRequest,
  DeleteSchemaRevisionRequest,
  DeployRequest,
  FreezeSectionRequest,
  OverwriteSchemaRevisionRequest,
  ResetChannelRequest,
  RollbackRequest,
  ToolEnvironment,
  UpdateBundleDraftRequest,
  UpdateSectionDraftRequest,
  ValidationIssue,
} from '../../types/gameConfig.types';
import { compileBundle } from './compiler';
import { publishToLocalArtifacts } from './publisher';
import { validateSectionRows } from './validation';

async function validateRefFieldsAgainstDrafts(args: {
  channelId: string;
  schemaRevisionId: string;
  templateName: string;
  fields: Array<{ name: string; type: string; constraints: any }>;
  rows: any[];
  primaryKey: string[] | null;
}): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = [];

  const refFields = args.fields.filter((f) => String(f.type) === 'ref');
  if (refFields.length === 0) return { ok: true, issues };

  // Resolve target template drafts once per referenced template.
  const targetCache = new Map<string, { keyField: string; keys: Set<string> }>();

  for (const f of refFields) {
    const c = (f.constraints || {}) as any;
    const refTemplate = typeof c.refTemplate === 'string' ? c.refTemplate : '';
    const refPath = typeof c.refPath === 'string' && c.refPath.trim() ? c.refPath.trim() : 'ID';
    if (!refTemplate) continue;

    if (!targetCache.has(refTemplate)) {
      const targetTemplate = await prisma.gameConfigTemplate.findFirst({
        where: { schemaRevisionId: args.schemaRevisionId, name: refTemplate },
        include: { fields: true },
      });
      if (!targetTemplate) {
        targetCache.set(refTemplate, { keyField: refPath, keys: new Set() });
      } else {
        const keyField =
          (Array.isArray(targetTemplate.primaryKey) && (targetTemplate.primaryKey as any).length > 0
            ? String((targetTemplate.primaryKey as any)[0])
            : refPath) || refPath;

        const draft = await prisma.gameConfigSectionDraft.findUnique({
          where: { channelId_templateId: { channelId: args.channelId, templateId: targetTemplate.id } } as any,
        });
        const keys = new Set<string>();
        const rows = (draft?.rows as any) || [];
        if (Array.isArray(rows)) {
          for (const r of rows) {
            if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
            const v = (r as any)[keyField];
            if (typeof v === 'string' && v.trim()) keys.add(v);
          }
        }
        targetCache.set(refTemplate, { keyField, keys });
      }
    }
  }

  const pk = args.primaryKey && args.primaryKey.length > 0 ? args.primaryKey : null;

  for (let i = 0; i < args.rows.length; i++) {
    const row = args.rows[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;

    const rowRef = pk ? pk.map((k) => (row as any)[k]).join('|') : String(i);

    for (const f of refFields) {
      const c = (f.constraints || {}) as any;
      const refTemplate = typeof c.refTemplate === 'string' ? c.refTemplate : '';
      const val = (row as any)[f.name];
      if (!refTemplate) continue;
      if (val === undefined || val === null || val === '') continue;
      if (typeof val !== 'string') continue; // type validation handles this

      const entry = targetCache.get(refTemplate);
      if (!entry) continue;
      if (!entry.keys.has(val)) {
        issues.push({
          severity: 'error',
          template: args.templateName,
          rowRef,
          path: f.name,
          message: `Invalid reference: '${val}' not found in ${refTemplate}.${entry.keyField} (draft)`,
        });
      }
    }
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues };
}

function getActorId(actor: unknown): string {
  return typeof actor === 'string' && actor.trim() ? actor : 'system';
}

function assertToolEnv(env: string): asserts env is ToolEnvironment {
  if (env !== 'development' && env !== 'staging' && env !== 'production') {
    throw new Error(`Invalid toolEnvironment: ${env}`);
  }
}

export async function createSchemaRevision(
  input: CreateSchemaRevisionRequest,
  actor: string
) {
  if (!input.gameId || !input.name) throw new Error('gameId and name required');
  if (!input.templates || input.templates.length === 0) {
    throw new Error('At least one template is required');
  }

  const createdBy = getActorId(actor);

  return prisma.$transaction(async (tx) => {
    const rev = await tx.gameConfigSchemaRevision.create({
      data: {
        gameId: input.gameId,
        name: input.name,
        createdBy,
      },
    });

    // Create enums (optional)
    if (input.enums && input.enums.length > 0) {
      for (const e of input.enums) {
        await tx.gameConfigEnum.create({
          data: {
            schemaRevisionId: rev.id,
            name: e.name,
            values: (Array.isArray(e.values) ? e.values : []) as any,
          },
        });
      }
    }

    // Create structures + fields (optional)
    if (input.structures && input.structures.length > 0) {
      for (const s of input.structures) {
        const structure = await tx.gameConfigStructure.create({
          data: {
            schemaRevisionId: rev.id,
            name: s.name,
            description: s.description,
          },
        });
        for (const f of s.fields || []) {
          await tx.gameConfigStructureField.create({
            data: {
              structureId: structure.id,
              name: f.name,
              type: f.type,
              required: !!f.required,
              constraints: (f.constraints || null) as any,
            },
          });
        }
      }
    }

    // Create templates + fields
    const templateIdByName = new Map<string, string>();
    for (const t of input.templates) {
      const tmpl = await tx.gameConfigTemplate.create({
        data: {
          schemaRevisionId: rev.id,
          name: t.name,
          description: t.description,
          sectionType: t.sectionType || 'array',
          primaryKey: (t.primaryKey && t.primaryKey.length > 0 ? t.primaryKey : null) as any,
        },
      });
      templateIdByName.set(t.name, tmpl.id);

      for (const f of t.fields || []) {
        await tx.gameConfigField.create({
          data: {
            templateId: tmpl.id,
            name: f.name,
            type: f.type,
            required: !!f.required,
            defaultValue: (f.defaultValue === undefined ? null : f.defaultValue) as any,
            constraints: (f.constraints || null) as any,
          },
        });
      }
    }

    // Relations (cross-section validation)
    if (input.relations && input.relations.length > 0) {
      for (const r of input.relations) {
        const fromId = templateIdByName.get(r.fromTemplate);
        const toId = templateIdByName.get(r.toTemplate);
        if (!fromId || !toId) {
          throw new Error(
            `Relation references unknown templates: ${r.fromTemplate} -> ${r.toTemplate}`
          );
        }
        await tx.gameConfigRelation.create({
          data: {
            schemaRevisionId: rev.id,
            fromTemplateId: fromId,
            fromPath: r.fromPath,
            toTemplateId: toId,
            toPath: r.toPath,
            mode: r.mode || 'error',
          },
        });
      }
    }

    return rev;
  });
}

export async function overwriteSchemaRevision(
  schemaRevisionId: string,
  input: OverwriteSchemaRevisionRequest,
  actor: string
) {
  if (!input.gameId || !input.name) throw new Error('gameId and name required');
  if (!input.templates || input.templates.length === 0) {
    throw new Error('At least one template is required');
  }

  const createdBy = getActorId(actor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.gameConfigSchemaRevision.findUnique({
      where: { id: schemaRevisionId },
    });
    if (!existing) throw new Error('Schema revision not found');
    if (existing.gameId !== input.gameId) throw new Error('Schema revision gameId mismatch');

    const bound = await tx.gameConfigChannel.findMany({
      where: { schemaRevisionId: existing.id },
      select: { id: true, toolEnvironment: true, envName: true },
    });

    const force = !!input.forceDeleteChannels;
    if (bound.length > 0 && !force) {
      const err: any = new Error(
        `Schema revision is bound to ${bound.length} channel(s). Confirm destructive overwrite to delete them.`
      );
      err.code = 'SCHEMA_IN_USE';
      err.boundChannels = bound;
      throw err;
    }

    if (bound.length > 0 && force) {
      // Delete all channels bound to this schema (dev/staging/prod). Cascades delete drafts/versions/releases/state/deployments.
      await tx.gameConfigChannel.deleteMany({ where: { schemaRevisionId: existing.id } });
    }

    // Clear existing schema contents
    await tx.gameConfigRelation.deleteMany({ where: { schemaRevisionId: existing.id } });
    await tx.gameConfigTemplate.deleteMany({ where: { schemaRevisionId: existing.id } });
    await tx.gameConfigStructure.deleteMany({ where: { schemaRevisionId: existing.id } });
    await tx.gameConfigEnum.deleteMany({ where: { schemaRevisionId: existing.id } });

    // Update schema revision name (still unique per gameId)
    // Keep createdBy/createdAt stable; this is a destructive "replace contents" operation.
    await tx.gameConfigSchemaRevision.update({
      where: { id: existing.id },
      data: { name: input.name },
    });

    // Recreate structures + fields
    if (input.structures && input.structures.length > 0) {
      for (const s of input.structures) {
        const structure = await tx.gameConfigStructure.create({
          data: {
            schemaRevisionId: existing.id,
            name: s.name,
            description: s.description,
          },
        });
        for (const f of s.fields || []) {
          await tx.gameConfigStructureField.create({
            data: {
              structureId: structure.id,
              name: f.name,
              type: f.type,
              required: !!f.required,
              constraints: (f.constraints || null) as any,
            },
          });
        }
      }
    }

    // Recreate enums (optional)
    if (input.enums && input.enums.length > 0) {
      for (const e of input.enums) {
        await tx.gameConfigEnum.create({
          data: {
            schemaRevisionId: existing.id,
            name: e.name,
            values: (Array.isArray(e.values) ? e.values : []) as any,
          },
        });
      }
    }

    // Recreate templates + fields
    const templateIdByName = new Map<string, string>();
    for (const t of input.templates) {
      const tmpl = await tx.gameConfigTemplate.create({
        data: {
          schemaRevisionId: existing.id,
          name: t.name,
          description: t.description,
          sectionType: t.sectionType || 'array',
          primaryKey: (t.primaryKey && t.primaryKey.length > 0 ? t.primaryKey : null) as any,
        },
      });
      templateIdByName.set(t.name, tmpl.id);

      for (const f of t.fields || []) {
        await tx.gameConfigField.create({
          data: {
            templateId: tmpl.id,
            name: f.name,
            type: f.type,
            required: !!f.required,
            defaultValue: (f.defaultValue === undefined ? null : f.defaultValue) as any,
            constraints: (f.constraints || null) as any,
          },
        });
      }
    }

    // Relations (explicit)
    if (input.relations && input.relations.length > 0) {
      for (const r of input.relations) {
        const fromId = templateIdByName.get(r.fromTemplate);
        const toId = templateIdByName.get(r.toTemplate);
        if (!fromId || !toId) {
          throw new Error(
            `Relation references unknown templates: ${r.fromTemplate} -> ${r.toTemplate}`
          );
        }
        await tx.gameConfigRelation.create({
          data: {
            schemaRevisionId: existing.id,
            fromTemplateId: fromId,
            fromPath: r.fromPath,
            toTemplateId: toId,
            toPath: r.toPath,
            mode: r.mode || 'error',
          },
        });
      }
    }

    return tx.gameConfigSchemaRevision.findUnique({ where: { id: existing.id } });
  });
}

export async function deleteSchemaRevision(
  schemaRevisionId: string,
  input: DeleteSchemaRevisionRequest,
  actor: string
) {
  void actor;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.gameConfigSchemaRevision.findUnique({
      where: { id: schemaRevisionId },
    });
    if (!existing) throw new Error('Schema revision not found');
    if (existing.gameId !== input.gameId) throw new Error('Schema revision gameId mismatch');

    const bound = await tx.gameConfigChannel.findMany({
      where: { schemaRevisionId: existing.id },
      select: { id: true, toolEnvironment: true, envName: true },
    });

    const force = !!input.forceDeleteChannels;
    if (bound.length > 0 && !force) {
      const err: any = new Error(
        `Schema revision is bound to ${bound.length} channel(s). Confirm destructive delete to delete them.`
      );
      err.code = 'SCHEMA_IN_USE';
      err.boundChannels = bound;
      throw err;
    }

    if (bound.length > 0 && force) {
      await tx.gameConfigChannel.deleteMany({ where: { schemaRevisionId: existing.id } });
    }

    await tx.gameConfigSchemaRevision.delete({ where: { id: existing.id } });

    return { deleted: true, schemaRevisionId: existing.id, deletedChannels: bound.length };
  });
}

export async function createChannel(input: CreateChannelRequest, actor: string) {
  assertToolEnv(input.toolEnvironment);
  const createdBy = getActorId(actor);

  return prisma.$transaction(async (tx) => {
    const schema = await tx.gameConfigSchemaRevision.findUnique({
      where: { id: input.schemaRevisionId },
    });
    if (!schema) throw new Error('Schema revision not found');
    if (schema.gameId !== input.gameId) throw new Error('Schema revision gameId mismatch');

    const channel = await tx.gameConfigChannel.create({
      data: {
        gameId: input.gameId,
        toolEnvironment: input.toolEnvironment,
        envName: input.envName,
        schemaRevisionId: input.schemaRevisionId,
      },
    });

    await tx.gameConfigBundleDraft.create({
      data: {
        channelId: channel.id,
        selection: {} as any,
        updatedBy: createdBy,
      },
    });

    await tx.gameConfigChannelState.create({
      data: {
        channelId: channel.id,
        currentVersion: 0,
        currentReleaseId: null,
      },
    });

    return channel;
  });
}

export async function resetDevelopmentChannel(channelId: string, input: ResetChannelRequest, actor: string) {
  const updatedBy = getActorId(actor);

  return prisma.$transaction(async (tx) => {
    const channel = await tx.gameConfigChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error('Channel not found');
    if (channel.toolEnvironment !== 'development') {
      throw new Error('Only development channels can be reset/rebound');
    }

    let nextSchemaRevisionId: string | null = null;
    if (input?.schemaRevisionId) {
      const schema = await tx.gameConfigSchemaRevision.findUnique({ where: { id: input.schemaRevisionId } });
      if (!schema) throw new Error('Schema revision not found');
      if (schema.gameId !== channel.gameId) throw new Error('Schema revision gameId mismatch');
      nextSchemaRevisionId = schema.id;
    }

    // Destructive: remove drafts/versions/releases and reset bundle/state.
    await tx.gameConfigSectionDraft.deleteMany({ where: { channelId: channel.id } });
    await tx.gameConfigSectionVersion.deleteMany({ where: { channelId: channel.id } });
    await tx.gameConfigBundleRelease.deleteMany({ where: { channelId: channel.id } } as any);

    await tx.gameConfigBundleDraft.upsert({
      where: { channelId: channel.id },
      update: { selection: {} as any, updatedBy },
      create: { channelId: channel.id, selection: {} as any, updatedBy },
    });

    await tx.gameConfigChannelState.upsert({
      where: { channelId: channel.id },
      update: { currentVersion: 0, currentReleaseId: null },
      create: { channelId: channel.id, currentVersion: 0, currentReleaseId: null },
    });

    const updated =
      nextSchemaRevisionId && nextSchemaRevisionId !== channel.schemaRevisionId
        ? await tx.gameConfigChannel.update({
            where: { id: channel.id },
            data: { schemaRevisionId: nextSchemaRevisionId },
          })
        : channel;

    return updated;
  });
}

export async function deleteDevelopmentChannel(channelId: string, actor: string) {
  void actor;
  return prisma.$transaction(async (tx) => {
    const channel = await tx.gameConfigChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error('Channel not found');
    if (channel.toolEnvironment !== 'development') {
      throw new Error('Only development channels can be deleted');
    }

    await tx.gameConfigSectionDraft.deleteMany({ where: { channelId: channel.id } });
    await tx.gameConfigSectionVersion.deleteMany({ where: { channelId: channel.id } });
    await tx.gameConfigBundleRelease.deleteMany({ where: { channelId: channel.id } } as any);
    await tx.gameConfigBundleDraft.deleteMany({ where: { channelId: channel.id } });
    await tx.gameConfigChannelState.deleteMany({ where: { channelId: channel.id } });
    await tx.gameConfigChannel.delete({ where: { id: channel.id } });

    return { deleted: true, channelId: channel.id };
  });
}

export async function pullFromStagingToDevelopmentChannel(channelId: string, actor: string) {
  const createdBy = getActorId(actor);

  return prisma.$transaction(async (tx) => {
    const dev = await tx.gameConfigChannel.findUnique({
      where: { id: channelId },
      include: { state: true },
    });
    if (!dev) throw new Error('Channel not found');
    if (dev.toolEnvironment !== 'development') {
      throw new Error('Pull from staging is only allowed for development channels');
    }

    const staging = await tx.gameConfigChannel.findUnique({
      where: {
        gameId_toolEnvironment_envName: {
          gameId: dev.gameId,
          toolEnvironment: 'staging',
          envName: dev.envName,
        },
      } as any,
      include: { state: true },
    });
    if (!staging) throw new Error('Staging channel not found for this envName');
    if (staging.schemaRevisionId !== dev.schemaRevisionId) {
      throw new Error('Schema mismatch: staging and development must use the same schema revision to pull');
    }

    const stagingReleaseId = staging.state?.currentReleaseId;
    if (!stagingReleaseId) throw new Error('Staging has no active release to pull');
    const stagingRelease = await tx.gameConfigBundleRelease.findUnique({ where: { id: stagingReleaseId } });
    if (!stagingRelease) throw new Error('Staging active release not found');

    const compiled = (stagingRelease.compiledConfigs || {}) as any;

    // Full replacement of dev channel content (like Remote Config pull).
    await tx.gameConfigSectionDraft.deleteMany({ where: { channelId: dev.id } });
    await tx.gameConfigSectionVersion.deleteMany({ where: { channelId: dev.id } });
    await tx.gameConfigBundleRelease.deleteMany({ where: { channelId: dev.id } } as any);

    const templates = await tx.gameConfigTemplate.findMany({
      where: { schemaRevisionId: dev.schemaRevisionId },
      include: { fields: true },
      orderBy: { createdAt: 'asc' },
    });
    const templateByName = new Map(templates.map((t) => [t.name, t]));

    const selection: Record<string, string> = {};
    let draftsWritten = 0;
    let versionsCreated = 0;

    for (const t of templates) {
      const rows = Array.isArray(compiled[t.name]) ? compiled[t.name] : [];

      await tx.gameConfigSectionDraft.create({
        data: {
          channelId: dev.id,
          templateId: t.id,
          rows: rows as any,
          updatedBy: createdBy,
        },
      });
      draftsWritten++;

      const version = await tx.gameConfigSectionVersion.create({
        data: {
          channelId: dev.id,
          templateId: t.id,
          versionNumber: 1,
          label: `pulled_from_staging_${String(stagingReleaseId).slice(0, 6)}`,
          rows: rows as any,
          createdBy,
        },
      });
      versionsCreated++;
      selection[t.name] = version.id;
    }

    await tx.gameConfigBundleDraft.upsert({
      where: { channelId: dev.id },
      update: { selection: selection as any, updatedBy: createdBy },
      create: { channelId: dev.id, selection: selection as any, updatedBy: createdBy },
    });

    await tx.gameConfigChannelState.upsert({
      where: { channelId: dev.id },
      update: { currentVersion: 0, currentReleaseId: null },
      create: { channelId: dev.id, currentVersion: 0, currentReleaseId: null },
    });

    // If compiled configs contain keys for templates that no longer exist, ignore them.
    // If schema has new templates, they will be pulled as empty arrays and still selectable.
    const unknownKeys = Object.keys(compiled || {}).filter((k) => !templateByName.has(k));

    return {
      envName: dev.envName,
      stagingReleaseId,
      draftsWritten,
      versionsCreated,
      selectionCount: Object.keys(selection).length,
      unknownKeys,
    };
  });
}

export async function upsertSectionDraft(
  channelId: string,
  templateName: string,
  input: UpdateSectionDraftRequest,
  actor: string
) {
  const updatedBy = getActorId(actor);

  const channel = await prisma.gameConfigChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error('Channel not found');
  if (channel.toolEnvironment !== 'development') {
    throw new Error('Section drafts can only be edited in development channels');
  }

  const template = await prisma.gameConfigTemplate.findFirst({
    where: { schemaRevisionId: channel.schemaRevisionId, name: templateName },
    include: { fields: true },
  });
  if (!template) throw new Error('Template not found in channel schema');

  const rows = input.rows;
  const { ok, issues } = validateSectionRows({
    templateName,
    rows,
    fields: template.fields.map((f) => ({
      name: f.name,
      type: f.type,
      required: f.required,
      constraints: f.constraints as any,
    })),
    primaryKey: (template.primaryKey as any) || null,
  });

  if (!ok) {
    const err = new Error('Validation failed');
    (err as any).issues = issues;
    throw err;
  }

  const refRes = await validateRefFieldsAgainstDrafts({
    channelId: channel.id,
    schemaRevisionId: channel.schemaRevisionId,
    templateName,
    fields: template.fields.map((f) => ({ name: f.name, type: f.type, constraints: f.constraints as any })),
    rows: rows as any,
    primaryKey: (template.primaryKey as any) || null,
  });
  if (!refRes.ok) {
    const err = new Error('Validation failed');
    (err as any).issues = [...issues, ...refRes.issues];
    throw err;
  }

  const draft = await prisma.gameConfigSectionDraft.upsert({
    where: {
      channelId_templateId: { channelId: channel.id, templateId: template.id },
    } as any,
    update: { rows: rows as any, updatedBy },
    create: {
      channelId: channel.id,
      templateId: template.id,
      rows: rows as any,
      updatedBy,
    },
  });

  return { draft, issues };
}

export async function freezeSectionVersion(
  channelId: string,
  templateName: string,
  input: FreezeSectionRequest,
  actor: string
) {
  const createdBy = getActorId(actor);

  const channel = await prisma.gameConfigChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error('Channel not found');
  if (channel.toolEnvironment !== 'development') {
    throw new Error('Freeze is only allowed in development channels');
  }

  const template = await prisma.gameConfigTemplate.findFirst({
    where: { schemaRevisionId: channel.schemaRevisionId, name: templateName },
    include: { fields: true },
  });
  if (!template) throw new Error('Template not found in channel schema');

  const draft = await prisma.gameConfigSectionDraft.findUnique({
    where: { channelId_templateId: { channelId: channel.id, templateId: template.id } } as any,
  });
  if (!draft) throw new Error('No draft exists for this template');

  const { ok, issues } = validateSectionRows({
    templateName,
    rows: draft.rows as any,
    fields: template.fields.map((f) => ({
      name: f.name,
      type: f.type,
      required: f.required,
      constraints: f.constraints as any,
    })),
    primaryKey: (template.primaryKey as any) || null,
  });
  if (!ok) {
    const err = new Error('Validation failed');
    (err as any).issues = issues;
    throw err;
  }

  const refRes = await validateRefFieldsAgainstDrafts({
    channelId: channel.id,
    schemaRevisionId: channel.schemaRevisionId,
    templateName,
    fields: template.fields.map((f) => ({ name: f.name, type: f.type, constraints: f.constraints as any })),
    rows: (draft.rows as any) || [],
    primaryKey: (template.primaryKey as any) || null,
  });
  if (!refRes.ok) {
    const err = new Error('Validation failed');
    (err as any).issues = [...issues, ...refRes.issues];
    throw err;
  }

  const last = await prisma.gameConfigSectionVersion.findFirst({
    where: { channelId: channel.id, templateId: template.id },
    orderBy: { versionNumber: 'desc' },
  });
  const nextVersion = (last?.versionNumber || 0) + 1;

  const created = await prisma.gameConfigSectionVersion.create({
    data: {
      channelId: channel.id,
      templateId: template.id,
      versionNumber: nextVersion,
      label: input.label || `v${nextVersion}`,
      rows: draft.rows as any,
      createdBy,
    },
  });

  return { version: created, issues };
}

export async function updateBundleDraft(
  channelId: string,
  input: UpdateBundleDraftRequest,
  actor: string
) {
  const updatedBy = getActorId(actor);
  const channel = await prisma.gameConfigChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error('Channel not found');
  if (channel.toolEnvironment !== 'development') {
    throw new Error('Bundle draft can only be edited in development channels');
  }

  // Validate selection points to section versions inside this channel and matching template name.
  const schemaTemplates = await prisma.gameConfigTemplate.findMany({
    where: { schemaRevisionId: channel.schemaRevisionId },
  });
  const templateByName = new Map(schemaTemplates.map((t) => [t.name, t]));

  for (const [templateName, sectionVersionId] of Object.entries(input.selection || {})) {
    const tmpl = templateByName.get(templateName);
    if (!tmpl) throw new Error(`Unknown template in selection: ${templateName}`);
    const v = await prisma.gameConfigSectionVersion.findUnique({ where: { id: sectionVersionId } });
    if (!v) throw new Error(`SectionVersion not found: ${sectionVersionId}`);
    if (v.channelId !== channel.id) throw new Error('SectionVersion must belong to the same channel');
    if (v.templateId !== tmpl.id) throw new Error('SectionVersion template mismatch for selection');
  }

  const draft = await prisma.gameConfigBundleDraft.upsert({
    where: { channelId: channel.id },
    update: { selection: input.selection as any, updatedBy },
    create: { channelId: channel.id, selection: input.selection as any, updatedBy },
  });

  return draft;
}

export async function getBundleDraft(channelId: string) {
  const draft = await prisma.gameConfigBundleDraft.findUnique({ where: { channelId } });
  return draft;
}

export async function getSectionDraft(channelId: string, templateName: string) {
  const channel = await prisma.gameConfigChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error('Channel not found');
  const template = await prisma.gameConfigTemplate.findFirst({
    where: { schemaRevisionId: channel.schemaRevisionId, name: templateName },
  });
  if (!template) throw new Error('Template not found');
  return prisma.gameConfigSectionDraft.findUnique({
    where: { channelId_templateId: { channelId, templateId: template.id } } as any,
  });
}

async function getOrCreateTargetChannel(args: {
  gameId: string;
  toolEnvironment: Exclude<ToolEnvironment, 'development'>;
  envName: string;
  schemaRevisionId: string;
}) {
  const existing = await prisma.gameConfigChannel.findUnique({
    where: {
      gameId_toolEnvironment_envName: {
        gameId: args.gameId,
        toolEnvironment: args.toolEnvironment,
        envName: args.envName,
      },
    } as any,
    include: { state: true },
  });
  if (existing) {
    if (existing.schemaRevisionId !== args.schemaRevisionId) {
      throw new Error('Target channel schemaRevisionId mismatch (schema is immutable per channel)');
    }
    if (!existing.state) {
      await prisma.gameConfigChannelState.create({
        data: { channelId: existing.id, currentVersion: 0, currentReleaseId: null },
      });
    }
    return existing;
  }

  const channel = await prisma.gameConfigChannel.create({
    data: {
      gameId: args.gameId,
      toolEnvironment: args.toolEnvironment,
      envName: args.envName,
      schemaRevisionId: args.schemaRevisionId,
    },
  });
  await prisma.gameConfigChannelState.create({
    data: { channelId: channel.id, currentVersion: 0, currentReleaseId: null },
  });
  return channel;
}

export async function deployChannelBundle(
  input: DeployRequest,
  actor: string
): Promise<{
  channelId: string;
  toToolEnvironment: string;
  envName: string;
  newVersion: number;
  releaseId: string;
  compiledHash: string;
  issues: ValidationIssue[];
  published?: { versionPath: string; configsPath: string };
}> {
  assertToolEnv(input.fromToolEnvironment);
  assertToolEnv(input.toToolEnvironment);

  const createdBy = getActorId(actor);

  // Deploy targets are restricted by the workflow checks below.
  if (input.fromToolEnvironment === 'production') {
    throw new Error('Production cannot be a deploy source');
  }

  const source = await prisma.gameConfigChannel.findUnique({
    where: {
      gameId_toolEnvironment_envName: {
        gameId: input.gameId,
        toolEnvironment: input.fromToolEnvironment,
        envName: input.envName,
      },
    } as any,
  });
  if (!source) throw new Error('Source channel not found');

  // Enforce workflow: dev -> staging, staging -> production
  if (input.fromToolEnvironment === 'development' && input.toToolEnvironment !== 'staging') {
    throw new Error('Only development -> staging is allowed for deploy');
  }
  if (input.fromToolEnvironment === 'staging' && input.toToolEnvironment !== 'production') {
    throw new Error('Only staging -> production is allowed for publish');
  }

  // For dev -> staging: compile from the dev bundle draft selection.
  // For staging -> production: publish the currently active staging release (staging is read-only).
  const templates = await prisma.gameConfigTemplate.findMany({
    where: { schemaRevisionId: source.schemaRevisionId },
    include: { fields: true },
  });
  const primaryKeysByTemplate: Record<string, string[] | null> = {};
  for (const t of templates) primaryKeysByTemplate[t.name] = (t.primaryKey as any) || null;

  let selection: Record<string, string> = {};
  let compiledRes: { compiled: Record<string, unknown>; compiledHash: string; issues: ValidationIssue[]; ok: boolean };

  if (input.fromToolEnvironment === 'development') {
    const sourceBundleDraft = await prisma.gameConfigBundleDraft.findUnique({
      where: { channelId: source.id },
    });
    if (!sourceBundleDraft) throw new Error('Source bundle draft not found');

    selection = (sourceBundleDraft.selection || {}) as Record<string, string>;
    if (Object.keys(selection).length === 0) throw new Error('Bundle draft selection is empty');

    const templateByName = new Map(templates.map((t) => [t.name, t]));

    const sections: Record<string, unknown> = {};
    for (const [templateName, sectionVersionId] of Object.entries(selection)) {
      const tmpl = templateByName.get(templateName);
      if (!tmpl) throw new Error(`Unknown template in selection: ${templateName}`);
      const v = await prisma.gameConfigSectionVersion.findUnique({ where: { id: sectionVersionId } });
      if (!v) throw new Error(`SectionVersion not found: ${sectionVersionId}`);
      if (v.channelId !== source.id) throw new Error('Selected SectionVersion must belong to source channel');
      if (v.templateId !== tmpl.id) throw new Error(`Selected SectionVersion template mismatch for ${templateName}`);
      sections[templateName] = v.rows as any;
    }

    const rels = await prisma.gameConfigRelation.findMany({
      where: { schemaRevisionId: source.schemaRevisionId },
    });
    const relTemplateNameById = new Map(templates.map((t) => [t.id, t.name]));
    const relations = rels
      .map((r) => ({
        fromTemplateName: relTemplateNameById.get(r.fromTemplateId) || '',
        fromPath: r.fromPath,
        toTemplateName: relTemplateNameById.get(r.toTemplateId) || '',
        toPath: r.toPath,
        mode: (r.mode as any) || 'error',
      }))
      .filter((r) => r.fromTemplateName && r.toTemplateName);

    // Implicit relations from type=ref fields (foreign key references).
    const implicit = [];
    for (const t of templates) {
      for (const f of (t.fields || []) as any[]) {
        if (String(f.type) !== 'ref') continue;
        const c = (f.constraints || {}) as any;
        const refTemplate = typeof c.refTemplate === 'string' ? c.refTemplate : '';
        const refPath = typeof c.refPath === 'string' && c.refPath.trim() ? c.refPath.trim() : 'ID';
        if (!refTemplate) continue;
        implicit.push({
          fromTemplateName: t.name,
          fromPath: f.name,
          toTemplateName: refTemplate,
          toPath: refPath,
          mode: 'error' as const,
        });
      }
    }

    compiledRes = compileBundle({
      sections,
      relations: [...relations, ...implicit],
      primaryKeysByTemplate,
    });
  } else {
    const sourceState = await prisma.gameConfigChannelState.findUnique({ where: { channelId: source.id } });
    const sourceReleaseId = sourceState?.currentReleaseId;
    if (!sourceReleaseId) throw new Error('Staging has no active release to publish');
    const sourceRelease = await prisma.gameConfigBundleRelease.findUnique({ where: { id: sourceReleaseId } });
    if (!sourceRelease) throw new Error('Staging active release not found');
    selection = (sourceRelease.selection || {}) as Record<string, string>;
    compiledRes = {
      compiled: sourceRelease.compiledConfigs as any,
      compiledHash: sourceRelease.compiledHash,
      issues: [],
      ok: true,
    };
  }

  if (!compiledRes.ok) {
    const err = new Error('Bundle validation failed');
    (err as any).issues = compiledRes.issues;
    throw err;
  }

  const target = await getOrCreateTargetChannel({
    gameId: input.gameId,
    toolEnvironment: input.toToolEnvironment as any,
    envName: input.envName,
    schemaRevisionId: source.schemaRevisionId,
  });

  return prisma.$transaction(async (tx) => {
    const state =
      (await tx.gameConfigChannelState.findUnique({ where: { channelId: target.id } })) ||
      (await tx.gameConfigChannelState.create({
        data: { channelId: target.id, currentVersion: 0, currentReleaseId: null },
      }));

    const fromVersion = state.currentVersion;
    const toVersion = fromVersion + 1;
    const fromReleaseId = state.currentReleaseId;

    const release = await tx.gameConfigBundleRelease.create({
      data: {
        channelId: target.id,
        selection: selection as any,
        compiledConfigs: compiledRes.compiled as any,
        compiledHash: compiledRes.compiledHash,
        createdBy,
      },
    });

    await tx.gameConfigChannelState.update({
      where: { channelId: target.id },
      data: { currentVersion: toVersion, currentReleaseId: release.id },
    });

    await tx.gameConfigDeployment.create({
      data: {
        channelId: target.id,
        action: 'deploy',
        fromReleaseId: fromReleaseId,
        toReleaseId: release.id,
        fromVersion,
        toVersion,
        createdBy,
        snapshot: {
          envName: target.envName,
          toolEnvironment: target.toolEnvironment,
          selection,
          compiledHash: compiledRes.compiledHash,
        } as any,
      },
    });

    // Local artifact publishing (safe fallback; R2 integration can replace this).
    const published = await publishToLocalArtifacts({
      baseDir: 'exports',
      gameId: target.gameId,
      toolEnvironment: target.toolEnvironment,
      envName: target.envName,
      version: toVersion,
      compiledConfigs: compiledRes.compiled,
    });

    return {
      channelId: target.id,
      toToolEnvironment: target.toolEnvironment,
      envName: target.envName,
      newVersion: toVersion,
      releaseId: release.id,
      compiledHash: compiledRes.compiledHash,
      issues: compiledRes.issues,
      published,
    };
  });
}

export async function rollbackChannel(
  input: RollbackRequest,
  actor: string
): Promise<{
  channelId: string;
  toolEnvironment: string;
  envName: string;
  newVersion: number;
  releaseId: string;
  compiledHash: string;
  published?: { versionPath: string; configsPath: string };
}> {
  const createdBy = getActorId(actor);

  const channel = await prisma.gameConfigChannel.findUnique({
    where: {
      gameId_toolEnvironment_envName: {
        gameId: input.gameId,
        toolEnvironment: input.toolEnvironment,
        envName: input.envName,
      },
    } as any,
  });
  if (!channel) throw new Error('Channel not found');
  if (channel.toolEnvironment === 'development') throw new Error('Rollback not allowed in development');

  const targetRelease = await prisma.gameConfigBundleRelease.findUnique({
    where: { id: input.toReleaseId },
  });
  if (!targetRelease) throw new Error('Release not found');
  if (targetRelease.channelId !== channel.id) throw new Error('Release does not belong to channel');

  return prisma.$transaction(async (tx) => {
    const state =
      (await tx.gameConfigChannelState.findUnique({ where: { channelId: channel.id } })) ||
      (await tx.gameConfigChannelState.create({
        data: { channelId: channel.id, currentVersion: 0, currentReleaseId: null },
      }));

    const fromVersion = state.currentVersion;
    const toVersion = fromVersion + 1;
    const fromReleaseId = state.currentReleaseId;

    await tx.gameConfigChannelState.update({
      where: { channelId: channel.id },
      data: { currentVersion: toVersion, currentReleaseId: targetRelease.id },
    });

    await tx.gameConfigDeployment.create({
      data: {
        channelId: channel.id,
        action: 'rollback',
        fromReleaseId,
        toReleaseId: targetRelease.id,
        fromVersion,
        toVersion,
        createdBy,
        snapshot: {
          envName: channel.envName,
          toolEnvironment: channel.toolEnvironment,
          compiledHash: targetRelease.compiledHash,
          releaseId: targetRelease.id,
        } as any,
      },
    });

    const published = await publishToLocalArtifacts({
      baseDir: 'exports',
      gameId: channel.gameId,
      toolEnvironment: channel.toolEnvironment,
      envName: channel.envName,
      version: toVersion,
      compiledConfigs: targetRelease.compiledConfigs as any,
    });

    return {
      channelId: channel.id,
      toolEnvironment: channel.toolEnvironment,
      envName: channel.envName,
      newVersion: toVersion,
      releaseId: targetRelease.id,
      compiledHash: targetRelease.compiledHash,
      published,
    };
  });
}

export async function getPublicVersion(args: { gameId: string; envName: string }) {
  const channel = await prisma.gameConfigChannel.findUnique({
    where: {
      gameId_toolEnvironment_envName: {
        gameId: args.gameId,
        toolEnvironment: 'production',
        envName: args.envName,
      },
    } as any,
    include: { state: true },
  });
  if (!channel) return null;
  const version = channel.state?.currentVersion ?? 0;
  return { version, env: channel.envName };
}

export async function getPublicConfigs(args: { gameId: string; envName: string }) {
  const channel = await prisma.gameConfigChannel.findUnique({
    where: {
      gameId_toolEnvironment_envName: {
        gameId: args.gameId,
        toolEnvironment: 'production',
        envName: args.envName,
      },
    } as any,
    include: { state: true },
  });
  if (!channel) return null;
  const releaseId = channel.state?.currentReleaseId;
  if (!releaseId) return { configs: null, version: channel.state?.currentVersion ?? 0 };
  const rel = await prisma.gameConfigBundleRelease.findUnique({ where: { id: releaseId } });
  if (!rel) return { configs: null, version: channel.state?.currentVersion ?? 0 };
  return { configs: rel.compiledConfigs as any, version: channel.state?.currentVersion ?? 0 };
}

// ---------------------------------------------------------------------------
// Admin read helpers (for UI)
// ---------------------------------------------------------------------------

export async function listSchemaRevisions(gameId: string) {
  return prisma.gameConfigSchemaRevision.findMany({
    where: { gameId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSchemaRevision(schemaRevisionId: string) {
  return prisma.gameConfigSchemaRevision.findUnique({
    where: { id: schemaRevisionId },
    include: {
      enums: { orderBy: { createdAt: 'asc' } },
      structures: {
        orderBy: { createdAt: 'asc' },
        include: { fields: { orderBy: { createdAt: 'asc' } } },
      },
      templates: {
        orderBy: { createdAt: 'asc' },
        include: { fields: { orderBy: { createdAt: 'asc' } } },
      },
      relations: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function listChannels(gameId: string, toolEnvironment?: ToolEnvironment) {
  const where: any = { gameId };
  if (toolEnvironment) where.toolEnvironment = toolEnvironment;
  return prisma.gameConfigChannel.findMany({
    where,
    include: { state: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function listSectionVersions(channelId: string, templateName: string) {
  const channel = await prisma.gameConfigChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error('Channel not found');
  const template = await prisma.gameConfigTemplate.findFirst({
    where: { schemaRevisionId: channel.schemaRevisionId, name: templateName },
  });
  if (!template) throw new Error('Template not found');
  return prisma.gameConfigSectionVersion.findMany({
    where: { channelId, templateId: template.id },
    orderBy: { versionNumber: 'desc' },
  });
}

export async function deleteSectionVersion(channelId: string, templateName: string, versionId: string, actor: string) {
  void actor;
  return prisma.$transaction(async (tx) => {
    const channel = await tx.gameConfigChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error('Channel not found');
    if (channel.toolEnvironment !== 'development') {
      throw new Error('Frozen versions can only be deleted in development channels');
    }

    const template = await tx.gameConfigTemplate.findFirst({
      where: { schemaRevisionId: channel.schemaRevisionId, name: templateName },
    });
    if (!template) throw new Error('Template not found');

    const v = await tx.gameConfigSectionVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new Error('Section version not found');
    if (v.channelId !== channel.id) throw new Error('Section version channel mismatch');
    if (v.templateId !== template.id) throw new Error('Section version template mismatch');

    await tx.gameConfigSectionVersion.delete({ where: { id: v.id } });

    // If bundle draft selection referenced this version, clear it.
    const draft = await tx.gameConfigBundleDraft.findUnique({ where: { channelId: channel.id } });
    if (draft && draft.selection && typeof draft.selection === 'object') {
      const sel = { ...(draft.selection as any) } as Record<string, string>;
      if (sel[templateName] === versionId) {
        delete sel[templateName];
        await tx.gameConfigBundleDraft.update({
          where: { channelId: channel.id },
          data: { selection: sel as any },
        });
      }
    }

    return { deleted: true, versionId };
  });
}

export async function listReleases(gameId: string, toolEnvironment: ToolEnvironment, envName: string) {
  const channel = await prisma.gameConfigChannel.findUnique({
    where: { gameId_toolEnvironment_envName: { gameId, toolEnvironment, envName } } as any,
  });
  if (!channel) throw new Error('Channel not found');
  return prisma.gameConfigBundleRelease.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: 'desc' },
  });
}
