import { Request, Response } from 'express';
import { HealthMetricsService } from '../services/HealthMetricsService';

const healthService = new HealthMetricsService();

export class HealthMetricsController {
  async getHealthMetrics(req: Request, res: Response) {
    try {
      const { gameId } = req.params;
      const { startDate, endDate, platform, country, appVersion } = req.query;

      if (!gameId) {
        return res.status(400).json({ error: 'gameId is required' });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const filters = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        ...(platform && { platform: platform as string }),
        ...(country && { country: country as string }),
        ...(appVersion && { appVersion: appVersion as string }),
      };

      const metrics = await healthService.getCrashMetrics(gameId, filters);
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching health metrics:', error);
      res.status(500).json({ error: 'Failed to fetch health metrics' });
    }
  }

  async getCrashTimeline(req: Request, res: Response) {
    try {
      const { gameId } = req.params;
      const { startDate, endDate, platform, country, appVersion } = req.query;

      if (!gameId) {
        return res.status(400).json({ error: 'gameId is required' });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const filters = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        ...(platform && { platform: platform as string }),
        ...(country && { country: country as string }),
        ...(appVersion && { appVersion: appVersion as string }),
      };

      const timeline = await healthService.getCrashTimeline(gameId, filters);
      res.json(timeline);
    } catch (error) {
      console.error('Error fetching crash timeline:', error);
      res.status(500).json({ error: 'Failed to fetch crash timeline' });
    }
  }

  async getCrashLogs(req: Request, res: Response) {
    try {
      const { gameId } = req.params;
      const {
        startDate,
        endDate,
        platform,
        country,
        appVersion,
        severity,
        crashType,
        limit,
        offset,
      } = req.query;

      if (!gameId) {
        return res.status(400).json({ error: 'gameId is required' });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const filters = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        ...(platform && { platform: platform as string }),
        ...(country && { country: country as string }),
        ...(appVersion && { appVersion: appVersion as string }),
        ...(severity && { severity: severity as string }),
        ...(crashType && { crashType: crashType as string }),
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      };

      const logs = await healthService.getCrashLogs(gameId, filters);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching crash logs:', error);
      res.status(500).json({ error: 'Failed to fetch crash logs' });
    }
  }

  async getCrashDetails(req: Request, res: Response) {
    try {
      const { crashId } = req.params;

      if (!crashId) {
        return res.status(400).json({ error: 'crashId is required' });
      }

      const crash = await healthService.getCrashDetails(crashId);
      
      if (!crash) {
        return res.status(404).json({ error: 'Crash not found' });
      }

      res.json(crash);
    } catch (error) {
      console.error('Error fetching crash details:', error);
      res.status(500).json({ error: 'Failed to fetch crash details' });
    }
  }

  async reportCrash(req: Request, res: Response) {
    try {
      const crashData = req.body;

      // Get game from middleware (set by authenticateEither)
      const game = (req as any).game;
      
      if (!game) {
        return res.status(403).json({ 
          error: 'Game not found or access denied' 
        });
      }

      // Validate required fields
      const requiredFields = ['crashType', 'severity', 'message'];
      const missingFields = requiredFields.filter(field => 
        !crashData[field] && !crashData[field.charAt(0).toUpperCase() + field.slice(1)]
      );

      if (missingFields.length > 0) {
        return res.status(400).json({ 
          error: `Missing required fields: ${missingFields.join(', ')}` 
        });
      }

      // Normalize field names from PascalCase (Unity SDK) to camelCase
      // Use the actual game.id (CUID) for the database foreign key
      const normalizedData = {
        gameId: game.id,
        userId: crashData.UserId || crashData.userId || null,
        sessionId: crashData.SessionId || crashData.sessionId || null,
        crashType: crashData.CrashType || crashData.crashType,
        severity: crashData.Severity || crashData.severity,
        message: crashData.Message || crashData.message,
        stackTrace: crashData.StackTrace || crashData.stackTrace || '',
        exceptionType: crashData.ExceptionType || crashData.exceptionType,
        platform: crashData.platform,
        osVersion: crashData.osVersion,
        manufacturer: crashData.manufacturer,
        device: crashData.device,
        deviceId: crashData.deviceId,
        appVersion: crashData.appVersion,
        appBuild: crashData.appBuild,
        bundleId: crashData.bundleId,
        engineVersion: crashData.engineVersion,
        sdkVersion: crashData.sdkVersion,
        country: crashData.country,
        connectionType: crashData.connectionType,
        memoryUsage: crashData.memoryUsage,
        batteryLevel: crashData.batteryLevel,
        diskSpace: crashData.diskSpace,
        breadcrumbs: crashData.Breadcrumbs || crashData.breadcrumbs,
        customData: {
          eventUuid: crashData.eventUuid,
          appSignature: crashData.appSignature,
          channelId: crashData.channelId,
          countryCode: crashData.countryCode,
          region: crashData.region,
          city: crashData.city,
          timezone: crashData.timezone,
          ...(crashData.customData || {}),
        },
      };

      const crash = await healthService.reportCrash(normalizedData);

      res.status(201).json({ 
        success: true, 
        data: crash 
      });
    } catch (error: any) {
      console.error('Error reporting crash:', error);
      console.error('Crash data received:', JSON.stringify(req.body, null, 2));
      res.status(500).json({ 
        success: false,
        error: 'Failed to report crash',
        message: error?.message || 'Unknown error'
      });
    }
  }
}

