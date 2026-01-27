# Server Setup & Testing Guide

## Quick Start

### 1. Install Dependencies
```bash
cd D:\wpp-flow-core\packages\aylas-core
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Start Server
```bash
# Development (hot reload)
npm run dev:server

# Production
npm run start:server
```

Server will start on `http://localhost:3000`

### 4. Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "aylas-core",
  "timestamp": "2026-01-26T23:39:29.000Z"
}
```

---

## Testing Endpoints

### Run Full Test Suite
```bash
chmod +x test-api.sh
./test-api.sh
```

This will test all 6 endpoints:
1. Health Check
2. M1: Normalize Message
3. M2: Process Multimodal
4. M3: Contact Lookup
5. M4: Classify Intent
6. M5: Log Event

### Manual Testing with curl

**Normalize Message:**
```bash
curl -X POST http://localhost:3000/api/v1/messages/normalize \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tenant_123",
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
          "content": "Hello",
          "content_type": "text",
          "attachments": []
        }
      }
    }
  }' | jq .
```

**Classify Intent:**
```bash
curl -X POST http://localhost:3000/api/v1/routing/classify \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tenant_123",
    "message": {
      "tenant_id": "tenant_123",
      "conversation_id": "123",
      "phone": "556194350995",
      "timestamp": '$(date +%s)'000,
      "type": "text",
      "content": "Queria agendar um banho",
      "attachments": [],
      "metadata": {}
    },
    "contact": {
      "id": 1,
      "phone": "556194350995",
      "name": "João",
      "custom_fields": {}
    }
  }' | jq .
```

---

## Endpoint Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/v1/messages/normalize` | POST | M1: Normalize Chatwoot webhook |
| `/api/v1/multimodal/process` | POST | M2: Process audio/image/PDF |
| `/api/v1/contacts/{tenant}/{phone}` | GET | M3: Lookup contact |
| `/api/v1/contacts/upsert` | POST | M3: Create/update contact |
| `/api/v1/routing/classify` | POST | M4: Classify message intent |
| `/api/v1/events/log` | POST | M5: Log event to database |

---

## Full Documentation

See `API.md` for detailed endpoint documentation with request/response examples.

---

## Integration with n8n

Once server is running, n8n webhooks can call:

**From n8n webhook node:**
```
POST http://localhost:3000/api/v1/messages/normalize

Headers:
  Content-Type: application/json

Body:
{
  "tenant_id": "aylas",
  "payload": {{ $json }}
}
```

n8n will receive:
```json
{
  "success": true,
  "data": {
    "tenant_id": "aylas",
    "conversation_id": "...",
    "phone": "...",
    "type": "text",
    "content": "...",
    ...
  }
}
```

---

## Troubleshooting

**Server won't start:**
- Check PORT is not in use: `lsof -i :3000`
- Check Node.js version: `node --version` (need 16+)

**Module not found:**
- Run `npm install` again
- Delete `node_modules` and reinstall

**Connection refused:**
- Make sure server is running: `npm run start:server`
- Check it's listening: `curl http://localhost:3000/health`

**Timeout errors:**
- May need to increase timeout in `.env` or jest config
- Check external API connectivity (OpenAI, Baserow)

---

## Next Steps

- [ ] Run `npm test` to verify all tests pass
- [ ] Start server with `npm run dev:server`
- [ ] Test endpoints with `./test-api.sh` or curl
- [ ] Configure n8n to call endpoints
- [ ] Deploy to production (Vercel, Railway, etc)
