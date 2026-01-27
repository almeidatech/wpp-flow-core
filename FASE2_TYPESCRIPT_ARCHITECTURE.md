# FASE 2: TypeScript Architecture - Aylas

## 1. CORE TYPES

```typescript
// Shared base types
type TenantId = string;
type MessageType = 'text' | 'audio' | 'image' | 'document' | 'video';
type IntentType = 'sales' | 'support' | 'appointment' | 'general';

interface BaseMessage {
  tenant_id: TenantId;
  conversation_id: string;
  phone: string;
  timestamp: number;
}

interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
}

interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

## 2. MODULE INTERFACES

### M1: Message Normalizer

```typescript
// Input: Raw Chatwoot webhook
interface WebhookPayload {
  event: 'message_created' | 'conversation_status_changed';
  body: {
    conversation: { id: number; contact: { phone_number: string } };
    message?: { content: string; content_type: string; attachments?: Attachment[] };
    custom_attributes?: Record<string, unknown>;
  };
}

interface Attachment {
  id: number;
  file_url: string;
  data_url: string;
  file_type: string;
}

// Output: Normalized message
interface NormalizedMessage extends BaseMessage {
  type: MessageType;
  content: string;
  attachments: Attachment[];
  metadata: Record<string, unknown>;
}

// Service
interface MessageNormalizer {
  normalize(payload: WebhookPayload, tenant_id: TenantId): Promise<NormalizedMessage>;
  validate(payload: WebhookPayload): boolean;
}
```

### M2: Multimodal Processor

```typescript
// Input: Attachment from normalized message
interface ProcessRequest {
  tenant_id: TenantId;
  attachment: Attachment;
  type: MessageType;
}

// Output: Extracted content
interface ExtractedContent {
  text: string;
  metadata: {
    duration?: number; // audio
    pages?: number; // pdf
    dimensions?: { width: number; height: number }; // image
  };
  confidence?: number;
}

// Service
interface MultimodalProcessor {
  process(req: ProcessRequest): Promise<ExtractedContent>;
  transcribe(audio_url: string): Promise<string>; // Whisper
  extractText(image_url: string): Promise<string>; // OCR
  parsePDF(pdf_url: string): Promise<string>;
}
```

### M3: Contact Manager

```typescript
// Input: Phone lookup
interface ContactLookupRequest {
  tenant_id: TenantId;
  phone: string;
}

// Output: Contact record
interface Contact {
  id: number;
  phone: string;
  name: string;
  email?: string;
  custom_fields: Record<string, unknown>;
  created_at: number;
}

// Service (config-driven - reads from TenantConfig)
interface ContactManager {
  find(req: ContactLookupRequest): Promise<Contact | null>;
  upsert(tenant_id: TenantId, contact: Partial<Contact>): Promise<Contact>;
  updateFields(tenant_id: TenantId, contact_id: number, fields: Record<string, unknown>): Promise<void>;
}
```

### M4: Agent Router

```typescript
// Input: Message + contact context
interface RoutingRequest {
  tenant_id: TenantId;
  message: NormalizedMessage;
  contact: Contact;
  conversation_history?: NormalizedMessage[];
}

