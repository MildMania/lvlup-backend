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

### Commands

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

