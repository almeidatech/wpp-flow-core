# ANÁLISE ARQUITETURAL PROFUNDA - AYLAS n8n WORKFLOWS
## Fase 1: Diagnóstico Estrutural & Mapa de Modularização

**Data:** 26 de Janeiro, 2026
**Escopo:** Análise de 4 workflows n8n (66 nós) + 2 workflows suporte + Base de conhecimento Aylas
**Objetivo:** Identificar problemas de arquitetura e mapear modularização TypeScript

---

## SEÇÃO 1: ARQUITETURA ATUAL

### 1.1 Fluxo de Dados Principal (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      AYLAS MESSAGE PROCESSING PIPELINE                         │
└─────────────────────────────────────────────────────────────────────────────────┘

WhatsApp Message
       ↓
   ┌──────────────────────────────────────────────────────────────────┐
   │ atendente_principal (66 nós)                                    │
   │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
   │                                                                  │
   │ 1. WEBHOOK NORMALIZATION (Variáveis Globais)                   │
   │    Extract: phone, sender, conversation_id, attachment type    │
   │           ↓                                                     │
   │ 2. CONTACT LOOKUP (contatoExiste → Baserow table 6)            │
   │    Query by phone_number                                        │
   │           ↓                                                     │
   │ 3. MULTIMODAL DISPATCH (Tipo da Mensagem + Switch1)            │
   │    ├─ Audio      → OpenAI Transcribe → Redis Queue             │
   │    ├─ Image      → GPT-4o Vision Analyze → Redis Queue         │
   │    ├─ PDF/File   → Extract Text → Redis Queue                  │
   │    ├─ Video      → Download & forward                          │
   │    └─ Text       → Direct → Redis Queue                        │
   │           ↓                                                     │
   │ 4. MESSAGE BUFFERING (Redis Chat Memory + Debounce)            │
   │    Accumulate messages for context window (100 msgs)           │
   │    Wait 1s for next message before processing                  │
   │           ↓                                                     │
   │ 5. AGENT ROUTING (Conditional)                                 │
   │    Route to: info_agent, comercial_agent, fidelidade, booking  │
   │           ↓                                                     │
   │ 6. SEND RESPONSE (Chatwoot API POST)                           │
   │    POST /api/v1/accounts/2/conversations/{id}/messages         │
   │           ↓                                                     │
   │ 7. LABEL APPLICATION (Labels + Attributes)                     │
   │    Add: ia_atendendo, intencao_*, agent_*                      │
   │                                                                  │
   └──────────────────────────────────────────────────────────────────┘
          ↓
   ┌──────────────────────────────────────────────────────────────────┐
   │ logger_central (17 nós)                 [CALLED FROM MULTIPLE]  │
   │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
   │                                                                  │
   │ 1. NORMALIZE EVENT (Explode entities → array of 1 canonical)   │
   │           ↓                                                     │
   │ 2. LOAD POLICIES (Baserow table 11: Rules Engine)              │
   │    Filter: event_type=*, entity=*, source, confidence >= N      │
   │           ↓                                                     │
   │ 3. POLICY MATCHER (Match event against policies)               │
   │    Sort by priority, return matched policies                   │
   │           ↓                                                     │
   │ 4. EXECUTION PLAN BUILDER                                       │
   │    Compile: persist_config, labels[], contact_attrs, emit[]    │
   │           ↓                                                     │
   │ 5. PERSIST ROUTER (Decide CRUD operations)                     │
   │    Generate: CREATE/UPDATE/DELETE for each table               │
   │           ↓                                                     │
   │ 6. BASEROW EXECUTOR (Loop over tables)                         │
   │    For each table:                                              │
   │    - getTables() → Find table ID                               │
   │    - getRow()    → Check if exists by phone                    │
   │    - CREATE      → POST new row                                │
   │    - UPDATE      → PATCH existing row                          │
   │           ↓                                                     │
   │ 7. CHATWOOT SYNC (Update labels + attributes)                  │
   │    Guard: Only if labels or attrs present                      │
   │    GET /api/v1/accounts/2/conversations/{id}/labels            │
   │    MERGE with execution plan                                   │
   │                                                                  │
   └──────────────────────────────────────────────────────────────────┘
          ↓
   ┌──────────────────────────────────────────────────────────────────┐
   │ pet_data_flow (5 nós) [OPTIONAL: Pet updates only]              │
   │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
   │                                                                  │
   │ 1. GET CLIENT (Baserow table 4: Contacts + Pet JSON)           │
   │    Query by phone_number                                        │
   │           ↓                                                     │
   │ 2. MERGE PET DATA (JavaScript)                                 │
   │    Parse client.dados_pet JSON array                           │
   │    Update/Add pet with patch fields                            │
   │           ↓                                                     │
   │ 3. UPDATE BASEROW (table 4)                                    │
   │    PATCH client row with new dados_pet JSON                    │
   │           ↓                                                     │
   │ 4. CALL logger_central                                         │
   │    Emit event: event_type=pet_update, action_type=dados_pet    │
   │                                                                  │
   └──────────────────────────────────────────────────────────────────┘
          ↓
   ┌──────────────────────────────────────────────────────────────────┐
   │ info_agent (6 nós) [AI Agent for FAQ]                           │
   │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
   │                                                                  │
   │ 1. AI Agent (LangChain + GPT-4o Mini)                           │
   │    Tools: Redis Chat Memory, Google FileSearch, Think           │
   │           ↓                                                     │
   │ 2. REDIS CHAT MEMORY                                            │
   │    Key: {phone}-1 | Window: 100 messages                        │
   │           ↓                                                     │
   │ 3. KLBAYLAS FIRESEARCH (Google Generative Language)             │
   │    Knowledge base: klbaylas-j22hu40zzxgk                        │
   │    Searches: Vacinas, Rotina, Preços, Fidelidade, etc.         │
   │           ↓                                                     │
   │ OUTPUT: JSON { status, tipo_resposta, final_message }          │
   │                                                                  │
   └──────────────────────────────────────────────────────────────────┘
