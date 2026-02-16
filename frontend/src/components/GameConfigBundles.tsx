import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import {
  createGameConfigChannel,
  createGameConfigSchemaRevision,
  deleteSectionVersion,
  deleteGameConfigChannel,
  deleteGameConfigSchemaRevision,
  deployBundle,
  getGameConfigSchemaRevision,
  listGameConfigChannels,
  listGameConfigSchemaRevisions,
  listReleases,
  listSectionVersions,
  overwriteGameConfigSchemaRevision,
  pullGameConfigFromStaging,
  resetGameConfigChannel,
  rollbackBundle,
  updateBundleDraft,
  upsertSectionDraft,
  freezeSection,
} from '../services/gameConfigApi';
import apiClient from '../lib/apiClient';
import './GameConfigBundles.css';

type FieldType = 'string' | 'int' | 'float' | 'bool' | 'json' | 'list' | 'ref' | 'enum';

type FieldDef = {
  name: string;
  type: FieldType;
  required: boolean;
  constraints?: {
    structureRef?: string; // for type=json
    elementType?: FieldType; // for type=list
    elementStructureRef?: string; // for list element struct
    elementModelRef?: string; // for list element model schema
    refTemplate?: string; // for type=ref
    refPath?: string; // default: "ID"
    enumRef?: string; // for type=enum (stored as string+enum constraint when persisted)
    enum?: unknown[]; // persisted constraint for validation + UI dropdowns
  };
};

type TemplateDef = {
  name: string;
  description?: string;
  sectionType: 'array';
  primaryKey: string[];
  fields: FieldDef[];
};

type StructureDef = {
  name: string;
  description?: string;
  fields: FieldDef[];
};

type RelationDef = {
  fromTemplate: string;
  fromPath: string;
  toTemplate: string;
  toPath: string;
  mode: 'error' | 'warn';
};

type EnumDef = {
  name: string;
  values: string[];
};

type Status = { kind: 'idle' | 'loading' | 'ok' | 'error'; message?: string };
type ValidationIssue = { severity: 'error' | 'warn'; template: string; rowRef: string; path: string; message: string };

function emptyTemplate(name = 'NewTab'): TemplateDef {
  return {
    name,
    sectionType: 'array',
    primaryKey: [],
    fields: [{ name: 'ID', type: 'string', required: true }],
  };
}

function emptyStructure(name = 'NewStructure'): StructureDef {
  return {
    name,
    fields: [{ name: 'ID', type: 'string', required: true }],
  };
}

function inferColumnsFromRows(rows: any[]): string[] {
  const keys = new Set<string>();
  for (const r of rows.slice(0, 100)) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      for (const k of Object.keys(r)) keys.add(k);
    }
  }
  return Array.from(keys);
}

function defaultValueForType(t: FieldType): any {
  if (t === 'bool') return false;
  if (t === 'int') return 0;
  if (t === 'float') return 0;
  if (t === 'list') return [];
  if (t === 'json') return {};
  if (t === 'ref') return '';
  if (t === 'enum') return '';
  return '';
}

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Invalid JSON' };
  }
}

function moveItem<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
}

function listTypeLabel(c?: { elementType?: FieldType; elementStructureRef?: string; elementModelRef?: string }): string {
  const et = c?.elementType || 'string';
  if (et === 'json') return `list<${c?.elementModelRef || c?.elementStructureRef || 'object'}>`;
  return `list<${et}>`;
}

function refTypeLabel(c?: { refTemplate?: string }): string {
  return `ref<${c?.refTemplate || 'model'}>`;
}

function enumTypeLabel(c?: { enumRef?: string }): string {
  return `enum<${c?.enumRef || 'Enum'}>`;
}

type DictionaryPage = 'structures' | 'models' | 'enums' | 'scheme';
type GameConfigPage = 'dictionary' | 'data' | 'bundle' | 'releases';

