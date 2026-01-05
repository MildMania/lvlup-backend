# 🚀 Railway.app Deployment - Quick Guide

## Why Railway for Your Game

- ✅ **Always-on** (no sleep issues)
- ✅ **Instant response** (no cold starts)
- ✅ **$5 free credit/month** (~500 compute hours)
- ✅ **Perfect for low-traffic live games**
- ✅ **PostgreSQL included**
- ✅ **Auto-deploy from GitHub**
- ✅ **Simple setup** (15 minutes)

**Estimated cost for your use case**: $0-3/month

---

## Quick Deployment (15 minutes)

### Step 1: Sign Up (2 min)
1. Go to https://railway.app
2. Click **"Login"** → **"Login with GitHub"**
3. Authorize Railway
4. Verify email
5. Add payment method (won't charge unless >$5/month)

### Step 2: Create New Project (3 min)
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Search and select `lvlup-backend`
4. Click **"Deploy Now"**

### Step 3: Configure Backend Service (2 min)
Railway auto-detects Node.js, but let's verify:

1. Click on your service
2. Go to **"Settings"** tab
3. **Root Directory**: `backend`
4. **Build Command**: (auto-detected, should be `npm install && npm run build`)
5. **Start Command**: (auto-detected, should be `npm start`)
6. **Watch Paths**: `backend/**`

### Step 4: Add PostgreSQL (1 min)
1. Click **"New"** in your project
2. Select **"Database"** → **"Add PostgreSQL"**
3. Done! Railway automatically:
   - Creates the database
   - Links it to your service
   - Sets `DATABASE_URL` environment variable

### Step 5: Add Environment Variables (1 min)
Railway provides automatically:
- ✅ `DATABASE_URL` (from PostgreSQL)
- ✅ `PORT` (auto-set)

You need to add:
1. Click your service → **"Variables"** tab
2. Add variables:
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = `*` (or your frontend URL later)
   - `OPENAI_API_KEY` = `your-key-here` (optional, for AI features)
3. Click **"Save"**

### Step 6: Deploy! (5 min)
1. Railway automatically starts deploying
2. Watch the **"Deployments"** tab
3. You'll see:
   ```
   Installing dependencies...
   Building...
   Generating Prisma Client...
   Starting server...
   ✓ Deployment successful
   ```
4. Note your URL: `https://your-app.railway.app`

### Step 7: Run Migrations (1 min)
1. Click your service
2. Click **"..."** menu → **"Terminal"**
3. Run:
   ```bash
   npm run db:migrate
   ```
4. Wait for: `Migration successful`

### Step 8: Test Your Backend (1 min)
```bash
# Test health endpoint
curl https://your-app.railway.app/api/health

# Expected response:
# {"status":"ok","timestamp":"2026-01-05T..."}
```

### Step 9: Create Your First Game (1 min)
```bash
curl -X POST https://your-app.railway.app/api/games \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Awesome Game",
    "description": "A cool game with analytics"
  }'
```

**Save the `apiKey` from the response!** You'll need it for Unity SDK.

---

## 🎉 Done!

Your backend is now:
- ✅ Deployed on Railway
- ✅ Always-on (no sleep)
- ✅ Connected to PostgreSQL
- ✅ Auto-deploys on git push
- ✅ Has HTTPS
- ✅ Ready for production

**Backend URL**: `https://your-app.railway.app`
**API Base**: `https://your-app.railway.app/api`

---

## 💰 Cost Monitoring

### Check Your Usage:
1. Go to Railway dashboard
2. Click **"Usage"** tab
3. See real-time costs

### Set Spending Limit:
1. Go to **"Settings"**
2. **"Usage Limits"**
3. Set max spend (e.g., $5/month)
4. Railway will pause services if exceeded

### Expected Cost (Low Traffic):
```
Compute: ~$1-2/month
Database: Free (< 1GB)
Network: Free (< 100GB)
Total: $1-3/month (within $5 free credit)
```

---

## 🔄 Auto-Deploy Setup

Already configured! Push to GitHub and Railway deploys automatically:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Railway automatically deploys! 🚀
# Check deployment at: railway.app/project/deployments
```

---

## 📊 Monitoring

### View Logs:
1. Click your service
2. **"Logs"** tab
3. See real-time logs

### View Metrics:
1. **"Metrics"** tab
2. See CPU, Memory, Network usage

### Set Alerts:
1. **"Settings"** → **"Webhooks"**
2. Add webhook URL for notifications

---

## 🔧 Common Commands

### Run Migrations:
```bash
# In Railway Terminal
npm run db:migrate
```

### Check Prisma Status:
```bash
npx prisma migrate status
```

### Seed Database:
```bash
npm run db:seed
```

### Generate Prisma Client:
```bash
npx prisma generate
```

### Restart Service:
Click **"..."** → **"Restart"**

---

## 🆘 Troubleshooting

### Build Failed?
1. Check **"Build Logs"**
2. Verify `package.json` scripts
3. Try: **"..."** → **"Redeploy"**

### Database Connection Error?
1. Verify PostgreSQL service is running
2. Check `DATABASE_URL` in Variables tab
3. Restart both services

### Can't Run Migrations?
```bash
# In Terminal
npx prisma generate
npx prisma migrate deploy
```

### Service Crashed?
1. Check **"Logs"** for errors
2. Verify environment variables
3. Check if PORT is being used correctly

---

## 📋 Post-Deployment Checklist

- [ ] Backend deployed successfully
- [ ] Health endpoint returns 200 OK
- [ ] PostgreSQL connected
- [ ] Migrations completed
- [ ] Created first game via API
- [ ] Saved API key
- [ ] Saved backend URL
- [ ] Tested a few endpoints
- [ ] Set spending limit (optional)
- [ ] Configured auto-deploy (automatic)

---

## 🎯 Next Steps

1. **✅ Backend deployed** - You're here!
2. **⏭️ Deploy Frontend** - Deploy to Vercel
3. **⏭️ Update Unity SDK** - Use your backend URL
4. **⏭️ Test End-to-End** - Complete integration test

---

## 🌟 Railway vs Render Comparison

| Feature | Railway | Render |
|---------|---------|--------|
| **Sleep after inactivity** | ❌ No | ⚠️ Yes (15 min) |
| **Cold start** | ❌ None | ⚠️ ~30 seconds |
| **Always-on** | ✅ Yes | ❌ No (free tier) |
| **Cost (low traffic)** | $0-3/mo | $0/mo* |
| **Better for live games** | ✅ Yes | ❌ No |
| **Setup time** | 15 min | 30 min |

*Render free tier is $0 but has sleep issues

**Railway wins for live games!** 🏆

---

## 💡 Pro Tips

1. **Monitor Usage Weekly** - Check Railway dashboard
2. **Set Spending Limit** - Peace of mind
3. **Use Environment Groups** - For dev/staging/prod
4. **Enable GitHub PR Previews** - Test before deploy
5. **Use Railway CLI** - For local development

---

## 📱 Railway Mobile App

Railway has a mobile app for monitoring:
- iOS: https://apps.apple.com/app/railway/id1617990591
- Android: Coming soon

Monitor your deployments on the go!

---

**Your backend is live on Railway! 🎉**

**Total time**: 15 minutes  
**Total cost**: $0-3/month  
**Sleep issues**: None ✅  
**Cold starts**: None ✅  
**Perfect for**: Live games with low traffic ⭐

---

*Railway.app Deployment Guide*  
*January 5, 2026*  
*Status: PRODUCTION READY 🚀*

