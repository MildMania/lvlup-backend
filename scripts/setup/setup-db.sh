#!/bin/bash

echo "Setting up Remote Config database..."

cd /Users/emre/Desktop/MM-Projects/lvlup-backend/backend

# Remove old database
rm -f prisma/dev.db prisma/dev.db-shm prisma/dev.db-wal

# Create migrations directory
mkdir -p prisma/migrations

# Push schema to create database
npx prisma db push --skip-generate --accept-data-loss

# Check if successful
if [ -f prisma/dev.db ]; then
    echo "✅ Database created successfully"
    echo "Tables:"
    sqlite3 prisma/dev.db ".tables"
    echo ""
    echo "remote_configs table schema:"
    sqlite3 prisma/dev.db ".schema remote_configs"
else
    echo "❌ Database creation failed"
    exit 1
fi

