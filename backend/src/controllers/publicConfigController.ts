/**
 * Public Config Controller
 * Handles public config fetching with rule evaluation and caching
 * Phase 3: User Story 1 - Config fetching for game clients
 */

import { Request, Response } from 'express';
import * as configService from '../services/ConfigService';
import * as cacheService from '../services/CacheService';
import { evaluateRules } from '../services/ruleEvaluator';
import { getCountryFromIP } from '../utils/geoip';
import {
  FetchConfigsQueryParams,
  FetchConfigsResponse,
} from '../types/api';
import {
  RuleEvaluationContext,
  ConfigEvaluationResult,
  RuleEvaluationMetrics,
} from '../types/config.types';
import logger from '../utils/logger';

/**
 * GET /api/configs/:gameId
 * Public config fetch endpoint with rule evaluation
 *
 * Query parameters:
 * - environment: Config environment (default: production)
 * - platform: Client platform (iOS, Android, Web)
 * - version: Application version (semantic version)
 * - country: Country code (ISO 3166-1 alpha-2)
 * - segment: User segment identifier
 * - debug: Enable debug output (true/false)
 */
export async function fetchConfigs(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { gameId } = req.params;
    const {
      environment = 'production',
      platform,
      version,
      country,
      segment,
      debug,
    } = req.query as FetchConfigsQueryParams & { debug?: string };

    if (!gameId) {
      res.status(400).json({
        success: false,
        error: 'gameId is required',
      });
      return;
    }

    // Get client IP for GeoIP lookup if country not provided
    let detectedCountry = country as string | undefined;
    if (!detectedCountry) {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        (req.socket.remoteAddress as string);

      if (clientIp) {
        detectedCountry = getCountryFromIP(clientIp) || undefined;
      }
    }

    // Build evaluation context
    const context: RuleEvaluationContext = {
      platform: platform as any,
      version: version as string,
      country: detectedCountry,
      segment: segment as string,
      serverTime: new Date(),
    };

    // Try to get from cache first
    const cacheKey = cacheService.generateCacheKey({
      gameId,
      environment: environment as any,
      platform: platform as any,
      version: version as string,
      country: detectedCountry,
      segment: segment as string,
    });

    const cached = await cacheService.getCacheValue<Record<string, unknown>>(
      cacheKey
    );

    if (cached) {
      logger.debug('Config cache hit', { gameId, cacheKey });

      res.status(200).json({
        success: true,
        data: {
          configs: cached,
          metadata: {
            gameId,
            environment: environment as any,
            fetchedAt: new Date().toISOString(),
            cacheUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            totalConfigs: Object.keys(cached).length,
          },
        },
      } as FetchConfigsResponse);
      return;
    }

    // Fetch configs from database
    const configs = await configService.getConfigs(
      gameId,
      environment as string
    );

    // Evaluate rules and build final config map
    const finalConfigs: Record<string, unknown> = {};
    const evaluations: ConfigEvaluationResult[] = [];
    const metrics: RuleEvaluationMetrics = {
      totalRules: 0,
      evaluatedRules: 0,
      matchedRule: null,
      evaluationTimeMs: 0,
      cacheHit: false,
    };

    for (const config of configs) {
      if (!config.enabled) {
        continue;
      }

      let finalValue = config.value;
      let source: 'default' | 'rule' | 'ab_test' = 'default';
      let matchedRuleId: string | undefined;
      let matchedRulePriority: number | undefined;

      // Evaluate rules if available
      if (config.rules && config.rules.length > 0) {
        const matchedRule = evaluateRules(config.rules, context, metrics);

        if (matchedRule) {
          finalValue = matchedRule.overrideValue;
          source = 'rule';
          matchedRuleId = matchedRule.id;
          matchedRulePriority = matchedRule.priority;
        }
      }

      finalConfigs[config.key] = finalValue;

      evaluations.push({
        key: config.key,
        value: finalValue,
        dataType: config.dataType,
        source,
        matchedRuleId,
        matchedRulePriority,
      });
    }

    // Cache the result
    await cacheService.setCacheValue(
      cacheKey,
      finalConfigs,
      cacheService.CACHE_TTL_DEFAULT
    );

    logger.info('Config fetched', {
      gameId,
      environment,
      configCount: Object.keys(finalConfigs).length,
      cached: false,
    });

    const response: FetchConfigsResponse = {
      success: true,
      data: {
        configs: finalConfigs,
        metadata: {
          gameId,
          environment: environment as any,
          fetchedAt: new Date().toISOString(),
          cacheUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          totalConfigs: Object.keys(finalConfigs).length,
        },
      },
    };

    // Add debug info if requested
    if (debug === 'true') {
      response.data.debug = {
        evaluations,
        context: {
          platform: context.platform,
          version: context.version,
          country: context.country,
          segment: context.segment,
          serverTime: context.serverTime!.toISOString(),
        },
      };
    }

    res.status(200).json(response);
  } catch (error) {
    logger.error('Failed to fetch configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch configs',
    });
  }
}

/**
 * GET /api/configs/:gameId/stats
 * Get config statistics (for monitoring)
 */
export async function getConfigStats(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { gameId } = req.params;
    const { environment = 'production' } = req.query;

    if (!gameId) {
      res.status(400).json({
        success: false,
        error: 'gameId is required',
      });
      return;
    }

    const configs = await configService.getConfigs(
      gameId,
      environment as string
    );

    const stats = {
      totalConfigs: configs.length,
      enabledConfigs: configs.filter((c) => c.enabled).length,
      totalRules: configs.reduce((sum, c) => sum + (c.rules?.length || 0), 0),
      configsByType: {
        string: configs.filter((c) => c.dataType === 'string').length,
        number: configs.filter((c) => c.dataType === 'number').length,
        boolean: configs.filter((c) => c.dataType === 'boolean').length,
        json: configs.filter((c) => c.dataType === 'json').length,
      },
    };

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get config stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get config stats',
    });
  }
}

/**
 * POST /api/configs/:gameId/validate
 * Validate configs would be returned for given context
 * (useful for testing without affecting cache)
 */
export async function validateConfigs(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { gameId } = req.params;
    const {
      environment = 'production',
      platform,
      version,
      country,
      segment,
    } = req.body;

    if (!gameId) {
      res.status(400).json({
        success: false,
        error: 'gameId is required',
      });
      return;
    }

    // Build evaluation context
    const context: RuleEvaluationContext = {
      platform,
      version,
      country,
      segment,
      serverTime: new Date(),
    };

    // Fetch configs
    const configs = await configService.getConfigs(gameId, environment);

    // Evaluate rules
    const results: ConfigEvaluationResult[] = [];

    for (const config of configs) {
      if (!config.enabled) continue;

      let finalValue = config.value;
      let source: 'default' | 'rule' = 'default';
      let matchedRuleId: string | undefined;

      if (config.rules && config.rules.length > 0) {
        const matchedRule = evaluateRules(config.rules, context);
        if (matchedRule) {
          finalValue = matchedRule.overrideValue;
          source = 'rule';
          matchedRuleId = matchedRule.id;
        }
      }

      results.push({
        key: config.key,
        value: finalValue,
        dataType: config.dataType,
        source,
        matchedRuleId,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        results,
        context,
      },
    });
  } catch (error) {
    logger.error('Failed to validate configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate configs',
    });
  }
}

