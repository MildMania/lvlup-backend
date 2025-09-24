# API Endpoint Specifications

## Engagement Metrics Endpoints

### 1. Session Count Analytics

```
GET /analytics/metrics/session-count
```

**Query Parameters:**

- `startDate` (string, optional): Start date in ISO format
- `endDate` (string, optional): End date in ISO format
- `country` (string|string[], optional): Filter by country or countries
- `platform` (string|string[], optional): Filter by platform(s)
- `version` (string|string[], optional): Filter by app version(s)
- `days` (string, optional): Comma-separated list of days (e.g., "1,3,7,14,30") for day-specific analysis
- `groupBy` (string, optional): Group results by "day", "week", "month" (default: "day")

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-09-01",
      "sessionCounts": {
        "average": 2.5,
        "median": 2,
        "distribution": {
          "1": 150,
          "2-5": 300,
          "6-10": 120,
          "10+": 50
        }
      }
    }
    // Additional dates...
  ]
}
```

### 2. Session Length Analytics

```
GET /analytics/metrics/session-length
```

**Query Parameters:**

- Same as session count endpoint, plus:
- `durationType` (string, optional): "average", "total", "distribution" (default: all)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-09-01",
      "sessionLength": {
        "average": 450, // in seconds
        "median": 380,
        "total": 280000,
        "distribution": {
          "<1min": 120,
          "1-5min": 250,
          "5-15min": 180,
          "15-30min": 90,
          "30min+": 30
        }
      }
    }
    // Additional dates...
  ]
}
```

## Player Journey Endpoints

### 1. Checkpoint Management

```
POST /analytics/journey/checkpoints
```

**Request Body:**

```json
{
  "name": "Tutorial Completed",
  "description": "Player has finished the onboarding tutorial",
  "type": "tutorial",
  "tags": ["onboarding", "new_user"],
  "order": 1
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "ck12345",
    "name": "Tutorial Completed",
    "description": "Player has finished the onboarding tutorial",
    "type": "tutorial",
    "tags": ["onboarding", "new_user"],
    "order": 1,
    "createdAt": "2025-09-24T10:30:00Z"
  }
}
```

### 2. Record Player Checkpoint

```
POST /analytics/journey/record
```

**Request Body:**

```json
{
  "userId": "user123", // or externalId
  "checkpointId": "ck12345",
  "metadata": {
    "timeSpent": 120, // optional additional data
    "attempts": 2
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "pc12345",
    "userId": "user123",
    "checkpointId": "ck12345",
    "timestamp": "2025-09-24T10:35:00Z"
  }
}
```

### 3. Journey Progress Analytics

```
GET /analytics/journey/progress
```

**Query Parameters:**

- Standard filters (startDate, endDate, country, platform, version)
- `checkpointType` (string|string[], optional): Filter by checkpoint type(s)
- `tags` (string|string[], optional): Filter by checkpoint tag(s)
- `format` (string, optional): "funnel", "timeline", "completion" (default: "funnel")

**Response:**

```json
{
  "success": true,
  "data": {
    "totalUsers": 1000,
    "checkpoints": [
      {
        "id": "ck1",
        "name": "App Install",
        "count": 1000,
        "percentage": 100,
        "avgTimeToReach": 0
      },
      {
        "id": "ck2",
        "name": "Tutorial Started",
        "count": 950,
        "percentage": 95,
        "avgTimeToReach": 60 // seconds from install
      },
      {
        "id": "ck3",
        "name": "Tutorial Completed",
        "count": 800,
        "percentage": 80,
        "avgTimeToReach": 600
      }
      // Additional checkpoints...
    ]
  }
}
```

### 4. Get User Journey

```
GET /analytics/journey/user/:userId
```

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "checkpoints": [
      {
        "id": "ck1",
        "name": "App Install",
        "timestamp": "2025-09-20T14:30:00Z"
      },
      {
        "id": "ck2",
        "name": "Tutorial Started",
        "timestamp": "2025-09-20T14:32:00Z"
      }
      // More checkpoints...
    ]
  }
}
```
