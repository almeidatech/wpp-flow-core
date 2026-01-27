# EXECUTIVA: Análise Arquitetural Aylas n8n
**Versão:** 1.0 | **Data:** 26 de Janeiro, 2026

---

## ACHADOS CRÍTICOS

### 1. HARDCODING = SEM MULTI-TENANCY

```
PROBLEMA ATUAL (n8n):
├─ Account ID: "account_id: 2" (hardcoded em 15+ nós HTTP)
├─ Baserow Tables: table/6, table/4, table/11 (hardcoded)
├─ Tenant Filter: filter__tenant_id__equal="aylas" (hardcoded)
├─ Credenciais: API tokens em Variáveis Globais (plaintext)
└─ Resultado: IMPOSSÍVEL replicar para novo cliente sem manual copy-paste

NOVO CLIENTE (Próximo):
├─ Account ID será 3
├─ Tables serão 100, 101, 102 (workspace diferente)
├─ Tenant será "cathotel"
├─ Processo: Duplicar todos workflows + atualizar 50+ referências
└─ Tempo: ~2-3 horas por cliente + risco de erro manual
```

**Impacto Financeiro:**
- 1 novo cliente = 2-3 horas engenharia
- 10 clientes = 20-30 horas + 50% bug rate
- Sem margin para escala

---

### 2. 66 NÓS EM 1 WORKFLOW = DEBUGGING IMPOSSÍVEL

```
atendente_principal (n8n):
├─ Webhook normalization (1 SET node)
├─ Multi-modal dispatch (Switch + 5 parallel media nodes)
├─ Contact lookup (Baserow + retry logic)
├─ Message queuing (Redis + debounce)
├─ Agent routing (Multiple IF/Switch nodes)
├─ Response sending (5 different HTTP endpoints)
├─ Label management (GET labels + merge + PATCH)
└─ Result: One spaghetti bowl, impossible to test

PROBLEMA:
- Mudança em nó X quebra nó Y (conexões implícitas)
- Sem unit tests
- Sem error handling consistente
- Sem observabilidade (qual nó falhou?)
```

---

### 3. POLÍTICAS SEM VERSIONAMENTO

```
logger_central (Policy Engine):
├─ Policies armazenadas em Baserow (tabela 11)
├─ Sem histórico de mudanças
├─ Sem rollback
├─ Exemplo:
│  ├─ Dia 1: Policy X → Add labels [ia_atendendo]
│  ├─ Dia 5: Atualizar Policy X → Add labels [ia_atendendo, priority_high]
│  └─ Resultado: Conversas antigas não têm priority_high retroativamente
│              e não há como saber qual policy versão foi aplicada
└─ Resultado: Impossível auditar decisões de automação
```

---

## ANÁLISE TÉCNICA DETALHADA

### Arquitetura Atual (4 Workflows)

```
┌────────────────────────────────────────────────────────────────┐
│ CAMADA 1: Ingress (atendente_principal - 66 nós)              │
│ ─────────────────────────────────────────────────────────────── │
│ Webhook Chatwoot → Normalize → Dispatch → Multiple Agents      │
│ • Sem modularização                                             │
│ • Sem contratos                                                 │
│ • Sem testes                                                    │
│ • Sem observabilidade                                           │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ CAMADA 2: Event Processing (logger_central - 17 nós)          │
│ ─────────────────────────────────────────────────────────────── │
│ Normalize → Match Policies → Build Plan → Persist → Sync       │
│ • Policy engine sem versionamento                              │
│ • Persist logic hardcoded a Baserow table IDs                  │
│ • Sem error recovery                                            │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ CAMADA 3: Specialized Flows (pet_data_flow, info_agent)       │
│ ─────────────────────────────────────────────────────────────── │
│ Pet updates + AI FAQ responses                                  │
│ • Duplicação de lógica                                          │
│ • Acoplamento a logger_central                                  │
│ • Knowledge base não reutilizável                              │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ SISTEMAS EXTERNOS                                               │
│ ─────────────────────────────────────────────────────────────── │
│ Chatwoot (CRM) | Baserow (DB) | OpenAI (LLM) | Redis (Cache)  │
└────────────────────────────────────────────────────────────────┘
```

---

## SOLUÇÃO: 7 MÓDULOS TYPESCRIPT

