# LvlUp Backend

Backend service for LvlUp - a game analytics and remote configuration tool for game developers.

## Features

- Game analytics tracking (events, sessions)
- User analytics and metrics
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
cd lvlup-backend
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
Create a `.env` file in the root directory with the following variables:
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
- `/config` - Remote configuration management

## Testing

Run tests with:
```bash
npm test
```

## License

MIT