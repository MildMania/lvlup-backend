import crypto from 'crypto';
import { ValidationIssue } from '../../types/gameConfig.types';
import { validateBundleRelations } from './validation';

export function stableStringify(obj: unknown): string {
  return JSON.stringify(sortRec(obj));
}

function sortRec(v: any): any {
  if (Array.isArray(v)) return v.map(sortRec);
  if (v && typeof v === 'object') {
    const out: any = {};
    for (const k of Object.keys(v).sort()) {
      out[k] = sortRec(v[k]);
    }
    return out;
  }
  return v;
}

export function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function compileBundle(args: {
  // templateName -> rows (array)
  sections: Record<string, unknown>;
  relations: Array<{
    fromTemplateName: string;
    fromPath: string;
    toTemplateName: string;
    toPath: string;
    mode: 'error' | 'warn';
  }>;
  primaryKeysByTemplate: Record<string, string[] | null>;
}): { compiled: Record<string, unknown>; compiledHash: string; issues: ValidationIssue[]; ok: boolean } {
  // Ensure deterministic top-level ordering
  const compiled: Record<string, unknown> = {};
  for (const name of Object.keys(args.sections).sort()) {
    compiled[name] = args.sections[name];
  }

  const relRes = validateBundleRelations({
    relations: args.relations,
    compiled,
    primaryKeysByTemplate: args.primaryKeysByTemplate,
  });

  const json = stableStringify(compiled);
  const compiledHash = sha256Hex(json);
  const ok = relRes.ok;
  return { compiled, compiledHash, issues: relRes.issues, ok };
}