```

### 1.2 Componentes Identificados

#### **1.2.1 Message Processor (atendente_principal, nós: Variáveis Globais + Tipo da Mensagem)**

**Responsabilidade:** Normalizar webhook Chatwoot bruto em estrutura canônica

**Entrada:**
```json
{
  "body": {
    "conversation": {
      "id": 60,
      "messages": [
        {
          "content": "Oi, tudo bem?",
          "attachments": [
            {
              "file_type": "audio",
              "data_url": "https://..."
            }
          ],
          "sender": {
            "phone_number": "+556194350995",
            "name": "João Silva"
          }
        }
      ],
      "contact_inbox": {
        "source_id": "wa_123456"
      }
    },
    "account": { "id": 2 }
  }
}
```

**Saída:**
```json
{
  "telefone": "556194350995",
  "conversationId": 60,
  "sourceID": "wa_123456",
  "accountIDChatwoot": 2,
  "messageContent": "Oi, tudo bem?",
  "fileType": "audio",
  "Media": "https://...",
  "nome": "João Silva",
  "urlChatwoot": "https://crm.olmedatech.com",
  "userTokenChatwoot": "P1iHEccTy6neQuB7WGRA6yQN",
  "statusDaConversa": "open"
}
```

**Padrão n8n:** `SET` node + `SWITCH` node com regras condicionais

---

#### **1.2.2 Multi-Modal Handler (atendente_principal, nós: Tipo da Mensagem, Switch1, Analyze image, Extrair PDF, Transcribe)**

**Responsabilidade:** Processar diferentes tipos de mídia (áudio, imagem, PDF, vídeo, texto)

**Matriz de Processamento:**

| Tipo | Nós n8n | Operação | Saída |
|------|---------|----------|--------|
| **audio/mp3** | `baixaÁudio` → `Transcribe a recording` | OpenAI Whisper (pt-BR) | `{ text }` |
| **image/jpg/png** | `baixaImagem` → `Analyze image` | GPT-4o Vision | `{ content: "descrição" }` |
| **file/pdf** | `convertePDF` → `Extrair Dados .pdf` | n8n Extract from File | `{ text }` |
| **video** | `baixaVídeo` | HTTP Download | URL forwarding |
| **text** | Direct | N/A | `$json.messageContent` |

**Key Issue:** Cada tipo dispara HTTP Request separado (5 nós paralelos) sem abstração comum

---

#### **1.2.3 Contact Manager (atendente_principal, nó: contatoExiste + Baserow table 6)**

**Responsabilidade:** Verificar se contato existe no CRM, recuperar contexto

**Query:**
```
GET baserow.olmedatech.com/api/database/rows/table/6/?filter__telefone__equal=556194350995
```

**Entidade retornada:**
```json
{
  "id": 123,
  "telefone": "556194350995",
  "nome": "João Silva",
  "email": "joao@email.com",
  "status": "ativo",
  "dados_pet": [
    {
      "pet_id": "pet_001",
      "nome": "Rex",
      "raca": "Shih Tzu",
      "idade": 3,
      "ultimo_update": "2025-12-20"
    }
  ]
}
```

**Padrão n8n:** Baserow native node com conditional retry (5 tries, 5s wait)

---

#### **1.2.4 Agent Router (atendente_principal, conditional nodes)**

**Responsabilidade:** Rotear para agente especializado baseado em intenção

**Rotas Identificadas:**
- `info_agent` - FAQ, informações sobre saúde, rotina, preços
- `comercial_agent` - Vendas, promoções
- `fidelidade_agent` - Programa de fidelidade
- `booking_agent` - Agendamentos

**Lógica de Roteamento:** Condicional baseada em:
1. Labels do Chatwoot (`etiqueta`)
2. Agent assignado (`agentName`)
3. Intent detectada no message content

**Padrão n8n:** IF node com múltiplas condições + Execute Workflow

---

#### **1.2.5 Event Logger (logger_central workflow)**

**Responsabilidade:** Event sourcing centralizado + Policy-driven automation

**Pipeline:**
```
Raw Event → Normalize → Load Policies → Match → Build Plan → Execute
```

**Schema de Evento:**
```json
{
  "event_type": "intent_detected | pet_update | conversation_created | ...",
  "entity": "conversation | contact | pet | order",
  "payload": { "intent": "hotel", "...": "..." },
  "conversation": {
    "conversation_id": 60,
    "account_id": 2,
    "channel": "whatsapp",
    "contact_id": 123,
    "telefone": "556194350995"
  },
  "context": {
    "source": "ai | system | user",
    "confidence": 0.82
  },
  "meta": {
    "received_at": "2025-12-26T17:16:34.919Z",
    "schema_version": "1.0",
    "depth": 0,
    "external_event_id": "evt_123456"
  }
}
```

**Policy Engine (Baserow table 11):**

| Campo | Tipo | Função |
|-------|------|--------|
| `enabled` | bool | Ativa/desativa policy |
| `event_type` | select | Tipo evento (ou `*` = wildcard) |
| `entity` | select | Entidade alvo (ou `*` = wildcard) |
| `confidence_gte` | number | Mínima confiança (ex: 0.7) |
| `source_in` | select | Origem evento (ai, system, user) |
| `priority` | number | Ordem execução (lower = primeiro) |
| `persist_config` | json | CRUD ops p/ Baserow tables |
| `labels_add` | array | Labels p/ adicionar Chatwoot |
| `labels_remove` | array | Labels p/ remover |
| `contact_attributes` | json | Attrs p/ atualizar contact |
| `emit_event` | string | Novo evento (recursão) |

**Execution Plan Output:**
```json
{
  "persist": {
    "crm_conversation": {
      "operation": "create",
      "fields": { "telefone": "556194350995", "last_intent": "hotel" }
    },
    "crm_pet": {
      "operation": "update",
      "match": { "telefone": "556194350995" },
      "fields": { "ultimo_atendimento": "2025-12-26" }
    }
  },
  "labels": {
    "add": ["intencao_hotel", "ia_atendendo"],
    "remove": ["pendente"]
  },
  "contact_attributes": {
    "last_intent": "hotel",
    "last_interaction_timestamp": "2025-12-26T17:16:34.919Z"
  },
  "emit_events": []
}
```

---

#### **1.2.6 Chatwoot Adapter**

**Responsabilidade:** Sincronizar estado entre n8n/Baserow → Chatwoot

**Operações:**

1. **POST Message:**
```bash
POST /api/v1/accounts/2/conversations/{conversation_id}/messages
Content-Type: application/json
api_access_token: P1iHEccTy6neQuB7WGRA6yQN

{
  "content": "Resposta do bot",
  "message_type": "outgoing",
  "content_type": "text",
  "private": false,
  "content_attributes": {
    "source_id": "wa_123456"
  }
}
```

2. **PATCH Labels:**
```bash
POST /api/v1/accounts/2/conversations/{conversation_id}/labels
api_access_token: P1iHEccTy6neQuB7WGRA6yQN

{
  "labels": ["ia_atendendo", "intencao_hotel"]
}
```

3. **PATCH Contact Attributes:**
```bash
POST /api/v1/accounts/2/contacts/{contact_id}
{
  "custom_attributes": {
    "ultima_intencao": "hotel",
    "last_interaction_at": "2025-12-26"
  }
}
```

4. **Toggle Status:**
```bash
POST /api/v1/accounts/2/conversations/{conversation_id}/toggle_status
{
  "status": "open"
}
```

---

#### **1.2.7 Knowledge Base (info_agent + Google FileSearch)**

**Responsabilidade:** FAQ Aylas em contexto de IA

**Integração:**
- **LLM:** GPT-4o Mini (OpenAI)
- **Memory:** Redis Chat Memory (keyed by `phone_number-1`)
- **Tools:** Google FileSearch (`klbaylas-j22hu40zzxgk`)

**System Prompt:**
```
Você é Maya, assistente do Espaço Aylas.
Tom: tutora experiente, acolhedora, apaixonada por pets.

PROIBIDO: listas com bullets (use texto corrido)
OBRIGATÓRIO: emojis moderados

Tópicos domínio:
- Saúde: V8/V10, Raiva, Tosse, Coleira (48h antes)
- Rotina: Socialização, gramadão, cromoterapia, musicoterapia, banho seco
- Hospedagem: Trazer ração + manta. Nós fornecemos: caminhas, comedouros
- Preços: Planos mensais + diárias avulsas
- Fidelidade: 1 real = 1 ponto, cashback em serviços
```

**FAQ Knowledge (36 tópicos em AYLAS_FAQ.md):**
- Saúde & Segurança (6 FAQs)
- Horários & Funcionamento (3)
- Preços, Pagamentos, Políticas (5)
- Cuidados Individuais (5)
- Comunicação & Acompanhamento (3)
- Pet Taxi (3)
- Programa Fidelidade (4)
- Hospedagem (3)
- Emergências (2)
- Localização & Visitas (3)

---

#### **1.2.8 Memory System (Redis Chat Memory)**

**Responsabilidade:** Contexto conversacional por usuário

**Keys Pattern:**
- `{phone_number}-1` - Chat history (atendente_principal)
- `{phone_number}` - Message queues (Split Out + Fila)

**Window:** 100 mensagens (context window length)

**Implementação:** LangChain Redis Chat Memory node (n8n native)

---

### 1.3 Entidades de Dados

#### **1.3.1 Conversation**

| Campo | Tipo | Fonte | Mutação |
|-------|------|-------|---------|
| `conversation_id` | int | Chatwoot webhook | Read-only |
| `account_id` | int | Chatwoot webhook | Read-only |
| `contact_id` | int | Chatwoot webhook | Read-only |
| `channel` | string | Chatwoot webhook | Read-only |
| `telefone` | string | Extracted from sender | Read-only |
| `status` | enum[open/resolved/pending] | Chatwoot + n8n toggle | Read-write |
| `labels` | string[] | Chatwoot + logger_central | Read-write |
| `assignee` | object | Chatwoot | Read-write |
| `contact_inbox.source_id` | string | Chatwoot webhook | Read-only |

**Baserow Representation:** Implícito em crm_conversation (table ID desconhecido)

---

#### **1.3.2 Event**

```typescript
interface Event {
  event_type: 'intent_detected' | 'pet_update' | 'conversation_created' | 'conversation_status_changed';
  entity: 'conversation' | 'contact' | 'pet' | 'order';
  payload: Record<string, any>;
  conversation: {
    conversation_id: number;
    account_id: number;
    channel: string;
    contact_id: number;
    telefone: string;
  };
  context: {
    source: 'ai' | 'system' | 'user';
    confidence: number | null;
  };
  meta: {
    received_at: string; // ISO 8601
    schema_version: string;
    depth: number;
    external_event_id: string | null;
  };
}
```

---

#### **1.3.3 Policy**

```typescript
interface Policy {
  id: number;
  enabled: boolean;
  name: string;
  event_type: string; // 'intent_detected' or '*' (wildcard)
  entity: string; // 'conversation' or '*' (wildcard)
  confidence_gte: number | null; // e.g., 0.7
  source_in: string | null; // 'ai' | 'system' | 'user' or null
  priority: number; // Lower executes first