### Mapa Modular

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AYLAS CORE LIBRARY (@aylas/core)               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ M1: Message Normalizer                                       │  │
│  │ Input: Webhook bruto | Output: Structured message            │  │
│  │ ✓ Type-safe | ✓ Testable | ✓ Error handling               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           ↓                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ M2: Multimodal Processor                                     │  │
│  │ Input: Message + media URLs | Output: Extracted content      │  │
│  │ ✓ Abstracted AI calls | ✓ Retry logic | ✓ Mocked in tests  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           ↓                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ M3: Contact Manager                                          │  │
│  │ Input: Phone | Output: Contact + Pet history                 │  │
│  │ ✓ Abstracted DB calls | ✓ JSON parsing | ✓ Null handling   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           ↓                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ M4: Agent Router                                             │  │
│  │ Input: Context | Output: Routing decision                    │  │
│  │ ✓ Pattern matching | ✓ LLM fallback | ✓ Confidence scores  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           ↓                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ M5: Event Logger (Policy Engine)                             │  │
│  │ Input: Event | Output: Execution plan                        │  │
│  │ ✓ Policy matching | ✓ Plan building | ✓ Execution          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           ↓                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ M6: Chatwoot Adapter                                         │  │
│  │ Input: Execution plan | Output: Synced conversation          │  │
│  │ ✓ Label merging | ✓ Attribute updates | ✓ Idempotent       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           ↓                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ M7: Knowledge Base (RAG)                                     │  │
│  │ Input: Question | Output: Augmented response                 │  │
│  │ ✓ Multi-tenant | ✓ System prompts configurable | ✓ RAG     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────┬───────────────────────────────────────────────────────────────┘
       │
       ↓ Configuration (CENTRAL, not hardcoded)

