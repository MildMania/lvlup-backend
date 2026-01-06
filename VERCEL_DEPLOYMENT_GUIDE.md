# 🚀 Frontend Deployment to Vercel

## Quick Deploy

### Option 1: Deploy via Vercel CLI (Recommended for First Deploy)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy from Frontend Directory**
   ```bash
   cd frontend
   vercel
   ```

4. **Follow the prompts:**
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N** (first time)
   - What's your project's name? `lvlup-dashboard` (or your preferred name)
   - In which directory is your code located? `./`
   - Want to override the settings? **N**

5. **Set Environment Variables** (if not auto-detected from vercel.json)
   ```bash
   vercel env add VITE_API_BASE_URL production
   # Paste: https://lvlup-backend-production.up.railway.app/api
   
   vercel env add VITE_API_KEY production
   # Paste: lvl_da7339ff066a4c0295e5b11fc15bb79b
   ```

6. **Deploy to Production**
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via Vercel Dashboard (Easiest)

1. **Go to [vercel.com](https://vercel.com)** and sign in

2. **Click "Add New Project"**

3. **Import from Git:**
   - Connect your GitHub account (if not already)
   - Select the `lvlup-backend` repository
   - Click "Import"

4. **Configure Project:**
   - **Framework Preset:** Vite ✅ (should auto-detect)
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build` (auto-detected)
   - **Output Directory:** `dist` (auto-detected)
   - **Install Command:** `npm install` (auto-detected)

5. **Add Environment Variables:**
   - Click "Environment Variables"
   - Add:
     ```
     VITE_API_BASE_URL = https://lvlup-backend-production.up.railway.app/api
     VITE_API_KEY = lvl_da7339ff066a4c0295e5b11fc15bb79b
     ```
   - Apply to: **Production, Preview, Development** ✅

6. **Click "Deploy"** 🚀

---

## After First Deployment

### Automatic Deployments
✅ Every push to `main` branch will automatically deploy to production  
✅ Pull requests create preview deployments  
✅ Vercel handles build, optimization, and CDN automatically  

### Get Your URL
After deployment completes, you'll get URLs like:
- **Production:** `https://lvlup-dashboard.vercel.app`
- **Preview:** `https://lvlup-dashboard-git-branch.vercel.app`

---

## Configuration Details

### vercel.json
The `vercel.json` file is already configured with:
- Build settings
- Output directory
- Environment variables (default values)

### Environment Variables Needed

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_API_BASE_URL` | `https://lvlup-backend-production.up.railway.app/api` | Backend API URL |
| `VITE_API_KEY` | `lvl_da7339ff066a4c0295e5b11fc15bb79b` | Default game API key |

**Note:** You can update these in Vercel Dashboard → Project Settings → Environment Variables

---

## Updating Environment Variables

### Via Vercel Dashboard
1. Go to your project in Vercel
2. Settings → Environment Variables
3. Edit the variable
4. Redeploy (or it will auto-redeploy on next push)

### Via Vercel CLI
```bash
vercel env rm VITE_API_BASE_URL production
vercel env add VITE_API_BASE_URL production
# Enter new value when prompted
```

---

## Custom Domain (Optional)

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain (e.g., `dashboard.yourgame.com`)
3. Follow Vercel's DNS configuration instructions
4. SSL certificate is automatically provisioned

---

## Troubleshooting

### Build Fails

**Check environment variables:**
```bash
vercel env ls
```

**View build logs:**
- In Vercel Dashboard → Deployments → Click on failed deployment → View logs

**Common issues:**
- Missing environment variables
- TypeScript errors (run `npm run build` locally first)
- Wrong root directory (should be `frontend`)

### API Not Working

**Check CORS settings in backend** (`backend/src/index.ts`):
```typescript
app.use(cors({
  origin: '*', // Or specify your Vercel domain
  credentials: true
}));
```

**Verify backend is accessible:**
```bash
curl https://lvlup-backend-production.up.railway.app/api/health
```

### Environment Variables Not Applied

- After adding/changing env vars, trigger a new deployment
- Or redeploy: `vercel --prod`

---

## Development Workflow

### Local Development
```bash
cd frontend
npm run dev
# Uses .env file (not committed to git)
```

### Preview Deployment (for testing)
```bash
vercel
# Creates a preview deployment
```

### Production Deployment
```bash
vercel --prod
# Deploys to production domain
```

### Or Just Push to GitHub
```bash
git push origin main
# Vercel automatically deploys on push!
```

---

## Performance Optimizations (Already Applied)

✅ **Vite** - Lightning fast builds  
✅ **Tree Shaking** - Removes unused code  
✅ **Code Splitting** - Lazy loading  
✅ **Minification** - Compressed assets  
✅ **Vercel CDN** - Global edge network  
✅ **Automatic caching** - Static assets cached  

---

## Monitoring

### View Deployment Status
- Vercel Dashboard → Deployments
- See build logs, runtime logs, and errors

### Analytics (Optional)
Enable Vercel Analytics in Project Settings for:
- Page views
- User traffic
- Core Web Vitals
- Real User Monitoring

---

## Security Notes

🔒 **API Key Exposure:**
- The `VITE_API_KEY` is exposed in frontend code (it's compiled into the bundle)
- This is normal for frontend apps
- Implement rate limiting on backend
- Use API key authentication on backend for protection

🔒 **Environment Variables:**
- `VITE_*` variables are PUBLIC (embedded in build)
- Never store secrets in VITE variables
- Backend handles authentication/authorization

---

## Cost

✅ **Free Tier Includes:**
- Unlimited deployments
- 100GB bandwidth/month
- Automatic HTTPS
- Global CDN
- Preview deployments

💰 **Paid Plans** (if needed):
- More bandwidth
- Team collaboration
- Advanced analytics
- Custom limits

---

## Next Steps After Deployment

1. ✅ **Test the deployed app** - Open your Vercel URL
2. ✅ **Check API connection** - Verify games load
3. ✅ **Update documentation** - Add production URL to README
4. ✅ **Share with team** - Send the Vercel URL
5. ✅ **Set up custom domain** (optional)
6. ✅ **Enable analytics** (optional)

---

## Quick Commands Cheat Sheet

```bash
# First time setup
vercel login
cd frontend
vercel

# Deploy to production
vercel --prod

# Check env vars
vercel env ls

# View logs
vercel logs

# Rollback (if needed)
# Go to Vercel Dashboard → Deployments → Click on previous deployment → Promote to Production
```

---

## Summary

Your frontend will be deployed to Vercel with:
- ✅ Automatic builds on every push
- ✅ Preview deployments for PRs
- ✅ Global CDN for fast loading
- ✅ Automatic HTTPS
- ✅ Easy rollbacks
- ✅ Real-time logs

**Estimated deployment time: 2-3 minutes** ⚡

Just run `vercel` in the frontend directory and you're live! 🚀

