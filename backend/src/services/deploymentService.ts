/**
 * Deployment Service
 * Handles deployment history tracking and rollback for staging/production
 */

import prisma from '../prisma';
import logger from '../utils/logger';


interface CreateDeploymentInput {
  gameId: string;
  environment: 'staging' | 'production';
  deployedBy: string;
  source: 'stash-from-dev' | 'publish-from-staging' | 'rollback';
  snapshot: any; // Complete snapshot of configs and rules
  isRollback?: boolean;
  rolledBackFrom?: string;
}

/**
 * Create a new deployment record with auto-incrementing version
 */
export async function createDeployment(input: CreateDeploymentInput) {
  // Get the latest version for this game and environment
  const latestDeployment = await prisma.deployment.findFirst({
    where: {
      gameId: input.gameId,
      environment: input.environment,
    },
    orderBy: { version: 'desc' },
  });

  const nextVersion = latestDeployment ? latestDeployment.version + 1 : 1;

  // Create new deployment
  const deployment = await prisma.deployment.create({
    data: {
      gameId: input.gameId,
      environment: input.environment,
      version: nextVersion,
      deployedBy: input.deployedBy,
      source: input.source,
      snapshot: input.snapshot as any,
      isRollback: input.isRollback || false,
      rolledBackFrom: input.rolledBackFrom,
    },
  });

  logger.info('Deployment created', {
    deploymentId: deployment.id,
    gameId: input.gameId,
    environment: input.environment,
    version: nextVersion,
  });

  // Cleanup old deployments (keep last 30)
  await cleanupOldDeployments(input.gameId, input.environment);

  return deployment;
}

/**
 * Get deployment history for a game and environment
 */
export async function getDeploymentHistory(
  gameId: string,
  environment: 'staging' | 'production',
  limit: number = 30
) {
  const deployments = await prisma.deployment.findMany({
    where: {
      gameId,
      environment,
    },
    orderBy: { version: 'desc' },
    take: limit,
  });

  return deployments;
}

/**
 * Get a single deployment by ID
 */
export async function getDeployment(deploymentId: string) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  return deployment;
}

/**
 * Get deployment by version
 */
export async function getDeploymentByVersion(
  gameId: string,
  environment: 'staging' | 'production',
  version: number
) {
  const deployment = await prisma.deployment.findFirst({
    where: {
      gameId,
      environment,
      version,
    },
  });

  return deployment;
}

/**
 * Cleanup old deployments (keep last 30)
 */
async function cleanupOldDeployments(
  gameId: string,
  environment: 'staging' | 'production'
) {
  const deployments = await prisma.deployment.findMany({
    where: {
      gameId,
      environment,
    },
    orderBy: { version: 'desc' },
    skip: 30, // Skip the 30 most recent
  });

  if (deployments.length > 0) {
    const idsToDelete = deployments.map((d) => d.id);
    const deleted = await prisma.deployment.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    logger.info('Cleaned up old deployments', {
      gameId,
      environment,
      deletedCount: deleted.count,
    });
  }
}

/**
 * Get current (latest) deployment
 */
export async function getCurrentDeployment(
  gameId: string,
  environment: 'staging' | 'production'
) {
  const deployment = await prisma.deployment.findFirst({
    where: {
      gameId,
      environment,
    },
    orderBy: { version: 'desc' },
  });

  return deployment;
}

/**
 * Compare two deployments (for diff view)
 */
export async function compareDeployments(deploymentId1: string, deploymentId2: string) {
  const [deployment1, deployment2] = await Promise.all([
    getDeployment(deploymentId1),
    getDeployment(deploymentId2),
  ]);

  if (!deployment1 || !deployment2) {
    throw new Error('One or both deployments not found');
  }

  return {
    deployment1: {
      id: deployment1.id,
      version: deployment1.version,
      deployedAt: deployment1.deployedAt,
      deployedBy: deployment1.deployedBy,
      configCount: (deployment1.snapshot as any)?.configs?.length || 0,
    },
    deployment2: {
      id: deployment2.id,
      version: deployment2.version,
      deployedAt: deployment2.deployedAt,
      deployedBy: deployment2.deployedBy,
      configCount: (deployment2.snapshot as any)?.configs?.length || 0,
    },
    snapshot1: deployment1.snapshot,
    snapshot2: deployment2.snapshot,
  };
}

