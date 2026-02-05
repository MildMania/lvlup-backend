#!/bin/bash

echo "🧪 Testing Authentication Endpoints"
echo "===================================="
echo ""

# Test 1: Health Check
echo "1️⃣ Testing Health Endpoint..."
HEALTH=$(curl -s http://localhost:3000/health)
if [[ $HEALTH == *"ok"* ]]; then
    echo "   ✅ Health check passed"
else
    echo "   ❌ Health check failed"
    echo "   Response: $HEALTH"
fi
echo ""

# Test 2: Auth Route exists
echo "2️⃣ Testing Auth Route..."
LOGIN_RESULT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/login)
if [[ $LOGIN_RESULT == "400" ]] || [[ $LOGIN_RESULT == "401" ]]; then
    echo "   ✅ Auth route exists (got $LOGIN_RESULT, which is expected without credentials)"
elif [[ $LOGIN_RESULT == "404" ]]; then
    echo "   ❌ Auth route NOT FOUND (404)"
    echo "   💡 Make sure backend is restarted after the route changes"
else
    echo "   ⚠️  Auth route returned unexpected code: $LOGIN_RESULT"
fi
echo ""

# Test 3: Login with credentials
echo "3️⃣ Testing Login with credentials..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"email":"admin@lvlup.com","password":"Admin123!@#"}')

if [[ $LOGIN_RESPONSE == *"accessToken"* ]]; then
    echo "   ✅ Login successful! Got access token"
    echo "   Token preview: ${LOGIN_RESPONSE:0:100}..."
elif [[ $LOGIN_RESPONSE == *"error"* ]]; then
    echo "   ⚠️  Login failed with error:"
    echo "   $LOGIN_RESPONSE"
else
    echo "   ❌ Unexpected response:"
    echo "   $LOGIN_RESPONSE"
fi
echo ""

# Test 4: CORS Headers
echo "4️⃣ Testing CORS Headers..."
CORS_HEADERS=$(curl -s -I -X OPTIONS http://localhost:3000/api/auth/login \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type")

if [[ $CORS_HEADERS == *"Access-Control-Allow-Origin: http://localhost:5173"* ]]; then
    echo "   ✅ CORS headers correct"
elif [[ $CORS_HEADERS == *"Access-Control-Allow-Origin: *"* ]]; then
    echo "   ❌ CORS still using wildcard (*)"
    echo "   💡 Backend needs to be restarted"
else
    echo "   ⚠️  CORS headers:"
    echo "$CORS_HEADERS" | grep "Access-Control"
fi
echo ""

# Test 5: Check if routes are registered
echo "5️⃣ Testing Route Registration..."
ROUTES_PAGE=$(curl -s http://localhost:3000/debug/routes)
if [[ $ROUTES_PAGE == *"/api/auth/login"* ]]; then
    echo "   ✅ Auth routes are registered"
elif [[ $ROUTES_PAGE == *"404"* ]] || [[ $ROUTES_PAGE == "" ]]; then
    echo "   ⚠️  Debug route not accessible"
else
    echo "   ⚠️  Auth routes may not be registered"
fi
echo ""

echo "===================================="
echo ""
echo "📝 Summary:"
echo ""
if [[ $LOGIN_RESPONSE == *"accessToken"* ]]; then
    echo "✅ Backend is working correctly!"
    echo "🌐 You can now login at: http://localhost:5173/login"
    echo ""
    echo "Credentials:"
    echo "  Email: admin@lvlup.com"
    echo "  Password: Admin123!@#"
else
    echo "⚠️  Issues detected. Common fixes:"
    echo ""
    echo "1. Restart the backend:"
    echo "   - Stop it (Ctrl+C)"
    echo "   - Start again: cd backend && npm run dev"
    echo ""
    echo "2. Make sure database is setup:"
    echo "   cd backend"
    echo "   npx prisma db push"
    echo "   npx ts-node scripts/setup-auth.ts"
    echo ""
    echo "3. Check if backend is running:"
    echo "   lsof -i :3000"
fi
echo ""

