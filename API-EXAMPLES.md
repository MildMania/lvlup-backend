# LvlUp Backend API Documentation

This document provides comprehensive examples for each endpoint in the LvlUp Backend API.

## Table of Contents

- [Authentication](#authentication)
- [Health Check](#health-check)
- [Games Management](#games-management)
- [Analytics](#analytics)
  - [Session Tracking](#session-tracking)
  - [Event Tracking](#event-tracking)
  - [Analytics Retrieval](#analytics-retrieval)
- [Enhanced Analytics](#enhanced-analytics)
  - [Retention Metrics](#retention-metrics)
  - [Active Users Metrics](#active-users-metrics)
  - [Playtime Metrics](#playtime-metrics)
  - [Session Count Metrics](#session-count-metrics)
  - [Session Length Metrics](#session-length-metrics)
- [Player Journey Analytics](#player-journey-analytics)
  - [Checkpoint Management](#checkpoint-management)
  - [Checkpoint Tracking](#checkpoint-tracking)
  - [Journey Progress](#journey-progress)
  - [User Journey Data](#user-journey-data)

## Authentication

All API requests (except for the health check and root endpoint) require authentication using an API key in the `X-API-Key` header.

```
X-API-Key: your_api_key_here
```

## Health Check

### GET /api/health

Check if the API is operational.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/health"
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-09-24T11:45:12.123Z",
  "service": "lvlup-backend"
}
```

## Games Management

### POST /api/games

Create a new game.

**Request:**

```bash
curl -X POST "http://localhost:3000/api/games" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Space Adventure",
    "description": "A sci-fi adventure game"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "cl9z1x2a30000ab1234567890",
    "name": "Space Adventure",
    "apiKey": "lvl_abcdef1234567890abcdef1234567890",
    "createdAt": "2025-09-24T12:00:00.000Z"
  }
}
```

### GET /api/games

List all games.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/games" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "cl9z1x2a30000ab1234567890",
      "name": "Space Adventure",
      "description": "A sci-fi adventure game",
      "createdAt": "2025-09-24T12:00:00.000Z",
      "stats": {
        "events": 1542,
        "users": 305,
        "sessions": 892,
        "checkpoints": 12,
        "playerJourneys": 1204
      }
    },
    {
      "id": "cl9z2x3b40001cd5678901234",
      "name": "Fantasy Quest",
      "description": "An epic fantasy RPG",
      "createdAt": "2025-09-23T14:30:00.000Z",
      "stats": {
        "events": 8721,
        "users": 1253,
        "sessions": 3542,
        "checkpoints": 28,
        "playerJourneys": 6782
      }
    }
  ]
}
```

### GET /api/games/:gameId

Get details for a specific game.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/games/cl9z1x2a30000ab1234567890" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "cl9z1x2a30000ab1234567890",
    "name": "Space Adventure",
    "description": "A sci-fi adventure game",
    "apiKey": "lvl_abcdef1234567890abcdef1234567890",
    "createdAt": "2025-09-24T12:00:00.000Z",
    "updatedAt": "2025-09-24T12:00:00.000Z",
    "stats": {
      "events": 1542,
      "users": 305,
      "sessions": 892,
      "checkpoints": 12,
      "playerJourneys": 1204
    }
  }
}
```

### PUT /api/games/:gameId/apikey

Regenerate API key for a game.

**Request:**

```bash
curl -X PUT "http://localhost:3000/api/games/cl9z1x2a30000ab1234567890/apikey" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "cl9z1x2a30000ab1234567890",
    "name": "Space Adventure",
    "apiKey": "lvl_newApiKey1234567890newApiKey123456"
  }
}
```

### DELETE /api/games/:gameId

Delete a game.

**Request:**

```bash
curl -X DELETE "http://localhost:3000/api/games/cl9z1x2a30000ab1234567890" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "message": "Game deleted successfully"
}
```

## Analytics

### Session Tracking

#### POST /api/analytics/session/start

Start a new session.

**Request:**

```bash
curl -X POST "http://localhost:3000/api/analytics/session/start" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890" \
  -d '{
    "userId": "user_123456",
    "deviceId": "device_abcdef",
    "platform": "iOS",
    "version": "1.2.3",
    "country": "US",
    "language": "en"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_1234567890abcdef",
    "userId": "user_123456",
    "startTime": "2025-09-24T12:30:00.000Z"
  }
}
```

#### PUT /api/analytics/session/end

End a session.

**Request:**

```bash
curl -X PUT "http://localhost:3000/api/analytics/session/end" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890" \
  -d '{
    "sessionId": "sess_1234567890abcdef"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_1234567890abcdef",
    "userId": "user_123456",
    "startTime": "2025-09-24T12:30:00.000Z",
    "endTime": "2025-09-24T12:45:30.000Z",
    "duration": 930
  }
}
```

### Event Tracking

#### POST /api/analytics/events

Track a single event.

**Request:**

```bash
curl -X POST "http://localhost:3000/api/analytics/events" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890" \
  -d '{
    "userId": "user_123456",
    "sessionId": "sess_1234567890abcdef",
    "type": "level_complete",
    "data": {
      "levelId": "level_5",
      "score": 12500,
      "stars": 3,
      "timeMs": 75000
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "eventId": "evt_1234567890abcdef"
  }
}
```

#### POST /api/analytics/events/batch

Track multiple events in a batch.

**Request:**

```bash
curl -X POST "http://localhost:3000/api/analytics/events/batch" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890" \
  -d '{
    "events": [
      {
        "userId": "user_123456",
        "sessionId": "sess_1234567890abcdef",
        "type": "item_collected",
        "data": {
          "itemId": "coin_gold",
          "quantity": 1,
          "position": {"x": 125, "y": 45, "z": 0}
        }
      },
      {
        "userId": "user_123456",
        "sessionId": "sess_1234567890abcdef",
        "type": "enemy_defeated",
        "data": {
          "enemyId": "goblin_03",
          "weaponUsed": "sword_steel",
          "hitPoints": 125
        }
      }
    ]
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "count": 2,
    "eventIds": ["evt_1234567890abcdef", "evt_abcdef1234567890"]
  }
}
```

### Analytics Retrieval

#### GET /api/analytics/game/:gameId

Get analytics data for a game.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/game/cl9z1x2a30000ab1234567890?startDate=2025-09-01&endDate=2025-09-24" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "gameId": "cl9z1x2a30000ab1234567890",
    "period": {
      "startDate": "2025-09-01T00:00:00.000Z",
      "endDate": "2025-09-24T23:59:59.999Z"
    },
    "overview": {
      "totalUsers": 305,
      "newUsers": 76,
      "sessionsCount": 892,
      "avgSessionDuration": 483,
      "eventsCount": 1542
    },
    "dailyStats": [
      {
        "date": "2025-09-01",
        "users": 105,
        "newUsers": 12,
        "sessions": 203,
        "events": 421
      }
      // ... more daily stats
    ],
    "topEvents": [
      {
        "type": "level_complete",
        "count": 342
      },
      {
        "type": "item_collected",
        "count": 298
      }
      // ... more top events
    ]
  }
}
```

## Enhanced Analytics

### Retention Metrics

#### GET /api/analytics/enhanced/metrics/retention

Get retention metrics.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/enhanced/metrics/retention?startDate=2025-09-01&endDate=2025-09-24&days=1,7,30" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "gameId": "cl9z1x2a30000ab1234567890",
    "period": {
      "startDate": "2025-09-01T00:00:00.000Z",
      "endDate": "2025-09-24T23:59:59.999Z"
    },
    "retentionRates": [
      {
        "date": "2025-09-01",
        "newUsers": 45,
        "retention": {
          "d1": 73.3,
          "d7": 42.2,
          "d30": 22.1
        }
      },
      {
        "date": "2025-09-02",
        "newUsers": 38,
        "retention": {
          "d1": 68.4,
          "d7": 39.5,
          "d30": 18.4
        }
      }
      // ... more dates
    ]
  }
}
```

### Active Users Metrics

#### GET /api/analytics/enhanced/metrics/active-users

Get daily, weekly, and monthly active user metrics.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/enhanced/metrics/active-users?startDate=2025-09-01&endDate=2025-09-24" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "gameId": "cl9z1x2a30000ab1234567890",
    "period": {
      "startDate": "2025-09-01T00:00:00.000Z",
      "endDate": "2025-09-24T23:59:59.999Z"
    },
    "activeUsers": [
      {
        "date": "2025-09-01",
        "dau": 87,
        "wau": 156,
        "mau": 305
      },
      {
        "date": "2025-09-02",
        "dau": 92,
        "wau": 162,
        "mau": 310
      }
      // ... more dates
    ]
  }
}
```

### Playtime Metrics

#### GET /api/analytics/enhanced/metrics/playtime

Get playtime metrics.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/enhanced/metrics/playtime?startDate=2025-09-01&endDate=2025-09-24" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "gameId": "cl9z1x2a30000ab1234567890",
    "period": {
      "startDate": "2025-09-01T00:00:00.000Z",
      "endDate": "2025-09-24T23:59:59.999Z"
    },
    "playtime": [
      {
        "date": "2025-09-01",
        "averagePlaytimePerSession": 482,
        "averagePlaytimePerUser": 1446,
        "totalPlaytime": 125802
      },
      {
        "date": "2025-09-02",
        "averagePlaytimePerSession": 495,
        "averagePlaytimePerUser": 1485,
        "totalPlaytime": 136620
      }
      // ... more dates
    ]
  }
}
```

### Session Count Metrics

#### GET /api/analytics/enhanced/metrics/session-count

Get session count metrics.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/enhanced/metrics/session-count?startDate=2025-09-01&endDate=2025-09-07" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "gameId": "cl9z1x2a30000ab1234567890",
    "period": {
      "startDate": "2025-09-01T00:00:00.000Z",
      "endDate": "2025-09-07T23:59:59.999Z"
    },
    "sessionCounts": [
      {
        "date": "2025-09-01",
        "sessionCounts": {
          "average": 3.2,
          "median": 2,
          "distribution": {
            "1": 25,
            "2-5": 42,
            "6-10": 18,
            "10+": 2
          }
        }
      },
      {
        "date": "2025-09-02",
        "sessionCounts": {
          "average": 3.5,
          "median": 3,
          "distribution": {
            "1": 22,
            "2-5": 45,
            "6-10": 21,
            "10+": 4
          }
        }
      }
      // ... more dates
    ]
  }
}
```

