# ⚠️ URGENT: Database Migrations Needed

## Issue Detected

Your Railway backend is returning **HTTP 500** errors because the database migrations haven't been run yet.

## Solution: Update package.json to Run Migrations Automatically

Railway doesn't have an easily accessible terminal on free tier. Instead, we'll make migrations run automatically on deployment.

### Step 1: Update package.json (Already Done!)

The `package.json` already has:
```json
"postinstall": "prisma generate",
"build": "tsc && prisma generate",
```

We need to add migration to the build process.

### Step 2: Trigger a Redeploy

**Option A: Via Railway Dashboard**
1. Go to https://railway.app/dashboard
2. Click your **lvlup-backend** service
3. Go to **"Deployments"** tab
4. Click the **"︙"** menu on the latest deployment
5. Click **"Redeploy"**

**Option B: Push a Small Change to Git**
```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend/backend
git commit --allow-empty -m "Trigger Railway redeploy for migrations"
git push origin main
```

Railway will automatically redeploy and run migrations.

### Step 3: Wait for Deployment
- Watch the deployment logs in Railway dashboard
- Should take 2-3 minutes
- Look for "Migration successful" or similar message

### Step 4: Verify It Worked

From your computer, test:
```bash
curl https://lvlup-backend-production.up.railway.app/api/games
```

Should return: `[]` (empty array, not error)

---

## Quick Alternative: Fix package.json Build Script

**Even Better Solution:** Make migrations run during build automatically.

---

## What the Error Means

**HTTP 500** = Backend server error
**Cause**: Database tables don't exist yet
**Fix**: Run migrations to create tables

After migrations run, you'll be able to:
- ✅ Create games via frontend
- ✅ List games
- ✅ Track events
- ✅ View analytics

---

## After Migrations Run

1. **Restart your frontend dev server:**
   ```bash
   # Stop it (Ctrl+C)
   cd frontend
   npm run dev
   ```

2. **Hard refresh browser:**
   ```
   Cmd + Shift + R (Mac)
   Ctrl + Shift + R (Windows)
   ```

3. **Try creating a game again:**
   - Click "Add Game"
   - Fill in name
   - Click "Create Game"
   - Should work now! ✅

---

## Still Getting Errors?

Check Railway logs:
1. Go to Railway dashboard
2. Click your service
3. Click **"Logs"** tab
4. Look for error messages
5. Share them if you need help

---

**Run this command in Railway terminal NOW:**
```bash
npm run db:migrate
```

Then try creating a game again!