  // Execution Config
  persist_config: Record<string, PersistOperation>; // JSON string in Baserow
  labels_add: string[]; // JSON array in Baserow
  labels_remove: string[]; // JSON array in Baserow
  contact_attributes: Record<string, any>; // JSON in Baserow
  emit_event: string | null; // Recursive event name
}

interface PersistOperation {
  table: string; // e.g., 'conversation', 'pet'
  operation: 'create' | 'update' | 'delete';
  match?: Record<string, any>; // Filter for update/delete
  fields: Record<string, any>;
}
```

---

#### **1.3.4 Contact**

```typescript
interface Contact {
  id: number;
  telefone: string;
  nome: string;
  email: string;
  status: 'ativo' | 'inativo' | 'suspenso';

  // Pet Management (JSON stringified in Baserow)
  dados_pet: {
    pets: Array<{
      pet_id: string;
      nome: string;
      raca: string;
      idade: number;
      genero: 'M' | 'F';
      ultimo_update: string; // ISO 8601
      origem_update: string; // 'sistema' | 'chat' | 'admin'
    }>;
  };

  // Audit
  created_at: string;
  updated_at: string;
}
```

---

#### **1.3.5 Pet**

```typescript
interface Pet {
  pet_id: string;
  nome: string;
  raca: string;
  idade: number;
  genero: 'M' | 'F';

  // Health
  vacinas: {
    v8_v10: { data: string; proximo: string };
    raiva: { data: string; proximo: string };
    tosse: { data: string; proximo: string };
  };
  antiparasitario: {
    tipo: 'comprimido' | 'coleira';
    marca: string;
    data_aplicacao: string;
    validade: string;
  };

  // Status
  ultimo_atendimento: string;
  ultimo_update: string;
}
```

---

### 1.4 Padrões n8n Identificados

#### **1.4.1 Conditional Routing (IF Node)**

**Uso:** Roteamento multi-path baseado em condições

**Exemplo:**
```javascript
IF $json.statusDaConversa === "open" THEN
  → Route A: Processa mensagem
ELSE
  → Route B: Ignora
```

**Ocorrências em atendente_principal:**
- `verificaSeExiste` - Contato existe?
- `Tipo da Mensagem` - Qual tipo de mídia?
- `Switch1` - Qual conteúdo extraído?
- `statusOpen` - Conversa aberta?

---

#### **1.4.2 Batch Processing (Loop Over Items + Split Out)**

**Uso:** Processar arrays de mensagens ou tabelas

**Padrão:**
```
Input: Array of messages → Split Out (separate by field)
  → Loop Over Items (process each) → Aggregate (re-combine)
```

**Aplicação:**
- Loop de transcrições (áudio)
- Loop de análises (imagens)
- Loop de tables (logger_central persist)

---

#### **1.4.3 Webhook Integration (HTTP Request Nodes)**

**Uso:** Comunicação com sistemas externos (Chatwoot, Baserow)

**Padrões:**
```
HTTP Request (POST) → enviaTexto (Chatwoot message)
HTTP Request (PATCH) → updateBaserow (Update contact)
HTTP Request (GET) → contatoExiste (Baserow lookup)
```

**Issues:**
- Hardcoded URLs e account IDs (ex: `account_id: 2`)
- Credentials em plaintext em Global Variables (ex: API tokens)
- Sem circuit breaker ou retry logic centralizado

---

#### **1.4.4 AI Node (LangChain Agent)**

**Uso:** Integração com LLMs (OpenAI, Google)

**Componentes:**
- AI Agent + Model (GPT-4o, GPT-4o Mini)
- Memory backend (Redis)
- Tools (FileSearch, Think, HTTP)

**Padrão:**
```
Input: { message, sourceID }
  → Redis Chat Memory (retrieve history)
  → AI Agent (LangChain)
  → FileSearch Tool (Google KB)
  → Output: { status, tipo_resposta, final_message }
```

---

#### **1.4.5 Error Handling (Retry On Fail)**

**Uso:** Resilência em nós críticos

**Configuração:**
```
maxTries: 5
waitBetweenTries: 5000ms
onError: 'continueRegularOutput' | 'retry'
```

**Nós com Retry:**
- `contatoExiste` (Baserow lookup)
- `Analyze image` (GPT-4o)
- `Transcribe a recording` (OpenAI)
- `enviaTranscritoChatwoot` (Chatwoot POST)

---

#### **1.4.6 State Management (Redis Nodes)**

**Uso:** Fila temporária de mensagens, deduplicação

**Keys:**
- `push (message to queue)`
- `get (retrieve message array)`
- `delete (clear queue)`

**Nós:**
- `Fila as mensagens transcritas`
- `Fila as mensagens de texto direto`
- `Puxa as Mensagens` (Get)
- `Redis` (Delete)

---

#### **1.4.7 Debouncing (Wait Node + Conditional)**

**Uso:** Aguardar mais mensagens antes de responder

**Configuração:**
```
Wait 1s (debounce-resposta)
  → If last message === buffered message
    → Process accumulated queue
  → Else
    → Wait more
```

**Nós:**
- `Debounce Resposta` (1s wait)
- `Debounce Resposta1` (1s wait)
- `If1`, `If` (condition check)

---

---

## SEÇÃO 2: PROBLEMAS IDENTIFICADOS

### 2.1 Acoplamento Arquitetural

#### **2.1.1 Hardcoding de Contexto de Conta (Chatwoot Account ID)**

**Localização:** Multiple HTTP nodes em `atendente_principal` e `logger_central`

**Evidência:**
```javascript
// atendente_principal, nó "enviaTexto" (linha 492)
url: "={{  $('Variáveis Globais').item.json.urlChatwoot }}/api/v1/accounts/2/conversations/{{ ... }}/messages"

// logger_central, nó "Get Labels" (linha 401)
url: "=https://crm.olmedatech.com/api/v1/accounts/2/conversations/{{ ... }}/labels"

// atendente_principal, nó "Variáveis Globais" SET (linha 1320)
"accountIDChatwoot": "={{ $json.body.account.id }}"  // Extraído, mas depois hardcoded em policy 'account_id: 2'
```

**Problema:**
- Conta Aylas (account_id 2) **hardcoded em 15+ nós HTTP Request**
- Para novo cliente, precisa **duplicar todos workflows** e atualizar account_id manualmente
- Impossível testar multi-tenancy

**Impacto:** ❌ **CRÍTICO** - Bloqueador para escala

---

#### **2.1.2 Hardcoding de Baserow Table IDs**

**Localização:** `logger_central` + `pet_data_flow` + `atendente_principal`

**Evidência:**
```javascript
// logger_central, nó "Load Policies" (linha 39)
url: "https://baserow.olmedatech.com/api/database/rows/table/11/"
// ^^ Table 11 = Policies hardcoded

