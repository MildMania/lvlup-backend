# LvlUp Platform Monorepo

Backend (Express + Prisma) and Frontend (React + Vite) for game analytics.

## Quick Start

### Environment Switching
```bash
./env local   # Switch to local dev (SQLite)
./env prod    # Switch to production (PostgreSQL)
./env status  # Check current environment
```

Then start servers:
```bash
cd backend && npm run dev    # Terminal 1
cd frontend && npm run dev   # Terminal 2
```

### First Time Setup
```bash
./first-time-setup.sh  # Installs dependencies, sets up DB, configures env
```

---

## Environment Commands

| Command | Description |
|---------|-------------|
| `./env local` | Switch to local development (SQLite) |
| `./env prod` | Switch to production (PostgreSQL on Railway) |
| `./env status` | Show current environment configuration |
| `./test-local-setup.sh` | Test your local setup |

### NPM Shortcuts (from backend/ or frontend/)
```bash
npm run dev:local   # Switch to local + start dev server
npm run dev:prod    # Switch to production + start dev server
npm run env:status  # Check current environment
```

### VS Code Users
Press `Cmd+Shift+P` → "Tasks: Run Task" → Select environment

---

## What Gets Switched Automatically?

- ✅ Backend database (SQLite ↔ PostgreSQL)
- ✅ Frontend API endpoint (localhost ↔ production URL)
- ✅ API keys for games
- ✅ Prisma Client regeneration

**After switching, restart your servers.**

---

## Manual Setup (if needed)

### Backend
```bash
cd backend
npm install
# .env will be created automatically by ./env local
npm run dev
```

### Frontend
```bash
cd frontend
npm install
# .env.local will be created automatically by ./env local
npm run dev
```

---

## Documentation

- `RAILWAY_DEPLOYMENT.md` - **How to deploy to Railway**
- `backend/README.md` - Backend API details
- `frontend/README.md` - Frontend setup details
- `backend/API-EXAMPLES.md` - API usage examples
- `DATABASE_SETUP.md` - Database setup instructions

---

## Deploying to Railway

**Yes, switch to prod BEFORE committing:**

```bash
./env prod              # 1. Switch to PostgreSQL
git add .               # 2. Stage changes
git commit -m "Deploy"  # 3. Commit
git push origin main    # 4. Railway auto-deploys
./env local             # 5. Switch back to SQLite
```

**Why?** Railway uses PostgreSQL. Running `./env prod` updates your schema to use PostgreSQL before pushing.

**See `RAILWAY_DEPLOYMENT.md` for complete guide.**

---

## Troubleshooting

**Servers not connecting?**
```bash
./env status           # Check what's active
./env local            # Switch to local
cd backend && npm run dev  # Restart backend
cd frontend && npm run dev # Restart frontend
```

**Database errors?**
```bash
cd backend
npx prisma generate
# Restart server
```

**Test your setup:**
```bash
./test-local-setup.sh
```