┌────────────────────────────────────────────────────────────────┐
│ config/tenants/                                                 │
│ ├─ aylas.ts      → TenantConfig { account_id, tables, llm }   │
│ ├─ cathotel.ts   → TenantConfig { ... }                       │
│ └─ pethotel.ts   → TenantConfig { ... }                       │
└────────────────────────────────────────────────────────────────┘
```

### Benefícios Imediatos

| Aspecto | n8n (Atual) | TypeScript (Proposto) |
|--------|-----------|----------------------|
| **Multi-tenancy** | Impossível | Config-driven, automático |
| **Testes** | Não (n8n sem unit test) | 100% coverage com Jest |
| **Debugging** | 66 nós = Impossível | Isolated modules, stacktraces |
| **Policies** | Sem versionamento | Git-tracked, auditável |
| **Time to onboard novo cliente** | 2-3h manual | 15 min (config) |
| **Credenciais** | Plaintext em Variáveis | Environment variables |
| **Observabilidade** | Silent failures | Trace IDs, structured logs |
| **Manutenção** | Code duplication | DRY, SOLID principles |

---

## IMPACTO POR PROBLEMA

### 🔴 Crítico (Bloqueadores)

#### #1: Hardcoding Account ID (Chatwoot)
- **Onde:** 15+ nós HTTP Request
- **Efeito:** Novo cliente = novo workflow com manual copy-paste
- **Risco:** Wrong account_id → messages sent to wrong customer
- **Solução:** M1-M6 + config/tenants/customer.ts

#### #2: Hardcoding Baserow Tables
- **Onde:** logger_central + pet_data_flow queries
- **Efeito:** Impossível replicar entre Baserow workspaces
- **Risco:** Table ID conflict → data written to wrong table
- **Solução:** ContactManager + EventLogger abstração

#### #3: Credenciais em Plaintext
- **Onde:** userTokenChatwoot em Variáveis Globais
- **Efeito:** Token exposto em logs, backups, audit trail
- **Risco:** API token compromise → malicious API calls
- **Solução:** process.env + secret manager (AWS/GCP)

---

### 🟠 Alto (Serious Issues)

#### #4: 66 Nós = Debugging Impossível
- **Onde:** atendente_principal workflow
- **Efeito:** Mudança em 1 nó quebra 10 (conexões implícitas)
- **Risco:** Breaking changes propagam silenciosamente
- **Solução:** Modularização em 7 funções TypeScript

#### #5: Sem Contratos
- **Onde:** Toda parte (cada nó assume estrutura de entrada)
- **Efeito:** Silent failures quando upstream estrutura muda
- **Risco:** Data corruption (invalid schema)
- **Solução:** TypeScript interfaces + Runtime validation

#### #6: Policy Matching sem Testes
- **Onde:** logger_central "Policy Matcher" node
- **Efeito:** Business logic untested → bugs in production
- **Risco:** Wrong policies matched → unintended labels/updates
- **Solução:** EventLogger com 100% unit test coverage

---

### 🟡 Médio (Technical Debt)

#### #7: Sem Observabilidade
- **Onde:** 5+ workflow execute em série (sem trace ID)
- **Efeito:** Impossível seguir jornada de uma mensagem
- **Risco:** Long debugging sessions
- **Solução:** Correlation ID + Structured logging

#### #8: Policies sem Versionamento
- **Onde:** Baserow table 11 (mutable, sem histórico)
- **Efeito:** Impossível auditar "quando mudou essa policy?"
- **Risco:** Compliance violation
- **Solução:** Git-tracked policies + changelog

---

## ROADMAP IMPLEMENTAÇÃO

### Fase 1: Modularização Core (4 semanas)
- [ ] Setup TypeScript project
- [ ] Implementar M1-M5 (Message → Event Logger)
- [ ] 100% unit test coverage
- [ ] Integração com n8n via HTTP

### Fase 2: Agent Dispatch (3 semanas)
- [ ] M4 refinement (Agent Router)
- [ ] M6 Chatwoot Adapter
- [ ] M7 Knowledge Base (RAG)
- [ ] E2E tests (mock Chatwoot, Baserow, OpenAI)

### Fase 3: Multi-tenancy (2 semanas)
- [ ] TenantConfig abstraction
- [ ] config/tenants/* templates
- [ ] Onboarding script para novo cliente
- [ ] Zero hardcoding

### Fase 4: Observabilidade (2 semanas)
- [ ] Winston logging configuration
- [ ] Trace ID propagation
- [ ] Datadog integration (optional)
- [ ] Alerts for critical errors

### Fase 5: Deprecate n8n (2 semanas)
- [ ] Cutover plan
- [ ] Parallel testing (n8n vs TypeScript)
- [ ] Monitoring dashboards
- [ ] Rollback procedures

**Total: ~13 semanas (Q2 2026)**

---

## ESTIMATIVA DE ESFORÇO

| Módulo | Dias | Testes | Risco |
|--------|------|--------|-------|
| M1: Message Normalizer | 3d | 5h | Baixo |
| M2: Multimodal Processor | 4d | 6h | Médio (LLM calls) |
| M3: Contact Manager | 3d | 4h | Baixo |
| M4: Agent Router | 4d | 5h | Médio (intent detection) |
| M5: Event Logger | 5d | 8h | Alto (policy logic) |
| M6: Chatwoot Adapter | 3d | 5h | Baixo |
| M7: Knowledge Base | 4d | 6h | Médio (RAG) |
| **Integração** | **5d** | **8h** | **Alto** |
| **Total** | **31d** | **47h** | — |

**1 Senior Dev + 1 Mid Dev = 4-5 semanas**

---

## RECOMENDAÇÕES

### Imediato (Esta semana)
1. ✅ Aprovar análise arquitetural
2. ✅ Validar com Aylas (feedback sobre policies)
3. ✅ Definir TenantConfig schema

### Curto prazo (Próximo mês)
1. Iniciar Fase 1 (M1-M5)
2. Setup CI/CD (Jest + GitHub Actions)
3. Create RFC (Request for Comments) com equipe

### Médio prazo (Q2 2026)
1. Implementar Fase 2-3
2. Onboard novo cliente (primeiro que solicit)
3. Cutover gradual (n8n → TypeScript)

### Longo prazo (Q3+ 2026)
1. Deprecate n8n (manter fallback por 3 meses)
2. Expandir para mais clientes
3. Contribuir patterns back à comunidade wpp-flow-core

---

## COMPARAÇÃO: CURRENT vs PROPOSED

### Scenario: Onboard "CatHotel Brasil"

#### Current (n8n):
```
1. Duplicar atendente_principal.json
2. Duplicar logger_central.json
3. Duplicar pet_data_flow.json
4. Duplicar info_agent.json
5. Atualizar account_id: 2 → 3 (15+ places)
6. Atualizar tableId: 4,6,11 → 200,201,202 (9+ places)
7. Atualizar tenant/niche filters
8. Atualizar system prompts
9. Testar (manual cliques em n8n UI)
10. Deploy & monitor

Tempo: 2-3 horas
Risco: 30-40% chance de error (wrong account_id, missing fields)
```

#### Proposed (TypeScript):
```
1. cp config/tenants/aylas.ts config/tenants/cathotel.ts
2. npm run onboard:cathotel
   ├─ Update account_id, table IDs
   ├─ Update API tokens (from env)
   ├─ Validate config schema
   ├─ Run integration tests
   └─ Deploy to production

Tempo: 15 minutos
Risco: <1% (schema validation catches errors)
```

---

## CONCLUSÃO

Arquitetura n8n atual é **viable para 1 cliente**, mas **impossível para escala**.

3 hardcoding críticos (Account ID, Table IDs, Tenant) impedem multi-tenancy.
66 nós monolíticos impedem manutenibilidade e testes.

**Solução proposta:** 7 módulos TypeScript + config-driven architecture
**Benefit:** 10x faster onboarding, 100x better testability, enterprise-ready.

**Next Step:** Kick-off Fase 1 com @dev @qa teams.

---

**Análise Completa:** `/d/wpp-flow-core/analise-aylas-fase-1.md` (2270 linhas, 68KB)
