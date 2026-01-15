# Session Heartbeat Implementation

## Overview

Implemented a **heartbeat-based session management system** that automatically closes sessions when the client stops sending heartbeats. This is much more robust than relying on app lifecycle events, especially for Android apps that get killed.

## How It Works

### 1. Client Side (Unity SDK)

The client sends a heartbeat every 30-60 seconds while the session is active:

```csharp
// In your Unity SDK
public class SessionManager : MonoBehaviour
{
    private string currentSessionId;
    private float heartbeatInterval = 30f; // Send heartbeat every 30 seconds
    private float lastHeartbeatTime;
    
    void Update()
    {
        if (!string.IsNullOrEmpty(currentSessionId))
        {
            // Send heartbeat periodically
            if (Time.realtimeSinceStartup - lastHeartbeatTime >= heartbeatInterval)
            {
                SendHeartbeat();
                lastHeartbeatTime = Time.realtimeSinceStartup;
            }
        }
    }
    
    private void SendHeartbeat()
    {
        StartCoroutine(SendHeartbeatCoroutine());
    }
    
    private IEnumerator SendHeartbeatCoroutine()
    {
        string url = $"{apiBaseUrl}/api/analytics/sessions/{currentSessionId}/heartbeat";
        
        using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
        {
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("X-API-Key", apiKey);
            request.timeout = 5; // 5 second timeout
            
            yield return request.SendWebRequest();
            
            if (request.result == UnityWebRequest.Result.Success)
            {
                Debug.Log("Heartbeat sent successfully");
            }
            else
            {
                Debug.LogWarning($"Heartbeat failed: {request.error}");
                // Don't worry about failures - backend will close session automatically
            }
        }
    }
}
```

### 2. Backend Side

The backend automatically closes sessions that haven't received a heartbeat within the timeout period (3 minutes by default).

#### Components

**SessionHeartbeatService** (`src/services/SessionHeartbeatService.ts`)
- Runs every 60 seconds
- Checks for sessions with no recent heartbeat
- Automatically closes inactive sessions
- Calculates duration based on last heartbeat time

**Configuration:**
- `HEARTBEAT_TIMEOUT_SECONDS`: 180 (3 minutes) - Session closes if no heartbeat for this long
- `CLEANUP_INTERVAL_SECONDS`: 60 (1 minute) - How often to check for stale sessions

## API Endpoints

### Send Heartbeat
```
POST /api/analytics/sessions/:sessionId/heartbeat
Headers:
  X-API-Key: your-api-key

Response:
{
  "success": true,
  "data": {
    "sessionId": "session-id",
    "timestamp": "2026-01-15T12:00:00.000Z"
  }
}
```

### Start Session (unchanged)
```
POST /api/analytics/sessions
```

### End Session (still supported, but optional)
```
PUT /api/analytics/sessions/:sessionId
```

## Database Schema

Added `lastHeartbeat` field to the Session model:

```prisma
model Session {
  id            String    @id @default(cuid())
  gameId        String
  userId        String
  startTime     DateTime  @default(now())
  endTime       DateTime?
  duration      Int?
  lastHeartbeat DateTime? // NEW: Track last heartbeat
  platform      String?
  version       String?
  // ...
  
  @@index([endTime, lastHeartbeat]) // NEW: Index for heartbeat queries
}
```

## Benefits of Heartbeat Approach

### ✅ Handles Android App Kills
- App gets killed → Heartbeats stop → Backend auto-closes session
- No need to send explicit end session event

### ✅ Handles Crashes
- App crashes → Heartbeats stop → Backend auto-closes session
- Accurate crash detection

### ✅ Handles Network Issues
- Temporary network loss → Heartbeats resume → Session stays open
- Extended network loss → Session closes → New session on reconnect

### ✅ Accurate Duration Tracking
- Duration calculated from `startTime` to `lastHeartbeat`
- More accurate than relying on explicit end events

