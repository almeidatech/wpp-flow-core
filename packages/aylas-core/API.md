# Aylas Core API Documentation

## Running the Server

```bash
# Development (hot reload)
npm run dev:server

# Production
npm run start:server
```

Server runs on `http://localhost:3000` by default.

## Endpoints

### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "aylas-core",
  "timestamp": "2026-01-26T23:30:00.000Z"
}
```

---

### M1: Normalize Message
```
POST /api/v1/messages/normalize
```

**Request:**
```json
{
  "tenant_id": "aylas",
  "payload": {
    "event": "message_created",
    "body": {
      "conversation": {
        "id": 60,
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
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant_id": "aylas",
    "conversation_id": "60",
    "phone": "556194350995",
    "timestamp": 1705106400000,
    "type": "text",
    "content": "Oi, tudo bem?",
    "attachments": [],
    "metadata": {}
  }
}
```

---

### M2: Process Multimodal
```
POST /api/v1/multimodal/process
```

**Request (Audio):**
```json
{
  "tenant_id": "aylas",
  "type": "audio",
  "attachment": {
    "id": 1,
    "file_url": "https://example.com/audio.mp3",
    "data_url": "https://example.com/audio.mp3",
    "file_type": "audio/mpeg"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "text": "Transcribed audio content",
    "metadata": {
      "duration": 15.5
    },
    "confidence": 0.95
  }
}
```

---

### M3: Contact Lookup
```
GET /api/v1/contacts/{tenant_id}/{phone}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "phone": "556194350995",
    "name": "João Silva",
    "email": "joao@example.com",
    "custom_fields": {},
    "created_at": 1705106400000
  }
}
```

---

### M3: Upsert Contact
```
POST /api/v1/contacts/upsert
```

**Request:**
```json
{
  "tenant_id": "aylas",
  "contact": {
    "phone": "556194350995",
    "name": "João Silva",
    "email": "joao@example.com",
    "custom_fields": {
      "pet_name": "Rex"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "phone": "556194350995",
    "name": "João Silva",
    "custom_fields": {
      "pet_name": "Rex"
    }
  }
}
```

---

### M4: Classify Intent
```
POST /api/v1/routing/classify
```

**Request:**
```json
{
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
    "id": 123,
    "phone": "556194350995",
    "name": "João Silva",
    "custom_fields": {}
  },
  "conversation_history": []
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "intent": "appointment",
    "confidence": 0.89,
    "suggested_agent": "booking_agent",
    "metadata": {
      "keywords": ["agendar", "banho", "cachorro"],
      "sentiment": "neutral"
    }
  }
}
```

---

### M5: Log Event
```
POST /api/v1/events/log
```

**Request:**
```json
{
  "tenant_id": "aylas",
  "contact_id": 123,
  "event_type": "message_created",
  "payload": {
    "content": "User message",
    "intent": "appointment"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 456,
    "tenant_id": "aylas",
    "contact_id": 123,
    "event_type": "message_created",
    "payload": {
      "content": "User message",
      "intent": "appointment"
    },
    "timestamp": 1705106400000
  }
}
```

---

## Error Handling

All errors return consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERR_VALIDATION",
    "message": "Invalid webhook payload",
    "details": {}
  }
}
```

**Common Error Codes:**
- `ERR_VALIDATION` - Invalid input
- `ERR_EXTERNAL_API_FAILED` - External API error (OpenAI, Baserow, etc)
- `ERR_MISSING_FIELD` - Required field missing
- `ERR_INVALID_TENANT` - Tenant not found
- `ERR_INTERNAL_ERROR` - Server error

---

## Testing with curl

Run the test script:

```bash
chmod +x test-api.sh
./test-api.sh
```

Or individual calls:

```bash
# Health check
curl http://localhost:3000/health

# Normalize message
curl -X POST http://localhost:3000/api/v1/messages/normalize \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "aylas",
    "payload": {...}
  }'
```

---

## Configuration

Copy `.env.example` to `.env` and set your credentials:

```bash
cp .env.example .env
```

Edit with your:
- Chatwoot account ID and token
- Baserow API token and table IDs
- LLM API key (OpenAI)