### Session Length Metrics

#### GET /api/analytics/enhanced/metrics/session-length

Get session length metrics.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/enhanced/metrics/session-length?startDate=2025-09-01&endDate=2025-09-07" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "gameId": "cl9z1x2a30000ab1234567890",
    "period": {
      "startDate": "2025-09-01T00:00:00.000Z",
      "endDate": "2025-09-07T23:59:59.999Z"
    },
    "sessionLengths": [
      {
        "date": "2025-09-01",
        "sessionLength": {
          "average": 482,
          "median": 375,
          "total": 125802,
          "distribution": {
            "<1min": 8,
            "1-5min": 24,
            "5-15min": 38,
            "15-30min": 22,
            "30+min": 8
          }
        }
      },
      {
        "date": "2025-09-02",
        "sessionLength": {
          "average": 495,
          "median": 390,
          "total": 136620,
          "distribution": {
            "<1min": 7,
            "1-5min": 22,
            "5-15min": 39,
            "15-30min": 23,
            "30+min": 9
          }
        }
      }
      // ... more dates
    ]
  }
}
```

## Player Journey Analytics

### Checkpoint Management

#### GET /api/analytics/enhanced/journey/checkpoints

Get all checkpoints defined for a game.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/enhanced/journey/checkpoints" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "gameId": "cl9z1x2a30000ab1234567890",
    "checkpoints": [
      {
        "id": "chkpt_001",
        "name": "Tutorial Complete",
        "description": "Player completed the tutorial",
        "type": "tutorial",
        "tags": ["onboarding"],
        "order": 1,
        "createdAt": "2025-09-01T10:00:00.000Z"
      },
      {
        "id": "chkpt_002",
        "name": "Level 1 Complete",
        "description": "Player completed level 1",
        "type": "level",
        "tags": ["progression"],
        "order": 2,
        "createdAt": "2025-09-01T10:01:00.000Z"
      }
      // ... more checkpoints
    ]
  }
}
```

