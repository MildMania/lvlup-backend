import { Request, Response } from 'express';
import * as deploymentService from '../services/deploymentService';
import * as configService from '../services/configService';
import logger from '../utils/logger';

export async function getDeploymentHistory(req: Request, res: Response): Promise<void> {
  try {
    const { gameId, environment } = req.params;
    const limit = parseInt(req.query.limit as string) || 30;

    if (!gameId || !environment) {
      res.status(400).json({ success: false, error: 'gameId and environment are required' });
      return;
    }

    if (environment !== 'staging' && environment !== 'production') {
      res.status(400).json({ success: false, error: 'environment must be staging or production' });
      return;
    }

    const deployments = await deploymentService.getDeploymentHistory(gameId, environment, limit);

    res.status(200).json({
      success: true,
      data: {
        deployments: deployments.map(d => ({
          id: d.id,
          version: d.version,
          deployedBy: d.deployedBy,
          deployedAt: d.deployedAt.toISOString(),
          source: d.source,
          isRollback: d.isRollback,
          rolledBackFrom: d.rolledBackFrom,
          configCount: (d.snapshot as any)?.configs?.length || 0,
        })),
      },
    });
  } catch (error) {
    logger.error('Failed to get deployment history:', error);
    res.status(500).json({ success: false, error: 'Failed to get deployment history' });
  }
}

export async function getDeployment(req: Request, res: Response): Promise<void> {
  try {
    const { deploymentId } = req.params;

    if (!deploymentId) {
      res.status(400).json({ success: false, error: 'deploymentId is required' });
      return;
    }

    const deployment = await deploymentService.getDeployment(deploymentId);

    if (!deployment) {
      res.status(404).json({ success: false, error: 'Deployment not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: deployment.id,
        version: deployment.version,
        gameId: deployment.gameId,
        environment: deployment.environment,
        deployedBy: deployment.deployedBy,
        deployedAt: deployment.deployedAt.toISOString(),
        source: deployment.source,
        isRollback: deployment.isRollback,
        rolledBackFrom: deployment.rolledBackFrom,
        snapshot: deployment.snapshot,
      },
    });
  } catch (error) {
    logger.error('Failed to get deployment:', error);
    res.status(500).json({ success: false, error: 'Failed to get deployment' });
  }
}

