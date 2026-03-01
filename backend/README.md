# LvlUp Backend

Backend service for LvlUp - a game analytics and remote configuration tool for game developers.

> Note: All commands in this README are executed from the `backend/` directory.

## Features

- Game analytics tracking (events, sessions)
- User analytics and metrics
  - Retention analysis
  - Active users (DAU, WAU, MAU)
  - Engagement metrics (session count, session length)
  - Player journey and progression tracking
- Remote configuration
- A/B testing tools

## Setup

### Prerequisites

- Node.js v16 or higher
- PostgreSQL database
- npm or yarn package manager

### Installation

1. Clone the repository

```bash
git clone <repository-url>
cd lvlup-backend/backend
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables
   Create a `.env` file in the backend directory with the following variables:

```
DATABASE_URL="postgresql://username:password@localhost:5432/lvlup"
PORT=3000
```

4. Generate Prisma client

```bash
npx prisma generate
```

5. Apply database migrations

```bash
npx prisma db push
```

6. Start the development server

```bash
npm run dev
```

## Runtime Modes (API vs Worker)

Use runtime flags to split serving traffic and background rollups.

- Railway API service:
  - `RUN_API=true`
  - `RUN_JOBS=false`
- Local worker process:
  - `RUN_API=false`
  - `RUN_JOBS=true`

Example local worker command (run from `backend/`):

```bash
RUN_API=false RUN_JOBS=true DATABASE_URL=<railway_postgres_url> npm run dev
```

The local worker must remain online for cron/rollup processing.

## Job Env Reference

For all background job environment flags and low-cost recommended settings, see:

- `README-JOBS-ENV.md`
- `README-EGRESS-RUNBOOK.md`

### Query Stats Snapshot

Capture top query-cost snapshots for before/after comparisons:

```bash
npm run ops:query-stats-snapshot -- 25
```

Output:

- `logs/query-stats/query-stats-<timestamp>.json`

### PM2 Worker Operations

Start worker with PM2 (from `backend/`):

```bash
cat > .worker.env <<'EOF'
DATABASE_URL=<railway_postgres_url>
EOF
npm run worker:start
```

Redeploy worker after new commits:

```bash
npm run worker:redeploy
```

Auto-update worker when new commits are pushed (polling mode):

```bash
*/2 * * * * cd /Users/emre/Desktop/MM-Projects/lvlup-backend/backend && npm run worker:auto-update >> /tmp/lvlup-worker-auto-update.log 2>&1
```

Install the cron line with `crontab -e`. This checks every 2 minutes and redeploys only when `origin/main` changed.

## API Documentation

### Authentication

All API endpoints require an API key that can be generated through the `/games` endpoint.
The API key should be provided in the `X-API-Key` header or as an `api_key` query parameter.

### Endpoints

- `/games` - Game management (CRUD operations)
- `/analytics` - Analytics tracking and reporting
- `/analytics/enhanced` - Enhanced analytics features
  - `/metrics/session-count` - Session count metrics per user per day
  - `/metrics/session-length` - Session length metrics per user per day
  - `/journey/checkpoints` - Player journey checkpoints management
  - `/journey/progress` - Player journey analytics
- `/config` - Remote configuration management

## Enhanced Analytics Features

### Engagement Metrics

Track and analyze user engagement patterns:

- **Session Count Analytics**: Track how many sessions users have per day

  - Filterable by date range, country, platform, version
  - Supports specific day analysis (e.g., d1, d7, d30)
  - Returns average, median, and distribution of session counts

- **Session Length Analytics**: Track how long users play per day
  - Filterable by date range, country, platform, version
  - Supports specific day analysis (e.g., d1, d7, d30)
  - Returns average, median, total playtime, and duration distribution

### Player Journey

Track player progression through important milestones:

- **Checkpoint Management**: Define and manage game checkpoints (levels, achievements, etc.)

  - Support for checkpoint types and tags for categorization
  - Optional ordering for sequence-based progression

- **Journey Analytics**: Analyze player progression through checkpoints
  - Track completion rates and drop-offs
  - Filter by checkpoint types and tags
  - View individual player journeys

## Testing

Run tests with:

```bash
npm test
```

## License

MIT
