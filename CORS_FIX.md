# 🔧 Authentication Errors - Quick Fix

## Problem 1: CORS Error

You're seeing this error:
```
Access to XMLHttpRequest has been blocked by CORS policy: 
The value of the 'Access-Control-Allow-Origin' header must not be the wildcard '*' 
when the request's credentials mode is 'include'.
```

## Problem 2: 404 Not Found

You're seeing:
```
POST http://localhost:3000/api/auth/login 404 (Not Found)
```

## The Solutions

Both issues have been fixed in the code. You just need to **restart the backend server**.

### What Was Fixed

1. **CORS Configuration** (`src/index.ts`):
   ```typescript
   // Before
   app.use(cors()); // ❌ Wildcard
   
   // After
   app.use(cors({
       origin: 'http://localhost:5173', // ✅ Specific origin
       credentials: true,                // ✅ Allow cookies
   }));
   ```

2. **Auth Routes Registration** (`src/routes/index.ts`):
   ```typescript
   // Added these imports and routes
   import authRoutes from './auth';
   import teamRoutes from './teams';
   import userRoutes from './users';
   import gameAccessRoutes from './game-access';
   
   router.use('/auth', authRoutes);
   router.use('/teams', teamRoutes);
   router.use('/users', userRoutes);
   ```

## Steps to Fix

### Option 1: Quick Restart (Recommended)

1. **Stop the backend server** (Press `Ctrl+C` in the terminal running the backend)

2. **Start it again:**
   ```bash
   cd backend
   npm run dev
   ```

3. **Refresh your browser** at `http://localhost:5173/login`

4. **Try logging in again** with:
   - Email: `admin@lvlup.com`
   - Password: `Admin123!@#`

### Option 2: Complete Setup (If Option 1 doesn't work)

Run this command from the project root:
```bash
chmod +x complete-setup.sh
./complete-setup.sh
```

Then:
1. In Terminal 1: `cd backend && npm run dev`
2. In Terminal 2: `cd frontend && npm run dev`
3. Open `http://localhost:5173/login`

## What Was Changed

The backend `src/index.ts` file was updated from:
```typescript
app.use(cors()); // ❌ Wildcard, doesn't work with credentials
```

To:
```typescript
app.use(cors({
    origin: 'http://localhost:5173', // ✅ Specific origin
    credentials: true,                // ✅ Allow cookies
}));
```

## Verify It's Fixed

After restarting the backend:

1. Open browser DevTools (F12)
2. Go to the Network tab
3. Try to login
4. Check the `login` request
5. Under "Response Headers", you should see:
   ```
   Access-Control-Allow-Origin: http://localhost:5173
   Access-Control-Allow-Credentials: true
   ```

## Still Having Issues?

### Check 1: Backend Environment Variable
Make sure `backend/.env` has:
```env
FRONTEND_URL="http://localhost:5173"
```

### Check 2: Port Numbers
- Backend should be on port **3000**
- Frontend should be on port **5173**

Check by running:
```bash
lsof -i :3000  # Should show node process
lsof -i :5173  # Should show vite process
```

### Check 3: Cookie Parser
Make sure `cookie-parser` is installed:
```bash
cd backend
npm list cookie-parser
```

If not installed:
```bash
npm install cookie-parser
```

### Check 4: Clear Browser Cache
Sometimes browsers cache CORS errors:
1. Open DevTools (F12)
2. Right-click on the refresh button
3. Select "Empty Cache and Hard Reload"

## Test Without Frontend

You can test the backend directly:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"email":"admin@lvlup.com","password":"Admin123!@#"}' \
  -v
```

Look for these headers in the response:
```
< Access-Control-Allow-Origin: http://localhost:5173
< Access-Control-Allow-Credentials: true
```

## Success!

Once you see the login form without CORS errors, you're ready to use the system! 🎉

---

**Quick Summary:**
1. Stop backend (Ctrl+C)
2. Start backend (`npm run dev`)
3. Try login again

