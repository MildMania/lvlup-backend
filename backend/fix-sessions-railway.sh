#!/bin/bash

# Fix Session Durations on Railway
# This script runs the session duration fix on Railway's PostgreSQL database

echo "🚂 Railway Session Duration Fix"
echo "================================"
echo ""

# Check if we're in Railway environment
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    echo ""
    echo "Usage:"
    echo "  1. Get your Railway DATABASE_URL from Railway dashboard"
    echo "  2. Run: DATABASE_URL='your-railway-db-url' ./fix-sessions-railway.sh"
    echo ""
    exit 1
fi

# Check if DATABASE_URL is a Railway URL
if [[ ! "$DATABASE_URL" =~ "railway" ]] && [[ ! "$DATABASE_URL" =~ "postgres" ]]; then
    echo "⚠️  WARNING: DATABASE_URL doesn't look like a Railway PostgreSQL URL"
    echo "   Current: $DATABASE_URL"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "📊 Checking for sessions with issues..."
echo ""

# Run the Node.js migration script
cd "$(dirname "$0")"
node fix-session-durations.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Check Railway logs to verify"
    echo "  2. Test your analytics endpoints"
    echo "  3. Monitor session health: GET /api/health/sessions"
else
    echo ""
    echo "❌ Migration failed. Check the error messages above."
    exit 1
fi

