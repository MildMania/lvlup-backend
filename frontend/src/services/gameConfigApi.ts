import apiClient from '../lib/apiClient';

export async function listGameConfigSchemaRevisions(gameId: string) {
  const res = await apiClient.get('/game-config/admin/schema-revisions', {
    params: { gameId },
  });
  return res.data.data as any[];
}

export async function getGameConfigSchemaRevision(schemaRevisionId: string) {
  const res = await apiClient.get(`/game-config/admin/schema-revisions/${schemaRevisionId}`);
  return res.data.data as any;
}

export async function createGameConfigSchemaRevision(payload: any) {
  const res = await apiClient.post('/game-config/admin/schema-revisions', payload);
  return res.data.data as any;
}

export async function overwriteGameConfigSchemaRevision(schemaRevisionId: string, payload: any, forceDeleteChannels?: boolean) {
  const res = await apiClient.put(`/game-config/admin/schema-revisions/${schemaRevisionId}`, {
    ...payload,
    forceDeleteChannels: !!forceDeleteChannels,
  });
  return res.data.data as any;
}

export async function deleteGameConfigSchemaRevision(schemaRevisionId: string, gameId: string, forceDeleteChannels?: boolean) {
  const res = await apiClient.delete(`/game-config/admin/schema-revisions/${schemaRevisionId}`, {
    params: { gameId, forceDeleteChannels: !!forceDeleteChannels },
  });
  return res.data.data as any;
}

export async function listGameConfigChannels(gameId: string, toolEnvironment?: string) {
  const res = await apiClient.get('/game-config/admin/channels', {
    params: { gameId, toolEnvironment },
  });
  return res.data.data as any[];
}

export async function createGameConfigChannel(payload: any) {
  const res = await apiClient.post('/game-config/admin/channels', payload);
  return res.data.data as any;
}

export async function resetGameConfigChannel(channelId: string, schemaRevisionId?: string) {
  const res = await apiClient.post(`/game-config/admin/channels/${channelId}/reset`, {
    schemaRevisionId: schemaRevisionId || undefined,
  });
  return res.data.data as any;
}

export async function deleteGameConfigChannel(channelId: string) {
  const res = await apiClient.delete(`/game-config/admin/channels/${channelId}`);
  return res.data.data as any;
}

export async function pullGameConfigFromStaging(channelId: string) {
  const res = await apiClient.post(`/game-config/admin/channels/${channelId}/pull-from-staging`, {});
  return res.data.data as any;
}

export async function upsertSectionDraft(channelId: string, templateName: string, rows: any) {
  const res = await apiClient.put(
    `/game-config/admin/channels/${channelId}/sections/${encodeURIComponent(templateName)}/draft`,
    { rows }
  );
  return res.data;
}

export async function freezeSection(channelId: string, templateName: string, label?: string) {
  const res = await apiClient.post(
    `/game-config/admin/channels/${channelId}/sections/${encodeURIComponent(templateName)}/freeze`,
    { label }
  );
  return res.data;
}

export async function listSectionVersions(channelId: string, templateName: string) {
  const res = await apiClient.get(
    `/game-config/admin/channels/${channelId}/sections/${encodeURIComponent(templateName)}/versions`
  );
  return res.data.data as any[];
}

export async function deleteSectionVersion(channelId: string, templateName: string, versionId: string) {
  const res = await apiClient.delete(
    `/game-config/admin/channels/${channelId}/sections/${encodeURIComponent(templateName)}/versions/${versionId}`
  );
  return res.data.data as any;
}

export async function updateBundleDraft(channelId: string, selection: Record<string, string>) {
  const res = await apiClient.put(`/game-config/admin/channels/${channelId}/bundle-draft`, {
    selection,
  });
  return res.data.data as any;
}

export async function deployBundle(payload: any) {
  const res = await apiClient.post('/game-config/admin/deploy', payload);
  return res.data.data as any;
}

export async function listReleases(gameId: string, toolEnvironment: string, env: string) {
  const res = await apiClient.get('/game-config/admin/releases', {
    params: { gameId, toolEnvironment, env },
  });
  return res.data.data as any[];
}

export async function rollbackBundle(payload: any) {
  const res = await apiClient.post('/game-config/admin/rollback', payload);
  return res.data.data as any;
}
