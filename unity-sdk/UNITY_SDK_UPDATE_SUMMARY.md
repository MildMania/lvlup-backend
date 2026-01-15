# Unity SDK Update - Level Funnel Tracking

## Summary
Updated the Unity SDK to support the new level funnel tracking feature for A/B testing different level designs and tracking their performance separately in the analytics dashboard.

## Changes Made

### 1. Configuration (`LvlUpConfig.cs`)
**Added Properties:**
- `levelFunnel` (string): Level funnel name for tracking different level design iterations
  - Example: "live_v1", "live_v2", "test_hard"
- `levelFunnelVersion` (int): Level funnel version number (incremental)
  - Example: 1, 2, 3, etc.

**Purpose:** Configure globally which level funnel variant the game client is using.

### 2. Event Model (`LvlUpModels.cs`)
**Added to EventMetadata base class:**
- `levelFunnel` (string): Level funnel name
- `levelFunnelVersion` (int?): Level funnel version number

**Updated Methods:**
- `CopyTo()`: Now copies level funnel fields when converting events

**Purpose:** All events can now carry level funnel tracking information.

### 3. Manager (`LvlUpManager.cs`)
**Added Methods:**
- `SetLevelFunnel(string levelFunnel, int levelFunnelVersion)`: Set/update funnel config after initialization
  - **Recommended approach** for A/B tests and Remote Config
  - Allows fetching funnel assignment from backend before setting
  - Logs changes in debug mode
- `GetLevelFunnel()`: Retrieve current funnel configuration
  - Returns tuple: (funnel name, version number)
- `IsLevelEvent(string eventName)`: Helper to detect level-related events

**Updated Method:**
- `TrackEvent()`: Now automatically adds level funnel data to level events when configured
  - Detects events: `level_start`, `level_complete`, `level_failed`
  - Adds `levelFunnel` and `levelFunnelVersion` from config
  - Logs when funnel data is added (debug mode)

**Purpose:** Seamless integration + flexibility for dynamic configuration from backend.

### 4. Event Helpers (`LvlUpEvents.cs`)
**Added Method:**
- `TrackLevelStartWithFunnel()`: Override global funnel config for specific events
  - Parameters: levelId, levelFunnel, levelFunnelVersion, additionalProperties
  - Allows per-event funnel customization (advanced use case)

**Purpose:** Flexibility for advanced scenarios where different events need different funnel configurations.

### 5. Documentation Updates

#### API_REFERENCE.md
- Added `levelFunnel` and `levelFunnelVersion` to config properties section
- Added "Level Funnel Tracking" section with:
  - Use cases (A/B testing, version tracking, etc.)
  - Configuration examples
  - Automatic tracking explanation

#### QUICKSTART.md
- Added level funnel configuration to config options
- Added complete "Level Funnel Tracking" section with:
  - Setup example
  - Usage examples for all level events
  - Dashboard filtering explanation
  - Use case examples

#### CHANGELOG.md
- Added v1.1.0 release notes
- Documented all new features
- Listed changes and documentation updates

## How It Works

### Static Configuration (Simple, but not recommended for A/B tests)
```csharp
var config = new LvlUpConfig
{
    levelFunnel = "live_v1",        // Your level design variant
    levelFunnelVersion = 2           // Current version number
};
LvlUpManager.Initialize(apiKey, baseUrl, config);
```

### Dynamic Configuration (Recommended for A/B Tests & Remote Config)
```csharp
// Step 1: Initialize SDK without funnel config
LvlUpManager.Initialize(apiKey, baseUrl, config: null, onComplete: (success, message) =>
{
    if (success)
    {
        // Step 2: Fetch funnel assignment from backend
        LvlUpManager.Instance.GetRemoteConfig("level_funnel", (response) =>
        {
            string funnel = response.data["funnel"];        // e.g., "live_v1"
            int version = (int)response.data["version"];    // e.g., 2
            
            // Step 3: Set the funnel dynamically
            LvlUpManager.Instance.SetLevelFunnel(funnel, version);
            
            // Step 4: Now track level events
            LvlUpEvents.TrackLevelStart(1);
        });
    }
});
```

**Why Dynamic Configuration?**
- Avoids cyclic dependency (SDK needs to be initialized to fetch config)
- Allows server-side A/B test assignment
- Supports Remote Config for funnel management
- No need to rebuild app to change funnel

### Automatic Tracking
```csharp
// These events automatically get funnel data added:
LvlUpEvents.TrackLevelStart(1);
LvlUpEvents.TrackLevelComplete(1, 1000, 45.5f);
LvlUpEvents.TrackLevelFailed(1, "timeout", 120f);

// Backend receives:
// {
//   eventName: "level_start",
//   properties: { levelId: 1 },
//   levelFunnel: "live_v1",
//   levelFunnelVersion: 2
// }
```

