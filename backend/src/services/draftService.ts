import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

interface CreateDraftInput {
  configId: string;
  gameId: string;
  key: string;
  value: any;
  dataType: string;
  environment: string;
  enabled: boolean;
  description?: string;
  changes?: Record<string, any>;
  createdBy: string;
}

interface DeploymentRequest {
  draftIds: string[];
  deployedBy: string;
}

/**
 * Create a draft for config changes
 */
export async function createConfigDraft(input: CreateDraftInput) {
  try {
    const draft = await prisma.configDraft.create({
      data: {
        configId: input.configId,
        gameId: input.gameId,
        key: input.key,
        value: input.value,
        dataType: input.dataType,
        environment: input.environment,
        enabled: input.enabled,
        description: input.description,
        changes: input.changes || {},
        status: 'draft',
        createdBy: input.createdBy,
      },
    });

    logger.info('Config draft created', {
      draftId: draft.id,
      configId: input.configId,
      createdBy: input.createdBy,
    });

    return draft;
  } catch (error) {
    logger.error('Failed to create config draft:', error);
    throw error;
  }
}

/**
 * Get pending drafts for a game
 */
export async function getPendingDrafts(gameId: string, environment?: string) {
  try {
    const query: any = {
      gameId,
      status: { in: ['draft', 'pending'] },
    };

    if (environment) {
      query.environment = environment;
    }

    const drafts = await prisma.configDraft.findMany({
      where: query,
      include: {
        config: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return drafts;
  } catch (error) {
    logger.error('Failed to fetch pending drafts:', error);
    throw error;
  }
}

/**
 * Deploy a draft (apply changes to production config)
 */
export async function deployDraft(draftId: string, deployedBy: string) {
  try {
    const draft = await prisma.configDraft.findUnique({
      where: { id: draftId },
      include: { config: true },
    });

    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }

    if (draft.status === 'deployed') {
      throw new Error(`Draft ${draftId} already deployed`);
    }

    // Update the actual config with draft values
    const updatedConfig = await prisma.remoteConfig.update({
      where: { id: draft.configId },
      data: {
        value: draft.value as any,
        enabled: draft.enabled,
        description: draft.description,
      },
    });

    // Mark draft as deployed
    const deployedDraft = await prisma.configDraft.update({
      where: { id: draftId },
      data: {
        status: 'deployed',
        deployedAt: new Date(),
        deployedBy,
      },
    });

    // Log deployment in history
    await prisma.configHistory.create({
      data: {
        configId: draft.configId,
        changeType: 'updated',
        previousValue: draft.config.value as any,
        newValue: draft.value as any,
        changedBy: deployedBy,
      },
    });

    logger.info('Config draft deployed', {
      draftId,
      configId: draft.configId,
      deployedBy,
    });

    return deployedDraft;
  } catch (error) {
    logger.error('Failed to deploy draft:', error);
    throw error;
  }
}

/**
 * Reject a draft
 */
export async function rejectDraft(draftId: string, reason: string, rejectedBy: string) {
  try {
    const updatedDraft = await prisma.configDraft.update({
      where: { id: draftId },
      data: {
        status: 'rejected',
        rejectionReason: reason,
      },
    });

    logger.info('Config draft rejected', {
      draftId,
      rejectedBy,
      reason,
    });

    return updatedDraft;
  } catch (error) {
    logger.error('Failed to reject draft:', error);
    throw error;
  }
}

/**
 * Update a draft (only for draft status)
 */
export async function updateDraft(draftId: string, updates: Partial<CreateDraftInput>) {
  try {
    const draft = await prisma.configDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }

    if (draft.status !== 'draft') {
      throw new Error(`Cannot update draft with status ${draft.status}`);
    }

    const updatedDraft = await prisma.configDraft.update({
      where: { id: draftId },
      data: {
        value: updates.value ?? draft.value,
        enabled: updates.enabled ?? draft.enabled,
        description: updates.description ?? draft.description,
        changes: updates.changes,
      },
    });

    logger.info('Config draft updated', {
      draftId,
    });

    return updatedDraft;
  } catch (error) {
    logger.error('Failed to update draft:', error);
    throw error;
  }
}

/**
 * Delete a draft (only for draft/rejected status)
 */
export async function deleteDraft(draftId: string) {
  try {
    const draft = await prisma.configDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }

    if (!['draft', 'rejected'].includes(draft.status)) {
      throw new Error(`Cannot delete draft with status ${draft.status}`);
    }

    await prisma.configDraft.delete({
      where: { id: draftId },
    });

    logger.info('Config draft deleted', {
      draftId,
    });
  } catch (error) {
    logger.error('Failed to delete draft:', error);
    throw error;
  }
}

/**
 * Get draft details with history
 */
export async function getDraftDetails(draftId: string) {
  try {
    const draft = await prisma.configDraft.findUnique({
      where: { id: draftId },
      include: {
        config: {
          include: {
            history: {
              orderBy: {
                changedAt: 'desc',
              },
              take: 5,
            },
          },
        },
      },
    });

    return draft;
  } catch (error) {
    logger.error('Failed to fetch draft details:', error);
    throw error;
  }
}

