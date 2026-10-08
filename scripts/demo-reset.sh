#!/usr/bin/env bash
# Demo reset script: returns the builder to a pristine demo-ready state.
# Usage: ./scripts/demo-reset.sh [--port 5199]
set -euo pipefail

PORT="${1:-5199}"
DEMO_FILE="/tmp/bf-demo.blockfw.json"

echo "=== Demo reset ==="

# 1. Kill any running builder server on the port.
if lsof -ti ":$PORT" > /dev/null 2>&1; then
  echo "Killing server on port $PORT..."
  lsof -ti ":$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# 2. Remove the demo project file (forces fresh init from example).
if [ -f "$DEMO_FILE" ]; then
  echo "Removing $DEMO_FILE..."
  rm -f "$DEMO_FILE"
fi

# 3. Start a fresh server.
echo "Starting builder on port $PORT..."
cd "$(dirname "$0")/.."
nohup node packages/builder/dist/bin.js --port "$PORT" --project "$DEMO_FILE" > /tmp/bf-demo-server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# 4. Wait for it to respond.
echo "Waiting for server..."
for i in {1..20}; do
  if curl -s "http://127.0.0.1:$PORT/api/project" > /dev/null 2>&1; then
    echo "Server ready."
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "ERROR: Server did not start in 20s. Check /tmp/bf-demo-server.log"
    exit 1
  fi
  sleep 1
done

# 5. Verify the project has 8 screens.
SCREENS=$(curl -s "http://127.0.0.1:$PORT/api/project" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['graph']['screens']))")
if [ "$SCREENS" -eq 8 ]; then
  echo "Verified: 8 screens loaded."
else
  echo "ERROR: Expected 8 screens, got $SCREENS"
  exit 1
fi

echo ""
echo "Demo ready at http://localhost:$PORT"
echo "Project file: $DEMO_FILE"
echo "Server log: /tmp/bf-demo-server.log"