// pet_data_flow, nó "Get Client" (linha 137)
tableId: 4,  // Table 4 = Contacts hardcoded

// atendente_principal, nó "contatoExiste" (linha 73)
tableId: 6,  // Table 6 = Unknown, but hardcoded
```

**Problema:**
- Table IDs são específicos do workspace Baserow (Olmeda)
- Impossível replicar para novo cliente (diferentes Baserow workspaces)
- Não há abstração de "schema mappings"

**Impacto:** ❌ **CRÍTICO** - Bloqueador para multi-tenancy

---

#### **2.1.3 Hardcoding de Tenant & Niche**

**Localização:** `logger_central`, nó "Load Policies" (linha 54-60)

```javascript
queryParameters: {
  parameters: [
    {
      "name": "filter__tenant_id__equal",
      "value": "aylas"  // ← HARDCODED
    },
    {
      "name": "filter__niche__equal",
      "value": "pet"    // ← HARDCODED
    }
  ]
}
```

**Problema:**
- Filters são codificados para Aylas (tenant="aylas", niche="pet")
- Cada novo cliente precisa novo workflow com novos filters
- Sem ambiente staging/prod

**Impacto:** ❌ **CRÍTICO** - Impossível multi-niche

---

#### **2.1.4 Credenciais em Variáveis Globais**

**Localização:** `atendente_principal`, nó "Variáveis Globais" (linha 1279)

```javascript
"userTokenChatwoot": "P1iHEccTy6neQuB7WGRA6yQN"  // ← PLAINTEXT TOKEN
```

**Problema:**
- API token em visibilidade pública
- Aparece em todos os logs/monitoramento
- Sem rotação de credenciais
- Sem secret manager

**Impacto:** 🔴 **SEGURANÇA CRÍTICA**

---

#### **2.1.5 Acoplamento de Policy ao Schema Baserow**

**Localização:** `logger_central`, nó "Execution Plan Builder" (linha 136)

```javascript
// Policies referenciam table names e field IDs implicitamente:
// "persist_config": {
//   "conversation": {
//     "operation": "create",
//     "fields": { "telefone": "...", "last_intent": "..." }
//   }
// }
```

**Problema:**
- Policy define campos mas não há validação de schema
- Se Baserow table mudar estrutura, policies quebram silenciosamente
- Sem versionamento de schema

**Impacto:** ❌ **MÉDIO** - Data corruption risk

---

### 2.2 Testabilidade

#### **2.2.1 Monolito de 66 Nós (atendente_principal)**

**Problema:**
- Um workflow com 66 nós é impossível debugar
- Nenhuma separação de concerns
- Mudança em um nó quebra 10 outros (conexões n8n)
- Não há "unit test" equivalente para n8n

**Impacto:** ❌ **MÉDIO** - Debugging impossível

---

#### **2.2.2 Sem Contratos Formalizados**

**Problema:**
- Cada nó assume estrutura específica de entrada
- Se upstream muda, downstream quebra
- Exemplo: `Tipo da Mensagem` switch assume `fileType` existe

```javascript
// Tipo da Mensagem switch, linha 182
"leftValue": "={{ $('Variáveis Globais').item.json.fileType }}",

// Mas o que se fileType for null ou undefined?
// Nó silenciosamente falha ou passa dados inválidos
```

**Impacto:** ❌ **ALTO** - Contracts by convention, not specification

---

#### **2.2.3 Redis Session Keys Manuais**

**Problema:**
- Redis keys construídas manualmente em cada nó

```javascript
// Line 41 (atendente_principal)
"sessionKey": "={{ String($('Variáveis Globais').item.json.body.sender.phone_number || '').replace(/^\\+/, '') }}-1"

// Line 874
"list": "={{ String($('Variáveis Globais').item.json.body.sender.phone_number || '').replace(/^\\+/, '') }}"

// Sem padronização = fácil errar
// E se format mudar? Manual update em 10 nós
```

**Impacto:** ❌ **MÉDIO** - DRY violation

---

#### **2.2.4 Policy Matching Sem Testes**

**Problema:**
- Policy matcher é JavaScript puro em `logger_central`
- Impossível testar sem executar workflow
- Lógica complexa: wildcard matching + confidence thresholds + source filtering

**Impacto:** ❌ **ALTO** - Business logic untested

---

### 2.3 Manutenibilidade

#### **2.3.1 Sem Versionamento de Policies**

**Problema:**
- Policies em Baserow table 11 sem histórico
- Mudança em policy afeta todas futuras execuções retroativamente
- Sem git-like diff/rollback

**Exemplo:**
```
Policy: "intent_detected + entity=conversation"
  → OLD: Add labels [ia_atendendo, intencao_hotel]
  → NEW: Add labels [ia_atendendo, intencao_hotel, priority_high]

Resultado: Conversas antigas não têm priority_high retroativamente
           Conversas novas têm (mas não há como saber qual foi aplicado quando)
```

**Impacto:** ❌ **MÉDIO** - Auditability issues

---

#### **2.3.2 Logging Distribuído**

**Problema:**
- Log de events em múltiplos lugares:
  1. `logger_central` persiste em Baserow
  2. `atendente_principal` envia para Chatwoot
  3. Redis queues têm data implicitamente
- Sem estrutura comum

**Impacto:** ❌ **MÉDIO** - Observability gap

---

#### **2.3.3 Sem Tratamento de Erros Consistente**

**Problema:**
- Alguns nós têm `retryOnFail: true`, outros não
- Sem tratamento de falhas "terminais" (ex: contact não existe)
- Mensagens falham silenciosamente

**Exemplo:**
```
contatoExiste:
  - 5 retries, 5s wait

But: Se Baserow cai permanentemente, retries esgotam
    Nó falha e workflow segue (alwaysOutputData: true)
    Contact é criado sem dados históricos (inconsistência)
```

**Impacto:** ❌ **ALTO** - Silent failures

---

#### **2.3.4 Code Duplication: Normalization**

**Problema:**
- Phone number normalization em 5 locais:

```javascript
// atendente_principal, linha 17
String($('Variáveis Globais').item.json.body.sender.phone_number || '').replace(/^\\+/, '')

// atendente_principal, linha 41
String($('Variáveis Globais').item.json.body.sender.phone_number || '').replace(/^\\+/, '') + '-1'

// atendente_principal, linha 80
String($('Variáveis Globais').item.json.body.sender.phone_number || '').replace(/^\\+/, '')

// ... 3 mais vezes
```

**Impacto:** ❌ **BAIXO** - Maintainability tax

---

#### **2.3.5 Duplicação: Pet Data Flow**

**Problema:**
- `pet_data_flow` chama `logger_central` para log
- Mas `logger_central` poderia ser integrado nativamente

```javascript
// pet_data_flow, nó "Call 'logger_central'" (linha 19)
workflowId: "fQE7Z8PsFhvbfIGp"  // Reference ao logger_central
// Depois de UPDATE Baserow, explicitamente chama logger