// Output: Routing decision
interface RoutingDecision {
  intent: IntentType;
  confidence: number;
  suggested_agent?: string;
  metadata: {
    keywords?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
}

// Service
interface AgentRouter {
  classify(req: RoutingRequest): Promise<RoutingDecision>;
  assignAgent(conversation_id: string, agent_id: number): Promise<void>;
}
```

### M5: Event Logger

```typescript
// Input: Business event
interface EventLogRequest {
  tenant_id: TenantId;
  contact_id: number;
  event_type: string; // customer_replied, message_sent, status_changed
  payload: Record<string, unknown>;
  timestamp?: number;
}

// Output: Logged event
interface EventLog {
  id: number;
  tenant_id: TenantId;
  contact_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// Service (Policy Engine - core business logic)
interface EventLogger {
  log(req: EventLogRequest): Promise<EventLog>;
  query(tenant_id: TenantId, filters: EventFilter): Promise<EventLog[]>;
  applyPolicy(event: EventLog): Promise<PolicyAction[]>; // trigger workflows
}

interface EventFilter {
  contact_id?: number;
  event_type?: string;
  from?: number;
  to?: number;
}

interface PolicyAction {
  type: 'send_message' | 'assign_agent' | 'update_contact' | 'trigger_webhook';
  params: Record<string, unknown>;
}
```

### M6: Chatwoot Adapter

```typescript
// Input: Send message to Chatwoot
interface SendMessageRequest {
  tenant_id: TenantId;
  conversation_id: string;
  content: string;
  message_type?: 'incoming' | 'outgoing';
  private?: boolean;
}

// Output: Message confirmation
interface ChatwootMessage {
  id: number;
  content: string;
  conversation_id: number;
  created_at: number;
}

// Service
interface ChatwootAdapter {
  sendMessage(req: SendMessageRequest): Promise<ChatwootMessage>;
  updateConversation(tenant_id: TenantId, conversation_id: string, updates: Record<string, unknown>): Promise<void>;
  getConversationHistory(tenant_id: TenantId, conversation_id: string, limit?: number): Promise<NormalizedMessage[]>;
}
```

### M7: Knowledge Base (RAG)

```typescript
// Input: Query with tenant context
interface KBQueryRequest {
  tenant_id: TenantId;
  query: string;
  context?: string;
  top_k?: number;
}

// Output: Retrieved knowledge
interface KBResult {
  content: string;
  source: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

// Service (multi-tenant vector store)
interface KnowledgeBase {
  query(req: KBQueryRequest): Promise<KBResult[]>;
  upsert(tenant_id: TenantId, documents: KBDocument[]): Promise<void>;
  delete(tenant_id: TenantId, document_ids: string[]): Promise<void>;
}

interface KBDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}
```

## 3. TENANT CONFIGURATION

```typescript
interface TenantConfig {
  id: TenantId;
  name: string;

  chatwoot: {
    account_id: number;
    api_url: string;
    api_token: string;
  };

  baserow: {
    api_url: string;
    api_token: string;
    tables: {
      contacts: number;
      events: number;
      knowledge_base?: number;
    };
  };

  llm: {
    provider: 'openai' | 'anthropic';
    api_key: string;
    model: string;
    temperature: number;
  };

  routing: {
    default_intent: IntentType;
    auto_assign: boolean;
    agent_mapping?: Record<IntentType, number>;
  };

  policies: EventPolicy[];
}

interface EventPolicy {
  event_type: string;
  condition?: string; // JSONLogic expression
  actions: PolicyAction[];
}

// Config loader
interface TenantConfigStore {
  get(tenant_id: TenantId): Promise<TenantConfig>;
  set(config: TenantConfig): Promise<void>;
  list(): Promise<TenantConfig[]>;
}
```

## 4. ERROR HANDLING

```typescript
enum ErrorCode {
  // Validation
  VALIDATION_ERROR = 'ERR_VALIDATION',
  INVALID_TENANT = 'ERR_INVALID_TENANT',
  MISSING_FIELD = 'ERR_MISSING_FIELD',

  // External APIs
  CHATWOOT_API_FAILED = 'ERR_CHATWOOT_API',
  BASEROW_API_FAILED = 'ERR_BASEROW_API',
  LLM_API_FAILED = 'ERR_LLM_API',

  // Processing
  TRANSCRIPTION_FAILED = 'ERR_TRANSCRIPTION',
  OCR_FAILED = 'ERR_OCR',
  PDF_PARSE_FAILED = 'ERR_PDF_PARSE',

  // Business logic
  CONTACT_NOT_FOUND = 'ERR_CONTACT_NOT_FOUND',
  POLICY_EXECUTION_FAILED = 'ERR_POLICY_EXEC',

  // System
  INTERNAL_ERROR = 'ERR_INTERNAL',
  TIMEOUT = 'ERR_TIMEOUT',
}

class AylasError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AylasError';
  }
}

// Error handler middleware
type ErrorHandler = (error: Error) => APIResponse<never>;
```

## 5. N8N INTEGRATION PLAN

### M1: Message Normalizer
```yaml
Type: HTTP Endpoint
Path: POST /api/normalize
Input:
  headers: { 'X-Tenant-ID': string }
  body: WebhookPayload