### ✅ Battery Efficient
- Only sends small HTTP POST every 30-60 seconds
- No background processes needed
- Lightweight payload

### ✅ Self-Healing
- Missed heartbeats don't break anything
- System recovers automatically
- No data loss

## Recommended Unity Implementation

### Heartbeat Frequency
- **30 seconds**: Good balance (recommended)
- **60 seconds**: More battery efficient, slightly less accurate
- **15 seconds**: Very accurate, but more network usage

### Implementation Tips

1. **Don't worry about failed heartbeats** - Backend will handle it
2. **Send heartbeat in Update loop** - Simple and reliable
3. **Use Fire-and-forget** - Don't block on heartbeat responses
4. **Stop heartbeats on pause** - Save battery when app is in background

```csharp
void OnApplicationPause(bool pauseStatus)
{
    if (pauseStatus)
    {
        // App going to background - stop sending heartbeats
        // Backend will auto-close session after 3 minutes
        StopHeartbeats();
    }
    else
    {
        // App returning to foreground - start new session
        StartNewSession();
    }
}
```

## Migration Guide

### For Existing Sessions

Existing sessions without `lastHeartbeat` will be closed by the heartbeat service after they've been open for more than 3 minutes without a heartbeat.

### Database Migration

Run the Prisma migration:

```bash
cd backend
npx prisma migrate dev --name add_session_heartbeat
# or for production
npx prisma migrate deploy
```

### Unity SDK Update

1. Add heartbeat sending logic to your SessionManager
2. Send heartbeat every 30-60 seconds
3. Stop heartbeats on app pause/quit (optional - backend handles it)

## Monitoring

The service logs important information:

```
[INFO] Starting session heartbeat service (checking every 60s, timeout: 180s)
[INFO] Found 5 inactive sessions to close
[INFO] Inactive session cleanup complete: 5 closed, 0 errors
[INFO] Inactive sessions by platform: { android: 3, ios: 2 }
```

### Get Statistics

The service provides statistics method (can be exposed as admin endpoint):

```typescript
const stats = await sessionHeartbeatService.getHeartbeatStats();
// Returns:
// {
//   totalSessions: 1000,
//   activeSessions: 50,      // Sessions with recent heartbeat
//   inactiveSessions: 10,    // Sessions past timeout
//   closedSessions: 940,     // Sessions with endTime
//   openSessions: 60         // Sessions without endTime
// }
```

## Testing

### Test Heartbeat Flow

1. Start a session → Get sessionId
2. Send heartbeat every 30 seconds → Check `lastHeartbeat` in database
3. Stop sending heartbeats → Wait 3+ minutes → Check session is closed
4. Verify `endTime` and `duration` are set correctly

### Test App Kill Scenario

1. Start a session
2. Send 2-3 heartbeats
3. Force kill the app
4. Wait 3+ minutes
5. Check database → Session should be closed with correct duration

### Test Network Loss

1. Start a session
2. Disable network for 1 minute
3. Re-enable network
4. Continue sending heartbeats
5. Session should remain open

## Configuration

Adjust timeout values in `SessionHeartbeatService.ts`:

```typescript
private readonly HEARTBEAT_TIMEOUT_SECONDS = 180; // Adjust based on your needs
private readonly CLEANUP_INTERVAL_SECONDS = 60;   // How often to check
```

**Recommendations:**
- Short timeout (60-120s): More accurate, but less forgiving of network issues
- Long timeout (180-300s): More forgiving, but sessions may appear longer than they were
- **Default 180s (3 minutes)**: Good balance

## Summary

The heartbeat system provides:
- ✅ Robust session management for Android
- ✅ Automatic session closure on app kill/crash
- ✅ Accurate duration tracking
- ✅ No client-side complexity
- ✅ Battery efficient
- ✅ Self-healing

This is a production-ready solution used by major analytics platforms like Firebase, Amplitude, and Mixpanel.

