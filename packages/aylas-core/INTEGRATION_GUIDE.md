# M6-M7 Integration Guide

This guide explains how to use the **M6 Chatwoot Adapter** and **M7 Knowledge Base / RAG** modules in the Aylas Core framework.

## Table of Contents

1. [M6: Chatwoot Adapter](#m6-chatwoot-adapter)
2. [M7: Knowledge Base / RAG](#m7-knowledge-base--rag)
3. [Integration Patterns](#integration-patterns)
4. [API Reference](#api-reference)
5. [Examples](#examples)

---

## M6: Chatwoot Adapter

### Overview

The Chatwoot Adapter provides type-safe integration with the Chatwoot API for:

- Sending messages to conversations
- Managing conversation labels (add/remove)
- Updating contact custom attributes
- Idempotent operations (prevents duplicate messages)
- Retry logic with exponential backoff

### Quick Start

```typescript
import { ChatwootAdapter, ExecutionPlan } from 'aylas-core';
import { tenantConfigStore } from 'aylas-core';

const adapter = new ChatwootAdapter(tenantConfigStore);

// Sync execution plan to Chatwoot
const executionPlan: ExecutionPlan = {
  persist: {
    welcome_message: {
      type: 'message',
      value: 'Hello! How can I help you today?',
    },
  },
  labels: {
    add: ['active', 'vip'],
    remove: ['archived'],
  },
  contact_attributes: {
    last_interaction: Date.now(),
    engagement_score: 95,
    subscription_tier: 'premium',
  },
  emit_events: ['conversation_updated'],
};

const result = await adapter.sync({
  tenant_id: 'my-tenant',
  conversation_id: 12345,
  execution_plan: executionPlan,
});

console.log(result);
// {
//   messages_sent: 1,
//   labels_updated: 3,
//   attributes_updated: 3,
//   errors: []
// }
```

### Configuration

Ensure your `TenantConfig` includes Chatwoot credentials:

```typescript
const tenantConfig: TenantConfig = {
  id: 'my-tenant',
  name: 'My Business',
  chatwoot: {
    account_id: 123,
    api_url: 'https://app.chatwoot.com',
    api_token: 'your-api-token',
  },
  // ... other config
};
```

### Idempotency

The adapter tracks sent messages to prevent duplicates:

```typescript
// First sync - sends message
await adapter.sync({ tenant_id, conversation_id, execution_plan });

// Second sync - skips duplicate message
await adapter.sync({ tenant_id, conversation_id, execution_plan });

// Clear cache if needed
adapter.clearCache();
```

### Error Handling

```typescript
try {
  await adapter.sync({ tenant_id, conversation_id, execution_plan });
} catch (error) {
  if (error instanceof AylasError) {
    console.error(`Chatwoot error: ${error.code} - ${error.message}`);
    console.error('Details:', error.details);
  }
}
```

---

## M7: Knowledge Base / RAG

### Overview

The Knowledge Base module provides Retrieval-Augmented Generation (RAG) capabilities:

- Vector-based semantic search using embeddings
- Multi-tenant isolation
- LLM-augmented responses (GPT-4)
- Confidence scoring (0-1)
- Domain-specific prompts (sales, support, appointment, general)

### Quick Start

```typescript
import { KnowledgeBase } from 'aylas-core';
import { tenantConfigStore } from 'aylas-core';

const kb = new KnowledgeBase(tenantConfigStore);

// 1. Add documents to knowledge base
await kb.addDocuments('my-tenant', [
  {
    id: 'doc-1',
    content: 'Our business hours are 9 AM to 5 PM Monday through Friday.',
    metadata: { category: 'hours' },
  },
  {
    id: 'doc-2',
    content: 'We offer free shipping on orders over $50.',
    metadata: { category: 'shipping' },
  },
  {
    id: 'doc-3',
    content: 'Our return policy allows returns within 30 days of purchase.',
    metadata: { category: 'returns' },
  },
]);

// 2. Query knowledge base
const result = await kb.query({
  tenant_id: 'my-tenant',
  query: 'What are your business hours?',
  top_k: 3,
  domain: 'support',
});

console.log(result);
// {
//   answer: "Our business hours are 9 AM to 5 PM, Monday through Friday.",
//   sources: [
//     { document: "Our business hours are...", similarity: 0.92 }
//   ],
//   confidence: 0.92
// }
```

### Configuration

Ensure your `TenantConfig` includes LLM credentials:

```typescript
const tenantConfig: TenantConfig = {
  id: 'my-tenant',
  name: 'My Business',
  llm: {
    provider: 'openai',
    api_key: 'your-openai-api-key',
    model: 'gpt-4',
    temperature: 0.7,
  },
  // ... other config
};
```

### Domain-Specific Prompts

Use the `domain` parameter to get specialized responses:

```typescript
// Sales inquiries
await kb.query({
  tenant_id: 'my-tenant',
  query: 'I want to buy your product',
  domain: 'sales',
});

// Technical support
await kb.query({
  tenant_id: 'my-tenant',
  query: 'My product is not working',
  domain: 'support',
});

// Appointment booking
await kb.query({
  tenant_id: 'my-tenant',
  query: 'I need to schedule a meeting',
  domain: 'appointment',
});
```

### Custom Configuration

```typescript
import { setKBConfig } from 'aylas-core';

setKBConfig('my-tenant', {
  system_prompt: 'Custom prompt template with {context} and {query}',
  max_sources: 5,
  temperature: 0.3,
  min_confidence: 0.6,
});
```

### Multi-Tenant Isolation

Each tenant has a separate vector store:

```typescript
// Tenant A's documents
await kb.addDocuments('tenant-a', [
  { id: 'a1', content: 'Tenant A specific info' },
]);

// Tenant B's documents
await kb.addDocuments('tenant-b', [
  { id: 'b1', content: 'Tenant B specific info' },
]);

// Queries are isolated
const resultA = await kb.query({ tenant_id: 'tenant-a', query: 'info' });
const resultB = await kb.query({ tenant_id: 'tenant-b', query: 'info' });
// Each returns only their tenant's data
```

---

## Integration Patterns

### Pattern 1: M5 → M6 Integration (Event → Chatwoot)

```typescript
import { EventLogger, ChatwootAdapter } from 'aylas-core';

const eventLogger = new EventLogger(configStore);
const chatwootAdapter = new ChatwootAdapter(configStore);

// 1. Log customer event
const event = await eventLogger.log({
  tenant_id: 'my-tenant',
  contact_id: 123,
  event_type: 'purchase_completed',
  payload: {
    order_id: 'ORD-001',
    amount: 99.99,
  },
});

// 2. Apply policies to get execution plan
const actions = await eventLogger.applyPolicy(event);

// 3. Convert actions to execution plan
const executionPlan: ExecutionPlan = {
  persist: {
    confirmation: {
      type: 'message',
      value: 'Thank you for your purchase!',
    },
  },
  labels: {
    add: ['customer', 'paid'],
    remove: [],
  },
  contact_attributes: {
    last_purchase: Date.now(),
    lifetime_value: 99.99,
  },
  emit_events: [],
};

// 4. Sync to Chatwoot
await chatwootAdapter.sync({
  tenant_id: 'my-tenant',
  conversation_id: 456,
  execution_plan: executionPlan,
});
```

### Pattern 2: M7 → M6 Integration (KB Answer → Chatwoot)

```typescript
import { KnowledgeBase, ChatwootAdapter } from 'aylas-core';

const kb = new KnowledgeBase(configStore);
const chatwootAdapter = new ChatwootAdapter(configStore);

// 1. Query knowledge base
const kbResult = await kb.query({
  tenant_id: 'my-tenant',
  query: 'How do I reset my password?',
  context: 'Customer is asking about password reset',
  top_k: 2,
  domain: 'support',
});

// 2. Send KB answer to Chatwoot
if (kbResult.confidence >= 0.7) {
  await chatwootAdapter.sync({
    tenant_id: 'my-tenant',
    conversation_id: 789,
    execution_plan: {
      persist: {
        kb_answer: {
          type: 'message',
          value: kbResult.answer,
        },
      },
      labels: {
        add: ['auto-resolved'],
        remove: [],
      },
      contact_attributes: {
        last_kb_confidence: kbResult.confidence,
      },
      emit_events: [],
    },
  });
} else {
  // Low confidence, escalate to human
  await chatwootAdapter.sync({
    tenant_id: 'my-tenant',
    conversation_id: 789,
    execution_plan: {
      persist: {
        escalation: {
          type: 'message',
          value: "I'll connect you with a human agent.",
        },
      },
      labels: {
        add: ['escalated'],
        remove: [],
      },
      contact_attributes: {},
      emit_events: [],
    },
  });
}
```

### Pattern 3: Full Pipeline (Webhook → M1-M7)

```typescript
// Webhook handler (e.g., Chatwoot message_created)
async function handleWebhook(payload: WebhookPayload) {
  const { conversation, message } = payload.body;

  // M1: Normalize message
  const normalized = normalizer.normalize(payload, 'my-tenant');

  // M2: Process attachments (if any)
  let extractedContent = '';
  if (normalized.attachments.length > 0) {
    const result = await multimodal.process({
      tenant_id: 'my-tenant',
      attachment: normalized.attachments[0],
      type: normalized.type,
    });
    extractedContent = result.extracted_text || '';
  }

  // M3: Lookup/create contact
  const contact = await contactMgr.find({
    tenant_id: 'my-tenant',
    phone: normalized.phone,
  });

  // M4: Route message
  const routing = await router.classify({
    tenant_id: 'my-tenant',
    message: normalized,
    contact,
  });

  // M5: Log event
  await eventLogger.log({
    tenant_id: 'my-tenant',
    contact_id: contact.id,
    event_type: 'message_received',
    payload: {
      content: normalized.content,
      intent: routing.intent,
    },
  });

  // M7: Query knowledge base
  const kbResult = await knowledgeBase.query({
    tenant_id: 'my-tenant',
    query: normalized.content + ' ' + extractedContent,
    top_k: 3,
    domain: routing.intent,
  });

  // M6: Send response to Chatwoot
  if (kbResult.confidence >= 0.7) {
    await chatwootAdapter.sync({
      tenant_id: 'my-tenant',
      conversation_id: conversation.id,
      execution_plan: {
        persist: {
          kb_response: {
            type: 'message',
            value: kbResult.answer,
          },
        },
        labels: {
          add: [routing.intent, 'auto-answered'],
          remove: [],
        },
        contact_attributes: {
          last_intent: routing.intent,
          kb_confidence: kbResult.confidence,
        },
        emit_events: ['conversation_auto_resolved'],
      },
    });
  }
}
```

---

## API Reference

### M6: Chatwoot Adapter

#### `ChatwootAdapter.sync(request: ChatwootSyncRequest): Promise<ChatwootSyncResult>`

Sync execution plan to Chatwoot.

**Request:**
```typescript
interface ChatwootSyncRequest {
  tenant_id: string;
  conversation_id: number;
  execution_plan: ExecutionPlan;
}

interface ExecutionPlan {
  persist: Record<string, PersistConfig>;
  labels: {
    add: string[];
    remove: string[];
  };
  contact_attributes: Record<string, unknown>;
  emit_events: string[];
}
```

**Response:**
```typescript
interface ChatwootSyncResult {
  messages_sent: number;
  labels_updated: number;
  attributes_updated: number;
  errors?: string[];
}
```

#### `ChatwootAdapter.clearCache(): void`

Clear idempotency cache for testing.

---

### M7: Knowledge Base

#### `KnowledgeBase.addDocuments(tenantId, documents): Promise<void>`

Add documents to knowledge base with embeddings.

**Parameters:**
```typescript
tenantId: string
documents: Array<{
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}>
```

#### `KnowledgeBase.query(request: KBQueryRequest): Promise<KBQueryResult>`

Query knowledge base with RAG.

**Request:**
```typescript
interface KBQueryRequest {
  tenant_id: string;
  query: string;
  context?: string;
  top_k?: number; // default 3
  domain?: 'sales' | 'support' | 'appointment' | 'general';
}
```

**Response:**
```typescript
interface KBQueryResult {
  answer: string;
  sources: Array<{
    document: string;
    similarity: number;
  }>;
  confidence: number; // 0-1
}
```

#### `KnowledgeBase.clearKnowledgeBase(tenantId): void`

Clear all documents for tenant.

#### `KnowledgeBase.getStats(tenantId): { document_count: number }`

Get knowledge base statistics.

---

## REST API Endpoints

### POST `/api/v1/chatwoot/sync`

Sync execution plan to Chatwoot.

**Request:**
```json
{
  "tenant_id": "my-tenant",
  "conversation_id": 12345,
  "execution_plan": {
    "persist": {
      "message1": {
        "type": "message",
        "value": "Hello!"
      }
    },
    "labels": {
      "add": ["urgent"],
      "remove": []
    },
    "contact_attributes": {
      "status": "active"
    },
    "emit_events": []
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messages_sent": 1,
    "labels_updated": 1,
    "attributes_updated": 1,
    "errors": []
  }
}
```

### POST `/api/v1/knowledge-base/query`

Query knowledge base.

**Request:**
```json
{
  "tenant_id": "my-tenant",
  "query": "What are your hours?",
  "context": "Customer asking about availability",
  "top_k": 3,
  "domain": "support"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "answer": "Our business hours are 9 AM to 5 PM, Monday through Friday.",
    "sources": [
      {
        "document": "Our business hours are...",
        "similarity": 0.92
      }
    ],
    "confidence": 0.92
  }
}
```

### POST `/api/v1/knowledge-base/documents`

Add documents to knowledge base.

**Request:**
```json
{
  "tenant_id": "my-tenant",
  "documents": [
    {
      "id": "doc-1",
      "content": "Our business hours are 9 AM to 5 PM.",
      "metadata": { "category": "hours" }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document_count": 1
  }
}
```

---

## Examples

### Example 1: Auto-Responder with KB

```typescript
// Setup
const kb = new KnowledgeBase(configStore);
await kb.addDocuments('tenant-1', [
  { id: '1', content: 'Shipping takes 3-5 business days' },
  { id: '2', content: 'We accept Visa, Mastercard, and PayPal' },
]);

// Handle customer message
const result = await kb.query({
  tenant_id: 'tenant-1',
  query: 'How long does shipping take?',
  domain: 'support',
});

// Send to Chatwoot
const adapter = new ChatwootAdapter(configStore);
await adapter.sync({
  tenant_id: 'tenant-1',
  conversation_id: 123,
  execution_plan: {
    persist: {
      answer: { type: 'message', value: result.answer },
    },
    labels: { add: ['auto-answered'], remove: [] },
    contact_attributes: {},
    emit_events: [],
  },
});
```

### Example 2: Intent-Based KB Domain Selection

```typescript
import { AgentRouter, KnowledgeBase } from 'aylas-core';

const router = new AgentRouter(configStore);
const kb = new KnowledgeBase(configStore);

// Classify intent
const routing = await router.classify({
  tenant_id: 'tenant-1',
  message: normalized,
  contact,
});

// Map intent to KB domain
const domainMap = {
  sales: 'sales',
  support: 'support',
  appointment: 'appointment',
  general: 'general',
};

// Query with appropriate domain
const result = await kb.query({
  tenant_id: 'tenant-1',
  query: normalized.content,
  domain: domainMap[routing.intent],
  top_k: 3,
});
```

---

## Testing

### Run Tests

```bash
npm run test:unit
```

### Test Coverage

- M6: 8 test cases, 90%+ coverage
- M7: 10 test cases, 85%+ coverage

---

## Troubleshooting

### Chatwoot API Errors

**Error:** `ERR_CHATWOOT_API - 401 Unauthorized`

**Solution:** Check `api_token` in tenant config.

---

### Knowledge Base Low Confidence

**Error:** All queries return confidence < 0.5

**Solution:**
1. Add more documents to knowledge base
2. Lower `min_confidence` threshold
3. Use more specific queries

```typescript
setKBConfig('tenant-1', {
  min_confidence: 0.3, // Lower threshold
});
```

---

## Performance Optimization

### Batch Operations

```typescript
// Batch add documents
await kb.addDocuments('tenant-1', documents); // Uses batch embeddings API

// Batch Chatwoot operations
const executionPlan: ExecutionPlan = {
  persist: {
    msg1: { type: 'message', value: 'First' },
    msg2: { type: 'message', value: 'Second' },
  },
  labels: { add: ['a', 'b', 'c'], remove: [] },
  contact_attributes: { attr1: 'val1', attr2: 'val2' },
  emit_events: [],
};

await chatwootAdapter.sync({ tenant_id, conversation_id, execution_plan });
```

### Caching

```typescript
// KB caching (in-memory vector store)
// Documents persist across queries until clearKnowledgeBase()

// Chatwoot client caching
// Clients are cached per tenant, reused across requests
```

---

## License

MIT

---

**Generated by:** Aylas Core Framework
**Version:** 1.0.0 (FASE 3 - M6-M7)
**Last Updated:** 2024-01-27
