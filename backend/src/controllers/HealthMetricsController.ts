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
        platform: platform as string | undefined,
        country: country as string | undefined,
        appVersion: appVersion as string | undefined,
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
        platform: platform as string | undefined,
        country: country as string | undefined,
        appVersion: appVersion as string | undefined,
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
        platform: platform as string | undefined,
        country: country as string | undefined,
        appVersion: appVersion as string | undefined,
        severity: severity as string | undefined,
        crashType: crashType as string | undefined,
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
      const { gameId } = req.params;
      const crashData = req.body;

      const crash = await healthService.reportCrash({
        gameId,
        ...crashData,
      });

      res.status(201).json(crash);
    } catch (error) {
      console.error('Error reporting crash:', error);
      res.status(500).json({ error: 'Failed to report crash' });
    }
  }
}

