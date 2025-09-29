# LvlUp Platform Monorepo

This repository now houses two separate projects:

- `backend/` – Express + Prisma service powering analytics, engagement metrics, and player journey features.
- `frontend/` – React + Vite dashboard that consumes the backend APIs.

## Getting Started

Clone the repo and work with each project independently.

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The backend README (`backend/README.md`) covers schema details, available APIs, and testing instructions.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The Vite dev server proxies `/api` requests to `http://localhost:3000` by default. Override this via `VITE_BACKEND_PROXY` if your backend runs elsewhere. See `frontend/README.md` for additional guidance.

## Repository Scripts

Commands must be executed from inside either `backend/` or `frontend/`. There is no root-level package configuration.

## Contributing

- Keep backend- and frontend-specific changes scoped to their respective folders.
- Update the corresponding README when adding new workflows or dependencies.

