# G1: Integração com n8n Local

## 🎯 Objetivo

Conectar seu n8n Aylas ao servidor Express rodando em `localhost:3000`

---

## ✅ Pré-requisitos

1. ✅ Server aylas-core rodando: `npm run start:server`
2. ✅ n8n local ou remoto acessível
3. ✅ Webhook Chatwoot apontando para n8n

---

## 🔌 Arquitetura Fluxo

```
Chatwoot Webhook
    ↓
n8n (seu workflow atual)
    ↓
HTTP POST → localhost:3000/api/v1/messages/normalize
    ↓
M1-M5 processam
    ↓
HTTP Response ← volta para n8n
    ↓
n8n (continua workflow: labels, atualiza Chatwoot, etc)
    ↓
Chatwoot (atualizado com labels/attributes)
```

---

## 📋 Setup em n8n

### Step 1: Copiar ID do Webhook Atual

No seu **atendente_principal**, qual é o nó que **recebe** o webhook do Chatwoot?

Copie a URL:
```
https://seu-n8n.com/webhook/chatwoot
```

### Step 2: Adicionar Nó HTTP (M1: Normalize)

No seu workflow:
1. **Insert → HTTP Request**
2. **Configurar:**
   - Method: `POST`
   - URL: `http://localhost:3000/api/v1/messages/normalize`
   - Authentication: `None` (local)
   - Headers:
     ```json
     {
       "Content-Type": "application/json"
     }
     ```
   - Body (Send JSON):
     ```json
     {
       "tenant_id": "aylas",
       "payload": {{ $json }}
     }
     ```

### Step 3: Extrair Response

Após o nó HTTP, adicione **Set** pra extrair dados:

```javascript
// Nome: Extract Normalized Data

return {
  normalized: $json.data,
  success: $json.success,
  phone: $json.data?.phone,
  conversation_id: $json.data?.conversation_id,
  message_type: $json.data?.type,
  content: $json.data?.content
};
```

### Step 4: Chamar M4 (Classify Intent) - Opcional

```
HTTP Request → POST
URL: http://localhost:3000/api/v1/routing/classify
Body:
{
  "tenant_id": "aylas",
  "message": {{ $json.normalized }},
  "contact": {
    "id": {{ $json.contact_id }},
    "phone": {{ $json.phone }},
    "name": "Customer",
    "custom_fields": {}
  }
}
```

Extrair intent:
```javascript
return {
  intent: $json.data?.intent,
  confidence: $json.data?.confidence,
  suggested_agent: $json.data?.suggested_agent
};
```

### Step 5: Continuar com Lógica Atual

Seu workflow atual:
- Switch por intent/type
- Route para agents
- Atualizar Chatwoot labels
- Chamar logger_central

**Tudo continua igual!** Só substitua os nós de normalização/classificação pelos calls HTTP.

---

## 🧪 Teste Passo a Passo

### Test 1: Health Check
```
GET http://localhost:3000/health
```
Esperado: `{ "status": "ok" }`

### Test 2: Normalize via n8n

No n8n, crie um workflow de teste:

1. **Webhook** (GET/POST qualquer)
2. **Set node** com dados fake:
   ```javascript
   {
     "body": {
       "conversation": {
         "id": 60,
         "contact": { "phone_number": "+556194350995" }
       },
       "message": {
         "content": "Teste de integração",
         "content_type": "text"
       }
     }
   }
   ```
3. **HTTP POST** → `http://localhost:3000/api/v1/messages/normalize`
4. **Execute** e veja a response

Esperado:
```json
{
  "success": true,
  "data": {
    "tenant_id": "aylas",
    "conversation_id": "60",
    "phone": "556194350995",
    "type": "text",
    "content": "Teste de integração"
  }
}
```

### Test 3: Classify via n8n

Mesmo workflow:

1. **Webhook**
2. **Set** com dados fake
3. **HTTP POST** → `http://localhost:3000/api/v1/routing/classify`
   ```json
   {
     "tenant_id": "aylas",
     "message": {
       "tenant_id": "aylas",
       "conversation_id": "60",
       "phone": "556194350995",
       "type": "text",
       "content": "Queria agendar um banho pro cachorro",
       "attachments": [],
       "metadata": {}
     },
     "contact": {
       "id": 1,
       "phone": "556194350995",
       "name": "João",
       "custom_fields": {}
     }
   }
   ```
4. **Execute** e veja intent detectado

---

## 🔄 Substituir Lógica Atual

Seu **atendente_principal** tem:
- ✅ Variáveis Globais (normalização)
- ✅ Tipo da Mensagem (type detection)
- ✅ Switch (routing)
- ✅ Agents (info_agent, comercial, etc)
- ✅ Chatwoot POST (envio)
- ✅ logger_central (policies)

**Com aylas-core:**

| Antes (n8n) | Depois (aylas-core HTTP) |
|-----------|-------------------------|
| Variáveis Globais + Tipo da Mensagem | HTTP POST /messages/normalize |
| Switch + IF nodes | HTTP POST /routing/classify |
| - | _(opcional)_ HTTP POST /multimodal/process |
| - | _(opcional)_ HTTP POST /events/log |

**Agents + Chatwoot + logger_central:** Continuam iguais em n8n

---

## 📊 Exemplo Workflow Atualizado

```
Webhook (Chatwoot)
    ↓
Set: Extract data
    ↓
HTTP POST /api/v1/messages/normalize  ← M1
    ↓
Set: Extract normalized
    ↓
IF (type === 'audio') → HTTP POST /multimodal/process  ← M2
    ↓
HTTP POST /api/v1/routing/classify  ← M4
    ↓
Set: Extract intent
    ↓
Switch (intent)
  ├─ 'appointment' → Booking Agent
  ├─ 'support' → Support Agent
  ├─ 'sales' → Commercial Agent
  └─ 'general' → Info Agent
    ↓
HTTP POST Chatwoot /messages  (send response)
    ↓
HTTP POST logger_central  (log event)
    ↓
Finish
```

---

## 🐛 Troubleshooting

### "Connection refused" na porta 3000
```bash
# Verificar se server está rodando
curl http://localhost:3000/health

# Se não responder, iniciar server:
npm run start:server
```

### Timeout em HTTP nodes n8n
- Aumentar timeout nas HTTP node settings
- Verificar conectividade (firewall, VPN)
- Checkar logs do server: `npm run start:server` com LOG_LEVEL=debug

### Dados não estão sendo normalizados
- Validar payload JSON da Chatwoot
- Comparar com exemplo em `API.md`
- Checar logs do server

### Performance lenta
- Aumentar AYLAS_LLM_TEMPERATURE em .env (reduz complexidade)
- Usar cache Redis (próxima fase)
- Implementar rate limiting

---

## ✅ Checklist Integração

- [ ] Server rodando: `npm run start:server`
- [ ] Health check OK: `curl http://localhost:3000/health`
- [ ] Test workflow criado em n8n
- [ ] HTTP POST /messages/normalize testado
- [ ] HTTP POST /routing/classify testado
- [ ] Webhook real apontado (substituir Variáveis Globais)
- [ ] Agents continuam funcionando
- [ ] Chatwoot atualizado com labels
- [ ] logger_central recebendo eventos

---

## 🎯 Próximos Passos

1. **Hoje:** Teste passo a passo em n8n
2. **Amanhã:** Substitua lógica atual
3. **Depois:** Implemente M2 (multimodal) para áudio/imagem
4. **Depois:** Implemente M6-M7 (Chatwoot + KB)

---

## 📞 Suporte

Se algo não funcionar:
1. Checar server logs: `LOG_LEVEL=debug npm run start:server`
2. Testar endpoint direto: `curl -X POST http://localhost:3000/...`
3. Validar JSON payload
4. Verificar `.env` credentials