### Backend Integration
The backend API already supports these fields:
- `Event` model has `levelFunnel` and `levelFunnelVersion` fields
- Level funnel service filters by exact funnel+version pairs
- Frontend dashboard allows multi-select filtering of funnels
- Analytics calculate metrics per funnel variant

## Use Cases

1. **A/B Testing Level Designs**
   - Set Group A to `levelFunnel: "live_v1"`
   - Set Group B to `levelFunnel: "live_v2"`
   - Compare win rates, completion times, churn rates

2. **Tracking Design Iterations**
   - Version 1: Initial level design
   - Version 2: Made levels easier based on feedback
   - Version 3: Added new mechanics
   - Compare metrics across versions

3. **Test vs Production Separation**
   - Production: `levelFunnel: "live_v1"`
   - Testing: `levelFunnel: "test_hard"`
   - Keep test data separate from production analytics

4. **Regional Variants**
   - US: `levelFunnel: "us_v1"`
   - EU: `levelFunnel: "eu_v1"`
   - Track performance by region

## Developer Experience

### Before (Manual)
```csharp
var props = new Dictionary<string, object>
{
    { "levelId", 1 },
    { "levelFunnel", "live_v1" },        // Had to add manually
    { "levelFunnelVersion", 2 }          // Had to add manually
};
LvlUpManager.Instance.TrackEvent("level_start", props);
```

### After (Automatic - Static Config)
```csharp
// Configure once at initialization
var config = new LvlUpConfig { levelFunnel = "live_v1", levelFunnelVersion = 2 };
LvlUpManager.Initialize(apiKey, baseUrl, config);

// Track events normally - funnel data added automatically
LvlUpEvents.TrackLevelStart(1);
```

### After (Automatic - Dynamic Config - RECOMMENDED)
```csharp
// Initialize SDK
LvlUpManager.Initialize(apiKey, baseUrl, config: null, onComplete: (success, msg) =>
{
    if (success)
    {
        // Fetch funnel from backend (Remote Config or A/B Test)
        FetchFunnelFromBackend((funnel, version) =>
        {
            // Set funnel dynamically
            LvlUpManager.Instance.SetLevelFunnel(funnel, version);
            
            // Track events - funnel data added automatically
            LvlUpEvents.TrackLevelStart(1);
        });
    }
});
```

## Testing Checklist

- [x] LvlUpConfig has new fields
- [x] EventMetadata includes funnel fields
- [x] LvlUpManager detects level events
- [x] LvlUpManager adds funnel data automatically
- [x] IsLevelEvent helper works correctly
- [x] CopyTo includes funnel fields
- [x] Documentation updated
- [x] Examples provided
- [x] CHANGELOG updated

## Breaking Changes
**None** - This is a backwards-compatible addition. Existing code continues to work without changes.

## Next Steps for Game Developers

### Recommended Approach (Dynamic Configuration)

1. Update to Unity SDK v1.1.0
2. Initialize SDK without funnel config:
   ```csharp
   LvlUpManager.Initialize(apiKey, baseUrl, config: null, onComplete: OnSdkReady);
   ```
3. Fetch funnel assignment from backend (Remote Config or A/B Test):
   ```csharp
   void OnSdkReady(bool success, string message)
   {
       if (success)
       {
           // Fetch from your backend
           LvlUpManager.Instance.GetRemoteConfig("level_funnel", (response) =>
           {
               string funnel = response.data["funnel"];
               int version = (int)response.data["version"];
               
               // Set dynamically
               LvlUpManager.Instance.SetLevelFunnel(funnel, version);
               
               // Start game
               StartGame();
           });
       }
   }
   ```
4. Track level events normally - funnel data added automatically
5. View analytics in dashboard filtered by funnel
6. Compare metrics to optimize level design!

### Alternative: Static Configuration (Simple)

1. Update to Unity SDK v1.1.0
2. Add level funnel configuration to your initialization:
   ```csharp
   var config = new LvlUpConfig
   {
       levelFunnel = "live_v1",  // Your funnel name
       levelFunnelVersion = 1     // Your version
   };
   LvlUpManager.Initialize(apiKey, baseUrl, config);
   ```
3. Deploy to different groups with different funnel names
4. View analytics in dashboard filtered by funnel
5. Compare metrics to optimize level design!

**Note:** Dynamic configuration is recommended because it allows server-side funnel assignment without rebuilding your app.

## Dashboard Integration
The backend dashboard now supports:
- Multi-select funnel filter (e.g., select "live_v1 (1)" and "live_v1 (2)")
- Exact funnel+version pair matching
- Metrics calculated per funnel:
  - Win Rate, Fail Rate
  - Churn (Start→Complete, Complete→Next)
  - APS (Attempts Per Success)
  - Completion/Fail durations
  - Booster usage, EGP rate
  - Custom metrics

---

**Version:** 1.1.0  
**Date:** January 14, 2026  
**Status:** ✅ Complete and Ready for Use

