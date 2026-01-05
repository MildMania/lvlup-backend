# 🚀 Backend Deployment Guide - Render.com (FREE)

## Prerequisites

- ✅ GitHub account
- ✅ Render.com account (sign up at render.com)
- ✅ Code pushed to GitHub repository

---

## Step 1: Push Code to GitHub

```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend

# Make sure .gitignore is updated and dev.db is removed
git add .
git commit -m "Prepare for deployment"
git push origin main
```

---

## Step 2: Create Render.com Account

1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up with GitHub
4. Authorize Render to access your repositories

---

## Step 3: Create PostgreSQL Database

1. In Render dashboard, click **"New +"**
2. Select **"PostgreSQL"**
3. Configure:
   - **Name**: `lvlup-db`
   - **Database**: `lvlup`
   - **User**: `lvlup`
   - **Region**: `Oregon (US West)` or closest to you
   - **Plan**: **FREE**
4. Click **"Create Database"**
5. **Wait** for database to be created (~2-3 minutes)
6. **Copy** the "External Database URL" - you'll need this!

---

## Step 4: Deploy Backend Service

1. Click **"New +"** again
2. Select **"Web Service"**
3. Connect your GitHub repository: `lvlup-backend`
4. Configure:

### Basic Settings:
- **Name**: `lvlup-backend` (or any name you like)
- **Region**: Same as database (e.g., Oregon)
- **Branch**: `main`
- **Root Directory**: `backend`
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### Environment Variables (Click "Advanced"):

Add these environment variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Paste the External Database URL from Step 3 |
| `PORT` | `10000` (Render provides this automatically) |
| `CORS_ORIGIN` | `*` (or your frontend URL later) |
| `OPENAI_API_KEY` | Your OpenAI API key (optional, for AI features) |

5. **Plan**: Select **FREE**
6. Click **"Create Web Service"**

---

## Step 5: Wait for Deployment

- Deployment takes 5-10 minutes
- Watch the logs in Render dashboard
- You'll see:
  ```
  npm install
  npm run build
  Prisma generating...
  Starting server...
  ```

---

## Step 6: Run Database Migrations

Once deployed, you need to run migrations:

1. In Render dashboard, go to your **lvlup-backend** service
2. Click **"Shell"** tab (on the left)
3. Run:
   ```bash
   npm run db:migrate
   ```
4. Wait for migrations to complete

---

## Step 7: Test Your Deployment

Your backend will be available at:
```
https://lvlup-backend-XXXXX.onrender.com
```

### Test the health endpoint:
```bash
curl https://lvlup-backend-XXXXX.onrender.com/api/health
```

You should get:
```json
{
  "status": "ok",
  "timestamp": "2026-01-05T..."
}
```

---

## Step 8: Create Your First Game

Use the API to create a game:

```bash
curl -X POST https://lvlup-backend-XXXXX.onrender.com/api/games \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Awesome Game",
    "description": "A cool game"
  }'
```

Response will include your `apiKey` - **SAVE THIS!**

---

## Your Backend URLs

After deployment, you'll have:

- **Backend URL**: `https://lvlup-backend-XXXXX.onrender.com`
- **API Base**: `https://lvlup-backend-XXXXX.onrender.com/api`
- **Health Check**: `https://lvlup-backend-XXXXX.onrender.com/api/health`

**Save these URLs!** You'll need them for:
- Frontend configuration
- Unity SDK initialization

---

## Common Issues & Solutions

### Issue 1: "Build failed"
**Solution**: Check logs, usually missing dependencies
```bash
# In Shell tab
npm install
npm run build
```

### Issue 2: "Database connection failed"
**Solution**: 
1. Check `DATABASE_URL` is correct
2. Make sure it's the **External** URL (not Internal)
3. Restart service

### Issue 3: "Service won't start"
**Solution**:
1. Check logs for errors
2. Verify `PORT` environment variable
3. Make sure `npm start` works locally first

### Issue 4: "Prisma errors"
**Solution**:
```bash
# In Shell tab
npx prisma generate
npx prisma migrate deploy
```

---

## Free Tier Limitations

Render.com FREE tier:
- ✅ 750 hours/month runtime
- ✅ Automatic HTTPS
- ✅ Automatic deploys from GitHub
- ⚠️ Spins down after 15 minutes of inactivity
- ⚠️ Cold start ~30 seconds when inactive

**Tip**: First request after inactivity will be slow. Consider a health check ping service.

---

## Environment Variables Reference

### Required:
```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/dbname
PORT=10000
```

### Optional:
```
OPENAI_API_KEY=sk-...
CORS_ORIGIN=https://your-frontend.com
LOG_LEVEL=info
```

---

## Auto-Deploy Setup

Render automatically deploys when you push to `main`:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Render will automatically deploy!
```

---

## Manual Deploy

To manually trigger deploy:
1. Go to Render dashboard
2. Click your service
3. Click **"Manual Deploy"** → **"Deploy latest commit"**

---

## Monitoring

### View Logs:
1. Go to service in Render dashboard
2. Click **"Logs"** tab
3. See real-time logs

### View Metrics:
1. Click **"Metrics"** tab
2. See CPU, memory, requests

### Set up Alerts:
1. Click **"Settings"**
2. Add notification webhooks
3. Get notified of issues

---

## Scaling (Paid Plans)

If you outgrow the free tier:

| Plan | Price | Features |
|------|-------|----------|
| **Free** | $0/mo | 750 hrs, sleeps after 15min |
| **Starter** | $7/mo | Always on, 0.5GB RAM |
| **Standard** | $25/mo | 2GB RAM, better performance |

---

## Alternative: Railway.app

If Render doesn't work, try Railway:

1. Go to railway.app
2. "Start a New Project"
3. "Deploy from GitHub"
4. Select repository
5. Add PostgreSQL service
6. Set environment variables
7. Deploy!

Railway gives $5 credit/month for free.

---

## Next Steps

After backend is deployed:

1. ✅ Save your backend URL
2. ✅ Save your API key
3. ➡️ Deploy frontend (Vercel)
4. ➡️ Update Unity SDK with API URL
5. ➡️ Test end-to-end

---

## Useful Commands

```bash
# View logs
render logs

# SSH into container (if needed)
render ssh

# Run migrations
npm run db:migrate

# Check Prisma status
npx prisma migrate status
```

---

## Support

- 📖 Render Docs: https://render.com/docs
- 💬 Render Community: https://community.render.com
- 🐛 Issues: Check Render dashboard logs

---

**Your backend is now deployed and ready for production use!** 🎉

Next: Deploy the frontend to Vercel!