Output: APIResponse<NormalizedMessage>

Example:
curl -X POST http://localhost:3000/api/normalize \
  -H "X-Tenant-ID: tenant_123" \
  -H "Content-Type: application/json" \
  -d '{"event":"message_created","body":{...}}'
```

### M2: Multimodal Processor
```yaml
Type: HTTP Endpoint
Path: POST /api/process-media
Input:
  body: ProcessRequest
Output: APIResponse<ExtractedContent>

Example:
curl -X POST http://localhost:3000/api/process-media \
  -d '{"tenant_id":"tenant_123","attachment":{...},"type":"audio"}'
```

### M3: Contact Manager
```yaml
Type: HTTP Endpoint
Path:
  - GET  /api/contacts/:phone
  - POST /api/contacts
  - PATCH /api/contacts/:id
Input:
  headers: { 'X-Tenant-ID': string }
Output: APIResponse<Contact>

Example:
curl -X GET http://localhost:3000/api/contacts/5511999999999 \
  -H "X-Tenant-ID: tenant_123"
```

### M4: Agent Router
```yaml
Type: HTTP Endpoint
Path: POST /api/route
Input:
  body: RoutingRequest
Output: APIResponse<RoutingDecision>

Example:
curl -X POST http://localhost:3000/api/route \
  -d '{"tenant_id":"tenant_123","message":{...},"contact":{...}}'
```

### M5: Event Logger
```yaml
Type: HTTP Endpoint + Background Worker
Path:
  - POST /api/events (log)
  - GET  /api/events (query)
Input:
  body: EventLogRequest | EventFilter
Output: APIResponse<EventLog | EventLog[]>

Background: Policy engine runs async (evaluates policies after logging)

Example:
curl -X POST http://localhost:3000/api/events \
  -d '{"tenant_id":"tenant_123","contact_id":42,"event_type":"customer_replied","payload":{...}}'
```

### M6: Chatwoot Adapter
```yaml
Type: HTTP Endpoint (wrapper around Chatwoot API)
Path: POST /api/chatwoot/send
Input:
  body: SendMessageRequest
Output: APIResponse<ChatwootMessage>

Example:
curl -X POST http://localhost:3000/api/chatwoot/send \
  -d '{"tenant_id":"tenant_123","conversation_id":"456","content":"Hello!"}'
```

### M7: Knowledge Base
```yaml
Type: HTTP Endpoint
Path:
  - POST /api/kb/query
  - POST /api/kb/upsert
Input:
  body: KBQueryRequest | { tenant_id, documents }
Output: APIResponse<KBResult[] | void>

Example:
curl -X POST http://localhost:3000/api/kb/query \
  -d '{"tenant_id":"tenant_123","query":"How to reset password?","top_k":3}'
```

### n8n Workflow Example (Message Processing)
```javascript
// Webhook Trigger → HTTP Request nodes
1. Chatwoot Webhook receives message
2. HTTP → POST /api/normalize (get NormalizedMessage)
3. IF has_attachment → POST /api/process-media
4. HTTP → GET /api/contacts/:phone (get Contact)
5. HTTP → POST /api/route (get RoutingDecision)
6. HTTP → POST /api/events (log event + trigger policies)
7. [Policy actions execute automatically]
8. HTTP → POST /api/chatwoot/send (send response)
```

## 6. INTEGRATION DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                          n8n WORKFLOW                               │
│  Chatwoot Webhook → HTTP Request nodes → Business Logic            │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AYLAS BACKEND (TypeScript)                     │
│                                                                     │
│  M1: Message Normalizer ──┐                                        │
│  (webhook → normalized)    │                                        │
│                            ▼                                        │
│  M2: Multimodal Processor ─┼─→ M3: Contact Manager                │
│  (audio/img/pdf → text)    │   (Baserow lookup/upsert)             │
│                            │                                        │
│                            ▼                                        │
│                     M4: Agent Router ──────────────┐               │
│                     (intent detection)              │               │
│                            │                        │               │
│                            ▼                        ▼               │
│                     M5: Event Logger  ←──→  M7: Knowledge Base     │
│                     (policy engine)          (RAG query)            │
│                            │                        │               │
│                            ▼                        │               │
│                     M6: Chatwoot Adapter ◄──────────┘               │
│                     (send response)                                 │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SERVICES                            │
│  Chatwoot API  │  Baserow API  │  OpenAI/Anthropic  │  Whisper     │
└─────────────────────────────────────────────────────────────────────┘

Data Flow:
1. Webhook → M1 → NormalizedMessage
2. NormalizedMessage → M2 (if attachment) → ExtractedContent
3. NormalizedMessage → M3 → Contact
4. {Message, Contact} → M4 → RoutingDecision
5. {Message, Contact, Intent} → M5 → EventLog + PolicyActions
6. PolicyActions → M6 → Chatwoot API
7. (Optional) Message → M7 → KBResult → M6
```

