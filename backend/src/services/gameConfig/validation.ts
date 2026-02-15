import { ValidationIssue } from '../../types/gameConfig.types';
import { extractPathValues, makeCompositeKey, parseCompositePath } from './path';

type FieldDef = {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  constraints?: any;
};

export function validateSectionRows(args: {
  templateName: string;
  rows: unknown;
  fields: FieldDef[];
  primaryKey: string[] | null;
}): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const { templateName, rows, fields, primaryKey } = args;

  if (!Array.isArray(rows)) {
    issues.push({
      severity: 'error',
      template: templateName,
      rowRef: 'n/a',
      path: '',
      message: `Section rows must be an array; got ${typeof rows}`,
    });
    return { ok: false, issues };
  }

  // Primary key uniqueness
  const pk = primaryKey && primaryKey.length > 0 ? primaryKey : null;
  const seenPk = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowObj = row && typeof row === 'object' && !Array.isArray(row) ? (row as any) : null;

    if (!rowObj) {
      issues.push({
        severity: 'error',
        template: templateName,
        rowRef: String(i),
        path: '',
        message: `Row must be an object; got ${Array.isArray(row) ? 'array' : typeof row}`,
      });
      continue;
    }

    let rowRef = String(i);
    if (pk) {
      const pkVals = pk.map((k) => rowObj[k]);
      if (pkVals.some((v) => v === undefined || v === null || v === '')) {
        issues.push({
          severity: 'error',
          template: templateName,
          rowRef,
          path: pk.join(','),
          message: `Primary key fields must be present and non-empty: ${pk.join(', ')}`,
        });
      } else {
        const key = makeCompositeKey(pkVals);
        rowRef = key;
        if (seenPk.has(key)) {
          issues.push({
            severity: 'error',
            template: templateName,
            rowRef,
            path: pk.join(','),
            message: `Duplicate primary key value: ${key}`,
          });
        } else {
          seenPk.add(key);
        }
      }
    }

    for (const f of fields) {
      const val = rowObj[f.name];
      if ((val === undefined || val === null) && f.required) {
        issues.push({
          severity: 'error',
          template: templateName,
          rowRef,
          path: f.name,
          message: `Missing required field '${f.name}'`,
        });
        continue;
      }
      if (val === undefined || val === null) continue;

      // Type checks
      const t = String(f.type);
      if (t === 'string' && typeof val !== 'string') {
        issues.push(typeErr(templateName, rowRef, f.name, 'string', val));
      } else if (t === 'ref' && typeof val !== 'string') {
        // Model references are stored as the referenced key (typically ID).
        issues.push(typeErr(templateName, rowRef, f.name, 'ref(string)', val));
      } else if (t === 'int') {
        if (typeof val !== 'number' || !Number.isInteger(val)) {
          issues.push(typeErr(templateName, rowRef, f.name, 'int', val));
        }
      } else if (t === 'float' || t === 'number') {
        if (typeof val !== 'number' || Number.isNaN(val)) {
          issues.push(typeErr(templateName, rowRef, f.name, 'number', val));
        }
      } else if (t === 'bool' || t === 'boolean') {
        if (typeof val !== 'boolean') {
          issues.push(typeErr(templateName, rowRef, f.name, 'bool', val));
        }
      } else if (t === 'list') {
        if (!Array.isArray(val)) {
          issues.push(typeErr(templateName, rowRef, f.name, 'list', val));
        }
      } else if (t === 'json') {
        if (typeof val !== 'object') {
          issues.push(typeErr(templateName, rowRef, f.name, 'json', val));
        }
      }

      // Constraints
      const c = f.constraints || {};
      if (c.enum && Array.isArray(c.enum)) {
        const ok = c.enum.some((x: any) => deepEqual(x, val));
        if (!ok) {
          issues.push({
            severity: 'error',
            template: templateName,
            rowRef,
            path: f.name,
            message: `Value not in enum for '${f.name}'`,
          });
        }
      }
      if (typeof c.min === 'number' && typeof val === 'number' && val < c.min) {
        issues.push({
          severity: 'error',
          template: templateName,
          rowRef,
          path: f.name,
          message: `Value ${val} is < min ${c.min}`,
        });
      }
      if (typeof c.max === 'number' && typeof val === 'number' && val > c.max) {
        issues.push({
          severity: 'error',
          template: templateName,
          rowRef,
          path: f.name,
          message: `Value ${val} is > max ${c.max}`,
        });
      }
      if (typeof c.maxLength === 'number' && typeof val === 'string' && val.length > c.maxLength) {
        issues.push({
          severity: 'error',
          template: templateName,
          rowRef,
          path: f.name,
          message: `String length ${val.length} exceeds maxLength ${c.maxLength}`,
        });
      }
      if (typeof c.regex === 'string' && typeof val === 'string') {
        try {
          const re = new RegExp(c.regex);
          if (!re.test(val)) {
            issues.push({
              severity: 'error',
              template: templateName,
              rowRef,
              path: f.name,
              message: `Value does not match regex for '${f.name}'`,
            });
          }
        } catch {
          issues.push({
            severity: 'warn',
            template: templateName,
            rowRef,
            path: f.name,
            message: `Invalid regex constraint for '${f.name}'`,
          });
        }
      }
    }
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues };
}

function typeErr(
  template: string,
  rowRef: string,
  path: string,
  expected: string,
  got: unknown
): ValidationIssue {
  const gotType = Array.isArray(got) ? 'list' : got === null ? 'null' : typeof got;
  return {
    severity: 'error',
    template,
    rowRef,
    path,
    message: `Expected ${expected} but got ${gotType}`,
  };
}

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function validateBundleRelations(args: {
  relations: Array<{
    fromTemplateName: string;
    fromPath: string;
    toTemplateName: string;
    toPath: string;
    mode: 'error' | 'warn';
  }>;
  compiled: Record<string, unknown>;
  primaryKeysByTemplate: Record<string, string[] | null>;
}): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  for (const rel of args.relations) {
    const fromSection = args.compiled[rel.fromTemplateName];
    const toSection = args.compiled[rel.toTemplateName];

    if (!Array.isArray(fromSection) || !Array.isArray(toSection)) {
      // v1 only supports array sections
      continue;
    }

    // Build target key set
    const toFields = parseCompositePath(rel.toPath);
    const toKeys = new Set<string>();
    for (const row of toSection) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const vals = toFields.map((f) => (row as any)[f]);
      toKeys.add(makeCompositeKey(vals));
    }

    for (let i = 0; i < fromSection.length; i++) {
      const row = fromSection[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;

      const refPk = args.primaryKeysByTemplate[rel.fromTemplateName];
      const rowRef = refPk
        ? makeCompositeKey(refPk.map((k) => (row as any)[k]))
        : String(i);

      const values = extractPathValues(row, rel.fromPath);
      for (const v of values) {
        if (v === undefined || v === null) continue;
        const key =
          toFields.length === 1
            ? makeCompositeKey([v])
            : makeCompositeKey(
                toFields.map((f) =>
                  v && typeof v === 'object' && !Array.isArray(v) ? (v as any)[f] : undefined
                )
              );
        if (!toKeys.has(key)) {
          issues.push({
            severity: rel.mode,
            template: rel.fromTemplateName,
            rowRef,
            path: rel.fromPath,
            message: `Reference not found in ${rel.toTemplateName}(${rel.toPath}): ${JSON.stringify(v)}`,
          });
        }
      }
    }
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues };
}