// Padrão: Baserow → logger é chamado explicitamente
// Melhor: logger seria acionado por Baserow webhook
```

**Impacto:** ❌ **MÉDIO** - Orchestration coupling

---

### 2.4 Escalabilidade

#### **2.4.1 Replicação Manual para Novo Cliente**

**Situação:**
Para onboard novo cliente (ex: CatHotel do Brasil), processo é:

1. Duplicar todos 4 workflows (atendente_principal, logger_central, pet_data_flow, info_agent)
2. Atualizar Chatwoot account_id (account_id 2 → 3)
3. Atualizar Baserow workspace/tables (table 6 → table_novo_cliente)
4. Atualizar credentials (token Chatwoot)
5. Atualizar tenant/niche filters (aylas/pet → cathotel/pet)
6. Atualizar system prompts (Maya → CatHotel Assistant)
7. Atualizar knowledge base (Aylas FAQ → CatHotel FAQ)

**Impacto:** ❌ **CRÍTICO** - 0% automation, 100% manual

---

#### **2.4.2 Sem Abstração de Configuração**

**Problema:**
- Cada cliente = seus próprios workflows
- Configuração spreada em:
  - Variáveis Globais
  - Query parameters
  - System prompts
  - Hardcoded URLs

**Ideal:**
```yaml
# config.yaml (centralized)
tenants:
  aylas:
    chatwoot:
      account_id: 2
      api_token: ${CHATWOOT_TOKEN}
    baserow:
      workspace: olmeda
      tables:
        contacts: 4
        conversations: 6
        policies: 11
    knowledge_base:
      source: google_firesearch
      id: klbaylas-j22hu40zzxgk
    system_prompt: |
      Você é Maya...
```

**Atual:** Hardcoded everywhere

**Impacto:** ❌ **CRÍTICO** - Configuration management gap

---

#### **2.4.3 Knowledge Base Não Reutilizável**

**Problema:**
- `info_agent` usa Google FileSearch `klbaylas-j22hu40zzxgk`
- Knowledge base é específico do cliente (Aylas FAQ)
- Para novo cliente, precisa:
  1. Criar novo FileSearch store
  2. Upload de novo FAQ
  3. Atualizar info_agent workflow
  4. Testar prompts

**Impacto:** ❌ **MÉDIO** - RAG not scalable

---

#### **2.4.4 Sem Data Sharding**

**Problema:**
- Baserow queries filtram por `telefone`
- Se 100k+ contacts, queries lentificam
- Sem índices, sem particionamento

**Impacto:** ❌ **BAIXO** (today) - Performance ceiling

---

### 2.5 Observabilidade

#### **2.5.1 Sem Structured Logging**

**Problema:**
- Events persistem em Baserow mas sem schema comum
- Campos variáveis dependem da policy

```json
// Policy A pode gerar:
{
  "telefone": "556194350995",
  "last_intent": "hotel"
}

// Policy B pode gerar:
{
  "telefone": "556194350995",
  "last_intent": "hotel",
  "pet_update": true,
  "pet_id": "pet_001"
}
```

**Impacto:** ❌ **MÉDIO** - Analytics impossible

---

#### **2.5.2 Sem Trace Distribuído**

**Problema:**
- Uma mensagem passa por 5+ workflows
- Sem correlation ID
- Impossível seguir jornada completa

**Flow:**
```
Chatwoot → atendente_principal
         → info_agent (si dispatch)
         → logger_central (si event)
         → Baserow update
         → Chatwoot update (labels)
```

**Sem trace ID:**
```
Which info_agent call correspond to which Chatwoot message?
If Baserow update falhou, qual foi a causa?
```

**Impacto:** ❌ **ALTO** - Debugging hell

---

#### **2.5.3 Sem Métricas de Performance**

**Problema:**
- Sem monitoramento de:
  - Latência de resposta
  - Taxa de erro por tipo de mensagem
  - Cache hit rate (Redis)
  - Baserow query latency
  - Chatwoot API response times

**Impacto:** ❌ **MÉDIO** - SLO blind

---

#### **2.5.4 Sem Alertas**

**Problema:**
- Se logger_central policy matching cair, ninguém sabe
- Se Baserow está down, workflow segue (silent fail)
- Se Redis fica full, message queues lost

**Impacto:** ❌ **ALTO** - Fire fighting

---

---

## SEÇÃO 3: MAPA DE MODULARIZAÇÃO (n8n → TypeScript)

### Visão Estratégica

**Objetivo:** Substituir os 4 workflows n8n por **7 módulos TypeScript** que:

1. Remover hardcoding (config-driven)
2. Adicionar contratos (TypeScript interfaces)
3. Permitir unit testing
4. Habilitar multi-tenancy nativa
5. Centralizar lógica de negócio

**Arquitetura Target:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK INGRESS (n8n)                       │
│              Chatwoot → Normalize → Dispatch                   │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│              AYLAS CORE LIBRARY (@aylas/core)                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Module 1: Message Normalizer                             │  │
│  │ (input: webhook → output: normalized event)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Module 2: Multimodal Processor                           │  │
│  │ (input: normalized event → output: extracted content)    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Module 3: Contact Manager                                │  │
│  │ (input: phone → output: contact + pets)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Module 4: Agent Router                                   │  │
│  │ (input: event + context → output: dispatch decision)     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Module 5: Event Logger (Policy Engine)                   │  │
│  │ (input: event → output: execution plan)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Module 6: Chatwoot Adapter                               │  │
│  │ (input: execution plan → output: synced state)           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Module 7: Knowledge Base (RAG)                           │  │
│  │ (input: query + context → output: response)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────┬───────────────────────────────────────────┘
                       ↓
        EXTERNAL SYSTEMS: Chatwoot, Baserow, OpenAI
```

---

### 3.1 Module 1: Message Normalizer

**Replaces n8n nós:** Variáveis Globais + Tipo da Mensagem

**Responsabilidade:**
- Input: Raw Chatwoot webhook JSON
- Valida schema
- Extrai campos obrigatórios
- Detecta tipo de mídia
- Output: `MessageNormalized` com fields estruturados

**Contrato de Entrada:**

```typescript
interface ChatwootWebhook {
  body: {
    conversation: {
      id: number;
      messages: Array<{
        id: number;
        content: string | null;
        message_type: 'incoming' | 'outgoing';
        attachments: Array<{
          id: number;
          file_type: 'image' | 'audio' | 'video' | 'file' | 'contact';
          data_url: string;
          file_name?: string;
        }>;
        sender: {
          id: number;
          name: string;
          email: string;
          phone_number?: string;
        };
      }>;
      contact_inbox: {
        source_id: string;
        inbox_id: number;
      };
      labels: string[];
      status: 'open' | 'resolved' | 'pending';
      meta?: {
        assignee?: {
          id: number;
          name: string;
        };
      };
    };
    account: {
      id: number;
      name: string;
    };
  };
}
```

**Contrato de Saída:**

```typescript
interface MessageNormalized {
  // Extracted from webhook
  phone: string; // Normalized: "556194350995"
  conversation_id: number;
  account_id: number;
  source_id: string; // e.g., "wa_123456"
  sender_name: string;

  // Message content
  type: 'text' | 'audio' | 'image' | 'pdf' | 'video';
  content: string; // Text or URL

  // Metadata
  labels: string[];
  status: 'open' | 'resolved' | 'pending';
  assignee?: { id: number; name: string };

  // Audit
  received_at: Date;
  message_id: number;
}
```

**Validação:**
- phone: Non-empty, numeric (after normalization)
- conversation_id: Positive integer
- account_id: Positive integer
- source_id: Non-empty string
- type: One of allowed types
- content: Non-empty string (if text)

**Testes:**
```typescript
describe('MessageNormalizer', () => {
  test('should normalize text message', () => {
    const input = { /* webhook with content */ };
    const result = normalizer.process(input);
    expect(result.type).toBe('text');
    expect(result.content).toBe('Oi, tudo bem?');
    expect(result.phone).toBe('556194350995');
  });

  test('should detect audio attachment', () => {
    const input = { /* webhook with audio */ };
    const result = normalizer.process(input);
    expect(result.type).toBe('audio');
    expect(result.content).toMatch(/https:\/\/.*\.mp3$/);
  });

  test('should throw if phone missing', () => {
    const input = { /* webhook without sender.phone_number */ };
    expect(() => normalizer.process(input)).toThrow(ValidationError);
  });
});
```

---

### 3.2 Module 2: Multimodal Processor

**Replaces n8n nós:** Analyze image + Extrair PDF + Transcribe a recording + baixaÁudio/Imagem/PDF/Vídeo

