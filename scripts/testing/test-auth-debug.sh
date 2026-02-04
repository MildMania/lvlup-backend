#!/bin/bash

echo "🔍 Debug Authentication Issue"
echo "=============================="
echo ""

# Get the access token from localStorage
echo "📋 Instructions:"
echo "1. Open browser DevTools (F12)"
echo "2. Go to Console tab"
echo "3. Type: localStorage.getItem('accessToken')"
echo "4. Copy the token value"
echo "5. Paste it below when prompted"
echo ""

read -p "Enter your access token: " TOKEN

if [ -z "$TOKEN" ]; then
    echo "❌ No token provided"
    exit 1
fi

echo ""
echo "Testing with token: ${TOKEN:0:30}..."
echo ""

# Test 1: Auth endpoint (should work)
echo "Test 1: /api/auth/me (uses dashboardAuth directly)"
echo "---------------------------------------------------"
RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULT"
echo ""

# Test 2: Games endpoint (uses authenticateEither)
echo "Test 2: /api/games (uses authenticateEither)"
echo "---------------------------------------------"
RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:3000/api/games \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULT"
echo ""

# Test 3: Analytics endpoint (uses authenticateEither)
echo "Test 3: /api/analytics/dashboard (uses authenticateEither)"
echo "----------------------------------------------------------"
RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" "http://localhost:3000/api/analytics/dashboard?startDate=2026-01-08&endDate=2026-01-15" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULT"
echo ""

echo "=============================="
echo ""
echo "💡 Check backend terminal for debug logs from authenticateEither"
echo "   Look for lines starting with 'authenticateEither:'"
echo ""

