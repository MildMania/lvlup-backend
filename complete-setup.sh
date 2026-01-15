#!/bin/bash

echo "🔧 Complete Setup & Troubleshooting Script"
echo "=========================================="
echo ""

# 1. Kill existing processes
echo "1️⃣ Stopping any existing servers..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
echo "✅ Ports cleared"
echo ""

# 2. Setup backend
echo "2️⃣ Setting up backend..."
cd backend

echo "   📦 Installing dependencies..."
npm install --silent

echo "   🗄️  Setting up database..."
npx prisma generate
npx prisma db push --accept-data-loss

echo "   👤 Creating super admin..."
npx ts-node scripts/setup-auth.ts

echo "✅ Backend setup complete"
echo ""

# 3. Setup frontend  
echo "3️⃣ Setting up frontend..."
cd ../frontend

echo "   📦 Installing dependencies..."
npm install --silent

echo "✅ Frontend setup complete"
echo ""

# 4. Display credentials
echo "=========================================="
echo "🔐 LOGIN CREDENTIALS"
echo "=========================================="
echo ""
echo "📧 Email:    admin@lvlup.com"
echo "🔑 Password: Admin123!@#"
echo ""
echo "🌐 Frontend: http://localhost:5173/login"
echo "🔧 Backend:  http://localhost:3000"
echo ""
echo "=========================================="
echo ""

# 5. Instructions
echo "📋 Next Steps:"
echo ""
echo "Terminal 1 - Start Backend:"
echo "  cd backend && npm run dev"
echo ""
echo "Terminal 2 - Start Frontend:"
echo "  cd frontend && npm run dev"
echo ""
echo "Then open: http://localhost:5173/login"
echo ""
echo "=========================================="

cd ..

