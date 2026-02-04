#!/bin/bash

echo "🔄 Restarting Backend Server..."
echo ""

# Kill any existing backend processes on port 3000
echo "📍 Checking for existing processes on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
echo "✅ Cleared port 3000"
echo ""

# Navigate to backend directory
cd "$(dirname "$0")/backend"

# Start the backend
echo "🚀 Starting backend server..."
npm run dev


