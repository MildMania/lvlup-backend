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

