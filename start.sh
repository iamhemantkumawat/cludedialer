#!/usr/bin/env bash
set -e

echo "────────────────────────────────────────"
echo "  CyberX AutoDialer — Starting up"
echo "────────────────────────────────────────"

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ─── Backend ──────────────────────────────────────────────────────────────────
echo ""
echo "📦 Installing backend dependencies…"
cd "$ROOT/backend"
npm install --silent

echo "🗄️ Initializing PostgreSQL schema…"
npm run db:init

echo "📥 Importing legacy SQLite data into PostgreSQL…"
npm run db:import-legacy

echo "🚀 Starting backend on http://localhost:3002 …"
npm run dev &
BACKEND_PID=$!

# ─── Frontend ─────────────────────────────────────────────────────────────────
echo ""
echo "📦 Installing frontend dependencies…"
cd "$ROOT/frontend"
npm install --silent

echo "🎨 Starting frontend on http://localhost:5173 …"
npm run dev &
FRONTEND_PID=$!

# ─── Cleanup on exit ──────────────────────────────────────────────────────────
trap "echo ''; echo '🛑 Shutting down…'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

echo ""
echo "────────────────────────────────────────"
echo "  ✅ AutoDialer running!"
echo "  🌐 Open: http://localhost:5173"
echo "  🔧 API:  http://localhost:3002"
echo "────────────────────────────────────────"
echo ""
echo "Press Ctrl+C to stop."
wait