**Responsabilidade:**
- Input: `MessageNormalized` com type=audio|image|pdf|video
- Download arquivo
- Extrai conteúdo (transcribe/OCR/analyze)
- Output: `MessageProcessed` com content extraído

**Contrato de Entrada:**

```typescript
interface MessageNormalized {
  phone: string;
  conversation_id: number;
  type: 'text' | 'audio' | 'image' | 'pdf' | 'video';
  content: string; // URL se mídia, texto se text
  // ... outros fields
}
```

**Contrato de Saída:**

```typescript
interface MessageProcessed {
  phone: string;
  conversation_id: number;

  // Extracted content
  text_content: string; // O que foi extraído (transcription, OCR, analysis)
  text_confidence?: number; // Para audio (0-1)

  // Source info
  original_type: 'text' | 'audio' | 'image' | 'pdf' | 'video';

  // Audit
  processed_at: Date;
  processor_model: 'gpt-4o-vision' | 'whisper' | 'pdf-extract' | 'none';
}
```

**Lógica:**

```typescript
class MultimodalProcessor {
  async process(msg: MessageNormalized): Promise<MessageProcessed> {
    switch (msg.type) {
      case 'text':
        return { ...msg, text_content: msg.content, processor_model: 'none' };

      case 'audio':
        const audio = await this.download(msg.content);
        const transcription = await this.openai.transcribe(audio);
        return {
          ...msg,
          text_content: transcription.text,
          text_confidence: transcription.confidence,
          processor_model: 'whisper'
        };

      case 'image':
        const image = await this.download(msg.content);
        const analysis = await this.openai.analyzeImage(image);
        return {
          ...msg,
          text_content: analysis.description,
          processor_model: 'gpt-4o-vision'
        };

      case 'pdf':
        const pdf = await this.download(msg.content);
        const text = await this.extractText(pdf);
        return {
          ...msg,
          text_content: text,
          processor_model: 'pdf-extract'
        };

      case 'video':
        // Para vídeo, apenas forward a URL
        return { ...msg, text_content: msg.content, processor_model: 'none' };
    }
  }
}
```

**Testes:**
```typescript
describe('MultimodalProcessor', () => {
  test('should transcribe audio via OpenAI Whisper', async () => {
    const msg = { type: 'audio', content: 'https://...' };
    const result = await processor.process(msg);
    expect(result.processor_model).toBe('whisper');
    expect(result.text_content).toMatch(/[a-z]/i);
  });

  test('should analyze image via GPT-4o Vision', async () => {
    const msg = { type: 'image', content: 'https://...' };
    const result = await processor.process(msg);
    expect(result.processor_model).toBe('gpt-4o-vision');
  });

  test('should handle text pass-through', async () => {
    const msg = { type: 'text', content: 'Hello' };
    const result = await processor.process(msg);
    expect(result.text_content).toBe('Hello');
    expect(result.processor_model).toBe('none');
  });
});
```

---

### 3.3 Module 3: Contact Manager

**Replaces n8n nós:** contatoExiste + Baserow query

**Responsabilidade:**
- Input: phone
- Query Baserow (table 4)
- Enrich context (pets, historical data)
- Output: `Contact` com pet info

**Contrato de Entrada:**

```typescript
interface ContactLookupRequest {
  phone: string;
  account_id: number; // For multi-tenancy
}
```

**Contrato de Saída:**

```typescript
interface Contact {
  id: number;
  phone: string;
  name: string;
  email: string;
  status: 'ativo' | 'inativo' | 'suspenso';

  pets: Array<{
    pet_id: string;
    nome: string;
    raca: string;
    idade: number;
    genero: 'M' | 'F';
    ultimo_update: Date;
  }>;

  // Historical
  first_seen: Date;
  last_interaction: Date;
  interaction_count: number;

  // Audit
  created_at: Date;
  updated_at: Date;
}
```

**Erros:**
```typescript
interface ContactNotFound extends Error {
  phone: string;
  account_id: number;
}
```

**Implementação:**

```typescript
class ContactManager {
  constructor(
    private baserow: BaserowClient,
    private config: TenantConfig
  ) {}

  async lookup(phone: string): Promise<Contact | null> {
    const row = await this.baserow.query({
      table: this.config.baserow.tables.contacts, // e.g., 4
      filters: [
        { field: 'telefone', value: phone }
      ]
    });

    if (!row) return null;

    return {
      id: row.id,
      phone: row.telefone,
      name: row.nome,
      pets: this.parsePets(row.dados_pet),
      // ...
    };
  }

  private parsePets(jsonString: string): Pet[] {
    try {
      const obj = JSON.parse(jsonString);
      return obj.pets || [];
    } catch {
      return [];
    }
  }
}
```

**Testes:**
```typescript
describe('ContactManager', () => {
  test('should retrieve contact by phone', async () => {
    const contact = await manager.lookup('556194350995');
    expect(contact?.phone).toBe('556194350995');
    expect(contact?.pets.length).toBeGreaterThan(0);
  });

  test('should parse pet JSON data', async () => {
    const contact = await manager.lookup('556194350995');
    expect(contact?.pets[0].nome).toBe('Rex');
  });

  test('should return null if not found', async () => {
    const contact = await manager.lookup('999999999');
    expect(contact).toBeNull();
  });
});
```

---

### 3.4 Module 4: Agent Router

**Replaces n8n nós:** Switch nodes + Conditional logic

**Responsabilidade:**
- Input: `MessageProcessed` + `Contact` + `Event`
- Detectar intenção (pattern matching ou LLM)
- Rotear para agente apropriado
- Output: `RoutingDecision`

**Contrato de Entrada:**

```typescript
interface RoutingContext {
  message: MessageProcessed;
  contact: Contact | null;
  event: Event;
  tenant_id: string;
}
```

**Contrato de Saída:**

```typescript
interface RoutingDecision {
  agent: 'info_agent' | 'booking_agent' | 'fidelidade_agent' | 'comercial_agent' | 'default';
  confidence: number; // 0-1
  reasoning: string;
  dispatch_params: {
    message: string;
    sourceID: string;
    context?: Record<string, any>;
  };
}
```

**Lógica de Detecção:**

```typescript
class AgentRouter {
  constructor(
    private config: TenantConfig,
    private llm?: LLMClient
  ) {}

  async route(ctx: RoutingContext): Promise<RoutingDecision> {
    // 1. Pattern-based intent detection (fast)
    const intent = this.detectIntent(ctx.message.text_content);

    // 2. Route based on intent
    if (intent.type === 'info') {
      return {
        agent: 'info_agent',
        confidence: intent.confidence,
        reasoning: `Pattern match: ${intent.pattern}`,
        dispatch_params: { ... }
      };
    }

    // 3. Fallback to LLM if low confidence
    if (intent.confidence < 0.5 && this.llm) {
      const llmResult = await this.llm.classifyIntent(ctx.message.text_content);
      return {
        agent: llmResult.agent,
        confidence: llmResult.confidence,
        reasoning: `LLM classification`,
        dispatch_params: { ... }
      };
    }

    // 4. Default agent
    return {
      agent: 'default',
      confidence: 0,
      reasoning: 'No pattern matched, no LLM available',
      dispatch_params: { ... }
    };
  }

  private detectIntent(text: string): { type: string; confidence: number; pattern: string } {
    const patterns = {
      info: [
        /qual.*vacina|protocolo.*saúde|cuidado.*saúde/i,
        /horário.*creche|check-in|check-out/i,
        /preço|custa|valor|plano|fidelidade/i
      ],
      booking: [
        /agendar|marcar|reservar|hospedagem|hotel/i,
        /data.*disponível|quando.*posso/i
      ]
    };

    for (const [type, patterns_list] of Object.entries(patterns)) {
      for (const pattern of patterns_list) {
        if (pattern.test(text)) {
          return { type, confidence: 0.8, pattern: pattern.source };
        }
      }
    }

    return { type: 'unknown', confidence: 0, pattern: 'none' };
  }
}
```

