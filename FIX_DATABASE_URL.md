# 🔧 URGENT: DATABASE_URL Not Set in Railway

## The Problem

Railway deployment is failing with:
```
Error: You must provide a nonempty URL. 
The environment variable `DATABASE_URL` resolved to an empty string.
```

This means the PostgreSQL database is not connected to your backend service.

---

## Solution: Connect PostgreSQL Database

### Step 1: Check if Database Exists

1. Go to https://railway.app/dashboard
2. Look at your project
3. Do you see **TWO services**?
   - `lvlup-backend` (your Node.js app)
   - `postgres` or `lvlup-db` (database)

**If you only see ONE service (backend only):**
→ You need to create a database (see Step 2)

**If you see BOTH services:**
→ They might not be connected (see Step 3)

---

### Step 2: Create PostgreSQL Database (If Missing)

1. In your Railway project, click **"+ New"**
2. Select **"Database"**
3. Choose **"Add PostgreSQL"**
4. Wait for it to provision (~1 minute)

Railway will automatically create a database named `postgres`.

---

### Step 3: Connect Database to Backend

Railway should automatically connect them, but if not:

1. Click on your **backend service** (`lvlup-backend`)
2. Go to **"Variables"** tab
3. Look for `DATABASE_URL`

**If DATABASE_URL is missing or empty:**

1. Click **"+ New Variable"**
2. Click **"Add Reference"**
3. Select your PostgreSQL database
4. Choose **"DATABASE_URL"**
5. Click **"Add"**

This will link the database URL to your backend.

---

### Step 4: Verify Environment Variable

After adding the database reference:

1. Go to **"Variables"** tab
2. You should see:
   ```
   DATABASE_URL = postgresql://postgres:...@...railway.app:5432/railway
   ```
   (The actual value will be hidden for security)

3. Click on it to verify it's not empty

---

### Step 5: Redeploy

After connecting the database:

1. Go to **"Deployments"** tab
2. Click **"Deploy"** button
3. Or just wait - Railway will auto-deploy when you save variables

---

## Alternative: Manual Environment Variable

If the reference doesn't work, you can manually set it:

### Get Database URL

1. Click on your **PostgreSQL service**
2. Go to **"Connect"** tab
3. Copy the **"Postgres Connection URL"**
   - Should look like: `postgresql://postgres:...@...railway.app:5432/railway`

### Set in Backend

1. Click on your **backend service**
2. Go to **"Variables"** tab
3. Click **"+ New Variable"**
4. **Variable:** `DATABASE_URL`
5. **Value:** Paste the connection URL
6. Click **"Add"**

---

## What Should Happen

After fixing, Railway will redeploy and you should see:

```
Starting Container...
> prisma migrate deploy
Applying migrations...
✓ Migrations applied
Starting server...
✓ Server listening on port 10000
```

---

## Verify It's Working

After deployment succeeds:

```bash
curl https://lvlup-backend-production.up.railway.app/api/games
```

Should return: `[]` (empty array)

---

## Common Issues

### "Database not found"
- Make sure you created a PostgreSQL database in Railway
- Not MySQL, not SQLite - must be **PostgreSQL**

### "Connection refused"
- Database and backend must be in the same Railway project
- Check they're both showing as "Active" (green)

### "Still getting empty DATABASE_URL"
- Try manually copying the connection string (see Alternative above)
- Make sure you saved the variable
- Redeploy after saving

---

## Quick Checklist

- [ ] PostgreSQL database exists in Railway project
- [ ] Database is "Active" (green status)
- [ ] Backend service exists
- [ ] `DATABASE_URL` variable is set in backend
- [ ] `DATABASE_URL` is not empty
- [ ] Redeploy triggered
- [ ] Deployment succeeds
- [ ] Can curl `/api/games` successfully

---

**Fix these steps, then try creating a game from the frontend!**

The backend will work once DATABASE_URL is properly connected.

