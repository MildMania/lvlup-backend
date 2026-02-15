import fs from 'fs/promises';
import path from 'path';
import { stableStringify } from './compiler';

export async function publishToLocalArtifacts(args: {
  baseDir: string; // e.g. backend/exports
  gameId: string;
  toolEnvironment: string;
  envName: string;
  version: number;
  compiledConfigs: Record<string, unknown>;
}): Promise<{ versionPath: string; configsPath: string }> {
  const dir = path.join(
    args.baseDir,
    'game-config',
    args.gameId,
    args.toolEnvironment,
    args.envName
  );
  await fs.mkdir(dir, { recursive: true });

  const versionJson = stableStringify({ version: args.version, env: args.envName });
  const configsJson = stableStringify(args.compiledConfigs);

  const versionPath = path.join(dir, 'version.json');
  const configsPath = path.join(dir, 'configs.json');

  // Write atomically-ish: write temp then rename
  await writeAtomic(versionPath, versionJson);
  await writeAtomic(configsPath, configsJson);

  return { versionPath, configsPath };
}

async function writeAtomic(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, filePath);
}

