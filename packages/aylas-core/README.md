# Aylas Core - TypeScript WhatsApp CRM Automation

Production-ready TypeScript modules for WhatsApp CRM automation. Built for n8n + Chatwoot + Baserow integration.

## Features

- **M1: Message Normalizer** - Validate and normalize Chatwoot webhooks with Zod schemas
- **M2: Multimodal Processor** - Extract text from audio (Whisper), images (GPT-4o Vision), PDFs
- **M3: Contact Manager** - Baserow-backed contact lookup/upsert with custom fields
- **M4: Agent Router** - LLM + pattern-based intent classification (sales/support/appointment)
- **M5: Event Logger** - Policy-driven event logging with JSONLogic condition matching

## Installation

```bash
npm install
npm run build
```

## Quick Start

```typescript
import {
  MessageNormalizer,
  MultimodalProcessor,
  ContactManager,
  AgentRouter,
  EventLogger,
  tenantConfigStore
} from '@wpp-flow/aylas-core';

// Configure environment
process.env.TENANT_ID = 'my-tenant';
process.env.CHATWOOT_API_TOKEN = 'xxx';
process.env.BASEROW_API_TOKEN = 'xxx';
process.env.OPENAI_API_KEY = 'xxx';

// Initialize modules
const normalizer = new MessageNormalizer();
const processor = new MultimodalProcessor(tenantConfigStore);
const contactManager = new ContactManager(tenantConfigStore);
const router = new AgentRouter(tenantConfigStore);
const eventLogger = new EventLogger(tenantConfigStore);

// Process incoming webhook
const payload = { event: 'message_created', body: {...} };
const message = await normalizer.normalize(payload, 'my-tenant');

// Extract audio transcription
if (message.type === 'audio') {
  const extracted = await processor.process({
    tenant_id: 'my-tenant',
    attachment: message.attachments[0],
    type: 'audio'
  });
  console.log('Transcription:', extracted.text);
}

// Find or create contact
const contact = await contactManager.upsert('my-tenant', {
  phone: message.phone,
  name: 'Customer Name'
});

// Classify intent
const decision = await router.classify({
  tenant_id: 'my-tenant',
  message,
  contact
});
console.log('Intent:', decision.intent, 'Confidence:', decision.confidence);

// Log event and trigger policies
const event = await eventLogger.log({
  tenant_id: 'my-tenant',
  contact_id: contact.id,
  event_type: 'customer_replied',
  payload: { intent: decision.intent }
});
```

## Environment Variables

```bash
# Tenant
TENANT_ID=default
TENANT_NAME="Default Tenant"

# Chatwoot
CHATWOOT_BASE_URL=https://app.chatwoot.com
CHATWOOT_API_TOKEN=xxx
CHATWOOT_ACCOUNT_ID=123

# Baserow
BASEROW_API_URL=https://api.baserow.io
BASEROW_API_TOKEN=xxx
BASEROW_TABLE_CONTACTS=100
BASEROW_TABLE_EVENTS=101

# LLM
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0.7

# Routing
DEFAULT_INTENT=general
AUTO_ASSIGN=true
```

## Module Documentation

### M1: Message Normalizer

Validates Chatwoot webhooks and extracts normalized message data.

```typescript
const normalizer = new MessageNormalizer();

// Validate payload
if (normalizer.validate(webhookPayload)) {
  const message = await normalizer.normalize(webhookPayload, 'tenant_123');
  // message.type: 'text' | 'audio' | 'image' | 'document' | 'video'
}
```

**Schema validation:**
- Phone number normalization (removes non-digits)
- Attachment type detection (audio/ogg, image/jpeg, application/pdf, etc.)
- Custom attributes preservation

### M2: Multimodal Processor

Extracts text from various media types using OpenAI APIs.

```typescript
const processor = new MultimodalProcessor(tenantConfigStore);

// Audio transcription (Whisper pt-BR)
const audio = await processor.process({
  tenant_id: 'tenant_123',
  attachment: { file_url: 'https://...audio.ogg' },
  type: 'audio'
});
// audio.text = "Transcribed text..."

// Image OCR (GPT-4o Vision)
const image = await processor.process({
  tenant_id: 'tenant_123',
  attachment: { file_url: 'https://...image.jpg' },
  type: 'image'
});
// image.text = "Description of image content..."

// PDF text extraction
const pdf = await processor.process({
  tenant_id: 'tenant_123',
  attachment: { file_url: 'https://...doc.pdf' },
  type: 'document'
});
// pdf.text = "Extracted PDF text..."
```

**Retry logic:** All API calls have automatic retry with exponential backoff.

### M3: Contact Manager

Baserow-backed contact database with custom fields.

