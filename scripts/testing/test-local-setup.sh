#!/bin/bash

echo "🧪 Testing Local Backend Setup..."
echo ""

# Check if backend is running
echo "1️⃣  Checking if backend is running on port 3000..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Backend is running!"
    curl -s http://localhost:3000/health | python3 -m json.tool 2>/dev/null || echo "Response received but not JSON"
else
    echo "❌ Backend is NOT running!"
    echo "   Please start it with: cd backend && npm run dev"
    exit 1
fi

echo ""

# Check games endpoint
echo "2️⃣  Fetching games from database..."
GAMES_RESPONSE=$(curl -s http://localhost:3000/api/games)
if echo "$GAMES_RESPONSE" | grep -q "success"; then
    echo "✅ Games endpoint responding!"
    echo "$GAMES_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$GAMES_RESPONSE"
else
    echo "❌ Games endpoint error!"
    echo "Response: $GAMES_RESPONSE"
    echo ""
    echo "💡 This usually means Prisma Client needs regeneration."
    echo "   Run: cd backend && npx prisma generate && restart server"
    exit 1
fi

echo ""

# Check frontend (if running)
echo "3️⃣  Checking if frontend is running on port 5173..."
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "✅ Frontend is running!"
    echo "   Open: http://localhost:5173"
else
    echo "⚠️  Frontend is NOT running"
    echo "   Start it with: cd frontend && npm run dev"
fi

echo ""

# Test creating a game
echo "4️⃣  Testing game creation..."
CREATE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/games \
    -H "Content-Type: application/json" \
    -d '{"name":"Test Game '$(date +%s)'","description":"Automated test game"}')

if echo "$CREATE_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Game creation works!"
    echo "$CREATE_RESPONSE" | python3 -m json.tool 2>/dev/null
else
    echo "⚠️  Game creation response:"
    echo "$CREATE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CREATE_RESPONSE"
fi

echo ""
echo "✨ Testing complete!"
echo ""
echo "📚 Next steps:"
echo "   1. Open http://localhost:5173 in your browser"
echo "   2. You should see games listed in the dashboard"
echo "   3. Try creating a new game"
echo ""

