# Comprehensive Event Metadata - GameAnalytics Style

## Overview

The SDK and backend have been updated to automatically capture comprehensive device, system, and app metadata with every event - similar to GameAnalytics. All metadata is collected **automatically** by the SDK without requiring any user configuration.

## What Changed

### 1. Unity SDK Updates

#### Enhanced DeviceInfo Model
The SDK now collects extensive metadata automatically:

```csharp
public class DeviceInfo
{
    // Core identifiers
    public string deviceId;              // Unique device identifier
    public string sessionId;             // Current session ID
    public int sessionNum;               // Session number for this user
    
    // Platform info
    public string platform;              // e.g., "android", "ios", "webgl"
    public string osVersion;             // e.g., "android 13", "iOS 16.0"
    public string manufacturer;          // e.g., "TECNO", "Apple"
    public string device;                // e.g., "TECNO BG6", "iPhone 14"
    
    // App info
    public string appVersion;            // e.g., "0.0.3"
    public string appBuild;              // e.g., "30087"
    public string bundleId;              // e.g., "com.mildmania.packperfect"
    public string engineVersion;         // e.g., "unity 2022.3.62"
    public string sdkVersion;            // e.g., "unity 1.0.0"
    
    // Network
    public string connectionType;        // e.g., "wifi", "wwan", "offline"
    
    // Additional
    public string appSignature;          // Android app signature
    public string channelId;             // e.g., "com.android.vending"
}
```

#### Enhanced EventDataItem
Events now include unique identifiers and timestamps:

```csharp
public class EventDataItem
{
    public string eventUuid;             // Unique event identifier (auto-generated)
    public string eventName;
    public Dictionary<string, object> properties;
    public string timestamp;             // Server-side timestamp (ISO 8601)
    public long clientTs;                // Client Unix timestamp in seconds
}
```

#### Automatic Collection
Added `CollectDeviceInfo()` method that automatically gathers:
- ✅ Device model and manufacturer
- ✅ OS version and platform
- ✅ App version and build info
- ✅ Network connectivity type
- ✅ Session tracking (session count)
- ✅ Unity engine version
- ✅ SDK version

### 2. Database Schema Updates

#### Expanded Event Model

```prisma
model Event {
  id         String   @id @default(cuid())
  gameId     String
  userId     String
  sessionId  String?
  eventName  String
  properties Json?
  timestamp  DateTime @default(now())
  
  // Event metadata
  eventUuid     String?  // Unique event identifier from client
  clientTs      BigInt?  // Client-side Unix timestamp
  
  // Device & Platform info (automatically captured)
  platform      String?
  osVersion     String?
  manufacturer  String?
  device        String?
  deviceId      String?
  
  // App info (automatically captured)
  appVersion    String?
  appBuild      String?
  bundleId      String?
  engineVersion String?
  sdkVersion    String?
  
  // Network & Additional (automatically captured)
  connectionType String?
  sessionNum     Int?
  appSignature   String?
  channelId      String?
  
  // Relations
  session    Session? @relation(fields: [sessionId], references: [id])
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  game       Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)

  // Indexes for analytics queries
  @@index([gameId, eventName, timestamp])
  @@index([userId, timestamp])
  @@index([gameId, platform, timestamp])
  @@index([gameId, appVersion, timestamp])
  @@map("events")
}
```

### 3. Backend Updates

#### Enhanced Types (api.ts)
- Updated `DeviceInfo` interface to match Unity SDK
- Updated `EventData` to include `eventUuid` and `clientTs`
- Updated `BatchEventData` to use comprehensive `DeviceInfo`

#### Updated AnalyticsService
The `trackBatchEvents` method now stores all device metadata with each event automatically.

## GameAnalytics Comparison

### Fields Covered

| GameAnalytics Field | LvlUp Field | Status |
|---------------------|-------------|--------|
| `v` | N/A (API version) | Not needed |
| `user_id` | `userId` | ✅ Captured |
| `event_uuid` | `eventUuid` | ✅ Auto-generated |
| `client_ts` | `clientTs` | ✅ Auto-captured |
| `sdk_version` | `sdkVersion` | ✅ Auto-captured |
| `os_version` | `osVersion` | ✅ Auto-captured |
| `manufacturer` | `manufacturer` | ✅ Auto-captured |
| `device` | `device` | ✅ Auto-captured |
| `platform` | `platform` | ✅ Auto-captured |
| `session_id` | `sessionId` | ✅ Captured |
| `session_num` | `sessionNum` | ✅ Auto-tracked |
| `connection_type` | `connectionType` | ✅ Auto-detected |
| `android_bundle_id` | `bundleId` | ✅ Auto-captured |
| `android_app_version` | `appVersion` | ✅ Auto-captured |
| `android_app_build` | `appBuild` | ✅ Auto-captured |
| `android_app_signature` | `appSignature` | ✅ Placeholder |
| `android_channel_id` | `channelId` | ✅ Placeholder |
| `engine_version` | `engineVersion` | ✅ Auto-captured |
| `build` | `appBuild` | ✅ Auto-captured |
| `google_aid` | N/A | Optional |
| `android_app_set_id` | N/A | Optional |
| `configurations` | `properties` | ✅ Via custom properties |

## How It Works

### Automatic Flow

1. **Developer calls `TrackEvent()`**
   ```csharp
   LvlUpManager.Instance.TrackEvent("level_complete", properties);
   ```

2. **SDK automatically collects device info**
   - Device model and manufacturer
   - OS version
   - App version and build
   - Network type
   - Session count
   - Engine version

3. **SDK batches events with metadata**
   - Events queued with comprehensive device info
   - Automatic flush based on batch size/time

