# Prisma Migration for Production (PostgreSQL)

## Important Note

The schema has been updated to use PostgreSQL for production deployment. SQLite is no longer supported.

## For Local Development

### Option 1: Use PostgreSQL Locally (Recommended)

Install PostgreSQL:
```bash
# macOS
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb lvlup_dev

# Update .env
DATABASE_URL="postgresql://localhost:5432/lvlup_dev?schema=public"
```

### Option 2: Use Docker
```bash
# Run PostgreSQL in Docker
docker run --name lvlup-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=lvlup_dev \
  -p 5432:5432 \
  -d postgres:15

# Update .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lvlup_dev?schema=public"
```

## Create Initial Migration

Once you have PostgreSQL running locally:

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Create initial migration
npx prisma migrate dev --name init

# Seed database (optional)
npm run db:seed
```

## For Production (Render.com)

Migrations run automatically during deployment with:
```bash
npm run db:migrate
```

Which runs:
```bash
npx prisma migrate deploy
```

## Migration Files

Migration files will be created in `prisma/migrations/` directory.
These SHOULD be committed to git.

## Troubleshooting

### "Can't reach database server"
- Make sure PostgreSQL is running
- Check DATABASE_URL in .env
- Verify port 5432 is not blocked

### "Migration failed"
- Drop database and recreate: `dropdb lvlup_dev && createdb lvlup_dev`
- Run migration again: `npx prisma migrate dev`

### "Prisma client not generated"
- Run: `npx prisma generate`
- Restart your dev server