**Testes:**
```typescript
describe('AgentRouter', () => {
  test('should route health question to info_agent', async () => {
    const ctx = { message: { text_content: 'Qual vacina é obrigatória?' } };
    const decision = await router.route(ctx);
    expect(decision.agent).toBe('info_agent');
    expect(decision.confidence).toBeGreaterThan(0.7);
  });

  test('should route booking to booking_agent', async () => {
    const ctx = { message: { text_content: 'Gostaria de agendar hospedagem' } };
    const decision = await router.route(ctx);
    expect(decision.agent).toBe('booking_agent');
  });
});
```

---

### 3.5 Module 5: Event Logger (Policy Engine)

**Replaces n8n workflow:** logger_central completo

**Responsabilidade:**
- Input: Normalized event
- Load & match policies from Baserow
- Build execution plan (CRUD + labels + emit)
- Output: `ExecutionPlan`

**Contrato de Entrada:**

```typescript
interface Event {
  event_type: string;
  entity: string;
  payload: Record<string, any>;
  conversation: {
    conversation_id: number;
    account_id: number;
    channel: string;
    contact_id: number;
    telefone: string;
  };
  context: {
    source: 'ai' | 'system' | 'user';
    confidence: number | null;
  };
  meta: {
    received_at: Date;
    schema_version: string;
    depth: number;
    external_event_id: string | null;
  };
}
```

**Contrato de Saída:**

```typescript
interface ExecutionPlan {
  event_id: string; // UUID

  persist: {
    [table: string]: {
      operation: 'create' | 'update' | 'delete';
      match?: Record<string, any>; // For update/delete
      fields: Record<string, any>;
    };
  };

  labels: {
    add: string[];
    remove: string[];
  };

  contact_attributes: Record<string, any>;

  emit_events: Array<{
    event_type: string;
    entity: string;
    payload: Record<string, any>;
  }>;

  // Audit
  matched_policies: number[];
  execution_order: string[];
}
```

**Implementação:**

```typescript
class EventLogger {
  constructor(
    private baserow: BaserowClient,
    private config: TenantConfig
  ) {}

  async processEvent(event: Event): Promise<ExecutionPlan> {
    // 1. Load policies from Baserow (table 11)
    const policies = await this.loadPolicies(
      event.event_type,
      event.entity,
      event.context
    );

    // 2. Match event against policies
    const matched = this.matchPolicies(event, policies);

    // 3. Build execution plan
    const plan = this.buildExecutionPlan(event, matched);

    // 4. Execute (persist, labels, emit)
    await this.execute(plan);

    return plan;
  }

  private matchPolicies(event: Event, policies: Policy[]): Policy[] {
    return policies
      .filter(p => p.enabled)
      .filter(p => p.event_type === '*' || p.event_type === event.event_type)
      .filter(p => p.entity === '*' || p.entity === event.entity)
      .filter(p => !p.confidence_gte || event.context.confidence! >= p.confidence_gte)
      .filter(p => !p.source_in || p.source_in === event.context.source)
      .sort((a, b) => a.priority - b.priority);
  }

  private buildExecutionPlan(event: Event, matched: Policy[]): ExecutionPlan {
    const plan: ExecutionPlan = {
      event_id: generateUUID(),
      persist: {},
      labels: { add: [], remove: [] },
      contact_attributes: {},
      emit_events: [],
      matched_policies: matched.map(p => p.id),
      execution_order: []
    };

    for (const policy of matched) {
      // Merge persist configs
      Object.assign(plan.persist, policy.persist_config);

      // Merge labels
      plan.labels.add.push(...policy.labels_add);
      plan.labels.remove.push(...policy.labels_remove);

      // Merge contact attributes
      Object.assign(plan.contact_attributes, policy.contact_attributes);

      // Queue emit events
      if (policy.emit_event) {
        plan.emit_events.push(policy.emit_event);
      }
    }

    // Deduplicate
    plan.labels.add = [...new Set(plan.labels.add)];
    plan.labels.remove = [...new Set(plan.labels.remove)];

    return plan;
  }

  private async execute(plan: ExecutionPlan): Promise<void> {
    // Persist to Baserow
    for (const [table, cfg] of Object.entries(plan.persist)) {
      if (cfg.operation === 'create') {
        await this.baserow.create(table, cfg.fields);
      } else if (cfg.operation === 'update') {
        await this.baserow.update(table, cfg.match, cfg.fields);
      }
    }

    // Emit recursive events
    for (const event_name of plan.emit_events) {
      // Queue for processing
    }
  }
}
```

**Testes:**
```typescript
describe('EventLogger', () => {
  test('should match policies by event_type', async () => {
    const event = { event_type: 'intent_detected', entity: 'conversation' };
    const matched = logger.matchPolicies(event, [
      { event_type: 'intent_detected', entity: '*', enabled: true },
      { event_type: 'pet_update', entity: '*', enabled: true }
    ]);
    expect(matched.length).toBe(1);
  });

  test('should build execution plan with persist + labels', async () => {
    const event = { /* event */ };
    const plan = await logger.processEvent(event);
    expect(plan.persist).toHaveProperty('crm_conversation');
    expect(plan.labels.add.length).toBeGreaterThan(0);
  });
});
```

---

### 3.6 Module 6: Chatwoot Adapter

**Replaces n8n nós:** enviaTexto + PATCH Labels + Toggle Status

**Responsabilidade:**
- Input: `ExecutionPlan` + `MessageProcessed`
- POST messages to Chatwoot
- PATCH labels & attributes
- Output: Synchronized conversation state

**Contrato de Entrada:**

```typescript
interface ChatwootAdapterInput {
  message_content: string;
  conversation_id: number;
  labels_to_add: string[];
  labels_to_remove: string[];
  contact_attributes: Record<string, any>;
  private: boolean;
}
```

**Contrato de Saída:**

```typescript
interface ChatwootAdapterOutput {
  message_id: number;
  labels_updated: boolean;
  attributes_updated: boolean;
  status_code: number;
}
```

**Implementação:**

```typescript
class ChatwootAdapter {
  constructor(
    private config: TenantConfig,
    private http: HttpClient
  ) {}

  async sendMessage(input: ChatwootAdapterInput): Promise<ChatwootAdapterOutput> {
    const url = `${this.config.chatwoot.base_url}/api/v1/accounts/${this.config.chatwoot.account_id}/conversations/${input.conversation_id}/messages`;

    const response = await this.http.post(url, {
      content: input.message_content,
      message_type: 'outgoing',
      private: input.private
    }, {
      headers: {
        'api_access_token': this.config.chatwoot.api_token
      }
    });

    return {
      message_id: response.id,
      labels_updated: true,
      attributes_updated: true,
      status_code: response.status
    };
  }

  async updateLabels(
    conversation_id: number,
    add: string[],
    remove: string[]
  ): Promise<void> {
    // GET current labels
    const current = await this.getLabels(conversation_id);

    // Compute final
    const final = [...new Set([
      ...current.filter(l => !remove.includes(l)),
      ...add
    ])];

    // PATCH
    const url = `${this.config.chatwoot.base_url}/api/v1/accounts/${this.config.chatwoot.account_id}/conversations/${conversation_id}/labels`;

    await this.http.post(url, { labels: final }, {
      headers: { 'api_access_token': this.config.chatwoot.api_token }
    });
  }

  private async getLabels(conversation_id: number): Promise<string[]> {
    const url = `${this.config.chatwoot.base_url}/api/v1/accounts/${this.config.chatwoot.account_id}/conversations/${conversation_id}/labels`;
    const response = await this.http.get(url, {
      headers: { 'api_access_token': this.config.chatwoot.api_token }
    });
    return response.labels || [];
  }
}
```

