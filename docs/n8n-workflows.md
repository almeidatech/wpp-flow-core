# Workflows n8n

## Recursos de Contexto

### n8n-mcp

Servidor MCP que conecta assistentes de IA ao ecossistema n8n.

**Funcionalidades:**
- 1.084 nós documentados (537 core + 547 comunitários)
- 2.709 templates de workflow
- 2.646 configurações pré-extraídas

**Instalação Claude Desktop:**
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": ["n8n-mcp"],
      "env": { "MCP_MODE": "stdio" }
    }
  }
}
```

**Alternativa hospedada:** [dashboard.n8n-mcp.com](https://dashboard.n8n-mcp.com)

### n8n-skills

7 skills para Claude Code:

1. **n8n Expression Syntax** - Padrões `{{}}`, variáveis `$json`, `$node`
2. **n8n MCP Tools Expert** - Seleção de ferramentas e validação
3. **n8n Workflow Patterns** - 5 padrões arquiteturais
4. **n8n Validation Expert** - Interpretação de erros
5. **n8n Node Configuration** - Dependências e conexões AI
6. **n8n Code JavaScript** - Padrões de acesso a dados
7. **n8n Code Python** - Limitações (sem libs externas)

**Instalação:**
```
/plugin install czlonkowski/n8n-skills
```

## Padrões de Workflow

### Webhook Chatwoot > Processamento > Resposta

```
[Webhook Trigger] -> [Switch por Evento] -> [Processamento] -> [HTTP Request Chatwoot API]
```

### Fluxo com IA

```
[Webhook] -> [Extrair Mensagem] -> [OpenAI/Claude] -> [Formatar Resposta] -> [Enviar via API]
```

## Expressões Comuns

```javascript
// Dados do webhook
{{ $json.body.message.content }}

// Referência a nó anterior
{{ $node["Nome do Nó"].json.data }}

// Condicionais
{{ $json.event === "message_created" ? "novo" : "outro" }}
```

## Segurança

- Nunca edite workflows de produção diretamente com IA
- Faça cópias e teste em desenvolvimento
- Valide mudanças antes de aplicar
