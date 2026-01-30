#!/bin/bash

# Script to apply the revenueUSD migration to Railway database
# This adds multi-currency support to the revenue tracking

echo "🔧 Applying revenueUSD migration..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    echo "Please set your Railway database URL:"
    echo "export DATABASE_URL='postgresql://...'"
    exit 1
fi

# Apply the migration
psql "$DATABASE_URL" -f prisma/migrations/add_revenue_usd_field.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "🎉 Multi-currency support is now enabled!"
    echo "All revenue values will be converted to USD for consistent aggregation."
else
    echo "❌ Migration failed"
    exit 1
fi

