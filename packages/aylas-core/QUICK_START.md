# Quick Start - Aylas Core

Get started with Aylas Core in 5 minutes.

## Prerequisites

- Node.js 20+
- npm or pnpm
- Baserow account (free tier OK)
- OpenAI API key
- Chatwoot account (optional for testing)

## Installation

```bash
cd packages/aylas-core
npm install
```

## Configuration

Create `.env` file:

```bash
# Copy template
cp .env.example .env

# Edit with your credentials
nano .env
```

Minimal `.env`:

```bash
TENANT_ID=demo
TENANT_NAME="Demo Tenant"

CHATWOOT_BASE_URL=https://app.chatwoot.com
CHATWOOT_API_TOKEN=your_token_here
CHATWOOT_ACCOUNT_ID=1

BASEROW_API_URL=https://api.baserow.io
BASEROW_API_TOKEN=your_token_here
BASEROW_TABLE_CONTACTS=123
BASEROW_TABLE_EVENTS=124

OPENAI_API_KEY=sk-xxx
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0.7

DEFAULT_INTENT=general
AUTO_ASSIGN=false
```

## Build

```bash
npm run build
```

Output: `dist/` directory with compiled JavaScript + type definitions.

## Run Tests

```bash
# All tests with coverage
npm test

# Watch mode (for development)
npm run test:watch

# Type checking only
npm run typecheck
```

Expected output:
```
Test Suites: 5 passed, 5 total
Tests:       40+ passed, 40+ total
Snapshots:   0 total
Time:        5s
Coverage:    > 80%
```

## Local Development Server

Create `dev.ts` in `src/`:

```typescript
import {
  MessageNormalizer,
  MultimodalProcessor,
  ContactManager,
  AgentRouter,
  EventLogger,
  tenantConfigStore,
  WebhookPayload
} from './index';

const normalizer = new MessageNormalizer();
const processor = new MultimodalProcessor(tenantConfigStore);
const contactManager = new ContactManager(tenantConfigStore);
const router = new AgentRouter(tenantConfigStore);
const eventLogger = new EventLogger(tenantConfigStore);

async function processWebhook(payload: WebhookPayload) {
  const tenantId = process.env.TENANT_ID || 'demo';

  // 1. Normalize
  const message = await normalizer.normalize(payload, tenantId);
  console.log('Message normalized:', message.type);

  // 2. Process attachments
  if (message.attachments.length > 0) {
    const extracted = await processor.process({
      tenant_id: tenantId,
      attachment: message.attachments[0]!,
      type: message.type
    });
    console.log('Extracted text:', extracted.text.substring(0, 100));
  }

  // 3. Find/create contact
  const contact = await contactManager.upsert(tenantId, {
    phone: message.phone,
    name: 'Test User'
  });
  console.log('Contact ID:', contact.id);

  // 4. Classify intent
  const decision = await router.classify({
    tenant_id: tenantId,
    message,
    contact
  });
  console.log('Intent:', decision.intent, 'Confidence:', decision.confidence);

  // 5. Log event
  const event = await eventLogger.log({
    tenant_id: tenantId,
    contact_id: contact.id,
    event_type: 'customer_replied',
    payload: { intent: decision.intent, confidence: decision.confidence }
  });
  console.log('Event logged:', event.id);
}

// Example webhook payload
const examplePayload: WebhookPayload = {
  event: 'message_created',
  body: {
    conversation: {
      id: 123,
      contact: { phone_number: '+5511999999999' }
    },
    message: {
      content: 'Quanto custa este produto?',
      content_type: 'text'
    }
  }
};

processWebhook(examplePayload).catch(console.error);
```

Run:

```bash
npm run dev
```

## Baserow Setup

### 1. Create Contacts Table

Columns:
- `id` (auto-increment)
- `phone` (text, required)
- `name` (text)
- `email` (email, optional)
- `custom_fields` (long text, JSON)
- `created_at` (number)

### 2. Create Events Table

Columns:
- `id` (auto-increment)
- `tenant_id` (text)
- `contact_id` (number, link to contacts)
- `event_type` (text)
- `payload` (long text, JSON)
- `timestamp` (number)

### 3. Get Table IDs

Navigate to table → URL contains table ID:
```
https://baserow.io/database/123/table/456
                                   ^table ID
```

Update `.env`:
```bash
BASEROW_TABLE_CONTACTS=456
BASEROW_TABLE_EVENTS=457
```

## Testing with n8n

### 1. Install n8n

```bash
npm install -g n8n
n8n start
```

### 2. Import Workflow

Create workflow:
1. Webhook Trigger (POST)
2. HTTP Request → `http://localhost:3000/normalize` (if running local server)
3. Set JSON response

### 3. Test Webhook

```bash
curl -X POST http://localhost:5678/webhook-test/aylas \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_created",
    "body": {
      "conversation": {
        "id": 123,
        "contact": { "phone_number": "+5511999999999" }
      },
      "message": {
        "content": "Preciso de ajuda com meu pedido",
        "content_type": "text"
      }
    }
  }'
```

## Common Commands

```bash
# Development
npm run dev              # Run dev server
npm run test:watch       # Watch tests
npm run typecheck        # Check types

# Build
npm run build            # Build for production
npm run lint             # Lint code

# Testing
npm test                 # Run all tests
npm test -- --coverage   # With coverage report
npm test -- normalizer   # Test specific file
```

## Troubleshooting

### Error: "Tenant not found"

**Cause:** `TENANT_ID` env var not set

**Fix:**
```bash
export TENANT_ID=demo
```

### Error: "Baserow API failed"

**Cause:** Invalid API token or table ID

**Fix:**
1. Check token in Baserow settings
2. Verify table IDs in URL
3. Test with curl:
```bash
curl https://api.baserow.io/api/database/rows/table/123/ \
  -H "Authorization: Token YOUR_TOKEN"
```

### Error: "LLM API failed"

**Cause:** Invalid OpenAI API key

**Fix:**
1. Check key at https://platform.openai.com/api-keys
2. Verify billing is enabled
3. Test with curl:
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

### Error: "Module not found"

**Cause:** Build not run after code changes

**Fix:**
```bash
npm run build
```

### Tests fail with "ReferenceError: File is not defined"

**Cause:** Node.js version < 20 (File API not available)

**Fix:**
```bash
nvm install 20
nvm use 20
```

## Next Steps

- Read [README.md](README.md) for API documentation
- Read [IMPLEMENTATION.md](IMPLEMENTATION.md) for architecture details
- Set up production deployment (Docker, Railway, Fly.io)
- Configure Chatwoot webhooks
- Create custom policies for your use case
- Integrate with n8n workflows

## Example Policies

Add to `TenantConfig.policies`:

```typescript
// Auto-assign sales inquiries
{
  event_type: 'intent_detected',
  condition: {
    and: [
      { '==': [{ var: 'payload.intent' }, 'sales'] },
      { '>=': [{ var: 'payload.confidence' }, 0.8] }
    ]
  },
  actions: [
    { type: 'assign_agent', params: { agent_id: 123 } },
    { type: 'add_label', params: { label: 'sales-lead' } }
  ],
  priority: 10
}

// Tag active customers
{
  event_type: 'customer_replied',
  actions: [
    { type: 'update_attributes', params: { last_active: Date.now() } }
  ],
  priority: 1
}
```

## Support

- GitHub Issues: https://github.com/your-org/wpp-flow-core/issues
- Documentation: https://docs.aylas.io
- Community: Discord server
