# Configuração Chatwoot

## Integração WhatsApp

### Opção 1: Embedded Signup (Recomendado)

1. Acesse **Settings > Inboxes > Add Inbox**
2. Selecione **WhatsApp**
3. Escolha **Embedded Signup**
4. Faça login com conta Meta/Facebook
5. Selecione ou crie WhatsApp Business Account
6. Adicione número de telefone

Webhooks e tokens são configurados automaticamente.

### Opção 2: Manual Setup

Para configuração manual via Meta Developer Console:

1. Crie app no [Meta for Developers](https://developers.facebook.com/)
2. Gere token de acesso permanente
3. Configure webhooks manualmente
4. Copie Phone Number ID e Business Account ID para Chatwoot

## Webhooks

### Configuração

**Settings \> Integrations \> Webhooks \> Add new webhook**

### Eventos Disponíveis

| Evento | Descrição |
|--------|-----------|
| `conversation_created` | Nova conversa criada |
| `conversation_updated` | Atributos da conversa alterados |
| `conversation_status_changed` | Status alterado (open/resolved/pending) |
| `message_created` | Nova mensagem na conversa |

### Payload Exemplo

```json
{
  "event": "message_created",
  "account": { "id": 1 },
  "conversation": { "id": 123 },
  "message": {
    "content": "Olá!",
    "message_type": "incoming"
  }
}
```

## Agent Bots

Para automação via bot:

1. **Settings > Applications > Add Bot**
2. Configure nome e webhook URL (endpoint n8n)
3. Vincule bot ao inbox desejado

O Chatwoot enviará eventos para o webhook, permitindo respostas automatizadas via API.

## API Reference

- Base URL: `https://app.chatwoot.com/api/v1`
- Auth: Header `api_access_token`
- [Documentação completa](https://www.chatwoot.com/developers/api/)

## Boas Práticas

- Use Embedded Signup para novos números
- Configure automações para respostas rápidas (canned responses)
- Implemente NLP para chatbots inteligentes
- Siga regras de opt-in do WhatsApp Business
- Mantenha integrações atualizadas
