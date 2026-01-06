# LvlUp Frontend

React + Vite dashboard surfaces analytics data from the LvlUp backend API.

> Note: Run these commands from the `frontend/` directory.

## 🚀 Quick Deploy to Vercel

```bash
vercel
```

See [VERCEL_DEPLOYMENT_GUIDE.md](../VERCEL_DEPLOYMENT_GUIDE.md) for detailed deployment instructions.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template and provide backend details:
   ```bash
   cp .env.example .env
   # update VITE_API_BASE_URL and VITE_API_KEY
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
   Opens at `http://localhost:5173`

## Environment Variables

Required for both development and production:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `https://lvlup-backend-production.up.railway.app/api` |
| `VITE_API_KEY` | Game API key | `lvl_da7339ff066a4c0295e5b11fc15bb79b` |

## Project Structure

- `src/lib/apiClient.ts` — Axios instance that injects the API key header.
- `src/services/analytics.ts` — Typed helpers for retention, active-user, and playtime endpoints.
- `src/types/analytics.ts` — Shared DTO types mirroring backend responses.
- `src/components/` — Reusable UI components (Dashboard, Layout, Modals, etc.)
- `src/contexts/` — React contexts for global state (GameContext)
- `src/App.tsx` — Main application component with routing

## Features

- ✅ Multi-game dashboard
- ✅ Real-time analytics
- ✅ Game management (create, switch, delete)
- ✅ Event tracking visualization
- ✅ User and session metrics
- ✅ Responsive design

## Deployment

### Vercel (Recommended)
```bash
vercel --prod
```

### Manual Build
```bash
npm run build
# Output in dist/
```

## Next Steps

- Build hook/state layers around the service helpers.
- Introduce routing for retention, engagement, and journey sections.
- Pair the UI with charting (e.g., Recharts or Victory) once API integration is verified.
