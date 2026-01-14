#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

print_usage() {
    echo ""
    echo "🔄 Environment Switcher for LvlUp Backend"
    echo ""
    echo "Usage: ./switch-env.sh [local|production|status]"
    echo ""
    echo "Commands:"
    echo "  local       - Switch to local development environment (SQLite)"
    echo "  production  - Switch to production environment (PostgreSQL on Railway)"
    echo "  status      - Show current environment configuration"
    echo ""
    echo "Examples:"
    echo "  ./switch-env.sh local       # Switch to local dev"
    echo "  ./switch-env.sh production  # Switch to production"
    echo "  ./switch-env.sh status      # Check current setup"
    echo ""
}

show_status() {
    echo ""
    echo "📊 Current Environment Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Backend status
    echo ""
    echo "🔧 Backend Configuration:"
    if [ -f "$BACKEND_DIR/.env" ]; then
        DATABASE_URL=$(grep "^DATABASE_URL=" "$BACKEND_DIR/.env" | cut -d'"' -f2)
        if [[ $DATABASE_URL == file:* ]]; then
            echo -e "  Environment: ${GREEN}LOCAL (SQLite)${NC}"
            echo "  Database: $DATABASE_URL"
        elif [[ $DATABASE_URL == postgres* ]]; then
            echo -e "  Environment: ${BLUE}PRODUCTION (PostgreSQL)${NC}"
            echo "  Database: ${DATABASE_URL:0:50}..."
        else
            echo -e "  Environment: ${YELLOW}UNKNOWN${NC}"
        fi
    else
        echo -e "  ${RED}❌ .env file not found${NC}"
    fi
    
    # Check if backend is running
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "  Backend Server: ${GREEN}✅ Running on port 3000${NC}"
    else
        echo -e "  Backend Server: ${YELLOW}⚠️  Not running${NC}"
    fi
    
    # Frontend status
    echo ""
    echo "🎨 Frontend Configuration:"
    if [ -f "$FRONTEND_DIR/.env.local" ]; then
        API_URL=$(grep "^VITE_API_BASE_URL=" "$FRONTEND_DIR/.env.local" | cut -d'=' -f2)
        if [[ $API_URL == *"localhost"* ]]; then
            echo -e "  Environment: ${GREEN}LOCAL${NC}"
            echo "  API URL: $API_URL"
        else
            echo -e "  Environment: ${BLUE}PRODUCTION${NC}"
            echo "  API URL: $API_URL"
        fi
        API_KEY=$(grep "^VITE_API_KEY=" "$FRONTEND_DIR/.env.local" | cut -d'=' -f2)
        echo "  API Key: ${API_KEY:0:20}..."
    elif [ -f "$FRONTEND_DIR/.env" ]; then
        echo -e "  Environment: ${BLUE}PRODUCTION (using .env)${NC}"
        API_URL=$(grep "^VITE_API_BASE_URL=" "$FRONTEND_DIR/.env" | cut -d'=' -f2)
        echo "  API URL: $API_URL"
    else
        echo -e "  ${RED}❌ No .env files found${NC}"
    fi
    
    # Check if frontend is running
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "  Frontend Server: ${GREEN}✅ Running on port 5173${NC}"
    else
        echo -e "  Frontend Server: ${YELLOW}⚠️  Not running${NC}"
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

switch_to_local() {
    echo ""
    echo "🔄 Switching to LOCAL development environment..."
    echo ""
    
    # Backend - ensure SQLite configuration
    echo "📝 Configuring backend for SQLite..."
    if [ -f "$BACKEND_DIR/.env" ]; then
        # Update DATABASE_URL to SQLite
        if grep -q "^DATABASE_URL=" "$BACKEND_DIR/.env"; then
            sed -i.bak 's|^DATABASE_URL=.*|DATABASE_URL="file:./dev.db"|' "$BACKEND_DIR/.env"
            echo -e "  ${GREEN}✅${NC} Updated DATABASE_URL to SQLite"
        else
            echo 'DATABASE_URL="file:./dev.db"' >> "$BACKEND_DIR/.env"
            echo -e "  ${GREEN}✅${NC} Added DATABASE_URL for SQLite"
        fi
        rm -f "$BACKEND_DIR/.env.bak"
    else
        echo -e "  ${RED}❌ Backend .env file not found${NC}"
        exit 1
    fi
    
    # Update Prisma schema to use SQLite
    if [ -f "$BACKEND_DIR/prisma/schema.prisma" ]; then
        sed -i.bak 's/provider = "postgresql"/provider = "sqlite"/' "$BACKEND_DIR/prisma/schema.prisma"
        echo -e "  ${GREEN}✅${NC} Updated Prisma schema to SQLite"
        rm -f "$BACKEND_DIR/prisma/schema.prisma.bak"
    fi
    
    # Frontend - create/update .env.local
    echo "📝 Configuring frontend for local backend..."
    cat > "$FRONTEND_DIR/.env.local" << 'EOF'
# Local Development Environment
VITE_API_BASE_URL=http://localhost:3000/api

# Use Puzzle Quest Adventures game from local DB
VITE_API_KEY=pqa_api_key_12345
EOF
    echo -e "  ${GREEN}✅${NC} Created/updated frontend/.env.local"
    
    # Regenerate Prisma Client for SQLite
    echo ""
    echo "🔧 Regenerating Prisma Client for SQLite..."
    cd "$BACKEND_DIR" && npx prisma generate > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✅${NC} Prisma Client regenerated successfully"
    else
        echo -e "  ${YELLOW}⚠️${NC}  Prisma generation had issues (check manually)"
    fi
    
    # Check for running servers
    echo ""
    NEEDS_RESTART=false
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Backend server is running - you need to restart it${NC}"
        NEEDS_RESTART=true
    fi
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Frontend server is running - you need to restart it${NC}"
        NEEDS_RESTART=true
    fi
    
    echo ""
    echo -e "${GREEN}✅ Switched to LOCAL environment!${NC}"
    echo ""
    echo "📚 Next steps:"
    if [ "$NEEDS_RESTART" = true ]; then
        echo "  1. Restart backend: cd backend && npm run dev"
        echo "  2. Restart frontend: cd frontend && npm run dev"
    else
        echo "  1. Start backend: cd backend && npm run dev"
        echo "  2. Start frontend: cd frontend && npm run dev"
    fi
    echo "  3. Open http://localhost:5173"
    echo ""
}

switch_to_production() {
    echo ""
    echo "🔄 Switching to PRODUCTION environment..."
    echo ""
    
    # Check if production DATABASE_URL exists
    if [ ! -f "$BACKEND_DIR/.env.production" ]; then
        echo -e "${YELLOW}⚠️  No .env.production file found for backend${NC}"
        echo "Creating template - please update with your production PostgreSQL URL"
        cat > "$BACKEND_DIR/.env.production" << 'EOF'
# Production Environment Variables
PORT=3000
NODE_ENV=production
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"
OPENAI_API_KEY="your-openai-api-key-here"
CORS_ORIGIN="https://your-frontend-domain.vercel.app"
EOF
        echo -e "  ${GREEN}✅${NC} Created backend/.env.production template"
        echo ""
        echo "Please edit backend/.env.production with your production credentials"
        exit 1
    fi
    
    # Backend - copy production config
    echo "📝 Configuring backend for PostgreSQL..."
    cp "$BACKEND_DIR/.env.production" "$BACKEND_DIR/.env"
    echo -e "  ${GREEN}✅${NC} Using production database configuration"
    
    # Update Prisma schema to use PostgreSQL
    if [ -f "$BACKEND_DIR/prisma/schema.prisma" ]; then
        sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' "$BACKEND_DIR/prisma/schema.prisma"
        echo -e "  ${GREEN}✅${NC} Updated Prisma schema to PostgreSQL"
        rm -f "$BACKEND_DIR/prisma/schema.prisma.bak"
    fi
    
    # Frontend - remove .env.local to use .env
    echo "📝 Configuring frontend for production backend..."
    if [ -f "$FRONTEND_DIR/.env.local" ]; then
        mv "$FRONTEND_DIR/.env.local" "$FRONTEND_DIR/.env.local.backup"
        echo -e "  ${GREEN}✅${NC} Backed up .env.local to .env.local.backup"
        echo -e "  ${GREEN}✅${NC} Frontend will now use .env (production)"
    else
        echo -e "  ${GREEN}✅${NC} Frontend already using .env (production)"
    fi
    
    # Regenerate Prisma Client for PostgreSQL
    echo ""
    echo "🔧 Regenerating Prisma Client for PostgreSQL..."
    cd "$BACKEND_DIR" && npx prisma generate > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✅${NC} Prisma Client regenerated successfully"
    else
        echo -e "  ${YELLOW}⚠️${NC}  Prisma generation had issues (check manually)"
    fi
    
    # Check for running servers
    echo ""
    NEEDS_RESTART=false
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Backend server is running - you need to restart it${NC}"
        NEEDS_RESTART=true
    fi
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Frontend server is running - you need to restart it${NC}"
        NEEDS_RESTART=true
    fi
    
    echo ""
    echo -e "${GREEN}✅ Switched to PRODUCTION environment!${NC}"
    echo ""
    echo "📚 Next steps:"
    if [ "$NEEDS_RESTART" = true ]; then
        echo "  1. Restart backend: cd backend && npm run dev"
        echo "  2. Restart frontend: cd frontend && npm run dev"
    else
        echo "  1. Start backend: cd backend && npm run dev"
        echo "  2. Start frontend: cd frontend && npm run dev"
    fi
    echo "  3. Open http://localhost:5173 (pointing to production DB)"
    echo ""
}

# Main script logic
case "${1:-}" in
    local)
        switch_to_local
        ;;
    production|prod)
        switch_to_production
        ;;
    status)
        show_status
        ;;
    *)
        print_usage
        exit 1
        ;;
esac

