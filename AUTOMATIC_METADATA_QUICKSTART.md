# Automatic Event Metadata - Quick Reference

## What's Automatic

When you track an event:
```csharp
LvlUpManager.Instance.TrackEvent("level_complete", properties);
```

The SDK **automatically** captures and sends:

### Device Info ✅
- Device model (e.g., "TECNO BG6", "iPhone 14")
- Manufacturer (e.g., "TECNO", "Apple")
- Device unique ID

### Platform Info ✅
- Platform (android, ios, webgl)
- OS version (e.g., "android 13", "iOS 16.0")

### App Info ✅
- App version (e.g., "0.0.3")
- App build number
- Bundle ID (e.g., "com.mildmania.packperfect")

### Engine Info ✅
- Unity version (e.g., "unity 2022.3.62")
- SDK version

### Network Info ✅
- Connection type (wifi, wwan, offline)

### Session Info ✅
- Session ID
- Session number (lifetime count)

### Event Info ✅
- Unique event UUID
- Client timestamp
- Server timestamp

## No Configuration Needed

❌ **You DON'T need to**:
```csharp
// This is NOT needed - SDK does it automatically!
var deviceInfo = new DeviceInfo {
    platform = "android",
    device = "..."
    // etc.
};
```

✅ **Just track events**:
```csharp
// This is all you need!
LvlUpManager.Instance.TrackEvent("button_click", new Dictionary<string, object>
{
    { "button_id", "play" },
    { "screen", "main_menu" }
});
```

## What Gets Stored

Every event in your database includes:

```
Event Table:
├── eventName: "level_complete"
├── properties: { level: 5, score: 1000 }
├── timestamp: "2026-01-06T14:30:00Z"
├── eventUuid: "6a2c..."
├── clientTs: 1704551400
├── platform: "android"
├── osVersion: "android 13"
├── manufacturer: "TECNO"
├── device: "TECNO BG6"
├── deviceId: "d800..."
├── appVersion: "0.0.3"
├── appBuild: "30087"
├── bundleId: "com.mildmania.packperfect"
├── engineVersion: "unity 2022.3.62"
├── sdkVersion: "unity 1.0.0"
├── connectionType: "wwan"
└── sessionNum: 2
```

## Analytics Queries

### By Platform
```sql
SELECT platform, COUNT(*) 
FROM events 
WHERE gameId = 'xxx' 
GROUP BY platform;
```

### By Device
```sql
SELECT manufacturer, device, COUNT(*) 
FROM events 
WHERE gameId = 'xxx' 
GROUP BY manufacturer, device
ORDER BY COUNT(*) DESC;
```

### By App Version
```sql
SELECT appVersion, COUNT(*) 
FROM events 
WHERE gameId = 'xxx' 
GROUP BY appVersion;
```

### By Connection Type
```sql
SELECT connectionType, COUNT(*) 
FROM events 
WHERE gameId = 'xxx' 
GROUP BY connectionType;
```

## Example Use Cases

### 1. Device-Specific Issues
Find events from a specific device model:
```sql
WHERE device = 'TECNO BG6'
```

### 2. Version Comparison
Compare event patterns across app versions:
```sql
WHERE appVersion IN ('0.0.2', '0.0.3')
```

### 3. Platform Optimization
See which platform has most engagement:
```sql
GROUP BY platform
```

### 4. Network Analysis
Track offline vs online behavior:
```sql
WHERE connectionType = 'offline'
```

### 5. User Loyalty
Track returning users via session count:
```sql
WHERE sessionNum > 10
```

## Benefits

✨ **Zero effort**: All metadata captured automatically
📊 **Rich insights**: Segment by device, platform, version, network
🐛 **Better debugging**: Know exact device/version for issues
📈 **Trend analysis**: Track metrics across versions
🎯 **User segmentation**: Target specific platforms or devices

## Summary

Just call `TrackEvent()` - we'll capture everything else automatically! 🚀

