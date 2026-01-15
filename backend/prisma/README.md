# Prisma Database Setup

## Database Providers

This project supports both SQLite (local development) and PostgreSQL (production).

### Local Development (SQLite)
The `switch-env.sh` script automatically switches the provider to SQLite for local development.

### Production (Railway)
Railway uses PostgreSQL. The schema is configured for PostgreSQL by default.

## Database Sync Strategy

We use `prisma db push` instead of migrations to handle the schema synchronization across different database providers.

### Why `db push` instead of migrations?

1. **Multi-provider support**: Migrations are provider-specific. Using SQLite locally and PostgreSQL in production would require separate migration histories.
2. **Simplicity**: For this project size, `db push` is simpler and faster.
3. **No migration conflicts**: Avoids provider mismatch errors like P3019.

## How to Seed the Local Database

### Step 1: Make sure you're using the local environment

```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend
./switch-env.sh local
```

This will configure your project to use SQLite (local database).

### Step 2: Push the schema to create/update database tables

```bash
cd backend
npm run db:push
```

This creates the database file (`dev.db`) and all tables.

### Step 3: Seed the database with test data

```bash
npm run db:seed
```

This will:
- Create 3 test games (Puzzle Quest Adventures, Space Runner 3D, City Builder Pro)
- Create 1000-2000 users per game
- Generate realistic sessions and events
- Create level funnel data with A/B test variants
- Set up checkpoints, player progression, remote configs, and A/B tests

**Note:** The seed script is smart - if games already exist, it will preserve them and only add level funnel data.

### Step 4: (Optional) Reset and reseed

If you want to start fresh:

```bash
npm run db:reset
```

This will drop all data and reseed from scratch.

## Commands Reference

```bash
# Sync schema to database (creates/updates tables)
npm run db:push

# Generate Prisma Client
npm run generate

# Seed database with test data
npm run db:seed

# Reset database and reseed
npm run db:reset
```

## Troubleshooting

### "Database connection error" when seeding

**For SQLite (local):**
- Make sure you ran `./switch-env.sh local` from the project root
- The database file will be created automatically at `backend/prisma/dev.db`

**For PostgreSQL:**
- Make sure your PostgreSQL server is running
- Check your `DATABASE_URL` in `.env` file
- Verify connection: `psql $DATABASE_URL`

### "Table does not exist" errors

Run `npm run db:push` to create/update all tables first.

### TypeScript compilation errors in seed

The seed file has been fixed to handle strict TypeScript settings. If you still see errors, try:
```bash
npm install
npm run generate
```

## Deployment

Railway automatically runs `prisma db push --skip-generate` on startup, which:
- Syncs the schema to PostgreSQL
- Skips client generation (already done in build step)
- Ensures database is up to date

## Switching to Migrations (Optional)

If you want to use migrations in the future:

1. Remove the `migrations` directory (if exists)
2. Update the provider in `schema.prisma` to your production database
3. Run `npx prisma migrate dev --name init` to create the initial migration
4. Update `package.json` start script to use `prisma migrate deploy`

**Note**: Once you switch to migrations, you'll need to maintain separate databases for different providers or use only one provider throughout.

