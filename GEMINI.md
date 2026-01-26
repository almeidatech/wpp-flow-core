# GEMINI.md

This file provides guidance to Gemini when working with code in this repository.

## Project Overview

**wpp-flow-core** is a **modular WhatsApp CRM automation framework** built on **AIOS 4.31.0** (AI Orchestration System). It combines **n8n** (workflow automation) + **Chatwoot** (multi-channel CRM) to deliver intelligent customer support workflows for any business vertical.

```
WhatsApp → Chatwoot Inbox (CRM) → Webhook → n8n Workflow → Chatwoot API → WhatsApp Reply
```

## Architecture at a Glance

**Three-Layer Quality Gates**
```
Layer 1: Pre-commit (lint, unit tests, typecheck)
   ↓
Layer 2: PR automation (integration tests, build, CodeRabbit review)
   ↓
Layer 3: Human review (story validation, architecture, business logic)
```

**Multi-Agent Development Workflow**
```
Analyst → Requirements → Architect → Design → PM → PRD
                                                    ↓
                                              SM → Story (Hyperdetailed)
                                                    ↓
                                    Dev → Implementation (Full context)
                                                    ↓
                                    QA → Validation (Story criteria)
                                                    ↓
                                 DevOps → Release (Semantic versioning)
```

**n8n + Chatwoot Integration Pattern**
```yaml
Webhook Trigger:
  nodes:
    - chatwoot_webhook: [message_created, conversation_created, conversation_status_changed]
    - code_node: "processMessage(event.conversation_id, event.message.content)"
    - chatwoot_api: "POST /api/v1/accounts/{id}/conversations/{conv_id}/messages"
```

## Development Commands

All commands run from `.aios-core/` (framework root):

### Framework Build & Test
```bash
npm run build              # Build framework distribution
npm run test              # All tests (unit + integration)
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run lint              # ESLint
npm run typecheck         # TypeScript type checking
```

### Project Setup
```bash
cp config/.env.example config/.env
# Fill in credentials: Chatwoot, WhatsApp Business API, n8n, LLM keys

npm run health-check      # Verify system readiness (MCPs, auth, dependencies)
```

### AIOS Framework Commands
```bash
# From project root
aios-core generate        # Generate components (agents, tasks, workflows)
aios-core manifest        # Manage install manifest (regenerate, validate)
aios-core metrics         # Metrics collection (record, show, cleanup)
aios-core migrate         # Framework migration (analyze, backup, execute, rollback)
```

## AIOS Framework Architecture

### Core Modules (`.aios-core/`)

