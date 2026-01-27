# Aylas Core - Implementation Details

## Architectural Decisions

### 1. Strict TypeScript Configuration

**Decision:** Use strict mode with all flags enabled (`noImplicitAny`, `strictNullChecks`, etc.)

**Rationale:**
- Catch bugs at compile time
- Better IDE autocomplete
- Self-documenting code
- Easier refactoring

**Trade-offs:**
- More verbose type annotations
- Longer initial development time
- Learning curve for team

### 2. Zod for Runtime Validation

**Decision:** Use Zod for webhook payload validation instead of manual checks

**Rationale:**
- Type-safe schema validation
- Automatic TypeScript type inference
- Better error messages
- Composable schemas

**Alternative considered:** Joi, but Zod has better TypeScript integration.

### 3. Dependency Injection via Constructor

**Decision:** Pass `TenantConfigStore` to all modules via constructor

**Rationale:**
- Easier testing (mock configs)
- No global state
- Multi-tenant support
- Config hot-reloading possible

**Trade-off:** More boilerplate in initialization.

### 4. Lazy Client Initialization

**Decision:** Initialize API clients (OpenAI, Baserow) on first use, not in constructor

**Rationale:**
- Faster module instantiation
- Avoid API calls during tests
- Memory efficient (only load needed clients)

**Implementation:** `Map<TenantId, Client>` cache per module.

### 5. Async Policy Execution

**Decision:** Execute policies asynchronously after logging event (fire-and-forget)

**Rationale:**
- Don't block event logging
- Policies may call external APIs (slow)
- Better error isolation

**Implementation:** `void this.applyPolicyAsync(event)` (no await).

### 6. JSONLogic Subset for Conditions

**Decision:** Implement custom JSONLogic evaluator instead of using library

**Rationale:**
- Full library is 50KB+ (bloat)
- Only need 5 operators: `==`, `>=`, `<=`, `and`, `or`, `var`
- Easier to debug
- No external dependency

**Trade-off:** Limited expressiveness, but sufficient for 95% of use cases.

### 7. Pattern Matching First, LLM Fallback

**Decision:** Try keyword matching before calling LLM for intent classification

**Rationale:**
- Cost optimization (avoid LLM calls when obvious)
- Latency reduction (pattern matching is instant)
- Deterministic behavior for common patterns

**Threshold:** Use LLM only if pattern confidence < 0.7.

### 8. Retry Logic with Exponential Backoff

**Decision:** Wrap all external API calls with retry utility

**Rationale:**
- Handle transient network errors
- Improve reliability
- Standard practice for production systems

**Configuration:**
- Default: 3 attempts, 1s initial delay, 2x backoff
- Max delay: 10s

### 9. Winston for Logging

**Decision:** Use Winston instead of console.log

**Rationale:**
- Structured logging (JSON format)
- Log levels (debug, info, warn, error)
- Context propagation (correlation IDs)
- Multiple transports (file, console, cloud)

**Production:** Send logs to cloud logging service (Datadog, CloudWatch).

### 10. Single Responsibility Modules

**Decision:** Each module (M1-M5) has one primary responsibility

**Rationale:**
- Easier testing
- Clear boundaries
- Independent deployment
- Reusable in other projects

**Example:** M2 only handles media processing, doesn't know about contacts or events.

## Known Limitations

### 1. Baserow Query Limitations

**Issue:** `findRow` only returns first match, no pagination support

**Impact:** Cannot efficiently query large event logs

**Workaround:** For M5 event queries, implement pagination in future iteration or use PostgreSQL.

**Resolution:** M5 is designed for write-heavy workloads (logging), queries are rare.

### 2. Video Processing Not Implemented

**Issue:** M2 returns placeholder for video attachments

**Impact:** Cannot extract text from video content

**Resolution:** Requires external service (AWS Transcribe, Cloudinary) - out of scope for M1-M5.

### 3. No Webhook Signature Validation

**Issue:** M1 doesn't verify Chatwoot webhook signatures

**Impact:** Potential security risk (spoofed webhooks)

**Resolution:** Add HMAC validation in production (requires Chatwoot webhook secret).

### 4. No Rate Limiting

**Issue:** No protection against API rate limits (OpenAI, Baserow)

**Impact:** May hit rate limits during traffic spikes

**Resolution:** Add rate limiter middleware in HTTP layer (not implemented yet).

### 5. Policy Engine - Limited JSONLogic Support

**Supported:**
- `==`, `>=`, `<=`, `and`, `or`, `var`

**Not supported:**
- `!`, `<`, `>`, `in`, `+`, `-`, `*`, `/`, `%`, `map`, `filter`, `reduce`

**Impact:** Complex conditions may require multiple simple policies.

**Resolution:** Sufficient for 95% of CRM automation use cases. Can extend if needed.

### 6. No Policy Testing UI

**Issue:** Policies are defined in config, no visual editor

**Impact:** Non-technical users cannot create policies

**Resolution:** Future feature - admin panel for policy management.

### 7. Single Tenant Config from Environment

**Issue:** `TenantConfigStore` only loads one tenant from env vars

**Impact:** Multi-tenant deployment requires code changes

**Resolution:** Implement database-backed config store in production.

### 8. No Event Replay

**Issue:** If policy execution fails, no retry mechanism

**Impact:** Lost policy actions

**Resolution:** Add dead letter queue (DLQ) for failed policy actions.

### 9. No Metrics Collection

