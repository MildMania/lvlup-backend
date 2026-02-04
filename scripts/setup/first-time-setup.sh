#!/bin/bash

# First-time setup script for new developers

echo "🚀 LvlUp Backend - First Time Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "This script will set up your local development environment."
echo ""

# Check for Node.js
echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} Found $NODE_VERSION"
else
    echo -e "${YELLOW}✗${NC} Node.js not found"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check for npm
echo -n "Checking npm... "
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓${NC} Found v$NPM_VERSION"
else
    echo -e "${YELLOW}✗${NC} npm not found"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Installing Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Backend dependencies
echo "Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Backend dependencies installed"
else
    echo -e "${YELLOW}✗${NC} Backend installation failed"
    exit 1
fi

# Frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Frontend dependencies installed"
else
    echo -e "${YELLOW}✗${NC} Frontend installation failed"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚙️  Configuring Environment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if backend/.env exists
cd "$SCRIPT_DIR"
if [ ! -f "backend/.env" ]; then
    echo "Creating backend/.env..."
    cat > "backend/.env" << 'EOF'
PORT=3000
NODE_ENV=development
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="your-openai-api-key-here"
CORS_ORIGIN="http://localhost:5173"
EOF
    echo -e "${GREEN}✓${NC} Created backend/.env"
else
    echo -e "${BLUE}ℹ${NC}  backend/.env already exists"
fi

# Set up local environment
echo ""
echo "Setting up local development environment..."
./switch-env.sh local > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Configured for local development"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  Setting Up Database"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$SCRIPT_DIR/backend"

# Generate Prisma Client
echo "Generating Prisma Client..."
npx prisma generate > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Prisma Client generated"

# Push database schema
echo "Creating database schema..."
npx prisma db push > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Database schema created"

# Seed database
echo "Seeding database with sample games..."
npm run db:seed > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Database seeded with sample data"
else
    echo -e "${YELLOW}⚠${NC}  Seeding skipped (may already have data)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Your local development environment is ready!"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Start the backend server:"
echo "     cd backend && npm run dev"
echo ""
echo "  2. In a new terminal, start the frontend:"
echo "     cd frontend && npm run dev"
echo ""
echo "  3. Open your browser to:"
echo "     http://localhost:5173"
echo ""
echo -e "${BLUE}Quick commands:${NC}"
echo ""
echo "  Switch to local:      ./env local"
echo "  Switch to production: ./env prod"
echo "  Check status:         ./env status"
echo "  Test setup:           ./test-local-setup.sh"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo ""
echo "  Quick reference:   cat QUICK_REFERENCE.txt"
echo "  Full workflow:     open WORKFLOW_GUIDE.md"
echo "  Local setup:       open LOCAL_SETUP_GUIDE.md"
echo ""
echo "Happy coding! 🚀"
echo ""

