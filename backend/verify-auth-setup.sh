#!/bin/bash

# LvlUp Authentication System - Verification Script
# This script checks if all components are properly installed and configured

echo "🔍 LvlUp Authentication System - Verification"
echo "=============================================="
echo ""

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the backend directory"
    exit 1
fi

echo "✅ Running from backend directory"
echo ""

# Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node -v)
echo "   Node.js: $NODE_VERSION"
echo ""

# Check if dependencies are installed
echo "📦 Checking dependencies..."
DEPS=(
    "bcrypt"
    "jsonwebtoken"
    "cookie-parser"
    "express-rate-limit"
    "speakeasy"
    "qrcode"
)

ALL_DEPS_OK=true
for dep in "${DEPS[@]}"; do
    if grep -q "\"$dep\"" package.json; then
        echo "   ✅ $dep"
    else
        echo "   ❌ $dep (missing)"
        ALL_DEPS_OK=false
    fi
done
echo ""

# Check environment variables
echo "🔧 Checking environment configuration..."
if [ -f ".env" ]; then
    echo "   ✅ .env file exists"
    
    ENV_VARS=(
        "DATABASE_URL"
        "JWT_ACCESS_SECRET"
        "JWT_REFRESH_SECRET"
        "FRONTEND_URL"
        "BACKEND_URL"
    )
    
    for var in "${ENV_VARS[@]}"; do
        if grep -q "^$var=" .env; then
            echo "   ✅ $var is set"
        else
            echo "   ⚠️  $var not found in .env"
        fi
    done
else
    echo "   ⚠️  .env file not found"
    echo "   💡 Copy from .env.example and configure"
fi
echo ""

# Check Prisma schema
echo "🗄️  Checking database schema..."
if [ -f "prisma/schema.prisma" ]; then
    echo "   ✅ Prisma schema exists"
    
    MODELS=(
        "DashboardUser"
        "Team"
        "TeamMember"
        "GameAccess"
        "RefreshToken"
        "TwoFactorAuth"
        "AuditLog"
    )
    
    for model in "${MODELS[@]}"; do
        if grep -q "model $model" prisma/schema.prisma; then
            echo "   ✅ $model model"
        else
            echo "   ❌ $model model (missing)"
        fi
    done
else
    echo "   ❌ Prisma schema not found"
fi
echo ""

# Check if Prisma client is generated
echo "🔧 Checking Prisma client..."
if [ -d "node_modules/.prisma" ] || [ -d "node_modules/@prisma/client" ]; then
    echo "   ✅ Prisma client generated"
else
    echo "   ⚠️  Prisma client not generated"
    echo "   💡 Run: npx prisma generate"
fi
echo ""

# Check source files
echo "📁 Checking source files..."
FILES=(
    "src/services/TokenService.ts"
    "src/services/AuthService.ts"
    "src/services/TeamService.ts"
    "src/services/GameAccessService.ts"
    "src/services/UserManagementService.ts"
    "src/services/AuditLogService.ts"
    "src/controllers/AuthController.ts"
    "src/controllers/TeamController.ts"
    "src/controllers/UserManagementController.ts"
    "src/controllers/GameAccessController.ts"
    "src/middleware/dashboardAuth.ts"
    "src/routes/auth.ts"
    "src/routes/teams.ts"
    "src/routes/users.ts"
    "src/routes/game-access.ts"
)

ALL_FILES_OK=true
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file (missing)"
        ALL_FILES_OK=false
    fi
done
echo ""

# Check setup script
echo "🚀 Checking setup script..."
if [ -f "scripts/setup-auth.ts" ]; then
    echo "   ✅ setup-auth.ts exists"
else
    echo "   ❌ setup-auth.ts not found"
fi
echo ""

# Summary
echo "=============================================="
echo "📊 Verification Summary"
echo "=============================================="
echo ""

if [ "$ALL_DEPS_OK" = true ] && [ "$ALL_FILES_OK" = true ]; then
    echo "✅ All authentication system files are present!"
    echo ""
    echo "🎯 Next Steps:"
    echo "   1. Configure .env file with JWT secrets"
    echo "   2. Run: npx prisma db push"
    echo "   3. Run: npx prisma generate"
    echo "   4. Run: npx ts-node scripts/setup-auth.ts"
    echo "   5. Run: npm run dev"
    echo "   6. Test with: curl -X POST http://localhost:3000/api/auth/login"
    echo ""
else
    echo "⚠️  Some components are missing or need attention"
    echo ""
    echo "🔧 Recommended Actions:"
    if [ "$ALL_DEPS_OK" = false ]; then
        echo "   - Install missing dependencies: npm install"
    fi
    if [ "$ALL_FILES_OK" = false ]; then
        echo "   - Restore missing source files"
    fi
    if [ ! -f ".env" ]; then
        echo "   - Create .env file from .env.example"
    fi
    echo ""
fi

echo "=============================================="
echo ""