**Issue:** No instrumentation for performance monitoring

**Impact:** Cannot track latency, error rates, throughput

**Resolution:** Add metrics in future iteration (Prometheus, StatsD).

### 10. Contact Upsert Race Condition

**Issue:** If two webhooks arrive simultaneously for same phone, may create duplicates

**Impact:** Data inconsistency

**Resolution:** Use unique index on phone number in Baserow + retry on conflict.

## Performance Characteristics

### M1: Message Normalizer
- **Latency:** <5ms (synchronous validation)
- **Memory:** <1MB (Zod schemas)
- **Throughput:** 1000+ req/sec

### M2: Multimodal Processor
- **Latency:** 2-10s (depends on OpenAI API)
  - Audio: 3-5s (Whisper)
  - Image: 2-4s (GPT-4o Vision)
  - PDF: 1-3s (local parsing)
- **Memory:** 50-100MB (buffers for file downloads)
- **Throughput:** Limited by OpenAI rate limits (50 req/min for Whisper)

### M3: Contact Manager
- **Latency:** 100-300ms (Baserow API)
- **Memory:** <10MB
- **Throughput:** Limited by Baserow rate limits (100 req/sec)

### M4: Agent Router
- **Latency:**
  - Pattern match: <10ms
  - LLM classification: 500-2000ms
- **Memory:** <20MB
- **Throughput:**
  - Pattern: 500+ req/sec
  - LLM: Limited by OpenAI rate limits (100 req/min)

### M5: Event Logger
- **Latency:**
  - Log: 100-200ms (Baserow write)
  - Policy eval: 50-100ms (synchronous)
  - Policy actions: Async (no blocking)
- **Memory:** <10MB
- **Throughput:** Limited by Baserow rate limits

## Security Considerations

### 1. API Keys in Environment
- **Risk:** Keys exposed in process env
- **Mitigation:** Use secret management service (AWS Secrets Manager, Vault)

### 2. No Input Sanitization
- **Risk:** Potential injection attacks in custom_fields JSON
- **Mitigation:** Zod schema validation, JSON serialization

### 3. No Authentication on Webhooks
- **Risk:** Unauthenticated webhook endpoints
- **Mitigation:** Add HMAC signature validation (Chatwoot provides signature header)

### 4. LLM Prompt Injection
- **Risk:** User message content may manipulate LLM classification
- **Mitigation:** Use system prompts with clear constraints, validate output schema

### 5. No Encryption at Rest
- **Risk:** Baserow data not encrypted
- **Mitigation:** Use Baserow self-hosted with encrypted database

## Next Phase (M6-M7)

### M6: Chatwoot Adapter
**Purpose:** Send messages, update conversations, manage labels

**API:**
```typescript
interface ChatwootAdapter {
  sendMessage(req: SendMessageRequest): Promise<ChatwootMessage>;
  updateConversation(conversationId: string, updates: Record<string, unknown>): Promise<void>;
  addLabels(conversationId: string, labels: string[]): Promise<void>;
  assignAgent(conversationId: string, agentId: number): Promise<void>;
}
```

**Implementation notes:**
- Use axios for HTTP requests
- Retry failed requests
- Handle rate limiting (429 responses)
- Support batch operations

### M7: Knowledge Base (RAG)
**Purpose:** Retrieve relevant FAQ/docs using vector similarity

**API:**
```typescript
interface KnowledgeBase {
  query(req: KBQueryRequest): Promise<KBResult[]>;
  upsert(tenantId: TenantId, documents: KBDocument[]): Promise<void>;
}
```

**Tech stack:**
- Vector DB: Pinecone / Qdrant / Weaviate
- Embeddings: OpenAI text-embedding-3-small
- Chunking: LangChain RecursiveCharacterTextSplitter
- Metadata filtering: tenant_id, tags, categories

**Integration with M4:**
```typescript
const kbResults = await knowledgeBase.query({
  tenant_id: 'tenant_123',
  query: message.content,
  top_k: 3
});

if (kbResults[0].similarity > 0.8) {
  // Send KB answer via M6
  await chatwootAdapter.sendMessage({
    conversation_id: message.conversation_id,
    content: kbResults[0].content
  });
}
```

## Testing Strategy

### Unit Tests (Jest)
- Mock all external dependencies (OpenAI, Baserow, Chatwoot)
- Test edge cases (null values, empty arrays, malformed JSON)
- Test error handling (network errors, API errors, validation errors)

### Integration Tests
- Use Docker Compose for local Baserow + Chatwoot instances
- Test full workflow: webhook → normalize → process → log
- Verify database state after operations

### E2E Tests (Future)
- Deploy to staging environment
- Send real Chatwoot webhooks
- Verify responses in Chatwoot UI

## Deployment Checklist

- [ ] Set all environment variables
- [ ] Test database connectivity (Baserow)
- [ ] Test API keys (OpenAI, Chatwoot)
- [ ] Run migrations (if any)
- [ ] Configure logging level (production = warn)
- [ ] Enable error tracking (Sentry)
- [ ] Set up health check endpoint
- [ ] Configure auto-scaling (based on queue depth)
- [ ] Set up monitoring dashboards (Grafana)
- [ ] Document runbook for common errors

## Contributing

### Code Style
- Use ESLint + Prettier
- Max line length: 100 chars
- No `any` types (use `unknown` + type guards)
- Explicit return types on public functions

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

### Pull Request Checklist
- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Coverage >= 80%
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