```typescript
const manager = new ContactManager(tenantConfigStore);

// Lookup by phone
const contact = await manager.find({
  tenant_id: 'tenant_123',
  phone: '5511999999999'
});

// Create or update
const upserted = await manager.upsert('tenant_123', {
  phone: '5511999999999',
  name: 'John Doe',
  email: 'john@example.com',
  custom_fields: { source: 'whatsapp', campaign: 'black-friday' }
});

// Update custom fields
await manager.updateFields('tenant_123', upserted.id, {
  last_interaction: Date.now(),
  status: 'active'
});
```

**Schema:**
- `id` (auto-increment)
- `phone` (unique index)
- `name`
- `email` (optional)
- `custom_fields` (JSON)
- `created_at` (timestamp)

### M4: Agent Router

Intent classification using pattern matching + LLM fallback.

```typescript
const router = new AgentRouter(tenantConfigStore);

const decision = await router.classify({
  tenant_id: 'tenant_123',
  message: normalizedMessage,
  contact: contactRecord,
  conversation_history: [previousMessage1, previousMessage2]
});

// decision.intent: 'sales' | 'support' | 'appointment' | 'general'
// decision.confidence: 0.0 - 1.0
// decision.metadata.sentiment: 'positive' | 'neutral' | 'negative'
```

**Pattern matching (Brazilian Portuguese):**
- Sales: "comprar", "preço", "quanto custa", "orçamento"
- Support: "problema", "ajuda", "não funciona", "erro"
- Appointment: "agendar", "horário", "marcar", "consulta"

**LLM fallback:** If pattern confidence < 0.7, uses GPT-4o for classification.

### M5: Event Logger

Policy-driven event logging with JSONLogic condition matching.

```typescript
const logger = new EventLogger(tenantConfigStore);

// Log event
const event = await logger.log({
  tenant_id: 'tenant_123',
  contact_id: 42,
  event_type: 'customer_replied',
  payload: { message_id: 123, intent: 'sales' }
});

// Policies are automatically evaluated asynchronously
// Define policies in TenantConfig:
const config = {
  policies: [
    {
      event_type: 'intent_detected',
      condition: { '>=': [{ var: 'payload.confidence' }, 0.8] },
      actions: [
        { type: 'assign_agent', params: { agent_id: 456 } },
        { type: 'add_label', params: { label: 'high-confidence' } }
      ],
      priority: 10
    },
    {
      event_type: '*', // wildcard
      actions: [
        { type: 'update_attributes', params: { last_event: Date.now() } }
      ]
    }
  ]
};
```

**Condition syntax (JSONLogic subset):**
- `{ '==': [left, right] }` - Equality
- `{ '>=': [left, right] }` - Greater than or equal
- `{ '<=': [left, right] }` - Less than or equal
- `{ and: [cond1, cond2] }` - Logical AND
- `{ or: [cond1, cond2] }` - Logical OR
- `{ var: 'payload.field' }` - Variable reference

**Action types:**
- `send_message` - Send Chatwoot message
- `assign_agent` - Assign conversation to agent
- `update_contact` - Update contact fields
- `trigger_webhook` - Call external webhook
- `add_label` - Add conversation label
- `update_attributes` - Update conversation attributes

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm test -- --coverage
```

**Coverage target:** 80%+ for all modules

## Error Handling

All errors extend `AylasError` with structured error codes:

```typescript
import { AylasError, ErrorCode } from '@wpp-flow/aylas-core';

try {
  await processor.process(req);
} catch (error) {
  if (error instanceof AylasError) {
    console.error(error.code); // ErrorCode.TRANSCRIPTION_FAILED
    console.error(error.message); // "Failed to transcribe audio"
    console.error(error.details); // { url: '...', error: '...' }
  }
}
```

**Error codes:**
- `ERR_VALIDATION` - Schema validation failed
- `ERR_INVALID_TENANT` - Tenant not found
- `ERR_CHATWOOT_API` - Chatwoot API error
- `ERR_BASEROW_API` - Baserow API error
- `ERR_LLM_API` - LLM provider error
- `ERR_TRANSCRIPTION` - Whisper transcription failed
- `ERR_OCR` - Vision API failed
- `ERR_PDF_PARSE` - PDF parsing failed
- `ERR_CONTACT_NOT_FOUND` - Contact lookup failed
- `ERR_POLICY_EXEC` - Policy execution failed
- `ERR_TIMEOUT` - Operation timed out

## Architecture

```
┌─────────────────────────────────────────────┐
│           n8n Workflow (HTTP)               │
│  Webhook → Process → Respond                │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Aylas Core (TypeScript)             │
│  M1 → M2 → M3 → M4 → M5                     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  External APIs                              │
│  Chatwoot | Baserow | OpenAI               │
└─────────────────────────────────────────────┘
```

## Next Phase: M6-M7

- **M6: Chatwoot Adapter** - Send messages, update conversations
- **M7: Knowledge Base** - RAG-based FAQ retrieval

## License

MIT