**Testes:**
```typescript
describe('ChatwootAdapter', () => {
  test('should POST message to Chatwoot', async () => {
    const result = await adapter.sendMessage({
      message_content: 'Hello',
      conversation_id: 60,
      labels_to_add: [],
      labels_to_remove: [],
      contact_attributes: {},
      private: false
    });
    expect(result.status_code).toBe(201);
  });

  test('should merge labels correctly', async () => {
    // Current: ['label_a']
    // Add: ['label_b']
    // Remove: ['label_a']
    // Final: ['label_b']

    await adapter.updateLabels(60, ['label_b'], ['label_a']);
    // ... assert labels = ['label_b']
  });
});
```

---

### 3.7 Module 7: Knowledge Base (RAG)

**Replaces n8n workflow:** info_agent

**Responsabilidade:**
- Input: User question + conversation context
- Query knowledge base (Google FileSearch)
- LLM-augmented response
- Output: Formatted answer

**Contrato de Entrada:**

```typescript
interface KnowledgeBaseQuery {
  question: string;
  phone: string; // For context
  conversation_id: number;
  tenant_id: string;
  system_prompt?: string; // If different
}
```

**Contrato de Saída:**

```typescript
interface KnowledgeBaseResponse {
  answer: string;
  sources: Array<{
    title: string;
    content: string;
    relevance: number; // 0-1
  }>;
  confidence: number; // 0-1
  response_type: 'faq' | 'generated' | 'unknown';
}
```

**Implementação:**

```typescript
class KnowledgeBase {
  constructor(
    private config: TenantConfig,
    private llm: LLMClient,
    private memory: RedisMemory
  ) {}

  async query(input: KnowledgeBaseQuery): Promise<KnowledgeBaseResponse> {
    // 1. Get conversation context from Redis
    const history = await this.memory.get(`${input.phone}-1`);

    // 2. Search knowledge base
    const sources = await this.search(input.question);

    // 3. Augment prompt with sources
    const systemPrompt = input.system_prompt || this.config.knowledge_base.system_prompt;
    const augmentedPrompt = this.augment(systemPrompt, sources, history);

    // 4. Call LLM
    const response = await this.llm.generate({
      model: 'gpt-4o-mini',
      system: augmentedPrompt,
      messages: [
        { role: 'user', content: input.question }
      ]
    });

    return {
      answer: response.content,
      sources: sources,
      confidence: sources.length > 0 ? 0.9 : 0.3,
      response_type: sources.length > 0 ? 'faq' : 'generated'
    };
  }

  private async search(query: string): Promise<Array<{ title: string; content: string; relevance: number }>> {
    // Query Google FileSearch or similar
    const results = await this.config.knowledge_base.search_client.search(query);
    return results.map(r => ({
      title: r.title || 'Untitled',
      content: r.content,
      relevance: r.relevance_score
    }));
  }

  private augment(
    systemPrompt: string,
    sources: Array<{ title: string; content: string }>,
    history: Array<{ role: string; content: string }>
  ): string {
    let augmented = systemPrompt;

    if (sources.length > 0) {
      augmented += '\n\n## Knowledge Base:\n';
      for (const source of sources) {
        augmented += `\n### ${source.title}\n${source.content}\n`;
      }
    }

    return augmented;
  }
}
```

**Testes:**
```typescript
describe('KnowledgeBase', () => {
  test('should query and augment response with sources', async () => {
    const result = await kb.query({
      question: 'Qual vacina é obrigatória?',
      phone: '556194350995',
      conversation_id: 60,
      tenant_id: 'aylas'
    });

    expect(result.answer).toMatch(/V8|V10|Raiva/i);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  test('should fall back to generated response if no sources', async () => {
    const result = await kb.query({
      question: 'Coisa completamente fora de contexto?',
      phone: '556194350995',
      conversation_id: 60,
      tenant_id: 'aylas'
    });

    expect(result.response_type).toBe('generated');
    expect(result.confidence).toBeLessThan(0.5);
  });
});
```

---

### 3.8 Composição das Sete Modules

**Fluxo End-to-End com TypeScript Modules:**

```
1. Webhook (Chatwoot)
   ↓
   MessageNormalizer.process() → MessageNormalized
   ↓
2. Multi-modal content extraction
   MultimodalProcessor.process() → MessageProcessed
   ↓
3. Contact enrichment
   ContactManager.lookup() → Contact (or null)
   ↓
4. Intent detection & routing
   AgentRouter.route() → RoutingDecision
   ↓
5. Policy-driven event processing
   EventLogger.processEvent() → ExecutionPlan
   ↓
6. Sync with Chatwoot
   ChatwootAdapter.sendMessage() & updateLabels() → ChatwootAdapterOutput
   ↓
7. Agent-specific response (if dispatch to agent)
   KnowledgeBase.query() → KnowledgeBaseResponse
   ↓
   Back to step 6 (send response via Chatwoot)
```

**Configuration (Central):**

```typescript
// config/aylas.ts
export const AylasConfig: TenantConfig = {
  tenant_id: 'aylas',
  niche: 'pet',

  chatwoot: {
    base_url: 'https://crm.olmedatech.com',
    account_id: 2,
    api_token: process.env.CHATWOOT_TOKEN
  },

  baserow: {
    base_url: 'https://baserow.olmedatech.com',
    api_token: process.env.BASEROW_TOKEN,
    tables: {
      contacts: 4,
      conversations: 6,
      policies: 11,
      // ...
    }
  },

  openai: {
    api_key: process.env.OPENAI_API_KEY,
    model_default: 'gpt-4o-mini',
    model_vision: 'gpt-4o'
  },

  knowledge_base: {
    system_prompt: `Você é Maya...`,
    search_client: GoogleFileSearchClient,
    store_id: 'klbaylas-j22hu40zzxgk'
  },

  agents: {
    info_agent: { workflow_id: '...' },
    booking_agent: { workflow_id: '...' }
  }
};
```

---

## SUMÁRIO EXECUTIVO

### Problemas Críticos (n8n atual)

| Problema | Severidade | Impacto |
|----------|-----------|--------|
| Hardcoding Account ID (account_id: 2) | 🔴 CRÍTICO | Impossível multi-tenancy |
| Hardcoding Baserow Table IDs | 🔴 CRÍTICO | Impossível replicabilidade |
| Credenciais em plaintext | 🔴 SEGURANÇA | Exposição de tokens API |
| 66 nós em 1 workflow | 🟠 MÉDIO | Debugging impossível |
| Sem contratos | 🟠 MÉDIO | Silent failures |
| Policies sem versionamento | 🟡 BAIXO | Auditabilidade |

### Benefícios da Modularização (7 modules TypeScript)

| Módulo | Benefício Principal |
|--------|-------------------|
| 1. Message Normalizer | Contatos formalizados, validação |
| 2. Multimodal Processor | Unit testable, reutilizável |
| 3. Contact Manager | Abstração de persistência |
| 4. Agent Router | Lógica de negócio centralizad |
| 5. Event Logger | Policy engine versionado |
| 6. Chatwoot Adapter | Singleresponsibility |
| 7. Knowledge Base | RAG multi-tenant |

### Roadmap Implementação

**Fase 1:** Modularização core (M1-M5)
**Fase 2:** Agent dispatch (M4 + M6 + M7)
**Fase 3:** Multi-tenancy (Config-driven, no more hardcoding)
**Fase 4:** Observabilidade (Trace IDs, Structured Logging)
**Fase 5:** Performance (Caching, Indexing)

---

**Próximas Etapas:**
- [ ] Validar arquitetura com equipe técnica
- [ ] Gerar Type Definitions (TypeScript interfaces)
- [ ] Prototipar Module 1 (Message Normalizer)
- [ ] Setup CI/CD para testes
- [ ] Planejar cut-over (n8n → TypeScript modules)

---

**Data de Análise:** 26 de Janeiro, 2026
**Analisado por:** Analyst + Architect (AIOS Framework)
**Status:** Ready for Design Phase (Fase 2)
