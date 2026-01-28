# Database Redundancy Analysis

## Analysis Date: January 28, 2026

## Current Situation
- Database growing 100MB/day
- PostgreSQL memory crash fixed (batch processing deployed)
- 5,000 users causing performance issues
- Need to reduce database size WITHOUT deleting historical data

---

## Redundant Data Found

### 1. **Event Table - Duplicate Location Fields** ⚠️ HIGH IMPACT

**Problem:** You have BOTH `country` AND `countryCode` storing the same data
```prisma
country     String? // ISO country code, e.g., "US", "TR"
countryCode String? // ISO 3166-1 alpha-2, e.g., "US"
```

**Impact:** 
- Storing country twice in every event
- With millions of events, this is significant waste
- Both fields contain the same ISO code

**Recommendation:** Keep `countryCode`, drop `country`
- All your indexes use `countryCode`
- Session table uses `countryCode`
- Consistent naming convention

**Estimated Savings:** ~5-10% of Event table size

---

### 2. **Event Table - Redundant Device/Platform Info** ⚠️ MEDIUM IMPACT

**Problem:** Device info is stored in BOTH Event AND User tables
```prisma
Event:
  platform     String? // Stored per event
  deviceId     String? // Stored per event
  
User:
  deviceId     String? // Also stored per user
  platform     String? // Also stored per user
```

**Questions:**
1. Does a user's device/platform change between events?
2. Do you need historical device changes, or just current device?
3. Are you tracking multi-device users?

**Options:**
- **Option A:** Store device info ONLY in User table (if device doesn't change)
- **Option B:** Store device info ONLY in Event table (if you need history)
- **Option C:** Keep in Event, remove from User (recommended)

**Estimated Savings:** ~3-5% of Event table size

---

### 3. **Event Table - Redundant Version/Platform in Session** ⚠️ MEDIUM IMPACT

**Problem:** Version and platform stored in multiple places
```prisma
Session:
  platform      String?
  version       String?
  
Event:
  platform     String?
  appVersion   String?
  
User:
  platform      String?
  version       String?
```

**Current Logic:**
- Event has its own platform/version
- Event links to Session (which has platform/version)
- User also stores platform/version

**Recommendation:** 
- Keep in Session and Event (for flexibility)
- Remove from User table (use most recent session instead)

**Estimated Savings:** ~2-3% of User table size

---

### 4. **Event Metadata - Rarely Used Fields** ⚠️ LOW-MEDIUM IMPACT

**Fields that are likely NULL for most events:**
```prisma
manufacturer String? // How often is this filled?
device       String? // How often is this filled?
osVersion    String? // How often is this filled?
latitude     Float?  // Geographic data
longitude    Float?  // Geographic data
city         String? // Geographic data
region       String? // Geographic data
timezone     String? // Geographic data
connectionType String? // Network info
appSignature   String? // Android specific
channelId      String? // Distribution channel
```

**I can run analysis to check:**
- What % of events have each field populated
- Which fields are always NULL
- Which fields have value

**Action Required:** Let me analyze your actual data first

---

### 5. **Crash Logs - Duplicate Device Info** ⚠️ LOW IMPACT

**Problem:** Same device info as Events
```prisma
CrashLog:
  platform     String?
  osVersion    String?
  manufacturer String?
  device       String?
  deviceId     String?
  appVersion   String?
  appBuild     String?
  bundleId     String?
  engineVersion String?
  sdkVersion    String?
```

**Note:** Crash logs are separate, so duplication is reasonable for independence
**Recommendation:** Keep as-is (crash logs should be self-contained)

---

## Questions for You

### Question 1: Event.country vs Event.countryCode
**Can I drop the `country` field from Event table?**
- ✅ Keep: `countryCode` (ISO standard, used in indexes)
- 🗑️ Drop: `country` (duplicate data)

**This is safe because:**
- Both store the same ISO code
- All queries use `countryCode`
- No data loss (same information)

---

### Question 2: Device Info Storage Strategy
**Where should device info be stored?**

**Option A: Remove from User table**
- User.deviceId → Drop
- User.platform → Drop
- Keep in Event and Session (more granular)

**Option B: Remove from Event table**
- Event.deviceId → Drop
- Event.platform → Drop (use Session.platform instead)
- Smaller events, reference session for device info

**Option C: Keep everything (safest, but most space)**

**My recommendation:** Option A (remove from User, keep in Event/Session)

---

### Question 3: Analyze Actual Usage
**Should I run analysis to check which Event fields are actually used?**

I can run queries to check:
- What % of events have `manufacturer` filled?
- What % of events have `latitude/longitude`?
- What % of events have `connectionType`?
- Which fields are always NULL?

This will tell us which fields are wasting space.

---

## Safe Actions (No Data Loss)

These changes only remove redundant storage, not actual data:

1. ✅ Drop `Event.country` (keep `countryCode`)
2. ✅ Drop `User.platform` (use Session.platform)
3. ✅ Drop `User.deviceId` (use Event.deviceId)
4. ✅ Drop `User.version` (use Session.version)

**Total Estimated Savings:** 10-15% of database size

---

## What I Need From You

1. **Approve dropping duplicate country field?** (Event.country)
2. **Approve removing device info from User table?** (deviceId, platform, version)
3. **Want me to analyze which Event fields are actually used?**

Once you approve, I'll:
1. Create migration scripts
2. Back up existing data
3. Drop redundant columns
4. Verify no queries break

**No historical data will be deleted** - just removing duplicate storage.

