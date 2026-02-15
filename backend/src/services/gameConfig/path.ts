/**
 * Minimal JSON path utilities for cross-section validation.
 *
 * Supported path grammar (v1):
 * - Dot navigation: "A.B.C"
 * - Array wildcard: "Stages[].StoreItemId"
 * - Top-level field: "Drop"
 *
 * Returns a flat list of terminal values.
 */

export function extractPathValues(root: unknown, path: string): unknown[] {
  if (!path) return [];
  const segments = path.split('.').map((s) => s.trim()).filter(Boolean);
  let current: unknown[] = [root];

  for (const seg of segments) {
    const isArray = seg.endsWith('[]');
    const key = isArray ? seg.slice(0, -2) : seg;
    const next: unknown[] = [];

    for (const v of current) {
      if (v == null) continue;

      const child =
        typeof v === 'object' && !Array.isArray(v) ? (v as any)[key] : undefined;

      if (isArray) {
        if (Array.isArray(child)) {
          for (const el of child) next.push(el);
        }
      } else {
        next.push(child);
      }
    }

    current = next;
  }

  // Flatten any remaining array nodes at the end (common mistake in paths)
  const out: unknown[] = [];
  for (const v of current) {
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  }
  return out.filter((v) => v !== undefined);
}

export function parseCompositePath(path: string): string[] {
  // For keys like "ID,VariantID" used in toPath.
  return path
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function makeCompositeKey(values: unknown[]): string {
  // Stable-ish string key; avoids collisions for common primitives.
  return values.map((v) => JSON.stringify(v)).join('|');
}

