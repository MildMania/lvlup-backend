# Switching to Netlify - Frontend Deployment Guide

## Why Switch to Netlify?

- Simple deployment process
- Automatic deployments from Git
- Built-in CDN and SSL
- Preview deployments for pull requests
- Better performance for static sites

## Prerequisites

1. A Netlify account (sign up at https://netlify.com)
2. Your GitHub repository connected

## Step-by-Step Migration Guide

### 1. Create Netlify Configuration

✅ **Done!** Created `netlify.toml` in the frontend directory with:
- Build command: `npm run build`
- Publish directory: `dist`
- SPA redirect rules for React Router
- Security headers
- Cache optimization for assets

### 2. Connect Repository to Netlify

1. **Log in to Netlify**: Go to https://app.netlify.com
2. **Click "Add new site"** → "Import an existing project"
3. **Choose Git provider**: Select GitHub
4. **Authorize Netlify**: Allow Netlify to access your repositories
5. **Select repository**: Choose `lvlup-backend` repository
6. **Configure build settings**:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build` (auto-detected from netlify.toml)
   - **Publish directory**: `dist` (auto-detected from netlify.toml)
   - **Branch to deploy**: `main` or `master`

### 3. Set Environment Variables

In Netlify dashboard → Site settings → Environment variables, add:

```bash
# Backend API URL (Railway)
VITE_API_BASE_URL=https://your-railway-app.railway.app/api

# Or if you have a custom domain
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

**How to add:**
1. Go to **Site settings** → **Environment variables**
2. Click **Add a variable**
3. Key: `VITE_API_BASE_URL`
4. Value: Your Railway backend URL
5. Click **Save**

### 4. Deploy

Click **Deploy site** button. Netlify will:
1. Clone your repository
2. Install dependencies (`npm install`)
3. Run build command (`npm run build`)
4. Deploy the `dist` folder to their CDN
5. Provide you with a URL like `https://random-name-123.netlify.app`

### 5. Update Backend CORS

Once deployed, update your Railway backend environment variables to allow the new Netlify domain:

**In Railway dashboard:**
1. Go to your backend service
2. Variables tab
3. Update `CORS_ORIGIN`:
   ```
   CORS_ORIGIN=https://your-netlify-site.netlify.app
   ```
4. Redeploy if needed

Or add to your backend `.env`:
```bash
CORS_ORIGIN=https://your-netlify-site.netlify.app
```

### 6. Custom Domain (Optional)

If you have a custom domain:

1. In Netlify: **Site settings** → **Domain management**
2. Click **Add custom domain**
3. Enter your domain (e.g., `app.yourdomain.com`)
4. Follow DNS configuration instructions:
   - Add CNAME record pointing to your Netlify site
   - Or use Netlify DNS (easier)
5. SSL certificate is automatically provisioned (free)

Then update Railway `CORS_ORIGIN` to your custom domain.

## Configuration Files

### netlify.toml
✅ Already created with optimal settings:
- Build configuration
- SPA routing redirects
- Security headers
- Asset caching

### .gitignore
✅ Already configured to ignore:
- `dist/` folder (build output)
- `.env.local` (local environment variables)
- Old/backup files

## Differences from Vercel

| Feature | Vercel | Netlify |
|---------|--------|---------|
| Config file | `vercel.json` | `netlify.toml` |
| Build output | `dist` | `dist` |
| Env vars prefix | `VITE_` | `VITE_` (same) |
| SPA routing | Auto | Need redirect rule ✅ |
| Custom domains | Easy | Easy |
| SSL | Free | Free |
| CDN | Yes | Yes |

## Post-Migration Checklist

- [ ] Repository connected to Netlify
- [ ] Environment variables set (`VITE_API_BASE_URL`)
- [ ] First deployment successful
- [ ] Site is accessible at Netlify URL
- [ ] Backend CORS updated with Netlify domain
- [ ] Test all features work correctly
- [ ] (Optional) Custom domain configured
- [ ] (Optional) Remove Vercel project if no longer needed

## Automatic Deployments

Netlify automatically deploys when you:
- Push to `main` branch → Production deployment
- Create a pull request → Preview deployment
- Push to any branch → Branch deployment

**Deploy previews** help you test changes before merging.

## Rollback

If something goes wrong:
1. Go to **Deploys** tab in Netlify dashboard
2. Find a previous successful deployment
3. Click **...** → **Publish deploy**
4. Previous version is instantly live

## Common Issues & Solutions

### Build fails with "command not found"
- **Solution**: Check `netlify.toml` has correct build command
- Verify `package.json` has the build script

### Environment variables not working
- **Solution**: Add `VITE_` prefix to all env vars
- Check they're set in Netlify dashboard (not just local `.env`)

### 404 on page refresh
- **Solution**: Check `netlify.toml` has the SPA redirect rule ✅
- Should be `from = "/*" to = "/index.html" status = 200`

### CORS errors after deployment
- **Solution**: Update Railway backend `CORS_ORIGIN` with Netlify URL
- May need to redeploy backend

## Monitoring & Analytics

Netlify provides:
- **Analytics**: Traffic, page views, bandwidth (paid feature)
- **Deploy logs**: Build output and errors
- **Function logs**: If you use Netlify Functions
- **Performance**: Core Web Vitals monitoring

## Cost

- **Free tier includes**:
  - 100 GB bandwidth/month
  - Unlimited sites
  - Continuous deployment
  - SSL certificates
  - Deploy previews
  
- **Pro tier** ($19/month per member):
  - Analytics
  - Password protection
  - More build minutes

For this project, free tier is sufficient.

## Next Steps

1. **Push changes** to GitHub:
   ```bash
   git add frontend/netlify.toml
   git commit -m "Add Netlify configuration"
   git push
   ```

2. **Follow steps 2-5** above to deploy

3. **Test everything** on the Netlify URL

4. **(Optional)** Set up custom domain

## Need Help?

- Netlify Docs: https://docs.netlify.com
- Community Forum: https://answers.netlify.com
- Status Page: https://www.netlifystatus.com

---

**Your current setup:**
- ✅ `netlify.toml` created with optimal configuration
- ✅ Build settings pre-configured
- ✅ SPA routing handled
- ✅ Security headers added
- ✅ Asset caching optimized

**Ready to deploy!** Follow steps 2-5 above.

