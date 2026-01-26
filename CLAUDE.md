# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Core de automação para atendimento WhatsApp via **n8n** + **Chatwoot**. Solução modular para qualquer nicho.

## Arquitetura

```
WhatsApp → Chatwoot (CRM) → Webhook → n8n (Automação) → Resposta via API
```

## Agents Instalados

Use os agents em `.claude/agents/` conforme o contexto:

| Agent | Quando usar |
|-------|-------------|
| `customer-support` | Fluxos de atendimento, FAQs, troubleshooting |
| `sales-automator` | Sequências de vendas, follow-up, conversão |
| `backend-architect` | APIs, schemas, arquitetura de serviços |
| `api-documenter` | Documentação de endpoints |
| `mcp-integration-engineer` | Criar integrações MCP customizadas |
| `javascript-pro` | Código n8n, funções JavaScript |
| `typescript-pro` | Código tipado |
| `nlp-engineer` | Processamento de linguagem, chatbots IA |

## Skills Instaladas

| Skill | Uso |
|-------|-----|
| `skill-creator` | Criar novas skills customizadas para Claude Code |

Scripts disponíveis em `.claude/skills/skill-creator/scripts/`:
- `init_skill.py <nome> --path <dir>` - Inicializar nova skill
- `package_skill.py <path>` - Empacotar skill para distribuição
- `quick_validate.py` - Validar skill

## Commands Instalados

| Comando | Uso |
|---------|-----|
| `/create-architecture-documentation` | Gerar documentação de arquitetura (C4, Arc42, ADRs, PlantUML) |

## MCPs Configurados

Ver `.claude/settings.json`:
- **n8n-mcp**: 1.084 nós, 2.709 templates
- **memory**: Contexto persistente entre sessões
- **github**: Integração repositório
- **postgres**: Conexão Chatwoot DB (se aplicável)

## Recursos Externos

### n8n
- Skills: `/plugin install czlonkowski/n8n-skills`
- Dashboard MCP: https://dashboard.n8n-mcp.com
- Expressões: `{{ $json.body.message.content }}`

### Chatwoot
- Webhooks: `message_created`, `conversation_created`, `conversation_status_changed`
- API: `POST /api/v1/accounts/{id}/conversations/{conv_id}/messages`
- Docs: https://www.chatwoot.com/developers/api/

## Configuração

```bash
cp config/.env.example config/.env
# Preencher credenciais
```

## Comandos Úteis

```bash
# Adicionar mais agents
npx claude-code-templates@latest --agent <categoria/nome>

# Analytics
npx claude-code-templates@latest --analytics

# Health check
npx claude-code-templates@latest --health-check
```
