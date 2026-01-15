# Quick Start - Deploy to Netlify

## 🚀 Fast Track (5 minutes)

### 1. Connect to Netlify
1. Go to https://app.netlify.com
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **GitHub** → Select your repository
4. Configure:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`

### 2. Set Environment Variable
In Netlify dashboard → **Site settings** → **Environment variables**:
- **Key**: `VITE_API_URL`
- **Value**: `https://your-railway-backend.railway.app/api`

### 3. Deploy
Click **Deploy site** button. Done! 🎉

### 4. Update Backend CORS
In Railway dashboard → Your backend service → **Variables**:
- Update `CORS_ORIGIN` to your new Netlify URL
- Example: `https://your-site.netlify.app`

---

## 📋 What's Already Set Up

✅ `netlify.toml` - Build configuration  
✅ SPA routing redirects  
✅ Security headers  
✅ Asset caching  
✅ `.gitignore` patterns  

## 🔗 Your Netlify URL

After deployment, you'll get a URL like:
```
https://[random-name].netlify.app
```

You can customize this:
1. **Site settings** → **Site details** → **Change site name**
2. Or add a custom domain

## 📚 Full Guide

See [NETLIFY_SETUP.md](./NETLIFY_SETUP.md) for detailed instructions, troubleshooting, and advanced configuration.

## ⚡ Common Commands

```bash
# Test build locally
npm run build

# Preview production build locally
npm run preview

# Development server
npm run dev
```

## 🔄 Auto-Deploy

Netlify automatically deploys when you:
- Push to `main` → Production
- Create PR → Preview deployment
- Push to branch → Branch deployment

## 🐛 Troubleshooting

### Build fails?
- Check environment variables are set in Netlify dashboard
- Verify `VITE_API_URL` has the correct Railway URL

### CORS errors?
- Update Railway backend `CORS_ORIGIN` with Netlify URL
- May need to redeploy backend

### 404 on refresh?
- Already handled by `netlify.toml` redirect rules ✅

## 📞 Need Help?

Check [NETLIFY_SETUP.md](./NETLIFY_SETUP.md) for:
- Detailed step-by-step guide
- Custom domain setup
- Monitoring and analytics
- Migration from Vercel
- Common issues and solutions

