# ✅ FIXED! How to Apply the Fixes

## What Was Fixed

✅ **CORS Configuration** - Now allows credentials from localhost:5173  
✅ **Auth Routes** - Now properly registered at `/api/auth/*`  
✅ **Cookie Parser** - Added to handle refresh tokens

## Apply the Fixes - Quick Steps

### Step 1: Stop the Backend
In the terminal where backend is running, press **Ctrl+C**

### Step 2: Restart the Backend
```bash
cd backend
npm run dev
```

Wait until you see:
```
LvlUp server running at http://0.0.0.0:3000
```

### Step 3: Test the Fix
You can test in two ways:

#### Option A: Use the Browser
1. Refresh the page at `http://localhost:5173/login`
2. Try to login with:
   - Email: `admin@lvlup.com`
   - Password: `Admin123!@#`
3. Should work! 🎉

#### Option B: Test via Command Line
```bash
chmod +x test-endpoints.sh
./test-endpoints.sh
```

This will show you if all endpoints are working.

---

## If You Still See Errors

### Error: "404 Not Found" persists

**Cause:** Backend didn't restart properly or route files have issues.

**Fix:**
```bash
# Stop backend (Ctrl+C)
cd backend

# Rebuild
npm run build

# Start again
npm run dev
```

### Error: "CORS policy" persists

**Cause:** Browser cached the old CORS response.

**Fix:**
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

### Error: "Invalid credentials"

**Cause:** Super admin user doesn't exist in database.

**Fix:**
```bash
cd backend
npx prisma db push
npx ts-node scripts/setup-auth.ts
```

You should see:
```
✅ Super admin created successfully!
📧 Email: admin@lvlup.com
🔑 Password: Admin123!@#
```

---

## Verify Everything Works

### Test 1: Backend Health
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": ...
}
```

### Test 2: Auth Endpoint Exists
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lvlup.com","password":"Admin123!@#"}'
```

Should return JSON with `accessToken` or an error message (but NOT 404).

### Test 3: CORS Headers
```bash
curl -I -X OPTIONS http://localhost:3000/api/auth/login \
  -H "Origin: http://localhost:5173"
```

Should see:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

---

## Quick Reference

### Credentials
- **Email:** `admin@lvlup.com`
- **Password:** `Admin123!@#`

### URLs
- **Frontend:** http://localhost:5173/login
- **Backend:** http://localhost:3000
- **Health Check:** http://localhost:3000/health

### Ports
- Backend: **3000**
- Frontend: **5173**

---

## Complete Fresh Start (If Nothing Works)

If you want to start completely fresh:

```bash
# 1. Stop both servers (Ctrl+C in each terminal)

# 2. Clean and setup backend
cd backend
rm -rf node_modules/.prisma
npm install
npx prisma generate
npx prisma db push --force-reset
npx ts-node scripts/setup-auth.ts

# 3. Start backend
npm run dev

# 4. In a new terminal, start frontend
cd ../frontend
npm run dev

# 5. Open browser
# Go to: http://localhost:5173/login
# Login with: admin@lvlup.com / Admin123!@#
```

---

## Success Checklist

- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Login page loads
- [ ] No CORS errors in browser console
- [ ] No 404 errors in browser console
- [ ] Login form accepts credentials
- [ ] After login, redirects to dashboard
- [ ] Dashboard shows your name and teams

Once all checkboxes are checked, you're ready to use the system! 🎉

---

## Still Need Help?

Run the diagnostic script:
```bash
chmod +x test-endpoints.sh
./test-endpoints.sh
```

This will tell you exactly what's wrong and how to fix it.

