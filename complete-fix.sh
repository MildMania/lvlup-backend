#!/bin/bash

echo "🔧 Complete System Fix"
echo "======================"
echo ""

# Stop any running servers
echo "🛑 Stopping any running servers..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
echo "✅ Servers stopped"
echo ""

# Fix Backend
echo "📦 Setting up Backend..."
cd backend

echo "  📥 Installing dependencies..."
npm install --silent

echo "  🗄️  Updating database..."
npx prisma generate
npx prisma db push --accept-data-loss

echo "  👤 Creating super admin..."
npx ts-node scripts/setup-auth.ts

echo "✅ Backend ready"
echo ""

# Fix Frontend
echo "📦 Setting up Frontend..."
cd ../frontend

echo "  📥 Installing dependencies (including react-router-dom)..."
npm install --silent
npm install react-router-dom --silent

echo "✅ Frontend ready"
echo ""

# Done
echo "======================"
echo "✅ Setup Complete!"
echo ""
echo "Now run in separate terminals:"
echo ""
echo "Terminal 1 - Backend:"
echo "  cd backend"
echo "  npm run dev"
echo ""
echo "Terminal 2 - Frontend:"
echo "  cd frontend"  
echo "  npm run dev"
echo ""
echo "Then open: http://localhost:5173/login"
echo ""
echo "Credentials:"
echo "  Email:    admin@lvlup.com"
echo "  Password: Admin123!@#"
echo ""

cd ..

