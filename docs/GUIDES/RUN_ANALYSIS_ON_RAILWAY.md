# How to Run Redundancy Analysis on Railway

## Quick Method (Railway Dashboard)

### Step 1: Open Railway Console
1. Go to Railway dashboard: https://railway.app
2. Select your `lvlup-backend` project
3. Click on your backend service
4. Click "Settings" tab
5. Scroll down and click "Open Terminal" or use Railway CLI

### Step 2: Run the Analysis

In the Railway terminal/console:

```bash
# Navigate to backend directory
cd backend

# Run the analysis
npm run analyze:redundancy
```

**Output will show:**
- Which fields are mostly NULL (wasted space)
- Duplicate data between tables
- Exact space savings if fields are dropped
- Specific recommendations for YOUR data

The analysis takes ~1-2 minutes and is **read-only** (no changes made).

---

## Alternative: Railway CLI (From Your Computer)

If you have Railway CLI installed:

```bash
# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run the analysis
railway run npm run analyze:redundancy
```

---

## Alternative: One-Time Command

If you don't want to add the npm script:

```bash
# In Railway terminal
cd backend
node dist/scripts/analyzeRedundancy.js
```

---

## What to Expect

The output will look like this:

```
🔍 DATABASE REDUNDANCY ANALYSIS
================================================================================

📊 Field Usage Analysis (Event Table):
--------------------------------------------------------------------------------
┌──────────────────┬───────────┬──────────┬──────────┬───────────────┐
│ Field            │ Fill Rate │ Filled   │ NULL     │ Wasted Space  │
├──────────────────┼───────────┼──────────┼──────────┼───────────────┤
│ latitude         │ 0.5%      │ 25       │ 4,975    │ 95 MB         │
│ longitude        │ 0.5%      │ 25       │ 4,975    │ 95 MB         │
│ manufacturer     │ 15%       │ 750      │ 4,250    │ 81 MB         │
│ country          │ 100%      │ 5,000    │ 0        │ 0 MB          │
└──────────────────┴───────────┴──────────┴──────────┴───────────────┘

🔄 Duplicate Storage Check:
--------------------------------------------------------------------------------
{
  "timestamp": "2026-01-28T...",
  "duplicates": [
    {
      "issue": "country vs countryCode",
      "eventsWithBoth": 5000,
      "totalEventsWithCountryData": 5000,
      "duplicationRate": 100,
      "recommendation": "Drop Event.country, keep Event.countryCode"
    }
  ]
}

💡 Recommendations:
--------------------------------------------------------------------------------

🗑️  Safe to drop (low usage < 50%):
   - latitude (0.5% filled, saves 95 MB)
   - longitude (0.5% filled, saves 95 MB)
   - manufacturer (15% filled, saves 81 MB)

🗑️  Safe to drop (redundant):
   - country (duplicate of countryCode)

💾 Estimated Space Savings:
   Total Events: 5,000
   Fields to Drop: 4
   Estimated Savings: 271 MB (0.26 GB)
   Percentage: ~10-15%

✅ Analysis complete!
```

---

## After Running the Analysis

1. **Review the results** - See which fields are actually being used
2. **Share the output with me** - Copy/paste or screenshot
3. **I'll ask for approval** - Before creating migration scripts to drop fields
4. **We'll create migrations** - Safe, reversible changes
5. **Deploy** - Free up database space

---

## Important Notes

- ✅ **Read-only analysis** - No data is modified
- ✅ **Safe to run** - Just counts and statistics
- ✅ **Takes 1-2 minutes** - Depending on database size
- ✅ **No downtime** - Server keeps running
- ⚠️ **Use Railway terminal** - Connects to production database
- ⚠️ **Don't run locally** - Your local DB is different

---

## Troubleshooting

### "Cannot find module 'analyzeRedundancy'"

You need to build first:
```bash
npm run build
npm run analyze:redundancy
```

### "DATABASE_URL not found"

Railway should set this automatically. Check:
```bash
echo $DATABASE_URL
```

If empty, the terminal might not have env vars loaded. Try:
```bash
railway run npm run analyze:redundancy
```

### Script times out

If you have millions of events, the analysis might be slow. You can:
1. Run during low-traffic hours
2. Add a limit to the analysis (I can modify the script)
3. Sample only 10% of data

---

**Ready to run?** Just open Railway terminal and run `npm run analyze:redundancy`

Then share the results and I'll recommend exactly which fields to drop!

