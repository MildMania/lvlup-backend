# 📋 Deployment Checklist

## Pre-Deployment

### Backend (Railway) ✅
- [x] Backend deployed to Railway
- [x] Database schema updated with event metadata
- [x] Environment variables configured
- [x] Health endpoint accessible
- [x] API endpoints working
- [x] CORS configured for frontend domain

**Backend URL:** `https://lvlup-backend-production.up.railway.app`

### Frontend (Vercel) 
- [ ] Frontend code ready
- [ ] Environment variables prepared
- [ ] Build succeeds locally
- [ ] API connection tested

---

## Vercel Deployment Steps

### Option 1: Via Vercel Dashboard (Easiest) ⭐

1. **Go to [vercel.com](https://vercel.com)** and sign in

2. **Import Project:**
   - Click "Add New Project"
   - Import from Git (GitHub)
   - Select `lvlup-backend` repository
   - Click "Import"

3. **Configure:**
   - **Root Directory:** `frontend` ⚠️ **IMPORTANT**
   - **Framework:** Vite (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

4. **Environment Variables:**
   ```
   VITE_API_BASE_URL = https://lvlup-backend-production.up.railway.app/api
   VITE_API_KEY = lvl_da7339ff066a4c0295e5b11fc15bb79b
   ```

5. **Deploy!** 🚀

### Option 2: Via CLI

```bash
cd frontend
vercel login
vercel
# Follow prompts, then:
vercel --prod
```

---

## Post-Deployment Verification

### 1. Check Build
- [ ] Deployment succeeded in Vercel dashboard
- [ ] No build errors
- [ ] Environment variables applied

### 2. Test Frontend
- [ ] Open Vercel URL
- [ ] Page loads without errors
- [ ] Dashboard displays

### 3. Test API Connection
- [ ] Games list loads
- [ ] Can create new game
- [ ] Can switch between games
- [ ] Analytics data displays
- [ ] Can delete games

### 4. Check Console
- [ ] No JavaScript errors
- [ ] No network errors
- [ ] API calls successful

### 5. Test Features
- [ ] Create game works
- [ ] Copy API key works
- [ ] Delete game works
- [ ] Dashboard metrics show
- [ ] Responsive design works

---

## Troubleshooting

### Build Fails
```bash
# Test locally first
cd frontend
npm run build
```

### API Not Connecting
1. Check CORS in backend
2. Verify Railway backend is running
3. Check environment variables in Vercel
4. Check browser console for errors

### Environment Variables Not Working
1. Redeploy after adding env vars
2. Ensure variables start with `VITE_`
3. Check they're set for all environments

---

## Update Backend CORS (if needed)

If frontend can't connect, update backend CORS:

```typescript
// backend/src/index.ts
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://your-vercel-url.vercel.app'
  ],
  credentials: true
}));
```

Then redeploy backend:
```bash
git add backend/src/index.ts
git commit -m "Update CORS for Vercel domain"
git push origin main
```

---

## Production URLs

After deployment, update these:

- **Backend:** `https://lvlup-backend-production.up.railway.app`
- **Frontend:** `https://your-project.vercel.app` (you'll get this after deploy)
- **API:** `https://lvlup-backend-production.up.railway.app/api`

---

## Automatic Deployments

✅ **Backend (Railway):**
- Deploys on push to `main`
- Runs migrations automatically
- Updates on commit

✅ **Frontend (Vercel):**
- Deploys on push to `main`
- Creates preview for PRs
- Instant rollback available

---

## Next Steps After Successful Deployment

1. **Share URLs** with team
2. **Test Unity SDK** with production API
3. **Set up custom domains** (optional)
4. **Enable monitoring** (optional)
5. **Update documentation** with production URLs

---

## Quick Commands

```bash
# Deploy frontend
cd frontend
vercel --prod

# Check frontend logs
vercel logs

# Rollback frontend
# Use Vercel Dashboard → Previous deployment → Promote

# Update backend
git push origin main  # Auto-deploys to Railway

# Check backend logs
# Use Railway Dashboard → Deployments → View logs
```

---

## Estimated Timeline

- ⏱️ **Frontend setup on Vercel:** 3-5 minutes
- ⏱️ **First deployment:** 2-3 minutes
- ⏱️ **Testing:** 5 minutes
- ⏱️ **Total:** ~10-15 minutes

---

## Success Criteria

✅ Frontend accessible at Vercel URL  
✅ Backend accessible at Railway URL  
✅ Dashboard loads without errors  
✅ Can create/manage games  
✅ Analytics data displays  
✅ No console errors  
✅ Mobile responsive  

---

## Support

- **Vercel Docs:** https://vercel.com/docs
- **Railway Docs:** https://docs.railway.app
- **Project Docs:** See `VERCEL_DEPLOYMENT_GUIDE.md`

---

**Ready to deploy? Let's go! 🚀**

