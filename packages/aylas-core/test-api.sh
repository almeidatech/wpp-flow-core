#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000/api/v1"
TENANT="tenant_123"

echo -e "${BLUE}=== TESTING AYLAS CORE API ===${NC}\n"

# Health check
echo -e "${BLUE}1. Health Check${NC}"
curl -s http://localhost:3000/health | jq .
echo ""

# M1: Normalize message
echo -e "${BLUE}2. M1: Normalize Message${NC}"
curl -s -X POST "$BASE_URL/messages/normalize" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT'",
    "payload": {
      "event": "message_created",
      "body": {
        "conversation": {
          "id": 123,
          "contact": {
            "phone_number": "+556194350995"
          }
        },
        "message": {
          "content": "Oi, tudo bem?",
          "content_type": "text",
          "attachments": []
        }
      }
    }
  }' | jq .
echo ""

# M2: Process multimodal (mock)
echo -e "${BLUE}3. M2: Process Multimodal (audio)${NC}"
curl -s -X POST "$BASE_URL/multimodal/process" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT'",
    "type": "audio",
    "attachment": {
      "id": 1,
      "file_url": "https://example.com/audio.mp3",
      "data_url": "https://example.com/audio.mp3",
      "file_type": "audio/mpeg"
    }
  }' | jq .
echo ""

# M3: Contact lookup
echo -e "${BLUE}4. M3: Contact Lookup${NC}"
curl -s -X GET "$BASE_URL/contacts/$TENANT/556194350995" \
  -H "Content-Type: application/json" | jq .
echo ""

# M4: Classify intent
echo -e "${BLUE}5. M4: Classify Intent${NC}"
curl -s -X POST "$BASE_URL/routing/classify" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT'",
    "message": {
      "tenant_id": "'$TENANT'",
      "conversation_id": "123",
      "phone": "556194350995",
      "timestamp": '$(date +%s)'000',
      "type": "text",
      "content": "Queria saber sobre a creche",
      "attachments": [],
      "metadata": {}
    },
    "contact": {
      "id": 1,
      "phone": "556194350995",
      "name": "João Silva",
      "custom_fields": {}
    }
  }' | jq .
echo ""

# M5: Log event
echo -e "${BLUE}6. M5: Log Event${NC}"
curl -s -X POST "$BASE_URL/events/log" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT'",
    "contact_id": 1,
    "event_type": "message_created",
    "payload": {
      "content": "Test message",
      "intent": "general"
    }
  }' | jq .
echo ""

echo -e "${GREEN}=== TESTS COMPLETED ===${NC}"
