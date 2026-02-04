# Database Setup Guide

You have several options to set up a database for your test dataset:

## Option 1: PostgreSQL with Docker (Recommended for Testing)

This is the fastest way to get started:

### 1. Install Docker (if not already installed)

Visit: https://docs.docker.com/desktop/install/mac/

### 2. Run PostgreSQL container

```bash
cd backend
docker run --name lvlup-postgres \
  -e POSTGRES_DB=lvlup \
  -e POSTGRES_USER=username \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:15

# Wait a few seconds for the database to start
sleep 5

# Push the database schema
npm run db:push

# Seed the test data
npm run db:seed
```

### 3. Stop the database when done

```bash
docker stop lvlup-postgres
docker rm lvlup-postgres
```

## Option 2: PostgreSQL with Homebrew

### 1. Install PostgreSQL

```bash
brew install postgresql@15
brew services start postgresql@15
```

### 2. Create database and user

```bash
# Connect to PostgreSQL
psql postgres

# In the PostgreSQL prompt:
CREATE DATABASE lvlup;
CREATE USER username WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE lvlup TO username;
\q
```

### 3. Setup and seed

```bash
cd backend
npm run db:push
npm run db:seed
```

## Option 3: SQLite (Easiest for Local Development)

I can modify the schema to use SQLite instead of PostgreSQL:

### 1. Update schema.prisma

Change the datasource from:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

To:

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

### 2. Update .env

Change:

```
DATABASE_URL="postgresql://username:password@localhost:5432/lvlup?schema=public"
```

To:

```
DATABASE_URL="file:./dev.db"
```

### 3. Generate and seed

```bash
npm run generate
npm run db:push
npm run db:seed
```

## Which Option Should You Choose?

- **Docker PostgreSQL**: Best for testing the exact production environment
- **Homebrew PostgreSQL**: Good if you want PostgreSQL permanently installed
- **SQLite**: Fastest to get started, but some analytics queries might behave differently

Let me know which option you'd prefer, and I can help you set it up!
