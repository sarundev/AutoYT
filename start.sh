#!/bin/bash
# AutoYT Launcher
# Starts both the FastAPI backend and Next.js frontend

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "  ╔═══════════════════════════════╗"
echo "  ║   🎬  AutoYT Starter          ║"
echo "  ╚═══════════════════════════════╝"
echo ""

# Check for client_secrets.json
if [ ! -f "$SCRIPT_DIR/backend/client_secrets.json" ]; then
  echo "  ⚠️  WARNING: backend/client_secrets.json not found!"
  echo "     You'll need it to connect your YouTube account."
  echo "     See the Setup Guide tab in the dashboard for instructions."
  echo ""
fi

# Kill any existing servers on our ports
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start backend
echo "  🖥  Starting backend (http://localhost:8000) ..."
cd "$SCRIPT_DIR/backend"
# Ensure venv was created with Python 3.12
if [ ! -f "venv/bin/python3.12" ] && [ ! -f "venv/bin/python" ]; then
  echo "  Creating Python 3.12 virtual environment..."
  python3.12 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt -q
else
  source venv/bin/activate
fi
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start frontend
echo "  🌐  Starting frontend (http://localhost:3000) ..."
cd "$SCRIPT_DIR/frontend"
npm run dev -- --port 3000 &
FRONTEND_PID=$!

echo ""
echo "  ✅  AutoYT is running!"
echo "  🌐  Dashboard: http://localhost:3000"
echo "  📡  API:       http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop all services."
echo ""

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT

wait