## 7. DEPLOYMENT ARCHITECTURE

```typescript
// Service registry (dependency injection)
interface ServiceContainer {
  messageNormalizer: MessageNormalizer;
  multimodalProcessor: MultimodalProcessor;
  contactManager: ContactManager;
  agentRouter: AgentRouter;
  eventLogger: EventLogger;
  chatwootAdapter: ChatwootAdapter;
  knowledgeBase: KnowledgeBase;
  tenantConfig: TenantConfigStore;
}

// HTTP server (Express-like)
interface HTTPServer {
  start(port: number): Promise<void>;
  registerRoutes(routes: Route[]): void;
  use(middleware: Middleware): void;
}

interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  handler: (req: Request) => Promise<Response>;
}

// Middleware stack
type Middleware = (req: Request, next: () => Promise<Response>) => Promise<Response>;

// Standard middleware
const errorHandler: Middleware;
const tenantValidator: Middleware;
const requestLogger: Middleware;
```

## 8. TESTING STRATEGY

```typescript
// Unit tests (per module)
describe('MessageNormalizer', () => {
  test('normalizes Chatwoot webhook', async () => {
    const payload: WebhookPayload = {...};
    const result = await normalizer.normalize(payload, 'tenant_123');
    expect(result.type).toBe('text');
  });
});

// Integration tests (module interactions)
describe('Contact + Event flow', () => {
  test('creates contact and logs event', async () => {
    const contact = await contactManager.upsert('tenant_123', {...});
    const event = await eventLogger.log({
      tenant_id: 'tenant_123',
      contact_id: contact.id,
      event_type: 'customer_replied',
      payload: {}
    });
    expect(event.contact_id).toBe(contact.id);
  });
});

// E2E tests (n8n workflow simulation)
describe('Full message flow', () => {
  test('processes message end-to-end', async () => {
    // Simulate Chatwoot webhook → n8n → Aylas → response
    const webhook = mockChatwootWebhook();
    const response = await POST('/api/normalize', webhook);
    expect(response.success).toBe(true);
  });
});
```

## 9. PHASE 3 IMPLEMENTATION CHECKLIST

- [ ] Setup TypeScript project (tsconfig, eslint, prettier)
- [ ] Implement TenantConfigStore (JSON file / Baserow / env vars)
- [ ] Build M1-M7 services with interfaces above
- [ ] Create HTTP server + routes + middleware
- [ ] Write unit tests (80%+ coverage)
- [ ] Build n8n workflow templates (import/export JSONs)
- [ ] Deploy backend (Docker + Railway/Render/Fly.io)
- [ ] Configure production secrets (tenant configs)
- [ ] E2E test with real Chatwoot webhook
- [ ] Document API endpoints (OpenAPI spec)

## 10. TECH STACK RECOMMENDATIONS

```typescript
// Runtime
runtime: 'Node.js 20+' | 'Bun'

// Framework
framework: 'Express' | 'Fastify' | 'Hono'

// Database
database: 'PostgreSQL' (for events) | 'SQLite' (for config cache)

// Vector DB
vector_db: 'Pinecone' | 'Qdrant' | 'Weaviate'

// LLM SDK
llm_sdk: 'Vercel AI SDK' | 'LangChain'

// Testing
testing: 'Vitest' | 'Jest'

// Build
build: 'tsup' | 'esbuild'
```

---

**Next Steps:** Show this to @architect for validation, then proceed to Phase 3 (implementation).