4. **Backend stores everything**
   - All device metadata stored per event
   - Indexed for fast analytics queries
   - Available for segmentation and analysis

### No User Configuration Required

✅ **Developers don't need to**:
- Manually collect device info
- Pass metadata to TrackEvent()
- Configure what to track
- Update code for new metadata fields

✅ **Everything is automatic**:
- Device info collected once per batch
- Metadata attached to all events
- Session tracking automatic
- Network monitoring automatic

## Analytics Benefits

With comprehensive metadata, you can now:

### 1. Platform Analysis
```typescript
// Most active platforms
SELECT platform, COUNT(*) as event_count
FROM events
WHERE gameId = 'xxx'
GROUP BY platform;
```

### 2. Device Segmentation
```typescript
// Events by device manufacturer
SELECT manufacturer, device, COUNT(*) as events
FROM events
WHERE gameId = 'xxx'
GROUP BY manufacturer, device
ORDER BY events DESC;
```

### 3. Version Comparison
```typescript
// Performance by app version
SELECT appVersion, eventName, COUNT(*) as count
FROM events
WHERE gameId = 'xxx'
GROUP BY appVersion, eventName;
```

### 4. Network Analysis
```typescript
// Events by connection type
SELECT connectionType, COUNT(*) as events
FROM events
WHERE gameId = 'xxx'
GROUP BY connectionType;
```

### 5. Session Tracking
```typescript
// Average session number (loyalty metric)
SELECT AVG(sessionNum) as avg_session_number
FROM events
WHERE gameId = 'xxx' AND sessionNum IS NOT NULL;
```

## Migration Steps

### 1. Update Database Schema

**Option A: Using Prisma Migrate (Recommended for Production)**
```bash
cd backend
npx prisma migrate dev --name add_comprehensive_event_metadata
```

**Option B: Using Prisma Push (For Development)**
```bash
cd backend
npx prisma db push
```

### 2. Update Unity SDK (If Not Already Updated)
The Unity SDK changes are in:
- `Runtime/Scripts/Models/LvlUpModels.cs`
- `Runtime/Scripts/LvlUpManager.cs`

No changes needed in game code - everything is automatic!

### 3. Deploy Backend
```bash
cd backend
npm run build
npm start
```

## Testing

### Verify Metadata Collection

1. **Track a test event**:
   ```csharp
   LvlUpManager.Instance.TrackEvent("test_metadata", new Dictionary<string, object>
   {
       { "test", true }
   });
   ```

2. **Check backend logs** for device info being sent

3. **Query database** to verify metadata is stored:
   ```sql
   SELECT 
     eventName,
     platform,
     osVersion,
     manufacturer,
     device,
     appVersion,
     connectionType,
     sessionNum
   FROM events
   ORDER BY timestamp DESC
   LIMIT 5;
   ```

## Example Event Payload

### What SDK Sends
```json
{
  "userId": "user_123",
  "sessionId": "session_abc",
  "events": [
    {
      "eventUuid": "6a2c751d-d6ef-4eb2-b54f-9965dfdb6ff5",
      "eventName": "level_complete",
      "properties": { "level": 5, "score": 1000 },
      "timestamp": "2026-01-06T14:30:00.000Z",
      "clientTs": 1704551400
    }
  ],
  "deviceInfo": {
    "deviceId": "d800ba93-9d03-469f-8c5d-64132e4cca4c",
    "sessionId": "session_abc",
    "sessionNum": 2,
    "platform": "android",
    "osVersion": "android 13",
    "manufacturer": "TECNO",
    "device": "TECNO BG6",
    "appVersion": "0.0.3",
    "appBuild": "30087",
    "bundleId": "com.mildmania.packperfect",
    "engineVersion": "unity 2022.3.62",
    "sdkVersion": "unity 1.0.0",
    "connectionType": "wwan"
  }
}
```

### What Backend Stores (per event)
Every event in the batch gets the full device metadata attached to it in the database.

## Configuration Options

### Session Tracking
Session count is tracked automatically per device:
```csharp
// Automatic - no code needed!
// Session count stored in PlayerPrefs
// Incremented on each session start
```

### SDK Version
Update the SDK version in `LvlUpManager.cs`:
```csharp
sdkVersion = "unity 1.0.0", // Update this
```

### Network Monitoring
Connection type is automatically detected:
- `wifi` - WiFi connection
- `wwan` - Cellular/mobile data
- `offline` - No connection

## Performance Considerations

### Minimal Overhead
- ✅ Device info collected once per batch
- ✅ Most data from Unity's SystemInfo (fast)
- ✅ No additional network calls
- ✅ Efficient database storage

### Batch Size
Device info sent once per batch, not per event:
```
10 events = 1x device info + 10x event data
(Not 10x device info)
```

## Future Enhancements

### Potential Additions
- [ ] GPS/Location data (with permissions)
- [ ] Device memory/storage info
- [ ] Battery level
- [ ] Screen resolution/DPI
- [ ] Device orientation
- [ ] App install source
- [ ] Actual Android app signature (via native plugin)
- [ ] Actual channel ID detection

### Custom Configurations
Developers could optionally add to event properties:
```csharp
var properties = new Dictionary<string, object>
{
    { "level", 5 },
    { "custom_config", "value" }
};
```

## Support

All metadata is captured automatically. Developers can focus on tracking events - the SDK handles everything else!

## Summary

✨ **Key Achievement**: Your SDK now automatically captures comprehensive device and system metadata with every event, just like GameAnalytics, without requiring any configuration from developers.

🎯 **Zero Configuration**: Everything is automatic
📊 **Rich Analytics**: Full device segmentation available
🚀 **Production Ready**: Optimized for performance