const GameConfigBundles: React.FC<{ isCollapsed?: boolean; page?: GameConfigPage; dictionaryPage?: DictionaryPage }> = ({ isCollapsed, page, dictionaryPage }) => {
  const { currentGame } = useGame();
  const gameId = currentGame?.id;
  const location = useLocation();

  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Schema builder state (visual)
  const [schemaName, setSchemaName] = useState('schema_live_3_1_0');
  const [enums, setEnums] = useState<EnumDef[]>([
    { name: 'PurchaseType', values: ['IAP', 'Soft', 'Hard'] },
  ]);
  const [activeEnumIdx, setActiveEnumIdx] = useState(0);
  const [structures, setStructures] = useState<StructureDef[]>([
    {
      name: 'DropItem',
      fields: [
        { name: 'ID', type: 'string', required: true },
        { name: 'DropProbability', type: 'string', required: false },
        { name: 'MinStack', type: 'int', required: false },
        { name: 'MaxStack', type: 'int', required: false },
      ],
    },
  ]);
  const [activeStructureIdx, setActiveStructureIdx] = useState(0);
  const [expandedStructureFieldIdx, setExpandedStructureFieldIdx] = useState<number | null>(null);
  const [templates, setTemplates] = useState<TemplateDef[]>([
    {
      name: 'Gacha',
      sectionType: 'array',
      primaryKey: ['ID'],
      fields: [
        { name: 'ID', type: 'string', required: true },
        { name: 'Name', type: 'string', required: true },
        { name: 'MinDrop', type: 'int', required: true },
        { name: 'MaxDrop', type: 'int', required: true },
        { name: 'Drops', type: 'list', required: true, constraints: { elementType: 'json', elementStructureRef: 'DropItem' } },
      ],
    },
    {
      name: 'StoreProducts',
      sectionType: 'array',
      primaryKey: ['ID', 'VariantID'],
      fields: [
        { name: 'ID', type: 'string', required: true },
        { name: 'VariantID', type: 'string', required: true },
        { name: 'Category', type: 'string', required: true },
        { name: 'ParentCategory', type: 'string', required: true },
        { name: 'Name', type: 'string', required: true },
        { name: 'Drop', type: 'ref', required: true, constraints: { refTemplate: 'Gacha', refPath: 'ID' } },
        { name: 'DropAmount', type: 'int', required: true },
        { name: 'PurchaseType', type: 'string', required: true },
        { name: 'ProductPrice', type: 'string', required: true },
      ],
    },
  ]);
  const [relations, setRelations] = useState<RelationDef[]>([]);
  const [activeTemplateIdx, setActiveTemplateIdx] = useState(0);
  const [expandedModelFieldIdx, setExpandedModelFieldIdx] = useState<number | null>(null);
  const [dragField, setDragField] = useState<null | { kind: 'structure' | 'model'; from: number }>(null);
  const [dragOverField, setDragOverField] = useState<null | { kind: 'structure' | 'model'; over: number }>(null);

  // Persist the in-progress Dictionary draft across navigation (analytics -> game-config etc).
  const draftStorageKey = useMemo(() => (gameId ? `lvlup:game-config:dictionaryDraft:${gameId}` : ''), [gameId]);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; confirmText?: string; danger?: boolean; onConfirm: () => void }>(null);

  // Schema revisions and channels
  const [schemaRevs, setSchemaRevs] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);

  const [envName, setEnvName] = useState('live_3.1.0');
  const [schemaRevisionId, setSchemaRevisionId] = useState('');
  const [devChannelId, setDevChannelId] = useState('');
  const [rebindSchemaRevisionId, setRebindSchemaRevisionId] = useState('');
  const [devChannelReloadNonce, setDevChannelReloadNonce] = useState(0);
  const [overwriteSchemaRevisionId, setOverwriteSchemaRevisionId] = useState('');
  const [deleteSchemaRevisionId, setDeleteSchemaRevisionId] = useState('');

  const devChannels = useMemo(() => channels.filter((c) => c.toolEnvironment === 'development'), [channels]);
  const devChannel = useMemo(() => channels.find((c) => c.id === devChannelId) || null, [channels, devChannelId]);
  const devSchemaName = useMemo(() => {
    if (!devChannel) return '';
    const r = schemaRevs.find((x) => x.id === devChannel.schemaRevisionId);
    return r?.name || '';
  }, [devChannel, schemaRevs]);

  // Loaded schema detail for selected channel
  const [schemaDetail, setSchemaDetail] = useState<any | null>(null);
  const templateNames = useMemo(() => (schemaDetail?.templates || []).map((t: any) => t.name), [schemaDetail]);
  const templateFieldDefsByName = useMemo(() => {
    const out: Record<string, Array<{ name: string; type: FieldType; required: boolean; constraints?: any }>> = {};
    for (const t of schemaDetail?.templates || []) {
      out[t.name] = (t.fields || []).map((f: any) => ({
        name: f.name,
        type: f.type as FieldType,
        required: !!f.required,
        constraints: f.constraints || undefined,
      }));
    }
    return out;
  }, [schemaDetail]);

  const primaryKeysByTemplate = useMemo(() => {
    const out: Record<string, string[] | null> = {};
    for (const t of schemaDetail?.templates || []) {
      const pk = (t as any)?.primaryKey;
      out[t.name] = Array.isArray(pk) && pk.length > 0 ? pk : null;
    }
    return out;
  }, [schemaDetail]);

  const enumDefsByName = useMemo(() => {
    const out: Record<string, unknown[]> = {};
    for (const e of schemaDetail?.enums || []) {
      if (e && typeof e.name === 'string') out[e.name] = Array.isArray(e.values) ? e.values : [];
    }
    return out;
  }, [schemaDetail]);

  const structureFieldDefsByName = useMemo(() => {
    const out: Record<string, Array<{ name: string; type: FieldType; required: boolean; constraints?: any }>> = {};
    for (const s of schemaDetail?.structures || []) {
      out[s.name] = (s.fields || []).map((f: any) => ({
        name: f.name,
        type: f.type as FieldType,
        required: !!f.required,
        constraints: f.constraints || undefined,
      }));
    }
    return out;
  }, [schemaDetail]);

  function makeCompositeKey(values: unknown[]): string {
    return values.map((v) => JSON.stringify(v)).join('|');
  }

  function rowRefFor(templateName: string, rowIndex: number, rowObj: any): string {
    const pk = primaryKeysByTemplate[templateName];
    if (!pk || pk.length === 0) return String(rowIndex);
    const vals = pk.map((k) => rowObj?.[k]);
    if (vals.some((v) => v === undefined || v === null || v === '')) return String(rowIndex);
    return makeCompositeKey(vals);
  }

  function issueSeverityFor(templateName: string, rowIndex: number, rowObj: any, fieldName: string): 'error' | 'warn' | null {
    const issues = issuesByTemplate[templateName] || [];
    if (issues.length === 0) return null;
    const rowRef = rowRefFor(templateName, rowIndex, rowObj);
    const hits = issues.filter((i) => i.template === templateName && i.rowRef === rowRef);
    if (hits.length === 0) return null;

    // Issues can come in as "ID,VariantID" for PK problems.
    const matchesField = (path: string) =>
      path === fieldName || path.split(',').map((s) => s.trim()).includes(fieldName);

    const fieldHits = hits.filter((h) => matchesField(h.path));
    if (fieldHits.some((h) => h.severity === 'error')) return 'error';
    if (fieldHits.some((h) => h.severity === 'warn')) return 'warn';
    return null;
  }

  function issueCounts(templateName: string): { errors: number; warns: number } {
    const issues = issuesByTemplate[templateName] || [];
    let errors = 0;
    let warns = 0;
    for (const i of issues) {
      if (i.severity === 'error') errors++;
      else warns++;
    }
    return { errors, warns };
  }

  // Data editor
  const [activeDataTab, setActiveDataTab] = useState<string>('');
  const [rowsByTemplate, setRowsByTemplate] = useState<Record<string, any[]>>({});
  const [dirtyTemplates, setDirtyTemplates] = useState<Record<string, boolean>>({});
  const [dataViewMode, setDataViewMode] = useState<'grid' | 'sheet'>('sheet');
  const [loadedFrozenByTemplate, setLoadedFrozenByTemplate] = useState<
    Record<string, null | { id: string; label?: string; versionNumber?: number; createdAt?: string }>
  >({});
  const [issuesByTemplate, setIssuesByTemplate] = useState<Record<string, ValidationIssue[]>>({});
  const sheetFoldStorageKey = useMemo(() => {
    if (!gameId) return '';
    if (!devChannelId) return `lvlup:game-config:sheetFold:${gameId}:no-channel`;
    return `lvlup:game-config:sheetFold:${gameId}:${devChannelId}`;
  }, [gameId, devChannelId]);
  const [sheetFoldByPk, setSheetFoldByPk] = useState<Record<string, boolean>>({});

  // Structure column-group collapse state (Data grid)
  const structCollapseStorageKey = useMemo(
    () => (gameId ? `lvlup:game-config:structCollapse:${gameId}` : ''),
    [gameId]
  );
  const [structCollapse, setStructCollapse] = useState<Record<string, boolean>>({});

  // Nested list modal (supports deep nesting via a stack)
  type ListEditorCtx = {
    title: string;
    items: any[];
    constraints?: any;
    writeBack:
      | { kind: 'row'; templateName: string; rowIndex: number; fieldName: string }
      | { kind: 'rowStruct'; templateName: string; rowIndex: number; fieldName: string; subFieldName: string }
      | { kind: 'parent'; parentItemIndex: number; fieldName: string };
  };
  const [listEditorStack, setListEditorStack] = useState<ListEditorCtx[]>([]);
  const listEditor = listEditorStack.length > 0 ? listEditorStack[listEditorStack.length - 1] : null;

  const [jsonEditor, setJsonEditor] = useState<null | {
    templateName: string;
    rowIndex: number;
    fieldName: string;
    subFieldName?: string;
    text: string;
  }>(null);

  // Versions + bundle selection
  const [versionsByTemplate, setVersionsByTemplate] = useState<Record<string, any[]>>({});
  const [bundleSelection, setBundleSelection] = useState<Record<string, string>>({});

  async function refreshAll() {
    if (!gameId) return;
    setStatus({ kind: 'loading', message: 'Loading...' });
    try {
      const [revs, chs] = await Promise.all([
        listGameConfigSchemaRevisions(gameId),
        listGameConfigChannels(gameId),
      ]);
      setSchemaRevs(revs);
      setChannels(chs);
      if (!schemaRevisionId && revs[0]?.id) setSchemaRevisionId(revs[0].id);
      setStatus({ kind: 'ok' });
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed to load' });
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (devChannelId && !channels.some((c) => c.id === devChannelId)) {
      setDevChannelId('');
    }
  }, [channels, devChannelId]);

  useEffect(() => {
    if (!draftStorageKey) return;
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.schemaName === 'string') setSchemaName(parsed.schemaName);
        if (Array.isArray(parsed.enums)) setEnums(parsed.enums);
        if (Array.isArray(parsed.structures)) setStructures(parsed.structures);
        if (Array.isArray(parsed.templates)) setTemplates(parsed.templates);
        if (Array.isArray(parsed.relations)) setRelations(parsed.relations);
      }
    } catch {
      // Ignore corrupt drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          draftStorageKey,
          JSON.stringify({ schemaName, enums, structures, templates, relations })
        );
      } catch {
        // localStorage full or denied; ignore.
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [draftStorageKey, schemaName, enums, structures, templates, relations]);

  useEffect(() => {
    if (!structCollapseStorageKey) return;
    try {
      const raw = localStorage.getItem(structCollapseStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') setStructCollapse(parsed);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structCollapseStorageKey]);

  useEffect(() => {
    if (!structCollapseStorageKey) return;
    try {
      localStorage.setItem(structCollapseStorageKey, JSON.stringify(structCollapse || {}));
    } catch {}
  }, [structCollapse, structCollapseStorageKey]);

  useEffect(() => {
    if (!sheetFoldStorageKey) return;
    try {
      const raw = localStorage.getItem(sheetFoldStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') setSheetFoldByPk(parsed);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetFoldStorageKey]);

  useEffect(() => {
    if (!sheetFoldStorageKey) return;
    try {
      localStorage.setItem(sheetFoldStorageKey, JSON.stringify(sheetFoldByPk || {}));
    } catch {}
  }, [sheetFoldByPk, sheetFoldStorageKey]);

  useEffect(() => {
    (async () => {
      if (!devChannel) {
        setSchemaDetail(null);
        setRowsByTemplate({});
        setBundleSelection({});
        setActiveDataTab('');
        setLoadedFrozenByTemplate({});
        setIssuesByTemplate({});
        return;
      }
      setRebindSchemaRevisionId(devChannel.schemaRevisionId);
      setStatus({ kind: 'loading', message: 'Loading channel schema and drafts...' });
      try {
        const detail = await getGameConfigSchemaRevision(devChannel.schemaRevisionId);
        setSchemaDetail(detail);
        const firstTab = detail?.templates?.[0]?.name || '';
        setActiveDataTab(firstTab);

        // Load drafts for each template (visual editor needs current rows)
        const rowsMap: Record<string, any[]> = {};
        for (const t of detail.templates || []) {
          const res = await apiClient.get(
            `/game-config/admin/channels/${devChannel.id}/sections/${encodeURIComponent(t.name)}/draft`
          );
          const draft = res.data.data;
          rowsMap[t.name] = Array.isArray(draft?.rows) ? draft.rows : [];
        }
        setRowsByTemplate(rowsMap);
        setDirtyTemplates({});
        setLoadedFrozenByTemplate({});
        setIssuesByTemplate({});

        // Load bundle draft selection
        const b = await apiClient.get(`/game-config/admin/channels/${devChannel.id}/bundle-draft`);
        const sel = b.data.data?.selection || {};
        setBundleSelection(sel);

        // Load versions (Bundle page needs these; avoid "freeze another version to see versions")
        const versionsMap: Record<string, any[]> = {};
        for (const t of detail.templates || []) {
          // eslint-disable-next-line no-await-in-loop
          const v = await listSectionVersions(devChannel.id, t.name);
          versionsMap[t.name] = Array.isArray(v) ? v : [];
        }
        setVersionsByTemplate(versionsMap);

        setStatus({ kind: 'ok' });
      } catch (e: any) {
        setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed to load channel' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devChannelId, devChannelReloadNonce]);

  async function onCreateSchemaRevision() {
    if (!gameId) return;
    setStatus({ kind: 'loading', message: 'Creating schema revision...' });
    try {
      const enumsByName: Record<string, string[]> = {};
      for (const e of enums) {
        if (e && typeof e.name === 'string' && e.name.trim()) {
          enumsByName[e.name.trim()] = (e.values || []).filter((x) => typeof x === 'string' && x.trim()) as string[];
        }
      }

      function normalizeFieldForPersist(f: FieldDef) {
        if (f.type !== 'enum') return f;
        const enumRef = f.constraints?.enumRef || '';
        const vals = enumRef ? (enumsByName[enumRef] || []) : [];
        return {
          ...f,
          type: 'string' as FieldType,
          constraints: { ...(f.constraints || {}), enumRef, enum: vals },
        };
      }

      // Convert visual schema into backend request payload
      const payload = {
        gameId,
        name: schemaName,
        enums: enums.map((e) => ({ name: e.name, values: e.values })),
        structures: structures.map((s) => ({
          name: s.name,
          description: s.description,
          fields: s.fields.map((f) => ({
            name: f.name,
            type: normalizeFieldForPersist(f).type,
            required: f.required,
            constraints: normalizeFieldForPersist(f).constraints,
          })),
        })),
        templates: templates.map((t) => ({
          name: t.name,
          description: t.description,
          sectionType: 'array',
          primaryKey: t.primaryKey,
          fields: t.fields.map((f) => {
            const nf = normalizeFieldForPersist(f);
            return ({ name: nf.name, type: nf.type, required: nf.required, constraints: nf.constraints });
          }),
        })),
        relations,
      };
      const created = await createGameConfigSchemaRevision(payload);
      setStatus({ kind: 'ok', message: `Schema created: ${created.id}` });
      await refreshAll();
    } catch (e: any) {
      const issues = e?.response?.data?.issues;
      setStatus({ kind: 'error', message: e?.response?.data?.error || (issues ? JSON.stringify(issues, null, 2) : e?.message || 'Failed') });
    }
  }

  async function onOverwriteSchemaRevision(forceDeleteChannels: boolean) {
    if (!gameId) return;
    if (!overwriteSchemaRevisionId) {
      setStatus({ kind: 'error', message: 'Select a scheme (schema revision) to overwrite' });
      return;
    }
    setStatus({ kind: 'loading', message: 'Overwriting schema revision...' });
    try {
      const enumsByName: Record<string, string[]> = {};
      for (const e of enums) {
        if (e && typeof e.name === 'string' && e.name.trim()) {
          enumsByName[e.name.trim()] = (e.values || []).filter((x) => typeof x === 'string' && x.trim()) as string[];
        }
      }

      function normalizeFieldForPersist(f: FieldDef) {
        if (f.type !== 'enum') return f;
        const enumRef = f.constraints?.enumRef || '';
        const vals = enumRef ? (enumsByName[enumRef] || []) : [];
        return {
          ...f,
          type: 'string' as FieldType,
          constraints: { ...(f.constraints || {}), enumRef, enum: vals },
        };
      }

      const payload = {
        gameId,
        name: schemaName,
        enums: enums.map((e) => ({ name: e.name, values: e.values })),
        structures: structures.map((s) => ({
          name: s.name,
          description: s.description,
          fields: s.fields.map((f) => ({
            name: f.name,
            type: normalizeFieldForPersist(f).type,
            required: f.required,
            constraints: normalizeFieldForPersist(f).constraints,
          })),
        })),
        templates: templates.map((t) => ({
          name: t.name,
          description: t.description,
          sectionType: 'array',
          primaryKey: t.primaryKey,
          fields: t.fields.map((f) => {
            const nf = normalizeFieldForPersist(f);
            return ({ name: nf.name, type: nf.type, required: nf.required, constraints: nf.constraints });
          }),
        })),
        relations,
      };
      const out = await overwriteGameConfigSchemaRevision(overwriteSchemaRevisionId, payload, forceDeleteChannels);
      setStatus({ kind: 'ok', message: `Schema overwritten: ${out?.id || overwriteSchemaRevisionId}` });
      await refreshAll();
    } catch (e: any) {
      // If backend reports bindings, surface it nicely.
      const bound = e?.response?.data?.boundChannels;
      if (e?.response?.status === 409 && Array.isArray(bound)) {
        setStatus({
          kind: 'error',
          message: `Scheme is bound to ${bound.length} channel(s). Use overwrite with deletion confirmation.`,
        });
        return;
      }
      const issues = e?.response?.data?.issues;
      setStatus({ kind: 'error', message: e?.response?.data?.error || (issues ? JSON.stringify(issues, null, 2) : e?.message || 'Failed') });
    }
  }

  async function onCreateDevChannel() {
    if (!gameId) return;
    if (!schemaRevisionId) {
      setStatus({ kind: 'error', message: 'Select a schema revision first' });
      return;
    }
    setStatus({ kind: 'loading', message: 'Creating development channel...' });
    try {
      const ch = await createGameConfigChannel({ gameId, toolEnvironment: 'development', envName, schemaRevisionId });
      setDevChannelId(ch.id);
      setStatus({ kind: 'ok', message: `Dev channel created: ${envName}` });
      await refreshAll();
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  async function onResetDevChannel(schemaRevisionIdToRebind?: string) {
    if (!devChannelId) return;
    setStatus({ kind: 'loading', message: schemaRevisionIdToRebind ? 'Rebinding schema and resetting channel...' : 'Resetting channel...' });
    try {
      await resetGameConfigChannel(devChannelId, schemaRevisionIdToRebind);
      setDirtyTemplates({});
      setBundleSelection({});
      setVersionsByTemplate({});
      setStatus({ kind: 'ok', message: schemaRevisionIdToRebind ? 'Channel rebound and reset' : 'Channel reset' });
      await refreshAll();
      setDevChannelReloadNonce((n) => n + 1);
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  async function onDeleteDevChannel() {
    if (!devChannelId) return;
    setStatus({ kind: 'loading', message: 'Deleting channel...' });
    try {
      await deleteGameConfigChannel(devChannelId);
      setDevChannelId('');
      setStatus({ kind: 'ok', message: 'Channel deleted' });
      await refreshAll();
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  function structCollapseKey(templateName: string, fieldName: string) {
    return `${templateName}.${fieldName}`;
  }

  function isStructCollapsed(templateName: string, fieldName: string, subFieldCount: number) {
    const k = structCollapseKey(templateName, fieldName);
    if (Object.prototype.hasOwnProperty.call(structCollapse, k)) return !!structCollapse[k];
    // Default: expanded for small structures, collapsed for larger ones.
    return subFieldCount > 3;
  }

  function setStructCollapsed(templateName: string, fieldName: string, collapsed: boolean) {
    const k = structCollapseKey(templateName, fieldName);
    setStructCollapse((s) => ({ ...s, [k]: collapsed }));
  }

  function setRows(templateName: string, rows: any[]) {
    setRowsByTemplate((m) => ({ ...m, [templateName]: rows }));
    setDirtyTemplates((d) => ({ ...d, [templateName]: true }));
    setIssuesByTemplate((m) => ({ ...m, [templateName]: [] })); // saved validation is stale once edited
  }

  async function onSaveTemplateDraft(templateName: string) {
    if (!devChannelId) return;
    setStatus({ kind: 'loading', message: `Saving ${templateName}...` });
    try {
      const rows = rowsByTemplate[templateName] || [];
      const res = await upsertSectionDraft(devChannelId, templateName, rows);
      if (!res.success) throw new Error(res.error || 'Failed');
      setDirtyTemplates((d) => ({ ...d, [templateName]: false }));
      const issues = Array.isArray(res.issues) ? (res.issues as ValidationIssue[]) : [];
      setIssuesByTemplate((m) => ({ ...m, [templateName]: issues }));
      const errors = issues.filter((i) => i.severity === 'error').length;
      const warns = issues.filter((i) => i.severity === 'warn').length;
      if (errors > 0) {
        setStatus({ kind: 'error', message: `${templateName} saved with ${errors} error(s) and ${warns} warning(s). Fix errors to freeze/deploy.` });
      } else if (warns > 0) {
        setStatus({ kind: 'ok', message: `${templateName} saved with ${warns} warning(s).` });
      } else {
        setStatus({ kind: 'ok', message: `${templateName} saved` });
      }
      // Keep the "loaded from frozen" indicator; it's still a valid source reference.
    } catch (e: any) {
      const issues = e?.response?.data?.issues;
      setStatus({ kind: 'error', message: e?.response?.data?.error || (issues ? JSON.stringify(issues, null, 2) : e?.message || 'Failed') });
    }
  }

  async function onFreezeTemplate(templateName: string) {
    if (!devChannelId) return;
    setStatus({ kind: 'loading', message: `Freezing ${templateName}...` });
    try {
      const res = await freezeSection(devChannelId, templateName);
      if (!res.success) throw new Error(res.error || 'Failed');
      setStatus({ kind: 'ok', message: `${templateName} frozen` });
      await loadVersions(templateName);
    } catch (e: any) {
      const issues = e?.response?.data?.issues;
      setStatus({ kind: 'error', message: e?.response?.data?.error || (issues ? JSON.stringify(issues, null, 2) : e?.message || 'Failed') });
    }
  }

  async function loadVersions(templateName: string) {
    if (!devChannelId) return;
    const v = await listSectionVersions(devChannelId, templateName);
    setVersionsByTemplate((m) => ({ ...m, [templateName]: v }));
  }

  async function loadAllVersions() {
    if (!devChannelId) return;
    for (const t of templateNames) {
      // eslint-disable-next-line no-await-in-loop
      await loadVersions(t);
    }
  }

  async function onSaveBundleSelection() {
    if (!devChannelId) return;
    setStatus({ kind: 'loading', message: 'Saving bundle selection...' });
    try {
      await updateBundleDraft(devChannelId, bundleSelection);
      setStatus({ kind: 'ok', message: 'Bundle selection saved' });
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  async function onDeployDevToStaging() {
    if (!gameId) return;
    setStatus({ kind: 'loading', message: 'Deploying dev to staging...' });
    try {
      const env = devChannel?.envName || envName;
      const out = await deployBundle({ gameId, envName: env, fromToolEnvironment: 'development', toToolEnvironment: 'staging' });
      setStatus({ kind: 'ok', message: `Staging version: ${out.newVersion}` });
      await refreshAll();
    } catch (e: any) {
      const issues = e?.response?.data?.issues;
      setStatus({ kind: 'error', message: e?.response?.data?.error || (issues ? JSON.stringify(issues, null, 2) : e?.message || 'Failed') });
    }
  }

  async function onPullFromStaging() {
    if (!devChannelId) {
      setStatus({ kind: 'error', message: 'Select a development channel first' });
      return;
    }
    setStatus({ kind: 'loading', message: 'Pulling from staging to development...' });
    try {
      const out = await pullGameConfigFromStaging(devChannelId);
      setStatus({ kind: 'ok', message: `Pulled from staging: ${out.stagingReleaseId.slice(0, 6)}... (drafts=${out.draftsWritten}, versions=${out.versionsCreated})` });
      // Reload channel schema+drafts+bundle
      setDevChannelReloadNonce((n) => n + 1);
      await refreshAll();
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  async function onPublishStagingToProd() {
    if (!gameId) return;
    setStatus({ kind: 'loading', message: 'Publishing staging to production...' });
    try {
      const env = devChannel?.envName || envName;
      const out = await deployBundle({ gameId, envName: env, fromToolEnvironment: 'staging', toToolEnvironment: 'production' });
      setStatus({ kind: 'ok', message: `Production version: ${out.newVersion}` });
      await refreshAll();
    } catch (e: any) {
      const issues = e?.response?.data?.issues;
      setStatus({ kind: 'error', message: e?.response?.data?.error || (issues ? JSON.stringify(issues, null, 2) : e?.message || 'Failed') });
    }
  }

  const [stagingReleases, setStagingReleases] = useState<any[]>([]);
  const [productionReleases, setProductionReleases] = useState<any[]>([]);

  async function onLoadStagingReleases() {
    if (!gameId) return;
    const env = devChannel?.envName || envName;
    setStatus({ kind: 'loading', message: 'Loading staging releases...' });
    try {
      const rels = await listReleases(gameId, 'staging', env);
      setStagingReleases(rels);
      setStatus({ kind: 'ok' });
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  async function onLoadProductionReleases() {
    if (!gameId) return;
    const env = devChannel?.envName || envName;
    setStatus({ kind: 'loading', message: 'Loading production releases...' });
    try {
      const rels = await listReleases(gameId, 'production', env);
      setProductionReleases(rels);
      setStatus({ kind: 'ok' });
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  async function onRollbackStagingTo(releaseId: string) {
    if (!gameId) return;
    const env = devChannel?.envName || envName;
    setStatus({ kind: 'loading', message: 'Rolling back staging...' });
    try {
      const out = await rollbackBundle({ gameId, envName: env, toolEnvironment: 'staging', toReleaseId: releaseId });
      setStatus({ kind: 'ok', message: `Staging rolled back to ${out.releaseId} (v${out.newVersion})` });
      await onLoadStagingReleases();
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  async function onRollbackProductionTo(releaseId: string) {
    if (!gameId) return;
    const env = devChannel?.envName || envName;
    setStatus({ kind: 'loading', message: 'Rolling back production...' });
    try {
      const out = await rollbackBundle({ gameId, envName: env, toolEnvironment: 'production', toReleaseId: releaseId });
      setStatus({ kind: 'ok', message: `Production rolled back to ${out.releaseId} (v${out.newVersion})` });
      await onLoadProductionReleases();
    } catch (e: any) {
      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
    }
  }

  const activeTemplate = templates[activeTemplateIdx] || null;
  const activeStructure = structures[activeStructureIdx] || null;

  const routeState = useMemo(() => {
    // If Layout passes explicit page props, honor them.
    if (page) {
      return {
        activePage: page,
        dictionaryActive: (dictionaryPage || 'structures') as DictionaryPage,
      };
    }

    const path = location.pathname || '';

    // /game-config/data|bundle|releases
    const simple = (p: GameConfigPage) => ({ activePage: p, dictionaryActive: 'structures' as DictionaryPage });
    // Channel selection lives inside Data now; keep /game-config/channel for old links.
    if (path.startsWith('/game-config/channel')) return simple('data');
    if (path.startsWith('/game-config/data')) return simple('data');
    if (path.startsWith('/game-config/bundle')) return simple('bundle');
    if (path.startsWith('/game-config/releases')) return simple('releases');

    // /game-config/dictionary/:tab
    if (path.startsWith('/game-config/dictionary/')) {
      const seg = path.split('/').filter(Boolean)[2] || 'structures';
      const tab = (seg === 'models' || seg === 'scheme' || seg === 'structures' || seg === 'enums') ? (seg as DictionaryPage) : 'structures';
      return { activePage: 'dictionary' as GameConfigPage, dictionaryActive: tab };
    }

    // Back-compat-ish: /game-config/structures|models|scheme
    const seg1 = path.split('/').filter(Boolean)[1] || '';
    if (seg1 === 'structures' || seg1 === 'models' || seg1 === 'enums' || seg1 === 'scheme') {
      return { activePage: 'dictionary' as GameConfigPage, dictionaryActive: seg1 as DictionaryPage };
    }

    return { activePage: 'dictionary' as GameConfigPage, dictionaryActive: 'structures' as DictionaryPage };
  }, [page, dictionaryPage, location.pathname]);

  const activePage: GameConfigPage = routeState.activePage;
  const dictionaryActive: DictionaryPage = routeState.dictionaryActive;

  return (
    <div className={`game-config-container ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="gc-header">
        <div>
          <h1>Game Config</h1>
          <p className="gc-subtitle">Build tab schemas visually, edit rows like a sheet, freeze versions, bundle and deploy by envName.</p>
        </div>
        <button className="gc-btn gc-btn-secondary" onClick={refreshAll}>Refresh</button>
      </div>

      <div className={`gc-status gc-status-${status.kind}`}>{status.message || status.kind}</div>

      {devChannel ? (
        <div className="gc-status" style={{ marginTop: -8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Current</span>
            <span>
              <code>development/{devChannel.envName}</code>
            </span>
            <span style={{ opacity: 0.8 }}>
              schema: <code>{devSchemaName || `${devChannel.schemaRevisionId.slice(0, 8)}...`}</code>
            </span>
            <span style={{ opacity: 0.7 }}>
              channel: <code>{devChannel.id.slice(0, 8)}...</code>
            </span>
          </div>
        </div>
      ) : null}

      <div className="gc-builder-tabs" style={{ marginBottom: 12 }}>
        <Link className={`gc-pill ${activePage === 'dictionary' ? 'active' : ''}`} to="/game-config/dictionary/structures">Dictionary</Link>
        <Link className={`gc-pill ${activePage === 'data' ? 'active' : ''}`} to="/game-config/data">Data</Link>
        <Link className={`gc-pill ${activePage === 'bundle' ? 'active' : ''}`} to="/game-config/bundle">Bundle</Link>
        <Link className={`gc-pill ${activePage === 'releases' ? 'active' : ''}`} to="/game-config/releases">Releases</Link>
      </div>

      <div className="gc-grid">
        {activePage === 'dictionary' ? (
          <section className="gc-card" style={{ gridColumn: '1 / -1' }}>
            <div className="gc-card-header">
              <h3>Dictionary</h3>
              <div className="gc-builder-tabs">
                <Link className={`gc-pill ${dictionaryActive === 'structures' ? 'active' : ''}`} to="/game-config/dictionary/structures">Structures</Link>
                <Link className={`gc-pill ${dictionaryActive === 'models' ? 'active' : ''}`} to="/game-config/dictionary/models">Models</Link>
                <Link className={`gc-pill ${dictionaryActive === 'enums' ? 'active' : ''}`} to="/game-config/dictionary/enums">Enums</Link>
                <Link className={`gc-pill ${dictionaryActive === 'scheme' ? 'active' : ''}`} to="/game-config/dictionary/scheme">Scheme</Link>
              </div>
            </div>

          {dictionaryActive === 'structures' ? (
            <div className="gc-split">
              <div className="gc-tabs">
                <div className="gc-tabs-header">
                  <strong>Structures</strong>
                  <div className="gc-inline">
                    <button
                      className="gc-btn gc-btn-compact"
                      onClick={() => {
                        setStructures((s) => [...s, emptyStructure(`Structure_${s.length + 1}`)]);
                        setActiveStructureIdx(structures.length);
                      }}
                    >
                      Add
                    </button>
                    <button
                      className="gc-btn gc-btn-danger gc-btn-compact"
                      disabled={!activeStructure || structures.length <= 1}
                      onClick={() => {
                        if (!activeStructure) return;
                        setConfirm({
                          title: 'Delete structure?',
                          body: `This will delete '${activeStructure.name}' from the Dictionary draft.`,
                          confirmText: 'Delete',
                          danger: true,
                          onConfirm: () => {
                            setStructures((ss) => ss.filter((_, i) => i !== activeStructureIdx));
                            setActiveStructureIdx((idx) => Math.max(0, Math.min(idx, structures.length - 2)));
                            setExpandedStructureFieldIdx(null);
                          },
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {structures.map((s, idx) => (
                  <button
                    key={s.name + idx}
                    className={`gc-tab ${idx === activeStructureIdx ? 'active' : ''}`}
                    onClick={() => setActiveStructureIdx(idx)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              <div className="gc-tab-editor">
                {!activeStructure ? (
                  <div className="gc-muted">No structure selected.</div>
                ) : (
                  <>
                    <div className="gc-row">
                      <label>Structure name</label>
                      <input
                        value={activeStructure.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          setStructures((ss) => ss.map((x, i) => (i === activeStructureIdx ? { ...x, name } : x)));
                        }}
                      />
                    </div>

                    <div className="gc-muted">Fields</div>
                    <div className="gc-table-scroll">
                      <table className="gc-table">
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}></th>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th style={{ width: 110 }}>Details</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeStructure.fields.map((f, fIdx) => (
                          <React.Fragment key={fIdx}>
                            <tr
                              className={
                                dragOverField?.kind === 'structure' && dragOverField.over === fIdx
                                  ? 'gc-drop-target'
                                  : undefined
                              }
                              onDragOver={(e) => {
                                if (!dragField || dragField.kind !== 'structure') return;
                                e.preventDefault();
                                setDragOverField({ kind: 'structure', over: fIdx });
                              }}
                              onDrop={(e) => {
                                if (!dragField || dragField.kind !== 'structure') return;
                                e.preventDefault();
                                const from = dragField.from;
                                const to = fIdx;
                                setDragField(null);
                                setDragOverField(null);
                                if (from === to) return;
                                setStructures((ss) =>
                                  ss.map((x, i) =>
                                    i === activeStructureIdx ? { ...x, fields: moveItem(x.fields, from, to) } : x
                                  )
                                );
                                setExpandedStructureFieldIdx((cur) => {
                                  if (cur === null) return cur;
                                  if (cur === from) return to;
                                  if (from < to && cur > from && cur <= to) return cur - 1;
                                  if (to < from && cur >= to && cur < from) return cur + 1;
                                  return cur;
                                });
                              }}
                            >
                              <td className="gc-drag-cell">
                                <span
                                  className="gc-drag-handle"
                                  title="Drag to reorder"
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move';
                                    try { e.dataTransfer.setData('text/plain', 'field'); } catch {}
                                    setDragField({ kind: 'structure', from: fIdx });
                                    setDragOverField({ kind: 'structure', over: fIdx });
                                  }}
                                  onDragEnd={() => {
                                    setDragField(null);
                                    setDragOverField(null);
                                  }}
                                >
                                  ::
                                </span>
                              </td>
                              <td>
                                <input
                                  value={f.name}
                                  onChange={(e) => {
                                    const name = e.target.value;
                                    setStructures((ss) =>
                                      ss.map((x, i) =>
                                        i === activeStructureIdx
                                          ? { ...x, fields: x.fields.map((ff, j) => (j === fIdx ? { ...ff, name } : ff)) }
                                          : x
                                      )
                                    );
                                  }}
                                />
                              </td>
                              <td>
                                <select
                                  value={f.type}
                                  onChange={(e) => {
                                    const type = e.target.value as FieldType;
                                    setStructures((ss) =>
                                      ss.map((x, i) =>
                                        i === activeStructureIdx
                                          ? {
                                              ...x,
                                              fields: x.fields.map((ff, j) =>
                                                j === fIdx
                                                  ? {
                                                      ...ff,
                                                      type,
                                                      constraints:
                                                        type === 'list'
                                                          ? { elementType: 'string' }
                                                          : type === 'json'
                                                            ? { structureRef: '' }
                                                            : type === 'enum'
                                                              ? { enumRef: '', enum: [] }
                                                            : undefined,
                                                    }
                                                  : ff
                                              ),
                                            }
                                          : x
                                      )
                                    );
                                  }}
                                >
                                  <option value="string">string</option>
                                  <option value="int">int</option>
                                  <option value="float">float</option>
                                  <option value="bool">bool</option>
                                  <option value="json">structure</option>
                                  <option value="enum">{enumTypeLabel(f.constraints)}</option>
                                  <option value="list">{listTypeLabel(f.constraints)}</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={f.required}
                                  onChange={(e) => {
                                    const required = e.target.checked;
                                    setStructures((ss) =>
                                      ss.map((x, i) =>
                                        i === activeStructureIdx
                                          ? { ...x, fields: x.fields.map((ff, j) => (j === fIdx ? { ...ff, required } : ff)) }
                                          : x
                                      )
                                    );
                                  }}
                                />
                              </td>
                              <td>
                                {f.type === 'json' || f.type === 'list' || f.type === 'enum' ? (
                                  <button
                                    className="gc-btn gc-btn-secondary gc-btn-compact"
                                    onClick={() => setExpandedStructureFieldIdx((cur) => (cur === fIdx ? null : fIdx))}
                                  >
                                    {expandedStructureFieldIdx === fIdx ? 'Hide' : 'Edit'}
                                  </button>
                                ) : (
                                  <span style={{ opacity: 0.5 }}>-</span>
                                )}
                              </td>
                              <td>
                                <button
                                  className="gc-btn gc-btn-danger gc-btn-compact"
                                  onClick={() => {
                                    setStructures((ss) =>
                                      ss.map((x, i) =>
                                        i === activeStructureIdx ? { ...x, fields: x.fields.filter((_, j) => j !== fIdx) } : x
                                      )
                                    );
                                    setExpandedStructureFieldIdx((cur) => (cur === fIdx ? null : cur));
                                  }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>

                            {expandedStructureFieldIdx === fIdx ? (
                              <tr className="gc-row-expand">
                                <td colSpan={6}>
                                  <div className="gc-detail-panel">
                                    {f.type === 'json' ? (
                                      <div className="gc-detail-row">
                                        <div className="gc-detail-label">Structure</div>
                                        <select
                                          value={f.constraints?.structureRef || ''}
                                          onChange={(e) => {
                                            const structureRef = e.target.value;
                                            setStructures((ss) =>
                                              ss.map((x, i) =>
                                                i === activeStructureIdx
                                                  ? {
                                                      ...x,
                                                      fields: x.fields.map((ff, j) =>
                                                        j === fIdx ? { ...ff, constraints: { ...ff.constraints, structureRef } } : ff
                                                      ),
                                                    }
                                                  : x
                                              )
                                            );
                                          }}
                                        >
                                          <option value="">Select structure...</option>
                                          {structures.map((s) => (
                                            <option key={s.name} value={s.name}>
                                              {s.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ) : null}

                                    {f.type === 'list' ? (
                                      <>
                                        <div className="gc-detail-row">
                                          <div className="gc-detail-label">Element type</div>
                                          <select
                                            value={f.constraints?.elementType || 'string'}
                                            onChange={(e) => {
                                              const elementType = e.target.value as FieldType;
                                              setStructures((ss) =>
                                                ss.map((x, i) =>
                                                  i === activeStructureIdx
                                                    ? {
                                                        ...x,
                                                        fields: x.fields.map((ff, j) =>
                                                          j === fIdx
                                                            ? {
                                                                ...ff,
                                                                constraints: {
                                                                  ...ff.constraints,
                                                                  elementType,
                                                                  elementStructureRef:
                                                                    elementType === 'json'
                                                                      ? ff.constraints?.elementStructureRef || ''
                                                                      : undefined,
                                                                },
                                                              }
                                                            : ff
                                                        ),
                                                      }
                                                    : x
                                                )
                                              );
                                            }}
                                          >
                                            <option value="string">string</option>
                                            <option value="int">int</option>
                                            <option value="float">float</option>
                                            <option value="bool">bool</option>
                                            <option value="json">structure</option>
                                          </select>
                                        </div>

                                        {f.constraints?.elementType === 'json' ? (
                                          <div className="gc-detail-row">
                                            <div className="gc-detail-label">Element structure</div>
                                            <select
                                              value={f.constraints?.elementStructureRef || ''}
                                              onChange={(e) => {
                                                const elementStructureRef = e.target.value;
                                                setStructures((ss) =>
                                                  ss.map((x, i) =>
                                                    i === activeStructureIdx
                                                      ? {
                                                          ...x,
                                                          fields: x.fields.map((ff, j) =>
                                                            j === fIdx
                                                              ? { ...ff, constraints: { ...ff.constraints, elementStructureRef } }
                                                              : ff
                                                          ),
                                                        }
                                                      : x
                                                  )
                                                );
                                              }}
                                            >
                                              <option value="">Select structure...</option>
                                              {structures.map((s) => (
                                                <option key={s.name} value={s.name}>
                                                  {s.name}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        ) : null}
                                      </>
                                    ) : null}

                                    {f.type === 'enum' ? (
                                      <div className="gc-detail-row">
                                        <div className="gc-detail-label">Enum</div>
                                        <select
                                          value={f.constraints?.enumRef || ''}
                                          onChange={(e) => {
                                            const enumRef = e.target.value;
                                            const vals = enums.find((x) => x.name === enumRef)?.values || [];
                                            setStructures((ss) =>
                                              ss.map((x, i) =>
                                                i === activeStructureIdx
                                                  ? {
                                                      ...x,
                                                      fields: x.fields.map((ff, j) =>
                                                        j === fIdx
                                                          ? { ...ff, constraints: { ...(ff.constraints || {}), enumRef, enum: vals } }
                                                          : ff
                                                      ),
                                                    }
                                                  : x
                                              )
                                            );
                                          }}
                                        >
                                          <option value="">Select enum...</option>
                                          {enums.map((en) => (
                                            <option key={en.name} value={en.name}>
                                              {en.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        ))}
                      </tbody>
                      </table>
                    </div>
                    <div className="gc-actions">
                      <button
                        className="gc-btn"
                        onClick={() => {
                          setStructures((ss) =>
                            ss.map((x, i) =>
                              i === activeStructureIdx
                                ? { ...x, fields: [...x.fields, { name: `Field_${x.fields.length + 1}`, type: 'string', required: false }] }
                                : x
                            )
                          );
                        }}
                      >
                        Add Field
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {dictionaryActive === 'enums' ? (
            <div className="gc-split">
              <div className="gc-tabs">
                <div className="gc-tabs-header">
                  <strong>Enums</strong>
                  <div className="gc-inline">
                    <button
                      className="gc-btn gc-btn-compact"
                      onClick={() => {
                        setEnums((es) => [...es, { name: `Enum_${es.length + 1}`, values: ['A', 'B'] }]);
                        setActiveEnumIdx(enums.length);
                      }}
                    >
                      Add
                    </button>
                    <button
                      className="gc-btn gc-btn-danger gc-btn-compact"
                      disabled={enums.length <= 1}
                      onClick={() => {
                        const active = enums[activeEnumIdx];
                        if (!active) return;
                        setConfirm({
                          title: 'Delete enum?',
                          body: `This will delete '${active.name}' from the Dictionary draft.`,
                          confirmText: 'Delete',
                          danger: true,
                          onConfirm: () => {
                            setEnums((es) => es.filter((_, i) => i !== activeEnumIdx));
                            setActiveEnumIdx((idx) => Math.max(0, Math.min(idx, enums.length - 2)));
                          },
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {enums.map((e, idx) => (
                  <button key={idx} className={`gc-tab ${idx === activeEnumIdx ? 'active' : ''}`} onClick={() => setActiveEnumIdx(idx)}>
                    {e.name}
                  </button>
                ))}
              </div>

              <div className="gc-tab-editor">
                {(() => {
                  const e = enums[activeEnumIdx];
                  if (!e) return null;
                  return (
                    <>
                      <div className="gc-row">
                        <label>Enum name</label>
                        <input
                          value={e.name}
                          onChange={(ev) => {
                            const name = ev.target.value;
                            setEnums((es) => es.map((x, i) => (i === activeEnumIdx ? { ...x, name } : x)));
                          }}
                        />
                      </div>

                      <div className="gc-muted">Values</div>
                      <div className="gc-table-scroll">
                        <table className="gc-table">
                          <thead>
                            <tr>
                              <th style={{ width: 60 }}>#</th>
                              <th>Value</th>
                              <th style={{ width: 110 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {e.values.map((v, i) => (
                              <tr key={i}>
                                <td><code>{i}</code></td>
                                <td>
                                  <input
                                    value={v}
                                    onChange={(ev) => {
                                      const val = ev.target.value;
                                      setEnums((es) =>
                                        es.map((x, idx) =>
                                          idx === activeEnumIdx
                                            ? { ...x, values: x.values.map((vv, j) => (j === i ? val : vv)) }
                                            : x
                                        )
                                      );
                                    }}
                                  />
                                </td>
                                <td>
                                  <button
                                    className="gc-btn gc-btn-danger"
                                    onClick={() => {
                                      setEnums((es) =>
                                        es.map((x, idx) =>
                                          idx === activeEnumIdx
                                            ? { ...x, values: x.values.filter((_, j) => j !== i) }
                                            : x
                                        )
                                      );
                                    }}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="gc-actions">
                        <button
                          className="gc-btn"
                          onClick={() => {
                            setEnums((es) =>
                              es.map((x, idx) =>
                                idx === activeEnumIdx
                                  ? { ...x, values: [...x.values, `Value_${x.values.length + 1}`] }
                                  : x
                              )
                            );
                          }}
                        >
                          Add Value
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : null}

          {dictionaryActive === 'models' ? (
            <div className="gc-split">
              <div className="gc-tabs">
                <div className="gc-tabs-header">
                  <strong>Models</strong>
                  <button
                    className="gc-btn"
                    onClick={() => {
                      setTemplates((t) => [...t, emptyTemplate(`Model_${t.length + 1}`)]);
                      setActiveTemplateIdx(templates.length);
                    }}
                  >
                    Add
                  </button>
                </div>
                {templates.map((t, idx) => (
                  <button
                    key={t.name + idx}
                    className={`gc-tab ${idx === activeTemplateIdx ? 'active' : ''}`}
                    onClick={() => setActiveTemplateIdx(idx)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              <div className="gc-tab-editor">
                {!activeTemplate ? (
                  <div className="gc-muted">No model selected.</div>
                ) : (
                  <>
                    <div className="gc-row">
                      <label>Model name</label>
                      <input
                        value={activeTemplate.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          setTemplates((ts) => ts.map((x, i) => (i === activeTemplateIdx ? { ...x, name } : x)));
                        }}
                      />
                    </div>

                    <div className="gc-muted">Columns</div>
                    <div className="gc-table-scroll">
                      <table className="gc-table">
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}></th>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th style={{ width: 110 }}>Details</th>
                          <th style={{ width: 60 }}>PK</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeTemplate.fields.map((f, fIdx) => (
                          <React.Fragment key={fIdx}>
                            <tr
                              className={
                                dragOverField?.kind === 'model' && dragOverField.over === fIdx
                                  ? 'gc-drop-target'
                                  : undefined
                              }
                              onDragOver={(e) => {
                                if (!dragField || dragField.kind !== 'model') return;
                                e.preventDefault();
                                setDragOverField({ kind: 'model', over: fIdx });
                              }}
                              onDrop={(e) => {
                                if (!dragField || dragField.kind !== 'model') return;
                                e.preventDefault();
                                const from = dragField.from;
                                const to = fIdx;
                                setDragField(null);
                                setDragOverField(null);
                                if (from === to) return;
                                setTemplates((ts) =>
                                  ts.map((x, i) =>
                                    i === activeTemplateIdx ? { ...x, fields: moveItem(x.fields, from, to) } : x
                                  )
                                );
                                setExpandedModelFieldIdx((cur) => {
                                  if (cur === null) return cur;
                                  if (cur === from) return to;
                                  if (from < to && cur > from && cur <= to) return cur - 1;
                                  if (to < from && cur >= to && cur < from) return cur + 1;
                                  return cur;
                                });
                              }}
                            >
                              <td className="gc-drag-cell">
                                <span
                                  className="gc-drag-handle"
                                  title="Drag to reorder"
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move';
                                    try { e.dataTransfer.setData('text/plain', 'field'); } catch {}
                                    setDragField({ kind: 'model', from: fIdx });
                                    setDragOverField({ kind: 'model', over: fIdx });
                                  }}
                                  onDragEnd={() => {
                                    setDragField(null);
                                    setDragOverField(null);
                                  }}
                                >
                                  ::
                                </span>
                              </td>
                              <td>
                                <input
                                  value={f.name}
                                  onChange={(e) => {
                                    const name = e.target.value;
                                    setTemplates((ts) =>
                                      ts.map((x, i) =>
                                        i === activeTemplateIdx
                                          ? { ...x, fields: x.fields.map((ff, j) => (j === fIdx ? { ...ff, name } : ff)) }
                                          : x
                                      )
                                    );
                                  }}
                                />
                              </td>
                              <td>
                                <select
                                  value={f.type}
                                  onChange={(e) => {
                                    const type = e.target.value as FieldType;
                                    setTemplates((ts) =>
                                      ts.map((x, i) =>
                                        i === activeTemplateIdx
                                          ? {
                                              ...x,
                                              fields: x.fields.map((ff, j) =>
                                                j === fIdx
                                                  ? {
                                                      ...ff,
                                                      type,
                                                      constraints:
                                                        type === 'list'
                                                          ? { elementType: 'string' }
                                                          : type === 'json'
                                                            ? { structureRef: '' }
                                                            : type === 'enum'
                                                              ? { enumRef: '', enum: [] }
                                                            : type === 'ref'
                                                              ? { refTemplate: '', refPath: 'ID' }
                                                            : undefined,
                                                    }
                                                  : ff
                                              ),
                                            }
                                          : x
                                      )
                                    );
                                  }}
                                >
                                  <option value="string">string</option>
                                  <option value="int">int</option>
                                  <option value="float">float</option>
                                  <option value="bool">bool</option>
                                  <option value="json">structure</option>
                                  <option value="enum">{enumTypeLabel(f.constraints)}</option>
                                  <option value="list">{listTypeLabel(f.constraints)}</option>
                                  <option value="ref">{refTypeLabel(f.constraints)}</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={f.required}
                                  onChange={(e) => {
                                    const required = e.target.checked;
                                    setTemplates((ts) =>
                                      ts.map((x, i) =>
                                        i === activeTemplateIdx
                                          ? { ...x, fields: x.fields.map((ff, j) => (j === fIdx ? { ...ff, required } : ff)) }
                                          : x
                                      )
                                    );
                                  }}
                                />
                              </td>
                              <td>
                                {f.type === 'json' || f.type === 'list' || f.type === 'ref' || f.type === 'enum' ? (
                                  <button
                                    className="gc-btn gc-btn-secondary gc-btn-compact"
                                    onClick={() => setExpandedModelFieldIdx((cur) => (cur === fIdx ? null : fIdx))}
                                  >
                                    {expandedModelFieldIdx === fIdx ? 'Hide' : 'Edit'}
                                  </button>
                                ) : (
                                  <span style={{ opacity: 0.5 }}>-</span>
                                )}
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={activeTemplate.primaryKey.includes(f.name)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setTemplates((ts) =>
                                      ts.map((x, i) => {
                                        if (i !== activeTemplateIdx) return x;
                                        const pk = new Set(x.primaryKey);
                                        if (checked) pk.add(f.name);
                                        else pk.delete(f.name);
                                        return { ...x, primaryKey: Array.from(pk) };
                                      })
                                    );
                                  }}
                                />
                              </td>
                              <td>
                                <button
                                  className="gc-btn gc-btn-danger gc-btn-compact"
                                  onClick={() => {
                                    setTemplates((ts) =>
                                      ts.map((x, i) =>
                                        i === activeTemplateIdx
                                          ? { ...x, fields: x.fields.filter((_, j) => j !== fIdx), primaryKey: x.primaryKey.filter((k) => k !== f.name) }
                                          : x
                                      )
                                    );
                                    setExpandedModelFieldIdx((cur) => (cur === fIdx ? null : cur));
                                  }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>

                            {expandedModelFieldIdx === fIdx ? (
                              <tr className="gc-row-expand">
                                <td colSpan={7}>
                                  <div className="gc-detail-panel">
                                    {f.type === 'json' ? (
                                      <div className="gc-detail-row">
                                        <div className="gc-detail-label">Structure</div>
                                        <select
                                          value={f.constraints?.structureRef || ''}
                                          onChange={(e) => {
                                            const structureRef = e.target.value;
                                            setTemplates((ts) =>
                                              ts.map((x, i) =>
                                                i === activeTemplateIdx
                                                  ? {
                                                      ...x,
                                                      fields: x.fields.map((ff, j) =>
                                                        j === fIdx ? { ...ff, constraints: { ...ff.constraints, structureRef } } : ff
                                                      ),
                                                    }
                                                  : x
                                              )
                                            );
                                          }}
                                        >
                                          <option value="">Select structure...</option>
                                          {structures.map((s) => (
                                            <option key={s.name} value={s.name}>
                                              {s.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ) : null}

                                    {f.type === 'list' ? (
                                      <>
                                        <div className="gc-detail-row">
                                          <div className="gc-detail-label">Element type</div>
                                          <select
                                            value={f.constraints?.elementType || 'string'}
                                            onChange={(e) => {
                                              const elementType = e.target.value as FieldType;
                                              setTemplates((ts) =>
                                                ts.map((x, i) =>
                                                  i === activeTemplateIdx
                                                    ? {
                                                        ...x,
                                                        fields: x.fields.map((ff, j) =>
                                                          j === fIdx
                                                            ? {
                                                                ...ff,
                                                                constraints: {
                                                                  ...ff.constraints,
                                                                  elementType,
                                                                  elementStructureRef:
                                                                    elementType === 'json'
                                                                      ? ff.constraints?.elementStructureRef || ''
                                                                      : undefined,
                                                                },
                                                              }
                                                            : ff
                                                        ),
                                                      }
                                                    : x
                                                )
                                              );
                                            }}
                                          >
                                            <option value="string">string</option>
                                            <option value="int">int</option>
                                            <option value="float">float</option>
                                            <option value="bool">bool</option>
                                            <option value="json">structure</option>
                                          </select>
                                        </div>

                                        {f.constraints?.elementType === 'json' ? (
                                          <>
                                            <div className="gc-detail-row">
                                              <div className="gc-detail-label">Element schema</div>
                                              <select
                                                value={f.constraints?.elementModelRef !== undefined ? 'model' : 'structure'}
                                                onChange={(e) => {
                                                  const kind = e.target.value;
                                                  setTemplates((ts) =>
                                                    ts.map((x, i) =>
                                                      i === activeTemplateIdx
                                                        ? {
                                                            ...x,
                                                            fields: x.fields.map((ff, j) =>
                                                              j === fIdx
                                                                ? {
                                                                    ...ff,
                                                                    constraints: {
                                                                      ...ff.constraints,
                                                                      elementModelRef: kind === 'model' ? (ff.constraints?.elementModelRef || '') : undefined,
                                                                      elementStructureRef: kind === 'structure' ? (ff.constraints?.elementStructureRef || '') : undefined,
                                                                    },
                                                                  }
                                                                : ff
                                                            ),
                                                          }
                                                        : x
                                                    )
                                                  );
                                                }}
                                              >
                                                <option value="structure">Structure</option>
                                                <option value="model">Model</option>
                                              </select>
                                            </div>

                                            {f.constraints?.elementModelRef !== undefined ? (
                                              <div className="gc-detail-row">
                                                <div className="gc-detail-label">Element model</div>
                                                <select
                                                  value={f.constraints?.elementModelRef || ''}
                                                  onChange={(e) => {
                                                    const elementModelRef = e.target.value;
                                                    setTemplates((ts) =>
                                                      ts.map((x, i) =>
                                                        i === activeTemplateIdx
                                                          ? {
                                                              ...x,
                                                              fields: x.fields.map((ff, j) =>
                                                                j === fIdx
                                                                  ? { ...ff, constraints: { ...ff.constraints, elementModelRef, elementStructureRef: undefined } }
                                                                  : ff
                                                              ),
                                                            }
                                                          : x
                                                      )
                                                    );
                                                  }}
                                                >
                                                  <option value="">Select model...</option>
                                                  {templates.map((t) => (
                                                    <option key={t.name} value={t.name}>
                                                      {t.name}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                            ) : (
                                              <div className="gc-detail-row">
                                                <div className="gc-detail-label">Element structure</div>
                                                <select
                                                  value={f.constraints?.elementStructureRef || ''}
                                                  onChange={(e) => {
                                                    const elementStructureRef = e.target.value;
                                                    setTemplates((ts) =>
                                                      ts.map((x, i) =>
                                                        i === activeTemplateIdx
                                                          ? {
                                                              ...x,
                                                              fields: x.fields.map((ff, j) =>
                                                                j === fIdx
                                                                  ? { ...ff, constraints: { ...ff.constraints, elementStructureRef, elementModelRef: undefined } }
                                                                  : ff
                                                              ),
                                                            }
                                                          : x
                                                      )
                                                    );
                                                  }}
                                                >
                                                  <option value="">Select structure...</option>
                                                  {structures.map((s) => (
                                                    <option key={s.name} value={s.name}>
                                                      {s.name}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                            )}
                                          </>
                                        ) : null}
                                      </>
                                    ) : null}

                                    {f.type === 'ref' ? (
                                      <>
                                        <div className="gc-detail-row">
                                          <div className="gc-detail-label">Target model</div>
                                          <select
                                            value={f.constraints?.refTemplate || ''}
                                            onChange={(e) => {
                                              const refTemplate = e.target.value;
                                              setTemplates((ts) =>
                                                ts.map((x, i) =>
                                                  i === activeTemplateIdx
                                                    ? {
                                                        ...x,
                                                        fields: x.fields.map((ff, j) =>
                                                          j === fIdx
                                                            ? {
                                                                ...ff,
                                                                constraints: {
                                                                  ...ff.constraints,
                                                                  refTemplate,
                                                                  refPath: ff.constraints?.refPath || 'ID',
                                                                },
                                                              }
                                                            : ff
                                                        ),
                                                      }
                                                    : x
                                                )
                                              );
                                            }}
                                          >
                                            <option value="">Select model...</option>
                                            {templates
                                              .filter((t) => t.name !== activeTemplate.name)
                                              .map((t) => (
                                                <option key={t.name} value={t.name}>
                                                  {t.name}
                                                </option>
                                              ))}
                                          </select>
                                        </div>

                                        <div className="gc-detail-row">
                                          <div className="gc-detail-label">Target key</div>
                                          <input
                                            value={f.constraints?.refPath || 'ID'}
                                            onChange={(e) => {
                                              const refPath = e.target.value || 'ID';
                                              setTemplates((ts) =>
                                                ts.map((x, i) =>
                                                  i === activeTemplateIdx
                                                    ? {
                                                        ...x,
                                                        fields: x.fields.map((ff, j) =>
                                                          j === fIdx
                                                            ? { ...ff, constraints: { ...ff.constraints, refPath } }
                                                            : ff
                                                        ),
                                                      }
                                                    : x
                                                )
                                              );
                                            }}
                                          />
                                        </div>
                                      </>
                                    ) : null}

                                    {f.type === 'enum' ? (
                                      <div className="gc-detail-row">
                                        <div className="gc-detail-label">Enum</div>
                                        <select
                                          value={f.constraints?.enumRef || ''}
                                          onChange={(e) => {
                                            const enumRef = e.target.value;
                                            const vals = enums.find((x) => x.name === enumRef)?.values || [];
                                            setTemplates((ts) =>
                                              ts.map((x, i) =>
                                                i === activeTemplateIdx
                                                  ? {
                                                      ...x,
                                                      fields: x.fields.map((ff, j) =>
                                                        j === fIdx
                                                          ? { ...ff, constraints: { ...(ff.constraints || {}), enumRef, enum: vals } }
                                                          : ff
                                                      ),
                                                    }
                                                  : x
                                              )
                                            );
                                          }}
                                        >
                                          <option value="">Select enum...</option>
                                          {enums.map((en) => (
                                            <option key={en.name} value={en.name}>
                                              {en.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        ))}
                      </tbody>
                      </table>
                    </div>

                    <div className="gc-actions">
                      <button
                        className="gc-btn"
                        onClick={() => {
                          setTemplates((ts) =>
                            ts.map((x, i) =>
                              i === activeTemplateIdx
                                ? { ...x, fields: [...x.fields, { name: `Field_${x.fields.length + 1}`, type: 'string', required: false }] }
                                : x
                            )
                          );
                        }}
                      >
                        Add Column
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {dictionaryActive === 'scheme' ? (
            <>
              <div className="gc-row">
                <label>Scheme name</label>
                <input value={schemaName} onChange={(e) => setSchemaName(e.target.value)} />
              </div>

              <div className="gc-muted">Relations (validation)</div>
              {relations.map((r, idx) => (
                <div key={idx} className="gc-rel-row">
                  <select value={r.fromTemplate} onChange={(e) => setRelations((rs) => rs.map((x, i) => i === idx ? { ...x, fromTemplate: e.target.value } : x))}>
                    {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                  <input value={r.fromPath} onChange={(e) => setRelations((rs) => rs.map((x, i) => i === idx ? { ...x, fromPath: e.target.value } : x))} placeholder="fromPath e.g. Drop" />
                  <span style={{ opacity: 0.7 }}>to</span>
                  <select value={r.toTemplate} onChange={(e) => setRelations((rs) => rs.map((x, i) => i === idx ? { ...x, toTemplate: e.target.value } : x))}>
                    {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                  <input value={r.toPath} onChange={(e) => setRelations((rs) => rs.map((x, i) => i === idx ? { ...x, toPath: e.target.value } : x))} placeholder="toPath e.g. ID" />
                  <select value={r.mode} onChange={(e) => setRelations((rs) => rs.map((x, i) => i === idx ? { ...x, mode: e.target.value as any } : x))}>
                    <option value="error">error</option>
                    <option value="warn">warn</option>
                  </select>
                  <button className="gc-btn gc-btn-danger" onClick={() => setRelations((rs) => rs.filter((_, i) => i !== idx))}>Remove</button>
                </div>
              ))}
              <div className="gc-actions">
                <button className="gc-btn" onClick={() => setRelations((rs) => [...rs, { fromTemplate: templates[0]?.name || '', fromPath: '', toTemplate: templates[0]?.name || '', toPath: 'ID', mode: 'error' }])}>
                  Add Relation
                </button>
              </div>

              <div className="gc-actions" style={{ marginTop: 12 }}>
                <button className="gc-btn gc-btn-primary" onClick={onCreateSchemaRevision}>Create Scheme (Schema Revision)</button>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="gc-muted">Overwrite an existing scheme (destructive)</div>
                <div className="gc-row">
                  <label>Target scheme</label>
                  <select value={overwriteSchemaRevisionId} onChange={(e) => setOverwriteSchemaRevisionId(e.target.value)}>
                    <option value="">Select...</option>
                    {schemaRevs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id.slice(0, 6)}...)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="gc-actions">
                  <button
                    className="gc-btn gc-btn-danger"
                    onClick={() => {
                      if (!overwriteSchemaRevisionId) {
                        setStatus({ kind: 'error', message: 'Select a target scheme first' });
                        return;
                      }
                      const bound = channels.filter((c) => c.schemaRevisionId === overwriteSchemaRevisionId);
                      if (bound.length === 0) {
                        onOverwriteSchemaRevision(false);
                        return;
                      }
                      const preview = bound
                        .slice(0, 6)
                        .map((c) => `${c.toolEnvironment}/${c.envName}`)
                        .join(', ');
                      setConfirm({
                        title: 'Overwrite scheme and delete bound channels?',
                        body:
                          `This scheme is currently bound to ${bound.length} channel(s). ` +
                          `Overwriting will DELETE them (dev/staging/production), including all drafts, frozen versions, releases and deployments.\n\n` +
                          `Examples: ${preview}${bound.length > 6 ? ', ...' : ''}`,
                        confirmText: 'Overwrite + Delete Channels',
                        danger: true,
                        onConfirm: () => onOverwriteSchemaRevision(true),
                      });
                    }}
                  >
                    Overwrite Scheme
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="gc-muted">Delete a scheme (destructive)</div>
                <div className="gc-row">
                  <label>Target scheme</label>
                  <select value={deleteSchemaRevisionId} onChange={(e) => setDeleteSchemaRevisionId(e.target.value)}>
                    <option value="">Select...</option>
                    {schemaRevs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id.slice(0, 6)}...)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="gc-actions">
                  <button
                    className="gc-btn gc-btn-danger"
                    onClick={() => {
                      if (!gameId) return;
                      if (!deleteSchemaRevisionId) {
                        setStatus({ kind: 'error', message: 'Select a target scheme first' });
                        return;
                      }
                      const bound = channels.filter((c) => c.schemaRevisionId === deleteSchemaRevisionId);
                      if (bound.length === 0) {
                        setConfirm({
                          title: 'Delete scheme?',
                          body: `This will permanently delete the scheme.\n\n${deleteSchemaRevisionId}`,
                          confirmText: 'Delete Scheme',
                          danger: true,
                          onConfirm: async () => {
                            try {
                              await deleteGameConfigSchemaRevision(deleteSchemaRevisionId, gameId, false);
                              setStatus({ kind: 'ok', message: 'Scheme deleted' });
                              setDeleteSchemaRevisionId('');
                              await refreshAll();
                            } catch (e: any) {
                              setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
                            }
                          },
                        });
                        return;
                      }
                      const preview = bound
                        .slice(0, 6)
                        .map((c) => `${c.toolEnvironment}/${c.envName}`)
                        .join(', ');
                      setConfirm({
                        title: 'Delete scheme and bound channels?',
                        body:
                          `This scheme is currently bound to ${bound.length} channel(s). ` +
                          `Deleting will DELETE them (dev/staging/production), including all drafts, frozen versions, releases and deployments.\n\n` +
                          `Examples: ${preview}${bound.length > 6 ? ', ...' : ''}`,
                        confirmText: 'Delete Scheme + Channels',
                        danger: true,
                        onConfirm: async () => {
                          try {
                            await deleteGameConfigSchemaRevision(deleteSchemaRevisionId, gameId, true);
                            setStatus({ kind: 'ok', message: `Scheme deleted (and ${bound.length} channel(s))` });
                            setDeleteSchemaRevisionId('');
                            await refreshAll();
                          } catch (e: any) {
                            setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
                          }
                        },
                      });
                    }}
                  >
                    Delete Scheme
                  </button>
                </div>
              </div>
            </>
          ) : null}
          </section>
        ) : null}

        {activePage === 'data' ? (
          <section className="gc-card" style={{ gridColumn: '1 / -1' }}>
            <h3>Data (Dev)</h3>
            <div className="gc-split" style={{ gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)' }}>
              <div className="gc-tab-editor">
                <div className="gc-muted">Channel selection</div>
                <div className="gc-row">
                  <label>envName</label>
                  <input value={envName} onChange={(e) => setEnvName(e.target.value)} />
                </div>
                <div className="gc-row">
                  <label>schemaRevision</label>
                  <select value={schemaRevisionId} onChange={(e) => setSchemaRevisionId(e.target.value)}>
                    <option value="">Select...</option>
                    {schemaRevs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id.slice(0, 6)}...)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="gc-actions">
                  <button className="gc-btn gc-btn-primary" onClick={onCreateDevChannel}>Create Dev Channel</button>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="gc-muted">Development channels</div>
                  <select value={devChannelId} onChange={(e) => setDevChannelId(e.target.value)}>
                    <option value="">Select...</option>
                    {devChannels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.envName} ({c.id.slice(0, 6)}...)
                      </option>
                    ))}
                  </select>
                </div>

                {devChannel ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="gc-muted">Channel actions</div>
                    <div className="gc-row">
                      <label>current schema</label>
                      <input value={devChannel.schemaRevisionId} readOnly />
                    </div>
                    <div className="gc-row">
                      <label>rebind schema</label>
                      <select value={rebindSchemaRevisionId} onChange={(e) => setRebindSchemaRevisionId(e.target.value)}>
                        <option value="">Select...</option>
                        {schemaRevs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.id.slice(0, 6)}...)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="gc-actions">
                      <button
                        className="gc-btn gc-btn-danger"
                        onClick={() =>
                          setConfirm({
                            title: 'Reset dev channel?',
                            body: 'This will delete ALL drafts, frozen versions, and bundle selection in this dev channel. The channel envName stays the same.',
                            confirmText: 'Reset',
                            danger: true,
                            onConfirm: () => onResetDevChannel(),
                          })
                        }
                      >
                        Reset
                      </button>
                      <button
                        className="gc-btn gc-btn-danger"
                        disabled={!rebindSchemaRevisionId || rebindSchemaRevisionId === devChannel.schemaRevisionId}
                        onClick={() =>
                          setConfirm({
                            title: 'Rebind schema and reset?',
                            body: 'This will reset the channel AND change the schema revision. All drafts/versions/bundle selection in this dev channel will be deleted.',
                            confirmText: 'Rebind + Reset',
                            danger: true,
                            onConfirm: () => onResetDevChannel(rebindSchemaRevisionId),
                          })
                        }
                      >
                        Rebind + Reset
                      </button>
                      <button
                        className="gc-btn gc-btn-danger"
                        onClick={() =>
                          setConfirm({
                            title: 'Delete dev channel?',
                            body: 'This will permanently delete the dev channel and all its drafts/versions/bundle selection.',
                            confirmText: 'Delete',
                            danger: true,
                            onConfirm: () => onDeleteDevChannel(),
                          })
                        }
                      >
                        Delete Channel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="gc-tab-editor">
                {!devChannel ? (
                  <div className="gc-muted">Select a development channel to edit data.</div>
                ) : (
                  <>
                    <div className="gc-muted">
                      Editing: <code>development/{devChannel.envName}</code>
                    </div>
                <div className="gc-data-tabs">
                  {templateNames.map((t: string) => (
                    <button key={t} className={`gc-pill ${t === activeDataTab ? 'active' : ''}`} onClick={() => setActiveDataTab(t)}>
                      {t}{dirtyTemplates[t] ? ' *' : ''}
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <div className="gc-inline">
                    <button
                      className={`gc-pill ${dataViewMode === 'sheet' ? 'active' : ''}`}
                      onClick={() => setDataViewMode('sheet')}
                      title="Sheets-like block editor"
                    >
                      Sheet
                    </button>
                    <button
                      className={`gc-pill ${dataViewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setDataViewMode('grid')}
                      title="Spreadsheet grid editor"
                    >
                      Grid
                    </button>
                  </div>
                  <button className="gc-btn" onClick={loadAllVersions}>Load Versions</button>
                </div>

                {activeDataTab ? (
                  <>
                    <div className="gc-muted" style={{ marginTop: 8 }}>
                      {loadedFrozenByTemplate[activeDataTab]
                        ? (
                            <>
                              Source: frozen version{' '}
                              <code>
                                {(loadedFrozenByTemplate[activeDataTab]?.label || 'version') +
                                  (loadedFrozenByTemplate[activeDataTab]?.versionNumber ? ` (#${loadedFrozenByTemplate[activeDataTab]?.versionNumber})` : '')}
                              </code>{' '}
                              <span style={{ opacity: 0.75 }}>
                                ({String(loadedFrozenByTemplate[activeDataTab]?.id || '').slice(0, 8)}...)
                              </span>
                              {dirtyTemplates[activeDataTab] ? (
                                <span style={{ marginLeft: 10, opacity: 0.9 }}>
                                  <code>unsaved changes</code>
                                </span>
                              ) : null}
                              {(() => {
                                const c = issueCounts(activeDataTab);
                                if (c.errors === 0 && c.warns === 0) return null;
                                return (
                                  <span style={{ marginLeft: 10, opacity: 0.9 }}>
                                    <code>{c.errors} errors</code> <code>{c.warns} warnings</code>
                                  </span>
                                );
                              })()}
                            </>
                          )
                        : (
                            <>
                              Source: current draft{dirtyTemplates[activeDataTab] ? (
                                <span style={{ marginLeft: 10, opacity: 0.9 }}>
                                  <code>unsaved changes</code>
                                </span>
                              ) : null}
                              {(() => {
                                const c = issueCounts(activeDataTab);
                                if (c.errors === 0 && c.warns === 0) return null;
                                return (
                                  <span style={{ marginLeft: 10, opacity: 0.9 }}>
                                    <code>{c.errors} errors</code> <code>{c.warns} warnings</code>
                                  </span>
                                );
                              })()}
                            </>
                          )}
                    </div>
                    <div className="gc-actions" style={{ marginTop: 10 }}>
                      <button className="gc-btn gc-btn-primary" onClick={() => onSaveTemplateDraft(activeDataTab)}>Save Draft</button>
                      <button
                        className="gc-btn"
                        onClick={() => onFreezeTemplate(activeDataTab)}
                        disabled={issueCounts(activeDataTab).errors > 0}
                        title={issueCounts(activeDataTab).errors > 0 ? 'Fix draft errors before freezing' : 'Freeze version'}
                      >
                        Freeze Version
                      </button>
                      <button
                        className="gc-btn"
                        onClick={() => {
                          const defs = templateFieldDefsByName[activeDataTab] || [];
                          const next: any = {};
                          for (const d of defs) {
                            if (d.type === 'json') {
                              const sr = d.constraints?.structureRef;
                              if (sr && structureFieldDefsByName[sr] && structureFieldDefsByName[sr].length > 0) {
                                const obj: any = {};
                                for (const sf of structureFieldDefsByName[sr]) {
                                  obj[sf.name] = defaultValueForType(sf.type);
                                }
                                next[d.name] = obj;
                              } else {
                                next[d.name] = {};
                              }
                            } else {
                              next[d.name] = defaultValueForType(d.type);
                            }
                          }
                          setRows(activeDataTab, [...(rowsByTemplate[activeDataTab] || []), next]);
                        }}
                      >
                        Add Row
                      </button>
                    </div>

                    {dataViewMode === 'grid' ? (
                      <div className="gc-sheet">
                        {(() => {
                          const rows = rowsByTemplate[activeDataTab] || [];
                          const defs = templateFieldDefsByName[activeDataTab] || [];
                        const schemaCols = defs.map((d) => d.name);
                        const extraCols = inferColumnsFromRows(rows).filter((k) => !schemaCols.includes(k));
                        const cols = [...schemaCols, ...extraCols];
                        const defByName = new Map(defs.map((d) => [d.name, d]));
                        type TopCol =
                          | { kind: 'simple'; name: string; def?: any }
                          | { kind: 'struct'; name: string; def: any; structureRef: string; subFields: any[]; collapsed: boolean };

                        const topCols: TopCol[] = cols.map((c) => {
                          const def = defByName.get(c);
                          if (def?.type === 'json') {
                            const sr = def.constraints?.structureRef;
                            const sfs = sr ? (structureFieldDefsByName[sr] || []) : [];
                            if (sr && sfs.length > 0) {
                              const collapsed = isStructCollapsed(activeDataTab, c, sfs.length);
                              return { kind: 'struct', name: c, def, structureRef: sr, subFields: sfs, collapsed };
                            }
                          }
                          return { kind: 'simple', name: c, def };
                        });

                        const hasExpandedStruct = topCols.some((tc) => tc.kind === 'struct' && !tc.collapsed);

                        function structSummary(val: any, subFields: any[]) {
                          if (!val || typeof val !== 'object' || Array.isArray(val)) return '';
                          const picks = subFields.slice(0, 2);
                          const parts: string[] = [];
                          for (const f of picks) {
                            const v = (val as any)[f.name];
                            if (v === undefined || v === null || v === '') continue;
                            parts.push(`${f.name}=${String(v)}`);
                          }
                          if (parts.length === 0) return '{...}';
                          return parts.join(', ');
                        }

                        function setStructFieldValue(rowIndex: number, fieldName: string, subFieldName: string, value: any) {
                          setRows(
                            activeDataTab,
                            rows.map((rr, i) => {
                              if (i !== rowIndex) return rr;
                              const base = rr && typeof rr === 'object' && !Array.isArray(rr) ? rr : {};
                              const curObj = (base as any)[fieldName];
                              const nextObj =
                                curObj && typeof curObj === 'object' && !Array.isArray(curObj)
                                  ? { ...(curObj as any), [subFieldName]: value }
                                  : { [subFieldName]: value };
                              return { ...(base as any), [fieldName]: nextObj };
                            })
                          );
                        }

                        return (
                          <table className="gc-sheet-table">
                            <thead>
                              <tr>
                                <th style={{ width: 80 }} rowSpan={hasExpandedStruct ? 2 : 1}>Row</th>
                                {topCols.map((tc) => {
                                  if (tc.kind === 'struct' && !tc.collapsed) {
                                    return (
                                      <th key={tc.name} colSpan={tc.subFields.length}>
                                        <div className="gc-th-group">
                                          <span>{tc.name}</span>
                                          <button
                                            className="gc-th-toggle"
                                            onClick={() => setStructCollapsed(activeDataTab, tc.name, true)}
                                            title="Collapse"
                                          >
                                            Collapse
                                          </button>
                                        </div>
                                      </th>
                                    );
                                  }
                                  return (
                                    <th key={tc.name} rowSpan={hasExpandedStruct ? 2 : 1}>
                                      <div className="gc-th-group">
                                        <span>{tc.name}</span>
                                        {tc.kind === 'struct' ? (
                                          <button
                                            className="gc-th-toggle"
                                            onClick={() => setStructCollapsed(activeDataTab, tc.name, false)}
                                            title="Expand"
                                          >
                                            Expand
                                          </button>
                                        ) : null}
                                      </div>
                                    </th>
                                  );
                                })}
                                <th style={{ width: 110 }} rowSpan={hasExpandedStruct ? 2 : 1}></th>
                              </tr>
                              {hasExpandedStruct ? (
                                <tr>
                                  {topCols.map((tc) => {
                                    if (tc.kind !== 'struct' || tc.collapsed) return null;
                                    return tc.subFields.map((sf: any) => (
                                      <th key={`${tc.name}.${sf.name}`}>{sf.name}</th>
                                    ));
                                  })}
                                </tr>
                              ) : null}
                            </thead>
                            <tbody>
                              {rows.map((r, idx) => (
                                <tr key={idx}>
                                  <td><code>{idx}</code></td>
                                  {topCols.map((tc) => {
                                    if (tc.kind === 'struct') {
                                      const objVal = r?.[tc.name];
                                      if (tc.collapsed) {
                                        return (
                                          <td key={tc.name}>
                                            <span className="gc-struct-summary">{structSummary(objVal, tc.subFields)}</span>
                                          </td>
                                        );
                                      }

                                      const baseObj = objVal && typeof objVal === 'object' && !Array.isArray(objVal) ? objVal : {};
                                      return tc.subFields.map((sf: any) => {
                                        const v = (baseObj as any)[sf.name];
                                        const t = sf.type as FieldType;
                                        const key = `${tc.name}.${sf.name}`;

                                        if (t === 'list') {
                                          return (
                                            <td key={key}>
                                              <button
                                                className="gc-btn"
                                                onClick={() => {
                                                  const constraints = (sf as any).constraints || undefined;
                                                  setListEditorStack([{
                                                    title: `${activeDataTab}[${idx}].${tc.name}.${sf.name}`,
                                                    items: Array.isArray(v) ? v : [],
                                                    constraints,
                                                    writeBack: { kind: 'rowStruct', templateName: activeDataTab, rowIndex: idx, fieldName: tc.name, subFieldName: sf.name },
                                                  }]);
                                                }}
                                              >
                                                Edit list ({Array.isArray(v) ? v.length : 0})
                                              </button>
                                            </td>
                                          );
                                        }

                                        if (t === 'json') {
                                          return (
                                            <td key={key}>
                                              <button
                                                className="gc-btn"
                                                onClick={() =>
                                                  setJsonEditor({
                                                    templateName: activeDataTab,
                                                    rowIndex: idx,
                                                    fieldName: tc.name,
                                                    subFieldName: sf.name,
                                                    text: JSON.stringify(v ?? {}, null, 2),
                                                  })
                                                }
                                              >
                                                Edit JSON
                                              </button>
                                            </td>
                                          );
                                        }

                                        if (t === 'ref') {
                                          const cc = (sf as any).constraints || {};
                                          const refTemplate = typeof cc.refTemplate === 'string' ? cc.refTemplate : '';
                                          const refPath = typeof cc.refPath === 'string' && cc.refPath.trim() ? cc.refPath.trim() : 'ID';
                                          const targetRows = refTemplate ? (rowsByTemplate[refTemplate] || []) : [];
                                          const ids = Array.from(
                                            new Set(
                                              targetRows
                                                .map((tr: any) => (tr && typeof tr === 'object' && !Array.isArray(tr) ? tr[refPath] : undefined))
                                                .filter((x: any) => typeof x === 'string' && x.trim())
                                            )
                                          ).sort((a, b) => String(a).localeCompare(String(b)));
                                          return (
                                            <td key={key}>
                                              <select
                                                value={typeof v === 'string' ? v : ''}
                                                onChange={(e) => setStructFieldValue(idx, tc.name, sf.name, e.target.value)}
                                              >
                                                <option value="">{refTemplate ? 'Select...' : 'Configure ref...'}</option>
                                                {ids.map((idVal) => (
                                                  <option key={idVal} value={idVal}>{idVal}</option>
                                                ))}
                                              </select>
                                            </td>
                                          );
                                        }

                                        const enumVals = Array.isArray((sf as any)?.constraints?.enum)
                                          ? ((sf as any).constraints.enum as any[]).filter((x: any) => typeof x === 'string')
                                          : (typeof (sf as any)?.constraints?.enumRef === 'string' && enumDefsByName[(sf as any).constraints.enumRef])
                                            ? (enumDefsByName[(sf as any).constraints.enumRef] as any[]).filter((x: any) => typeof x === 'string')
                                            : [];
                                        if (enumVals.length > 0) {
                                          return (
                                            <td key={key}>
                                              <select
                                                value={typeof v === 'string' ? v : ''}
                                                onChange={(e) => setStructFieldValue(idx, tc.name, sf.name, e.target.value)}
                                              >
                                                <option value="">Select...</option>
                                                {enumVals.map((vv: string) => (
                                                  <option key={vv} value={vv}>{vv}</option>
                                                ))}
                                              </select>
                                            </td>
                                          );
                                        }

                                        if (t === 'bool') {
                                          return (
                                            <td key={key}>
                                              <input
                                                type="checkbox"
                                                checked={!!v}
                                                onChange={(e) => setStructFieldValue(idx, tc.name, sf.name, e.target.checked)}
                                              />
                                            </td>
                                          );
                                        }

                                        if (t === 'int' || t === 'float') {
                                          return (
                                            <td key={key}>
                                              <input
                                                type="number"
                                                step={t === 'int' ? 1 : 'any'}
                                                value={v === undefined || v === null ? '' : String(v)}
                                                onChange={(e) => {
                                                  const raw = e.target.value;
                                                  const val =
                                                    raw === ''
                                                      ? null
                                                      : t === 'int'
                                                        ? Number.parseInt(raw, 10)
                                                        : Number.parseFloat(raw);
                                                  setStructFieldValue(idx, tc.name, sf.name, val);
                                                }}
                                              />
                                            </td>
                                          );
                                        }

                                        return (
                                          <td key={key}>
                                            <input
                                              value={v === undefined || v === null ? '' : String(v)}
                                              onChange={(e) => setStructFieldValue(idx, tc.name, sf.name, e.target.value)}
                                            />
                                          </td>
                                        );
                                      });
                                    }

                                    // Simple column (top-level field)
                                    const c = tc.name;
                                    const v = r?.[c];
                                    const def = tc.def;
                                    const sev = issueSeverityFor(activeDataTab, idx, r, c);
                                    const cls = sev === 'error' ? 'gc-invalid' : sev === 'warn' ? 'gc-warn' : '';

                                    if (def?.type === 'list') {
                                      return (
                                        <td key={c}>
                                          <button
                                            className="gc-btn"
                                            onClick={() => {
                                              const constraints = (def as any).constraints || undefined;
                                              setListEditorStack([{
                                                title: `${activeDataTab}[${idx}].${c}`,
                                                items: Array.isArray(v) ? v : [],
                                                constraints,
                                                writeBack: { kind: 'row', templateName: activeDataTab, rowIndex: idx, fieldName: c },
                                              }]);
                                            }}
                                          >
                                            Edit list ({Array.isArray(v) ? v.length : 0})
                                          </button>
                                        </td>
                                      );
                                    }

                                    if (def?.type === 'json') {
                                      return (
                                        <td key={c}>
                                          <button
                                            className="gc-btn"
                                            onClick={() =>
                                              setJsonEditor({
                                                templateName: activeDataTab,
                                                rowIndex: idx,
                                                fieldName: c,
                                                text: JSON.stringify(v ?? {}, null, 2),
                                              })
                                            }
                                          >
                                            Edit JSON
                                          </button>
                                        </td>
                                      );
                                    }

                                    if (def?.type === 'ref') {
                                      const cc = (def as any).constraints || {};
                                      const refTemplate = typeof cc.refTemplate === 'string' ? cc.refTemplate : '';
                                      const refPath = typeof cc.refPath === 'string' && cc.refPath.trim() ? cc.refPath.trim() : 'ID';
                                      const targetRows = refTemplate ? (rowsByTemplate[refTemplate] || []) : [];
                                      const ids = Array.from(
                                        new Set(
                                          targetRows
                                            .map((tr: any) => (tr && typeof tr === 'object' && !Array.isArray(tr) ? tr[refPath] : undefined))
                                            .filter((x: any) => typeof x === 'string' && x.trim())
                                        )
                                      ).sort((a, b) => String(a).localeCompare(String(b)));
                                      return (
                                        <td key={c}>
                                          <select
                                            className={cls}
                                            value={typeof v === 'string' ? v : ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setRows(
                                                activeDataTab,
                                                rows.map((rr, i) => (i === idx ? { ...(rr || {}), [c]: val } : rr))
                                              );
                                            }}
                                          >
                                            <option value="">{refTemplate ? 'Select...' : 'Configure ref...'}</option>
                                            {ids.map((idVal) => (
                                              <option key={idVal} value={idVal}>
                                                {idVal}
                                              </option>
                                            ))}
                                          </select>
                                        </td>
                                      );
                                    }

                                    // Enum constraints (string dropdown)
                                    const enumVals = Array.isArray(def?.constraints?.enum)
                                      ? (def!.constraints.enum as any[]).filter((x: any) => typeof x === 'string')
                                      : (typeof def?.constraints?.enumRef === 'string' && enumDefsByName[def.constraints.enumRef])
                                        ? (enumDefsByName[def.constraints.enumRef] as any[]).filter((x: any) => typeof x === 'string')
                                        : [];
                                    if (enumVals.length > 0) {
                                      return (
                                        <td key={c}>
                                          <select
                                            className={cls}
                                            value={typeof v === 'string' ? v : ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setRows(activeDataTab, rows.map((rr, i) => i === idx ? { ...(rr || {}), [c]: val } : rr));
                                            }}
                                          >
                                            <option value="">Select...</option>
                                            {enumVals.map((vv: string) => (
                                              <option key={vv} value={vv}>{vv}</option>
                                            ))}
                                          </select>
                                        </td>
                                      );
                                    }

                                    if (def?.type === 'bool') {
                                      return (
                                        <td key={c}>
                                          <input
                                            type="checkbox"
                                            checked={!!v}
                                            onChange={(e) => {
                                              const val = e.target.checked;
                                              setRows(
                                                activeDataTab,
                                                rows.map((rr, i) => (i === idx ? { ...(rr || {}), [c]: val } : rr))
                                              );
                                            }}
                                          />
                                        </td>
                                      );
                                    }

                                    if (def?.type === 'int' || def?.type === 'float') {
                                      return (
                                        <td key={c}>
                                          <input
                                            className={cls}
                                            type="number"
                                            step={def.type === 'int' ? 1 : 'any'}
                                            value={v === undefined || v === null ? '' : String(v)}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              const val =
                                                raw === ''
                                                  ? null
                                                  : def.type === 'int'
                                                    ? Number.parseInt(raw, 10)
                                                    : Number.parseFloat(raw);
                                              setRows(
                                                activeDataTab,
                                                rows.map((rr, i) => (i === idx ? { ...(rr || {}), [c]: val } : rr))
                                              );
                                            }}
                                          />
                                        </td>
                                      );
                                    }

                                    return (
                                      <td key={c}>
                                        <input
                                          className={cls}
                                          value={v === undefined || v === null ? '' : String(v)}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setRows(activeDataTab, rows.map((rr, i) => i === idx ? { ...(rr || {}), [c]: val } : rr));
                                          }}
                                        />
                                      </td>
                                    );
                                  })}
                                  <td>
                                    <button className="gc-btn gc-btn-danger" onClick={() => setRows(activeDataTab, rows.filter((_, i) => i !== idx))}>
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                        })()}
                      </div>
                    ) : null}

                    {dataViewMode === 'sheet' ? (
                      <div className="gc-sheet-blocks">
                        {(() => {
                          const rows = rowsByTemplate[activeDataTab] || [];
                          const defs = templateFieldDefsByName[activeDataTab] || [];
                          const pk = (schemaDetail?.templates || []).find((t: any) => t.name === activeDataTab)?.primaryKey as any;
                          const pkFields: string[] = Array.isArray(pk) ? pk : ['ID'];
                          const titleField = pkFields[0] || 'ID';

                          const scalarDefs = defs.filter((d) => d.type !== 'list');
                          const listDefs = defs.filter((d) => d.type === 'list');

                          function rowTitle(r: any, idx: number) {
                            const v = r && typeof r === 'object' && !Array.isArray(r) ? r[titleField] : undefined;
                            if (typeof v === 'string' && v.trim()) return v;
                            return `${activeDataTab}[${idx}]`;
                          }

                          function foldKeyForRow(r: any, idx: number) {
                            const v = r && typeof r === 'object' && !Array.isArray(r) ? r[titleField] : undefined;
                            if (typeof v === 'string' && v.trim()) return `${activeDataTab}:${titleField}:${v}`;
                            return `${activeDataTab}:row:${idx}`;
                          }

                          function isFolded(k: string) {
                            return !!sheetFoldByPk[k];
                          }

                          function setFolded(k: string, folded: boolean) {
                            setSheetFoldByPk((m) => ({ ...m, [k]: folded }));
                          }

                          function setField(rowIndex: number, fieldName: string, value: any) {
                            setRows(
                              activeDataTab,
                              rows.map((rr, i) => (i === rowIndex ? { ...(rr || {}), [fieldName]: value } : rr))
                            );
                          }

                          function renderFieldEditor(def: any, value: any, onChange: (v: any) => void, className?: string) {
                            const enumVals = Array.isArray(def?.constraints?.enum)
                              ? (def.constraints.enum as any[]).filter((x: any) => typeof x === 'string')
                              : (typeof def?.constraints?.enumRef === 'string' && enumDefsByName[def.constraints.enumRef])
                                ? (enumDefsByName[def.constraints.enumRef] as any[]).filter((x: any) => typeof x === 'string')
                                : [];
                            if (enumVals.length > 0) {
                              return (
                                <select className={className} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
                                  <option value="">Select...</option>
                                  {enumVals.map((vv: string) => (
                                    <option key={vv} value={vv}>{vv}</option>
                                  ))}
                                </select>
                              );
                            }

                            if (def.type === 'ref') {
                              const cc = def.constraints || {};
                              const refTemplate = typeof cc.refTemplate === 'string' ? cc.refTemplate : '';
                              const refPath = typeof cc.refPath === 'string' && cc.refPath.trim() ? cc.refPath.trim() : 'ID';
                              const targetRows = refTemplate ? (rowsByTemplate[refTemplate] || []) : [];
                              const ids = Array.from(
                                new Set(
                                  targetRows
                                    .map((tr: any) => (tr && typeof tr === 'object' && !Array.isArray(tr) ? tr[refPath] : undefined))
                                    .filter((x: any) => typeof x === 'string' && x.trim())
                                )
                              ).sort((a, b) => String(a).localeCompare(String(b)));
                              return (
                                <select className={className} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
                                  <option value="">{refTemplate ? 'Select...' : 'Configure ref...'}</option>
                                  {ids.map((idVal) => (
                                    <option key={idVal} value={idVal}>{idVal}</option>
                                  ))}
                                </select>
                              );
                            }

                            if (def.type === 'bool') {
                              return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
                            }

                            if (def.type === 'int' || def.type === 'float') {
                              return (
                                <input
                                  className={className}
                                  type="number"
                                  step={def.type === 'int' ? 1 : 'any'}
                                  value={value === undefined || value === null ? '' : String(value)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const v =
                                      raw === ''
                                        ? null
                                        : def.type === 'int'
                                          ? Number.parseInt(raw, 10)
                                          : Number.parseFloat(raw);
                                    onChange(v);
                                  }}
                                />
                              );
                            }

                            if (def.type === 'json') {
                              const sr = def.constraints?.structureRef;
                              const sfs = sr ? (structureFieldDefsByName[sr] || []) : [];
                              if (sr && sfs.length > 0) {
                                const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
                                return (
                                  <div className="gc-struct-form">
                                    {sfs.map((sf: any) => {
                                      const vv = (obj as any)[sf.name];
                                      return (
                                        <div key={sf.name} className="gc-struct-field">
                                          <div className="gc-struct-label">{sf.name}</div>
                                          {renderFieldEditor(
                                            sf,
                                            vv,
                                            (nextVal) => {
                                              const nextObj = { ...(obj as any), [sf.name]: nextVal };
                                              onChange(nextObj);
                                            }
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              return (
                                <button
                                  className="gc-btn"
                                  disabled
                                  title="Use Grid view for raw JSON editing"
                                >
                                  Edit JSON
                                </button>
                              );
                            }

                            return (
                              <input
                                className={className}
                                value={value === undefined || value === null ? '' : String(value)}
                                onChange={(e) => onChange(e.target.value)}
                              />
                            );
                          }

                          return (
                            <>
                              {rows.map((r, idx) => (
                                <div key={idx} className={`gc-block ${isFolded(foldKeyForRow(r, idx)) ? 'gc-block-folded' : ''}`}>
                                  <div className="gc-block-header">
                                    <div className="gc-block-title">
                                      <span className="gc-block-title-label">ID</span>
                                      <strong className="gc-block-title-value">{rowTitle(r, idx)}</strong>
                                      <button
                                        className="gc-fold-btn"
                                        onClick={() => {
                                          const k = foldKeyForRow(r, idx);
                                          setFolded(k, !isFolded(k));
                                        }}
                                        title={isFolded(foldKeyForRow(r, idx)) ? 'Unfold' : 'Fold'}
                                      >
                                        {isFolded(foldKeyForRow(r, idx)) ? 'Unfold' : 'Fold'}
                                      </button>
                                    </div>
                                    <div className="gc-inline">
                                      <button
                                        className="gc-btn"
                                        onClick={() => setRows(activeDataTab, [...rows.slice(0, idx + 1), { ...(r || {}) }, ...rows.slice(idx + 1)])}
                                      >
                                        Duplicate
                                      </button>
                                      <button
                                        className="gc-btn gc-btn-danger"
                                        onClick={() => setRows(activeDataTab, rows.filter((_, i) => i !== idx))}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>

                                  {!isFolded(foldKeyForRow(r, idx)) ? (
                                    <div className="gc-block-body">
                                    <div className="gc-kv">
                                      {scalarDefs.map((d) => {
                                        const v = r?.[d.name];
                                        const sev = issueSeverityFor(activeDataTab, idx, r, d.name);
                                        const cls = sev === 'error' ? 'gc-invalid' : sev === 'warn' ? 'gc-warn' : '';
                                        return (
                                          <div key={d.name} className="gc-kv-row">
                                            <div className="gc-kv-key">{d.name}</div>
                                            <div className="gc-kv-val">
                                              {renderFieldEditor(d, v, (nv) => setField(idx, d.name, nv), cls)}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {listDefs.map((ld) => {
                                      const v = r?.[ld.name];
                                      const items = Array.isArray(v) ? v : [];
                                      const lc = (ld as any).constraints || {};
                                      const elementType = lc?.elementType as FieldType | undefined;
                                      const elementStructureRef = lc?.elementStructureRef as string | undefined;
                                      const elementModelRef = lc?.elementModelRef as string | undefined;

                                      const structFields =
                                        elementType === 'json' && elementStructureRef
                                          ? (structureFieldDefsByName[elementStructureRef] || [])
                                          : [];
                                      const modelFields =
                                        elementType === 'json' && elementModelRef
                                          ? (templateFieldDefsByName[elementModelRef] || [])
                                          : [];
                                      const elementFields = structFields.length > 0 ? structFields : modelFields;
                                      const isPrimitiveList =
                                        elementType && elementType !== 'json' && elementType !== 'list' && elementType !== 'ref';
                                      const cols = elementFields.length > 0
                                        ? elementFields.map((f: any) => f.name)
                                        : isPrimitiveList
                                          ? ['value']
                                          : inferColumnsFromRows(items);

                                      function setList(next: any[]) {
                                        setField(idx, ld.name, next);
                                      }

                                      return (
                                        <div key={ld.name} className="gc-subtable">
                                          <div className="gc-subtable-header">
                                            <strong>{ld.name}</strong>
                                            <div className="gc-inline">
                                              <button
                                                className="gc-btn"
                                                onClick={() => {
                                                  let nextItem: any = {};
                                                  if (elementFields.length > 0) {
                                                    for (const f of elementFields) nextItem[f.name] = defaultValueForType(f.type);
                                                  } else if (isPrimitiveList && elementType) {
                                                    nextItem = defaultValueForType(elementType as any);
                                                  }
                                                  setList([...items, nextItem]);
                                                }}
                                              >
                                                Add Row
                                              </button>
                                            </div>
                                          </div>
                                          <div className="gc-subtable-wrap">
                                            <table className="gc-subtable-table">
                                              <thead>
                                                <tr>
                                                  <th style={{ width: 60 }}>#</th>
                                                  {cols.map((c: string) => <th key={c}>{c}</th>)}
                                                  <th style={{ width: 110 }}></th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {items.map((it: any, itIdx: number) => (
                                                  <tr key={itIdx}>
                                                    <td><code>{itIdx}</code></td>
                                                    {cols.map((c: string) => (
                                                      <td key={c}>
                                                        {(() => {
                                                          // primitive list column
                                                          if (cols.length === 1 && c === 'value' && isPrimitiveList) {
                                                            const v0 = it;
                                                            const t0 = elementType as FieldType;
                                                            const def0 = { name: 'value', type: t0, required: false, constraints: {} };
                                                            return renderFieldEditor(def0 as any, v0, (nv) => {
                                                              setList(items.map((x: any, i: number) => (i === itIdx ? nv : x)));
                                                            });
                                                          }

                                                          const f = elementFields.find((x: any) => x.name === c) || null;
                                                          const t = f?.type as FieldType | undefined;
                                                          const v1 = it && typeof it === 'object' && !Array.isArray(it) ? it[c] : undefined;
                                                          const def1 = f || { name: c, type: 'string', required: false, constraints: {} };

                                                          if (t === 'list') {
                                                            return (
                                                              <button
                                                                className="gc-btn"
                                                                onClick={() => {
                                                                  const constraints = (def1 as any).constraints || undefined;
                                                                  // Use the existing list modal with a proper stack:
                                                                  // parent = this list field (writes back to row)
                                                                  // child = nested list field inside an item (writes back to parent)
                                                                  setListEditorStack([
                                                                    {
                                                                      title: `${activeDataTab}[${idx}].${ld.name}`,
                                                                      items: items,
                                                                      constraints: (ld as any).constraints || undefined,
                                                                      writeBack: { kind: 'row', templateName: activeDataTab, rowIndex: idx, fieldName: ld.name },
                                                                    },
                                                                    {
                                                                      title: `${activeDataTab}[${idx}].${ld.name}[${itIdx}].${c}`,
                                                                      items: Array.isArray(v1) ? v1 : [],
                                                                      constraints,
                                                                      writeBack: { kind: 'parent', parentItemIndex: itIdx, fieldName: c },
                                                                    },
                                                                  ]);
                                                                }}
                                                              >
                                                                Edit list ({Array.isArray(v1) ? v1.length : 0})
                                                              </button>
                                                            );
                                                          }

                                                          if (t === 'json') {
                                                            return (
                                                              <button
                                                                className="gc-btn"
                                                                disabled
                                                                title="Use Grid view for raw JSON editing"
                                                              >
                                                                Edit JSON
                                                              </button>
                                                            );
                                                          }

                                                          return renderFieldEditor(def1 as any, v1, (nv) => {
                                                            const nextItems = items.map((x: any, i: number) =>
                                                              i === itIdx ? (typeof x === 'object' && x && !Array.isArray(x) ? { ...(x as any), [c]: nv } : { [c]: nv }) : x
                                                            );
                                                            setList(nextItems);
                                                          });
                                                        })()}
                                                      </td>
                                                    ))}
                                                    <td>
                                                      <button className="gc-btn gc-btn-danger" onClick={() => setList(items.filter((_: any, i: number) => i !== itIdx))}>
                                                        Delete
                                                      </button>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  ) : null}
                                </div>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 14 }}>
                      <div className="gc-muted">Frozen versions for {activeDataTab}</div>
                      <div className="gc-list">
                        {(versionsByTemplate[activeDataTab] || []).slice(0, 8).map((v) => (
                          <div key={v.id} className="gc-list-item">
                            <code>{v.id}</code>
                            <span>{v.label} (#{v.versionNumber})</span>
                            <button
                              className="gc-btn"
                              onClick={() => {
                                setConfirm({
                                  title: 'Load frozen version into editor?',
                                  body:
                                    `This will replace the current editor rows for '${activeDataTab}' with the frozen snapshot:\n\n` +
                                    `${v.label || 'version'} (#${v.versionNumber})\n` +
                                    `${v.id}\n\n` +
                                    'This does not save anything until you click Save Draft.',
                                  confirmText: 'Load Version',
                                  danger: true,
                                  onConfirm: () => {
                                    const nextRows = Array.isArray(v.rows) ? v.rows : [];
                                    setRows(activeDataTab, nextRows);
                                    setLoadedFrozenByTemplate((m) => ({
                                      ...m,
                                      [activeDataTab]: { id: v.id, label: v.label, versionNumber: v.versionNumber, createdAt: v.createdAt },
                                    }));
                                    setStatus({ kind: 'ok', message: `Loaded ${activeDataTab} from frozen ${v.label} (#${v.versionNumber})` });
                                  },
                                });
                              }}
                            >
                              Load
                            </button>
                            <button
                              className="gc-btn gc-btn-danger"
                              onClick={() => {
                                if (!devChannelId) return;
                                setConfirm({
                                  title: 'Delete frozen version?',
                                  body:
                                    `This will permanently delete the frozen version:\n\n` +
                                    `${v.label || 'version'} (#${v.versionNumber})\n` +
                                    `${v.id}\n\n` +
                                    `If the Bundle was pointing to this version for '${activeDataTab}', it will be cleared.`,
                                  confirmText: 'Delete',
                                  danger: true,
                                  onConfirm: async () => {
                                    try {
                                      await deleteSectionVersion(devChannelId, activeDataTab, v.id);
                                      if (loadedFrozenByTemplate[activeDataTab]?.id === v.id) {
                                        setLoadedFrozenByTemplate((m) => ({ ...m, [activeDataTab]: null }));
                                      }
                                      // Reload versions list
                                      await loadVersions(activeDataTab);
                                      setStatus({ kind: 'ok', message: `Deleted frozen version ${v.label} (#${v.versionNumber})` });
                                      // If bundle selection referenced this version, clear locally too.
                                      setBundleSelection((sel) => {
                                        if (sel[activeDataTab] !== v.id) return sel;
                                        const next = { ...sel };
                                        delete next[activeDataTab];
                                        return next;
                                      });
                                    } catch (e: any) {
                                      setStatus({ kind: 'error', message: e?.response?.data?.error || e?.message || 'Failed' });
                                    }
                                  },
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="gc-muted" style={{ marginTop: 8 }}>
                        Tip: use <strong>Load</strong> to bring an old frozen version back into the editor, then <strong>Save Draft</strong> and <strong>Freeze</strong>.
                      </div>
                    </div>
                  </>
                ) : null}
                  </>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activePage === 'bundle' ? (
          <section className="gc-card" style={{ gridColumn: '1 / -1' }}>
            <h3>Bundle</h3>
            {!devChannel ? (
              <div className="gc-muted">Select a dev channel first.</div>
            ) : (
              <>
                <div className="gc-muted">Pick which frozen version of each tab is included.</div>
                <div className="gc-bundle-grid">
                  {templateNames.map((t: string) => {
                    const versions = versionsByTemplate[t] || [];
                    return (
                      <div key={t} className="gc-bundle-row">
                        <div className="gc-bundle-name">{t}</div>
                        <select
                          value={bundleSelection[t] || ''}
                          onChange={(e) => setBundleSelection((s) => ({ ...s, [t]: e.target.value }))}
                        >
                          <option value="">(not included)</option>
                          {versions.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label} (#{v.versionNumber})
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div className="gc-actions">
                  <button className="gc-btn gc-btn-primary" onClick={onSaveBundleSelection}>Save Bundle Selection</button>
                </div>
              </>
            )}
          </section>
        ) : null}

        {activePage === 'releases' ? (
          <section className="gc-card" style={{ gridColumn: '1 / -1' }}>
            <h3>Releases</h3>
            <div className="gc-actions">
              <button
                className="gc-btn"
                onClick={() =>
                  setConfirm({
                    title: 'Pull from staging?',
                    body:
                      'This will fully replace the selected development channel drafts and versions with the currently active staging release for the same envName.\n\n' +
                      'Effectively: staging -> development (full replacement).',
                    confirmText: 'Pull',
                    danger: true,
                    onConfirm: () => onPullFromStaging(),
                  })
                }
                disabled={!devChannelId}
                title={devChannelId ? 'Pull active staging release into dev channel' : 'Select a dev channel first'}
              >
                Pull From Staging
              </button>
              <button
                className="gc-btn gc-btn-primary"
                onClick={onDeployDevToStaging}
                disabled={!devChannelId}
                title={devChannelId ? 'Stash dev bundle to staging (development -> staging)' : 'Select a dev channel first'}
              >
                Stash To Staging
              </button>
              <button className="gc-btn" onClick={onPublishStagingToProd} title="Publish active staging release to production (staging -> production)">
                Publish Staging To Production
              </button>
            </div>
            <div className="gc-muted" style={{ marginTop: 10 }}>
              Workflow matches Remote Config: <code>development</code> can pull from staging and stash to staging. <code>staging</code> can publish to production. <code>production</code> is read-only (rollback only).
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="gc-actions">
                <button className="gc-btn" onClick={onLoadStagingReleases}>Load Staging Releases</button>
                <button className="gc-btn" onClick={onLoadProductionReleases}>Load Production Releases</button>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="gc-muted">Staging</div>
                <div className="gc-list">
                  {stagingReleases.slice(0, 10).map((r) => (
                    <div key={r.id} className="gc-release-row">
                      <code>{r.id}</code>
                      <span style={{ opacity: 0.85 }}>{new Date(r.createdAt).toLocaleString()}</span>
                      <code>{r.compiledHash.slice(0, 10)}...</code>
                      <button className="gc-btn gc-btn-danger" onClick={() => onRollbackStagingTo(r.id)}>Rollback to this</button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="gc-muted">Production</div>
                <div className="gc-list">
                  {productionReleases.slice(0, 10).map((r) => (
                    <div key={r.id} className="gc-release-row">
                      <code>{r.id}</code>
                      <span style={{ opacity: 0.85 }}>{new Date(r.createdAt).toLocaleString()}</span>
                      <code>{r.compiledHash.slice(0, 10)}...</code>
                      <button className="gc-btn gc-btn-danger" onClick={() => onRollbackProductionTo(r.id)}>Rollback to this</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {listEditor ? (
        <div className="gc-modal-overlay" onClick={() => setListEditorStack([])}>
          <div className="gc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gc-modal-header">
              <strong>{listEditor.title}</strong>
              <div className="gc-inline">
                {listEditorStack.length > 1 ? (
                  <button className="gc-btn" onClick={() => setListEditorStack((s) => s.slice(0, -1))}>Back</button>
                ) : null}
                <button className="gc-btn" onClick={() => setListEditorStack([])}>Close</button>
              </div>
            </div>
            {(() => {
              const lc = listEditor.constraints || {};
              const elementType = lc?.elementType as FieldType | undefined;
              const elementStructureRef = lc?.elementStructureRef as string | undefined;
              const elementModelRef = lc?.elementModelRef as string | undefined;

              const structFields =
                elementType === 'json' && elementStructureRef
                  ? (structureFieldDefsByName[elementStructureRef] || [])
                  : [];
              const modelFields =
                elementType === 'json' && elementModelRef
                  ? (templateFieldDefsByName[elementModelRef] || [])
                  : [];

              const elementFields = structFields.length > 0 ? structFields : modelFields;
              const fieldByName = new Map(elementFields.map((f) => [f.name, f]));

              const isPrimitiveList =
                elementType && elementType !== 'json' && elementType !== 'list' && elementType !== 'ref';

              const cols = elementFields.length > 0
                ? elementFields.map((f) => f.name)
                : isPrimitiveList
                  ? ['value']
                  : inferColumnsFromRows(listEditor.items);

              return (
                <>
                  <div className="gc-actions" style={{ marginTop: 10 }}>
                    <button
                      className="gc-btn"
                      onClick={() =>
                        setListEditorStack((stack) => {
                          if (stack.length === 0) return stack;
                          const cur = stack[stack.length - 1];
                          let nextItem: any = {};
                          if (elementFields.length > 0) {
                            for (const f of elementFields) nextItem[f.name] = defaultValueForType(f.type);
                          } else if (isPrimitiveList) {
                            nextItem = defaultValueForType(elementType as any);
                          }
                          const nextCur = { ...cur, items: [...cur.items, nextItem] };
                          return [...stack.slice(0, -1), nextCur];
                        })
                      }
                    >
                      Add Item
                    </button>
                    <button
                      className="gc-btn gc-btn-primary"
                      onClick={() => {
                        const cur = listEditor;
                        if (cur.writeBack.kind === 'row') {
                          const { templateName, rowIndex, fieldName } = cur.writeBack;
                          const rows = rowsByTemplate[templateName] || [];
                          const nextRows = rows.map((r, i) => i === rowIndex ? { ...(r || {}), [fieldName]: cur.items } : r);
                          setRows(templateName, nextRows);
                          setListEditorStack([]);
                          return;
                        }
                        if (cur.writeBack.kind === 'rowStruct') {
                          const { templateName, rowIndex, fieldName, subFieldName } = cur.writeBack;
                          const rows = rowsByTemplate[templateName] || [];
                          const nextRows = rows.map((r, i) => {
                            if (i !== rowIndex) return r;
                            const base = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
                            const curObj = (base as any)[fieldName];
                            const nextObj =
                              curObj && typeof curObj === 'object' && !Array.isArray(curObj)
                                ? { ...(curObj as any), [subFieldName]: cur.items }
                                : { [subFieldName]: cur.items };
                            return { ...(base as any), [fieldName]: nextObj };
                          });
                          setRows(templateName, nextRows);
                          setListEditorStack([]);
                          return;
                        }

                        // parent write-back
                        setListEditorStack((stack) => {
                          if (stack.length < 2) return [];
                          const child = stack[stack.length - 1];
                          const parent = stack[stack.length - 2];
                          const wb = child.writeBack;
                          if (wb.kind !== 'parent') return stack.slice(0, -1);

                          const parentItems = parent.items.slice();
                          const parentItem = parentItems[wb.parentItemIndex] && typeof parentItems[wb.parentItemIndex] === 'object'
                            ? { ...(parentItems[wb.parentItemIndex] as any) }
                            : {};
                          (parentItem as any)[wb.fieldName] = child.items;
                          parentItems[wb.parentItemIndex] = parentItem;
                          const nextParent = { ...parent, items: parentItems };
                          return [...stack.slice(0, -2), nextParent];
                        });
                      }}
                    >
                      Save List
                    </button>
                  </div>
                  <div className="gc-sheet" style={{ marginTop: 12 }}>
                    <table className="gc-sheet-table">
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>#</th>
                          {cols.map((c) => <th key={c}>{c}</th>)}
                          <th style={{ width: 110 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {listEditor.items.map((it, idx) => (
                          <tr key={idx}>
                            <td><code>{idx}</code></td>
                            {cols.map((c) => (
                              <td key={c}>
                                {(() => {
                                  // Primitive list editing
                                  if (cols.length === 1 && c === 'value' && isPrimitiveList) {
                                    const v = it;
                                    if (elementType === 'bool') {
                                      return (
                                        <input
                                          type="checkbox"
                                          checked={!!v}
                                          onChange={(e) => {
                                            const val = e.target.checked;
                                            setListEditorStack((stack) => {
                                              const cur = stack[stack.length - 1];
                                              const items = cur.items.map((x, i) => (i === idx ? val : x));
                                              const nextCur = { ...cur, items };
                                              return [...stack.slice(0, -1), nextCur];
                                            });
                                          }}
                                        />
                                      );
                                    }
                                    if (elementType === 'int' || elementType === 'float') {
                                      return (
                                        <input
                                          type="number"
                                          step={elementType === 'int' ? 1 : 'any'}
                                          value={v === undefined || v === null ? '' : String(v)}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const val =
                                              raw === ''
                                                ? null
                                                : elementType === 'int'
                                                  ? Number.parseInt(raw, 10)
                                                  : Number.parseFloat(raw);
                                            setListEditorStack((stack) => {
                                              const cur = stack[stack.length - 1];
                                              const items = cur.items.map((x, i) => (i === idx ? val : x));
                                              const nextCur = { ...cur, items };
                                              return [...stack.slice(0, -1), nextCur];
                                            });
                                          }}
                                        />
                                      );
                                    }
                                    return (
                                      <input
                                        value={v === undefined || v === null ? '' : String(v)}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setListEditorStack((stack) => {
                                            const cur = stack[stack.length - 1];
                                            const items = cur.items.map((x, i) => (i === idx ? val : x));
                                            const nextCur = { ...cur, items };
                                            return [...stack.slice(0, -1), nextCur];
                                          });
                                        }}
                                      />
                                    );
                                  }

                                  const f = fieldByName.get(c);
                                  const t = f?.type;
                                  const v = it && typeof it === 'object' && !Array.isArray(it) ? (it as any)[c] : undefined;

                                  if (t === 'list') {
                                    return (
                                      <button
                                        className="gc-btn"
                                        onClick={() => {
                                          const childItems = Array.isArray(v) ? v : [];
                                          setListEditorStack((stack) => ([
                                            ...stack,
                                            {
                                              title: `${listEditor.title}[${idx}].${c}`,
                                              items: childItems,
                                              constraints: (f as any).constraints || undefined,
                                              writeBack: { kind: 'parent', parentItemIndex: idx, fieldName: c },
                                            },
                                          ]));
                                        }}
                                      >
                                        Edit list ({Array.isArray(v) ? v.length : 0})
                                      </button>
                                    );
                                  }

                                  if (t === 'ref') {
                                    const cc = (f as any).constraints || {};
                                    const refTemplate = typeof cc.refTemplate === 'string' ? cc.refTemplate : '';
                                    const refPath = typeof cc.refPath === 'string' && cc.refPath.trim() ? cc.refPath.trim() : 'ID';
                                    const targetRows = refTemplate ? (rowsByTemplate[refTemplate] || []) : [];
                                    const ids = Array.from(
                                      new Set(
                                        targetRows
                                          .map((tr: any) => (tr && typeof tr === 'object' && !Array.isArray(tr) ? tr[refPath] : undefined))
                                          .filter((x: any) => typeof x === 'string' && x.trim())
                                      )
                                    ).sort((a, b) => String(a).localeCompare(String(b)));
                                    return (
                                      <select
                                        value={typeof v === 'string' ? v : ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setListEditorStack((stack) => {
                                            const cur = stack[stack.length - 1];
                                            const items = cur.items.map((x: any, i: number) =>
                                              i === idx ? { ...(x || {}), [c]: val } : x
                                            );
                                            const nextCur = { ...cur, items };
                                            return [...stack.slice(0, -1), nextCur];
                                          });
                                        }}
                                      >
                                        <option value="">{refTemplate ? 'Select...' : 'Configure ref...'}</option>
                                        {ids.map((idVal) => (
                                          <option key={idVal} value={idVal}>{idVal}</option>
                                        ))}
                                      </select>
                                    );
                                  }

                                  const enumVals = Array.isArray((f as any)?.constraints?.enum)
                                    ? (((f as any).constraints.enum as any[]) || []).filter((x: any) => typeof x === 'string')
                                    : (typeof (f as any)?.constraints?.enumRef === 'string' && enumDefsByName[(f as any).constraints.enumRef])
                                      ? (enumDefsByName[(f as any).constraints.enumRef] as any[]).filter((x: any) => typeof x === 'string')
                                      : [];
                                  if (enumVals.length > 0) {
                                    return (
                                      <select
                                        value={typeof v === 'string' ? v : ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setListEditorStack((stack) => {
                                            const cur = stack[stack.length - 1];
                                            const items = cur.items.map((x: any, i: number) =>
                                              i === idx ? { ...(x || {}), [c]: val } : x
                                            );
                                            const nextCur = { ...cur, items };
                                            return [...stack.slice(0, -1), nextCur];
                                          });
                                        }}
                                      >
                                        <option value="">Select...</option>
                                        {enumVals.map((vv: string) => (
                                          <option key={vv} value={vv}>{vv}</option>
                                        ))}
                                      </select>
                                    );
                                  }

                                  if (t === 'bool') {
                                    return (
                                      <input
                                        type="checkbox"
                                        checked={!!v}
                                        onChange={(e) => {
                                          const val = e.target.checked;
                                          setListEditorStack((stack) => {
                                            const cur = stack[stack.length - 1];
                                            const items = cur.items.map((x: any, i: number) =>
                                              i === idx ? { ...(x || {}), [c]: val } : x
                                            );
                                            const nextCur = { ...cur, items };
                                            return [...stack.slice(0, -1), nextCur];
                                          });
                                        }}
                                      />
                                    );
                                  }

                                  if (t === 'int' || t === 'float') {
                                    return (
                                      <input
                                        type="number"
                                        step={t === 'int' ? 1 : 'any'}
                                        value={v === undefined || v === null ? '' : String(v)}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          const val =
                                            raw === ''
                                              ? null
                                              : t === 'int'
                                                ? Number.parseInt(raw, 10)
                                                : Number.parseFloat(raw);
                                          setListEditorStack((stack) => {
                                            const cur = stack[stack.length - 1];
                                            const items = cur.items.map((x: any, i: number) =>
                                              i === idx ? { ...(x || {}), [c]: val } : x
                                            );
                                            const nextCur = { ...cur, items };
                                            return [...stack.slice(0, -1), nextCur];
                                          });
                                        }}
                                      />
                                    );
                                  }

                                  return (
                                    <input
                                      value={v === undefined || v === null ? '' : String(v)}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setListEditorStack((stack) => {
                                          const cur = stack[stack.length - 1];
                                          const items = cur.items.map((x: any, i: number) =>
                                            i === idx ? { ...(x || {}), [c]: val } : x
                                          );
                                          const nextCur = { ...cur, items };
                                          return [...stack.slice(0, -1), nextCur];
                                        });
                                      }}
                                    />
                                  );
                                })()}
                              </td>
                            ))}
                            <td>
                              <button
                                className="gc-btn gc-btn-danger"
                                onClick={() =>
                                  setListEditorStack((stack) => {
                                    const cur = stack[stack.length - 1];
                                    const items = cur.items.filter((_: any, i: number) => i !== idx);
                                    const nextCur = { ...cur, items };
                                    return [...stack.slice(0, -1), nextCur];
                                  })
                                }
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="gc-muted" style={{ marginTop: 10 }}>
                    {elementFields.length > 0
                      ? `Columns come from ${structFields.length > 0 ? `structure '${elementStructureRef}'` : `model '${elementModelRef}'`}.`
                      : isPrimitiveList
                        ? `List of ${String(elementType)} values.`
                        : 'Columns are inferred from existing item keys.'}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {jsonEditor ? (
        <div className="gc-modal-overlay" onClick={() => setJsonEditor(null)}>
          <div className="gc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gc-modal-header">
              <strong>
                {jsonEditor.templateName}[{jsonEditor.rowIndex}].{jsonEditor.fieldName}{jsonEditor.subFieldName ? `.${jsonEditor.subFieldName}` : ''}
              </strong>
              <button className="gc-btn" onClick={() => setJsonEditor(null)}>Close</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <textarea
                value={jsonEditor.text}
                onChange={(e) => setJsonEditor((s) => (s ? { ...s, text: e.target.value } : s))}
                rows={16}
              />
            </div>
            <div className="gc-actions">
                <button
                  className="gc-btn gc-btn-primary"
                  onClick={() => {
                    const parsed = safeParseJson(jsonEditor.text);
                    if (!parsed.ok) {
                      setStatus({ kind: 'error', message: parsed.error });
                      return;
                    }
                    const t = jsonEditor.templateName;
                    const ri = jsonEditor.rowIndex;
                    const fn = jsonEditor.fieldName;
                    const sfn = jsonEditor.subFieldName;
                    const rows = rowsByTemplate[t] || [];
                    const nextRows = rows.map((r, i) => {
                      if (i !== ri) return r;
                      const base = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
                      if (!sfn) return { ...(base as any), [fn]: parsed.value };
                      const curObj = (base as any)[fn];
                      const nextObj =
                        curObj && typeof curObj === 'object' && !Array.isArray(curObj)
                          ? { ...(curObj as any), [sfn]: parsed.value }
                          : { [sfn]: parsed.value };
                      return { ...(base as any), [fn]: nextObj };
                    });
                    setRows(t, nextRows);
                    setJsonEditor(null);
                    setStatus({ kind: 'ok', message: 'JSON updated (draft not saved yet)' });
                  }}
                >
                Save JSON
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div className="gc-modal-overlay" onClick={() => setConfirm(null)}>
          <div className="gc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gc-modal-header">
              <strong>{confirm.title}</strong>
              <button className="gc-btn" onClick={() => setConfirm(null)}>Close</button>
            </div>
            <div style={{ marginTop: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {confirm.body}
            </div>
            <div className="gc-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="gc-btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button
                className={`gc-btn ${confirm.danger ? 'gc-btn-danger' : 'gc-btn-primary'}`}
                onClick={() => {
                  const fn = confirm.onConfirm;
                  setConfirm(null);
                  fn();
                }}
              >
                {confirm.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GameConfigBundles;