| Module | Purpose | Key Components |
|--------|---------|-----------------|
| **core/** | Runtime engine | Config cache, elicitation, health-check, orchestration, quality gates, registry |
| **development/** | Agent definitions | 11 personas (dev, qa, architect, pm, po, sm, analyst, devops, ux, data-engineer, nlp) |
| **infrastructure/** | Integration layer | PM adapters (ClickUp, GitHub, Jira, local), executors, helpers, IDE sync |
| **product/** | PM/PO templates | 52+ templates, 14+ checklists, 28+ scripts |
| **workflow-intelligence/** | Optimization engine | Pattern learning, context propagation, parallel planning |

### Key Architectural Pattern: Tech Stack Detection

Pre-flight analysis runs BEFORE agent execution:
```javascript
TechStackDetector analyzes:
  → package.json (framework, dependencies)
  → Source code patterns (language, paradigm)
  → Configuration files (build tool, linter, database)
  → Routes agent to appropriate skill set
```

This ensures agents give framework-specific guidance (React vs Vue, TypeScript vs JavaScript, etc.)

### 11 Specialized Agents

Access via `@agent-name` (e.g., `@dev *create-feature`):

| Agent | Role | When to Use |
|-------|------|------------|
| `@aios-master` | Orchestrator | Framework development, workflow coordination, meta-operations |
| `@dev` | Developer | Code implementation, debugging, refactoring |
| `@qa` | Quality Assurance | Test design, story validation, coverage analysis |
| `@architect` | Tech Lead | API design, architecture decisions, system design |
| `@pm` | Product Manager | Requirements, epics, product roadmap, PRDs |
| `@po` | Product Owner | Acceptance criteria, sprint planning, releases |
| `@sm` | Scrum Master | Story creation, sprint workflow, team coordination |
| `@analyst` | Business Analyst | Research, brainstorming, competitor analysis |
| `@devops` | Infrastructure | Git operations, CI/CD, releases, repository management |
| `@data-engineer` | Data Specialist | Database schemas, migrations, performance tuning |
| `@ux-design-expert` | UX/UI Designer | Interface design, usability, accessibility |
| `@nlp-engineer` | AI/NLP | Language models, chatbots, text processing, sentiment |

### Agent Collaboration Example

**Story Implementation Workflow:**
```
1. User: "Create login feature"
2. @pm: Creates PRD with full requirements
3. @sm: Writes hyperdetailed story with architecture guidance embedded
4. @dev: Implements with full context (no context switching)
5. @qa: Validates against story acceptance criteria
6. @devops: Manages push, PR, versioning
```

## Integration Patterns

### Chatwoot Webhook Events

Chatwoot sends webhooks to n8n on:

| Event | Payload | Use Case |
|-------|---------|----------|
| `message_created` | `conversation_id, message.content, sender` | Process incoming customer message |
| `conversation_created` | `conversation_id, customer_id, channel` | Route to appropriate automation |
| `conversation_status_changed` | `conversation_id, status, updated_by` | Track conversation lifecycle |

**Chatwoot API Base:** `https://app.chatwoot.com/api/v1`
**Auth Header:** `api_access_token: <token>`

### n8n Expressions

Access webhook data in n8n code nodes:
```javascript
{{ $json.body.message.content }}        // Message text
{{ $json.body.conversation.id }}        // Conversation ID
{{ $json.body.conversation.custom_attributes }} // Metadata
{{ $json.event }}                       // Event type (message_created, etc.)
```

## Tool Usage Rules

**Critical Rule:** Use native Gemini tools for local operations:

| Task | Use This | Description |
|------|----------|-------------|
| Read files | `view_file` | Reads file content. |
| Write files | `write_to_file` / `replace_file_content` | Creates or modifies files. |
| Run commands | `run_command` | Executes shell commands. |
| Search files | `find_by_name` / `grep_search` | Finds files by name or content. |

## Custom Agents for Domain Specificity

8 domain-specific agents installed in `.claude/agents/` (Compatible with Gemini workflows):

| Agent | Specialization | Use Case |
|-------|----------------|----------|
| **customer-support** | Support workflows | Chatwoot flows, FAQs, ticket routing |
| **sales-automator** | Sales sequences | Follow-up workflows, lead scoring, conversion |
| **backend-architect** | API design | REST/GraphQL design, schema planning |
| **api-documenter** | API documentation | OpenAPI/Swagger generation, client SDKs |
| **mcp-integration-engineer** | Custom MCPs | Building domain-specific MCP servers |
| **javascript-pro** | n8n code | JavaScript functions, n8n node development |
| **typescript-pro** | Type-safe code | Advanced TypeScript, generic types |
| **nlp-engineer** | AI/NLP systems | Chatbots, intent classification, sentiment |

**Usage:** `@agent-name *command` (e.g., `@customer-support *create-routing-workflow`)

## Skills & Commands

### Installed Skills

| Skill | Purpose | Usage |
|-------|---------|-------|
| `skill-creator` | Create custom skills | `@aios-master *create-skill` |
| `create-architecture-documentation` | Generate C4, Arc42, ADRs | `/create-architecture-documentation` |

### AIOS Commands (via `@aios-master`)

```bash
*help                    # Show all commands
*status                  # Current context and progress
*kb                      # Toggle knowledge base mode
*create agent {name}     # Create new agent
*create task {name}      # Create new task
*workflow {name}         # Start workflow
*plan                    # Create workflow plan
```

## Development Workflow: From Story to Production

### Phase 1: Requirements → Design (Async, stakeholder feedback)
```
@analyst → @architect → @pm → PRD document
```

### Phase 2: Story Creation (Hyperdetailed, execution context)
```
@sm creates story with:
  - Complete implementation context
  - Architecture patterns embedded
  - Test requirements
  - Acceptance criteria
  - Links to PRD sections
```

### Phase 3: Implementation (Full context, focused work)
```
@dev executes story:
  - All context available upfront
  - No context switching
  - Architecture guidance built-in
  - Test specs clear
```

### Phase 4: Quality Assurance
```
@qa validates:
  - Story acceptance criteria met
  - Tests pass and coverage OK
  - No regressions
  - Performance acceptable
```

### Phase 5: Release Management
```
@devops:
  - *pre-push (run quality gates)
  - *push (git push with validation)
  - *create-pr (GitHub PR creation)
  - *release (semantic versioning + changelog)
```

## Chatwoot + n8n Setup Guide

### 1. Chatwoot Webhook Configuration
```
Settings → Integrations → Webhooks
Event: message_created
URL: https://your-n8n.com/webhook/chatwoot
Auth: API Token (from n8n)
```

### 2. n8n Webhook Trigger Node
```yaml
Trigger: Webhook
Methods: [POST]
Auth: Basic (username=token, password=secret)
Response: 200 OK
```

### 3. n8n Process Node
```javascript
// Extract message content and conversation ID
const messageContent = $json.body.message.content;
const conversationId = $json.body.conversation.id;

// Call your AI/automation logic
const response = await processMessage(messageContent);
return { response, conversationId };
```

### 4. Chatwoot API Response Node
```javascript
const apiUrl = `${process.env.CHATWOOT_BASE_URL}/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/conversations/${$json.conversationId}/messages`;

return {
  url: apiUrl,
  method: 'POST',
  headers: {
    'api_access_token': process.env.CHATWOOT_API_TOKEN,
    'Content-Type': 'application/json'
  },
  body: {
    content: $json.response,
    message_type: 1,  // 1 = outgoing
    private: false
  }
};
```

## Configuration & Secrets

**Environment Setup:**
```bash
# Copy template and fill credentials
cp config/.env.example config/.env

# Required variables:
CHATWOOT_BASE_URL=https://app.chatwoot.com
CHATWOOT_API_TOKEN=<token>
CHATWOOT_ACCOUNT_ID=<id>

WHATSAPP_PHONE_NUMBER_ID=<id>
WHATSAPP_BUSINESS_ACCOUNT_ID=<id>
WHATSAPP_API_TOKEN=<token>

N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=<key>

OPENAI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
```

**Never commit secrets.** Use `.gitignore` which already excludes: `.env`, `*.pem`, `*.key`, `credentials.json`

## Documentation Patterns

**Framework Documentation** lives in `docs/framework/`:
- `coding-standards.md` - Code style and patterns
- `tech-stack.md` - Technology selection rationale
- `source-tree.md` - Directory structure guide

**Project Documentation** in `docs/architecture/`:
- `*.md` files - Architecture decisions and specifications
- ADRs - Architecture Decision Records with rationale
- Sharded docs - Large docs split into parts (configured in core-config.yaml)

**Decision Logging:** All architectural decisions tracked in `.ai/decision-logs-index.md` with full ADR format

## Related Documentation

- [Chatwoot Integration Guide](docs/chatwoot-setup.md)
- [n8n Workflow Patterns](docs/n8n-workflows.md)
- [Framework Documentation](docs/framework/)
- [Architecture Decisions](docs/architecture/)