### Checkpoint Tracking

#### POST /api/analytics/enhanced/journey/record

Record a player reaching a checkpoint.

**Request:**

```bash
curl -X POST "http://localhost:3000/api/analytics/enhanced/journey/record" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890" \
  -d '{
    "userId": "user_123456",
    "checkpointId": "chkpt_002",
    "metadata": {
      "score": 12500,
      "timeTaken": 345,
      "attempts": 2
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "pcpt_1234567890",
    "userId": "user_123456",
    "checkpointId": "chkpt_002",
    "timestamp": "2025-09-24T13:45:12.000Z"
  }
}
```

### Journey Progress

#### GET /api/analytics/enhanced/journey/progress

Get journey progress analytics.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/enhanced/journey/progress?startDate=2025-09-01&endDate=2025-09-24&checkpointType=level&format=funnel" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "gameId": "cl9z1x2a30000ab1234567890",
    "period": {
      "startDate": "2025-09-01T00:00:00.000Z",
      "endDate": "2025-09-24T23:59:59.999Z"
    },
    "totalUsers": 305,
    "checkpoints": [
      {
        "id": "chkpt_001",
        "name": "Tutorial Complete",
        "count": 287,
        "percentage": 94.1,
        "avgTimeToReach": 423
      },
      {
        "id": "chkpt_002",
        "name": "Level 1 Complete",
        "count": 256,
        "percentage": 83.9,
        "avgTimeToReach": 1256
      },
      {
        "id": "chkpt_003",
        "name": "Level 2 Complete",
        "count": 198,
        "percentage": 64.9,
        "avgTimeToReach": 3421
      }
      // ... more checkpoints
    ]
  }
}
```

### User Journey Data

#### GET /api/analytics/enhanced/journey/user/:userId

Get journey data for a specific user.

**Request:**

```bash
curl -X GET "http://localhost:3000/api/analytics/enhanced/journey/user/user_123456" \
  -H "X-API-Key: lvl_abcdef1234567890abcdef1234567890"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "user_123456",
    "checkpoints": [
      {
        "id": "chkpt_001",
        "name": "Tutorial Complete",
        "timestamp": "2025-09-20T14:30:45.000Z",
        "metadata": {
          "score": 1000,
          "timeTaken": 320
        }
      },
      {
        "id": "chkpt_002",
        "name": "Level 1 Complete",
        "timestamp": "2025-09-20T14:42:12.000Z",
        "metadata": {
          "score": 12500,
          "timeTaken": 345,
          "attempts": 2
        }
      }
      // ... more checkpoints
    ]
  }
}
```

## Error Handling

All endpoints return standard error responses when something goes wrong:

**Example 404 Error:**

```json
{
  "success": false,
  "error": "Resource not found"
}
```

**Example 400 Error:**

```json
{
  "success": false,
  "error": "Invalid request parameters"
}
```

**Example 401 Error:**

```json
{
  "success": false,
  "error": "Invalid API key"
}
```

**Example 500 Error:**

```json
{
  "success": false,
  "error": "Internal server error"
}
```