export async function rollbackDeployment(req: Request, res: Response): Promise<void> {
  try {
    const { deploymentId } = req.params;
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    if (!deploymentId) {
      res.status(400).json({ success: false, error: 'deploymentId is required' });
      return;
    }

    const targetDeployment = await deploymentService.getDeployment(deploymentId);

    if (!targetDeployment) {
      res.status(404).json({ success: false, error: 'Deployment not found' });
      return;
    }

    if (targetDeployment.environment !== 'staging') {
      res.status(403).json({ success: false, error: 'Rollback is only allowed for staging environment' });
      return;
    }

    const currentConfigs = await configService.getConfigs(targetDeployment.gameId, 'staging');
    await Promise.allSettled(
      currentConfigs.map(async (config) => {
        try {
          await configService.deleteConfig(config.id, userId);
        } catch (error) {
          logger.warn(`Failed to delete config ${config.id} during rollback`, error);
        }
      })
    );

    const snapshot = targetDeployment.snapshot as any;
    const restoredConfigs = [];

    for (const configSnapshot of snapshot.configs || []) {
      try {
        const restoredConfig = await configService.createConfig(
          {
            gameId: targetDeployment.gameId,
            key: configSnapshot.key,
            value: configSnapshot.value,
            dataType: configSnapshot.dataType,
            environment: 'staging',
            enabled: configSnapshot.enabled,
            description: configSnapshot.description,
          },
          userId
        );

        const restoredRules = [];
        if (configSnapshot.rules && configSnapshot.rules.length > 0) {
          for (const ruleSnapshot of configSnapshot.rules) {
            try {
              const restoredRule = await configService.createRule(
                {
                  configId: restoredConfig.id,
                  priority: ruleSnapshot.priority,
                  overrideValue: ruleSnapshot.overrideValue,
                  enabled: ruleSnapshot.enabled,
                  platformConditions: ruleSnapshot.platformConditions,
                  countryConditions: ruleSnapshot.countryConditions,
                  segmentConditions: ruleSnapshot.segmentConditions,
                  activeBetweenStart: ruleSnapshot.activeBetweenStart,
                  activeBetweenEnd: ruleSnapshot.activeBetweenEnd,
                },
                userId
              );
              restoredRules.push(restoredRule);
            } catch (error) {
              logger.warn(`Failed to restore rule during rollback`, error);
            }
          }
        }

        restoredConfigs.push({ ...restoredConfig, rules: restoredRules });
      } catch (error) {
        logger.warn(`Failed to restore config ${configSnapshot.key} during rollback`, error);
      }
    }

    const newDeployment = await deploymentService.createDeployment({
      gameId: targetDeployment.gameId,
      environment: 'staging',
      deployedBy: userId,
      source: 'rollback',
      snapshot: { configs: restoredConfigs },
      isRollback: true,
      rolledBackFrom: deploymentId,
    });

    logger.info('Rollback completed', {
      newDeploymentId: newDeployment.id,
      newVersion: newDeployment.version,
      rolledBackTo: targetDeployment.version,
      configsRestored: restoredConfigs.length,
    });

    res.status(200).json({
      success: true,
      data: {
        deploymentId: newDeployment.id,
        version: newDeployment.version,
        rolledBackToVersion: targetDeployment.version,
        configsRestored: restoredConfigs.length,
      },
    });
  } catch (error) {
    logger.error('Failed to rollback deployment:', error);
    res.status(500).json({ success: false, error: 'Failed to rollback deployment' });
  }
}

/**
 * Compare two deployments and return diff
 */
export async function compareDeployments(req: Request, res: Response): Promise<void> {
  try {
    const { deploymentId1, deploymentId2 } = req.params;

    if (!deploymentId1 || !deploymentId2) {
      res.status(400).json({ success: false, error: 'Both deployment IDs are required' });
      return;
    }

    const [deployment1, deployment2] = await Promise.all([
      deploymentService.getDeployment(deploymentId1),
      deploymentService.getDeployment(deploymentId2),
    ]);

    if (!deployment1 || !deployment2) {
      res.status(404).json({ success: false, error: 'One or both deployments not found' });
      return;
    }

    const snapshot1 = deployment1.snapshot as any;
    const snapshot2 = deployment2.snapshot as any;

    const configs1 = snapshot1.configs || [];
    const configs2 = snapshot2.configs || [];

    // Calculate diff
    const added = configs2.filter((c2: any) => !configs1.find((c1: any) => c1.key === c2.key));
    const removed = configs1.filter((c1: any) => !configs2.find((c2: any) => c2.key === c1.key));
    const modified = configs2.filter((c2: any) => {
      const c1 = configs1.find((c: any) => c.key === c2.key);
      return c1 && JSON.stringify(c1.value) !== JSON.stringify(c2.value);
    }).map((c2: any) => {
      const c1 = configs1.find((c: any) => c.key === c2.key);
      return {
        key: c2.key,
        oldValue: c1.value,
        newValue: c2.value,
        oldEnabled: c1.enabled,
        newEnabled: c2.enabled,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        deployment1: {
          id: deployment1.id,
          version: deployment1.version,
          deployedAt: deployment1.deployedAt.toISOString(),
        },
        deployment2: {
          id: deployment2.id,
          version: deployment2.version,
          deployedAt: deployment2.deployedAt.toISOString(),
        },
        diff: {
          added,
          removed,
          modified,
          addedCount: added.length,
          removedCount: removed.length,
          modifiedCount: modified.length,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to compare deployments:', error);
    res.status(500).json({ success: false, error: 'Failed to compare deployments' });
  }
}

