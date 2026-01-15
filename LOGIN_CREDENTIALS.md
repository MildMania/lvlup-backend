# 🔐 Super Admin Login Credentials

## Default Credentials

**📧 Email:** `admin@lvlup.com`  
**🔑 Password:** `Admin123!@#`

## How to Login

1. **Start the Backend:**
   ```bash
   cd backend
   npm run dev
   ```
   Backend will run on: `http://localhost:3000`

2. **Start the Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend will run on: `http://localhost:5173`

3. **Open Your Browser:**
   Navigate to: `http://localhost:5173/login`

4. **Sign In:**
   - Enter email: `admin@lvlup.com`
   - Enter password: `Admin123!@#`
   - Click "Sign in"

## After First Login

⚠️ **Important:** Please change the default password after your first login!

You can change your password by:
1. Go to Dashboard
2. Click on "Edit Profile"
3. Use the "Change Password" option

## What You Can Do

As Super Admin, you have access to:
- ✅ **Dashboard** - View your profile and teams
- ✅ **Team Management** - Create and manage teams
- ✅ **User Management** - Create and manage dashboard users
- ✅ **Game Access** - Grant access to games
- ✅ **Analytics** - View game analytics (existing functionality)

## Troubleshooting

### Backend won't start
```bash
cd backend
npx prisma generate
npx prisma db push
npm run dev
```

### Can't login
1. Make sure backend is running on port 3000
2. Check browser console for errors
3. Verify .env files are configured correctly

### Need to reset super admin
Run this in the backend directory:
```bash
npx ts-node scripts/setup-auth.ts
```

---

**Security Note:** These are default credentials for development. In production, use strong, unique passwords and enable 2FA.

