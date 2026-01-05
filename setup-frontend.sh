#!/bin/bash

# Frontend Configuration for Railway Backend
echo "🎨 Frontend → Railway Backend Configuration"
echo "==========================================="
echo ""

# Check if Railway URL is provided
if [ -z "$1" ]; then
    echo "❌ Error: Railway backend URL required"
    echo ""
    echo "Usage: ./setup-frontend.sh <railway-url> [api-key]"
    echo ""
    echo "Example:"
    echo "  ./setup-frontend.sh https://lvlup-backend-production-abc123.up.railway.app"
    echo "  ./setup-frontend.sh https://your-backend.railway.app lvl_abc123def456"
    echo ""
    echo "To find your Railway URL:"
    echo "  1. Go to Railway dashboard"
    echo "  2. Click your lvlup-backend service"
    echo "  3. Copy the URL from 'Domains' section"
    exit 1
fi

RAILWAY_URL="$1"
API_KEY="${2}"

# Remove trailing slash
RAILWAY_URL="${RAILWAY_URL%/}"

echo "🌐 Railway URL: $RAILWAY_URL"
echo ""

# Test backend health
echo "🔍 Testing backend connection..."
HEALTH_RESPONSE=$(curl -s "$RAILWAY_URL/health")

if [ $? -ne 0 ]; then
    echo "❌ Failed to connect to backend"
    echo "   Check your Railway URL and make sure the service is running"
    exit 1
fi

echo "✅ Backend is healthy!"
echo ""

# Create frontend .env file
ENV_FILE="frontend/.env"

if [ -f "$ENV_FILE" ]; then
    echo "⚠️  Found existing $ENV_FILE"
    echo "📝 Creating backup: ${ENV_FILE}.backup"
    cp "$ENV_FILE" "${ENV_FILE}.backup"
fi

echo "📝 Creating $ENV_FILE..."

if [ -z "$API_KEY" ]; then
    # No API key provided, use placeholder
    cat > "$ENV_FILE" << EOF
# Frontend Environment Variables
# Generated: $(date)

# Railway Backend URL
VITE_API_BASE_URL=$RAILWAY_URL/api

# Game API Key - Replace with your actual API key
# Get it by running: ./create-game.sh $RAILWAY_URL
VITE_API_KEY=YOUR_API_KEY_HERE
EOF

    echo "✅ Created $ENV_FILE"
    echo ""
    echo "⚠️  You need to add your API key!"
    echo ""
    echo "To get an API key:"
    echo "  1. Run: ./create-game.sh $RAILWAY_URL"
    echo "  2. Copy the API key from the response"
    echo "  3. Update $ENV_FILE with the API key"
else
    # API key provided
    cat > "$ENV_FILE" << EOF
# Frontend Environment Variables
# Generated: $(date)

# Railway Backend URL
VITE_API_BASE_URL=$RAILWAY_URL/api

# Game API Key
VITE_API_KEY=$API_KEY
EOF

    echo "✅ Created $ENV_FILE with API key"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Configuration:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Backend URL: $RAILWAY_URL/api"
if [ -n "$API_KEY" ]; then
    echo "API Key:     $API_KEY"
else
    echo "API Key:     [NEEDS TO BE SET]"
fi
echo ""

# Check if in frontend directory or root
if [ -d "frontend" ]; then
    FRONTEND_DIR="frontend"
else
    FRONTEND_DIR="."
fi

echo "🚀 Next Steps:"
echo ""
echo "1. Start the frontend development server:"
echo "   cd $FRONTEND_DIR"
echo "   npm install  # if not done yet"
echo "   npm run dev"
echo ""
echo "2. Open in browser:"
echo "   http://localhost:5173"
echo ""
echo "3. The frontend will now connect to Railway backend!"
echo ""

if [ -z "$API_KEY" ]; then
    echo "⚠️  Don't forget to:"
    echo "   - Create a game: ./create-game.sh $RAILWAY_URL"
    echo "   - Update $ENV_FILE with the API key"
    echo ""
fi

echo "✅ Frontend configuration complete!"

