#!/bin/bash

echo "🧹 Complete Backend Clean & Restart"
echo "===================================="
echo ""

cd backend

echo "1️⃣ Stopping any running backend..."
pkill -f "ts-node-dev" || true
pkill -f "node.*index.ts" || true
sleep 2

echo "2️⃣ Cleaning compiled files..."
rm -rf dist/
rm -rf node_modules/.cache/
rm -rf .ts-node/

echo "3️⃣ Regenerating Prisma..."
npx prisma generate

echo "4️⃣ Starting backend fresh..."
echo ""
echo "🚀 Backend starting..."
echo "    Watch for: '✅ authenticateEither middleware loaded!'"
echo "    Then try loading analytics page"
echo ""

npm run dev

