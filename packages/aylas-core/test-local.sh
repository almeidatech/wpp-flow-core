#!/bin/bash
set -e

echo "🚀 Starting Aylas Core Server..."
cd "$(dirname "$0")"

# Start server in background
npm run start:server &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
for i in {1..10}; do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Server is running!"
    break
  fi
  echo "  Attempt $i/10..."
  sleep 1
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🧪 TESTING ENDPOINTS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Test 1: Health
echo "1️⃣  Health Check"
curl -s http://localhost:3000/health | jq . || echo "FAILED"
echo ""

# Test 2: M1 Normalize
echo "2️⃣  M1: Normalize Message"
curl -s -X POST http://localhost:3000/api/v1/messages/normalize \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "aylas",
    "payload": {
      "event": "message_created",
      "body": {
        "conversation": {
          "id": 60,
          "contact": {"phone_number": "+556194350995"}
        },
        "message": {
          "content": "Oi, tudo bem?",
          "content_type": "text"
        }
      }
    }
  }' | jq . || echo "FAILED"
echo ""

# Test 3: M4 Classify
echo "3️⃣  M4: Classify Intent"
curl -s -X POST http://localhost:3000/api/v1/routing/classify \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "aylas",
    "message": {
      "tenant_id": "aylas",
      "conversation_id": "60",
      "phone": "556194350995",
      "timestamp": 1705106400000,
      "type": "text",
      "content": "Queria agendar um banho pro meu cachorro",
      "attachments": [],
      "metadata": {}
    },
    "contact": {
      "id": 1,
      "phone": "556194350995",
      "name": "João",
      "custom_fields": {}
    }
  }' | jq . || echo "FAILED"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✅ Tests completed! Server running on http://localhost:3000"
echo ""
echo "To stop the server, press Ctrl+C"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Keep server running
wait $SERVER_PID
