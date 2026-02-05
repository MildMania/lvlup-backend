# Railway Deployment Guide

## 🎯 Simple Deployment Workflow

**Yes, switch to prod before committing to GitHub/Railway:**

```bash
./env prod              # 1. Switch to production (sets PostgreSQL)
git add .               # 2. Stage changes
git commit -m "Deploy"  # 3. Commit with PostgreSQL schema
git push origin main    # 4. Railway auto-deploys
./env local             # 5. Switch back to local dev (SQLite)
```

That's it! Railway will automatically build and deploy.

---

## ⚠️ Why Switch to Prod First?

Railway uses **PostgreSQL**, so your `schema.prisma` must have:
```prisma
provider = "postgresql"  // ✅ Railway needs this
```

Running `./env prod` automatically updates the schema provider.

**If you forget:**
- Railway build will fail because schema has `provider = "sqlite"`
- You'll need to run `./env prod` and commit again

---

## 🚀 Railway Configuration

### Environment Variables (Set in Railway Dashboard)

**Required:**
- `DATABASE_URL` - Auto-provided by Railway PostgreSQL plugin
- `NODE_ENV` - Set to `production`
- `PORT` - Auto-provided by Railway

**Optional:**
- `OPENAI_API_KEY` - Your OpenAI API key
- `CORS_ORIGIN` - Your frontend URL (e.g., https://your-app.vercel.app)

---

## 📝 Full Deployment Steps

### 1. Prepare for Deployment
```bash
./env prod
```

This automatically:
- ✅ Updates Prisma schema to `provider = "postgresql"`
- ✅ Regenerates Prisma Client for PostgreSQL
- ✅ Shows you need to commit

### 2. Verify (Optional)
```bash
cat backend/prisma/schema.prisma | grep provider
```
Should show: `provider = "postgresql"`

### 3. Commit and Push
```bash
git add .
git commit -m "Deploy to Railway"
git push origin main
```

### 4. Switch Back to Local
```bash
./env local
```

Continue local development with SQLite.

---

## 🔄 Daily Development Workflow

### Working Locally (Most of the Time)
```bash
./env local             # Use SQLite
cd backend && npm run dev
# ... make changes, test, commit normally ...
```

Your commits will have `provider = "sqlite"` - that's fine for local dev commits.

### Ready to Deploy?
```bash
./env prod              # Switch to PostgreSQL
git add .
git commit -m "Deploy"
git push
./env local             # Back to SQLite
```

---

## 🧪 Test Against Production DB (Optional)

Want to test with the production Railway database locally?

```bash
./env prod              # Connect to Railway PostgreSQL
cd backend && npm run dev
# Test against production data...
./env local             # Switch back when done
```

---

## 🚨 Troubleshooting

### Build Fails on Railway

**Error**: `provider = "sqlite"` in schema

**Fix:**
```bash
./env prod
git add backend/prisma/schema.prisma
git commit -m "Fix schema for deployment"
git push
```

### Database Connection Errors

**Check Railway dashboard:**
- PostgreSQL plugin installed?
- `DATABASE_URL` environment variable set?
- Database service running?

### Migration Errors

Railway runs `npx prisma migrate deploy` automatically.

**If it fails:**
1. Check Railway logs
2. Verify `backend/prisma/migrations/` folder is committed
3. Ensure migrations work locally: `cd backend && npx prisma migrate deploy`

---

## 📊 Post-Deployment Check

```bash
# Check if backend is running
curl https://your-app.railway.app/health

# Test API
curl https://your-app.railway.app/api/games
```

---

## 🎯 Summary

**Simple Rule:**
- **Before pushing to Railway**: Run `./env prod`
- **After pushing**: Run `./env local`

**Why?**
- Railway needs PostgreSQL schema (`./env prod` sets this)
- Local dev uses SQLite (faster, simpler)

**The schema provider in git will change** - that's expected and automatic! ✅

---

## 📦 What Gets Deployed

Railway automatically:
1. ✅ Installs dependencies (`npm install`)
2. ✅ Builds TypeScript (`npm run build`)
3. ✅ Generates Prisma Client (`prisma generate`)
4. ✅ Runs migrations (`npx prisma migrate deploy`)
5. ✅ Starts server (`node dist/index.js`)

All configured in `package.json` scripts.

