# 🚀 Backend Deployment - Quick Checklist

## ✅ Pre-Deployment (DONE)

- [x] Updated Prisma schema to PostgreSQL
- [x] Added deployment scripts to package.json
- [x] Created render.yaml configuration
- [x] Added .env.example
- [x] Updated .gitignore (no dev.db)
- [x] Removed large files from git history
- [x] Created deployment documentation

## 📋 Deployment Steps (DO THIS NOW)

### 1. Push to GitHub ⏭️
```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend
git push origin main
```

### 2. Create Render Account (5 min)
- [ ] Go to https://render.com
- [ ] Sign up with GitHub
- [ ] Authorize Render

### 3. Create PostgreSQL Database (2 min)
- [ ] Click "New +" → "PostgreSQL"
- [ ] Name: `lvlup-db`
- [ ] Region: Oregon (or closest)
- [ ] Plan: **FREE**
- [ ] Click "Create Database"
- [ ] **COPY** External Database URL

### 4. Deploy Backend Service (5 min)
- [ ] Click "New +" → "Web Service"
- [ ] Connect GitHub repo: `lvlup-backend`
- [ ] Root Directory: `backend`
- [ ] Build Command: `npm install && npm run build`
- [ ] Start Command: `npm start`
- [ ] Add Environment Variables:
  - [ ] `NODE_ENV` = `production`
  - [ ] `DATABASE_URL` = (paste from step 3)
  - [ ] `CORS_ORIGIN` = `*`
- [ ] Plan: **FREE**
- [ ] Click "Create Web Service"

### 5. Wait for Deploy (10 min)
- [ ] Watch logs in Render dashboard
- [ ] Wait for "Live" status

### 6. Run Migrations (2 min)
- [ ] Go to service → "Shell" tab
- [ ] Run: `npm run db:migrate`
- [ ] Wait for completion

### 7. Test Deployment (2 min)
```bash
# Replace with your URL
curl https://your-backend.onrender.com/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"..."}
```

### 8. Create First Game (2 min)
```bash
curl -X POST https://your-backend.onrender.com/api/games \
  -H "Content-Type: application/json" \
  -d '{"name":"My Game","description":"Test game"}'
```

**SAVE THE API KEY FROM RESPONSE!**

---

## 📝 Information to Save

After deployment, save these:

- [ ] **Backend URL**: `https://lvlup-backend-XXXXX.onrender.com`
- [ ] **API Base URL**: `https://lvlup-backend-XXXXX.onrender.com/api`
- [ ] **Game API Key**: `lvl_XXXXXXXXXXXXXXXX`
- [ ] **Database URL**: (in Render dashboard)

---

## ⏱️ Total Time: ~30 minutes

- Push to GitHub: 1 min
- Create Render account: 5 min
- Create database: 2 min
- Deploy service: 5 min
- Wait for deployment: 10 min
- Run migrations: 2 min
- Test: 5 min

---

## 🆘 If Something Goes Wrong

### Deployment failed?
1. Check logs in Render dashboard
2. Verify build command is correct
3. Check environment variables

### Database connection error?
1. Verify DATABASE_URL is the **External** URL
2. Make sure it starts with `postgresql://`
3. Restart service

### Can't run migrations?
```bash
# In Shell tab
npx prisma generate
npx prisma migrate deploy
```

### Service won't start?
1. Check logs for errors
2. Verify PORT is set (Render auto-provides)
3. Make sure build succeeded

---

## 📚 Full Guide

See `BACKEND_DEPLOYMENT_GUIDE.md` for complete step-by-step instructions.

---

## ➡️ Next Step

After backend is deployed successfully:
- Deploy Frontend to Vercel
- Update Unity SDK with backend URL
- Test end-to-end integration

---

**Ready? Start with Step 1: Push to GitHub!** 🚀

