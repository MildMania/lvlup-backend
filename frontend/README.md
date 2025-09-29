# LvlUp Frontend

React + Vite dashboard surfaces analytics data from the LvlUp backend API.

> Note: Run these commands from the `frontend/` directory.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template and provide backend details:
   ```bash
   cp .env.example .env.local
   # update VITE_API_BASE_URL and VITE_API_KEY
   ```
3. Run the dev server alongside the backend:
   ```bash
   npm run dev
   ```
   The Vite server proxies `/api` calls to `http://localhost:3000` by default. Override with `VITE_BACKEND_PROXY` if your backend runs elsewhere.

## Project Structure

- `src/lib/apiClient.ts` — Axios instance that injects the API key header.
- `src/services/analytics.ts` — Typed helpers for retention, active-user, and playtime endpoints.
- `src/types/analytics.ts` — Shared DTO types mirroring backend responses.
- `src/App.tsx` — Entry screen outlining the planned dashboards.

Add new views under `src/features/*` and wire them through the `App` shell as the dashboard grows.

## Next Steps

- Build hook/state layers around the service helpers.
- Introduce routing for retention, engagement, and journey sections.
- Pair the UI with charting (e.g., Recharts or Victory) once API integration is verified.
