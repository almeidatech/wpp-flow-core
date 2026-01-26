# wpp-flow-core

Core de automação para atendimento de conversas via WhatsApp usando **n8n** (automações) e **Chatwoot** (CRM).

Solução modular projetada para ser adaptada a qualquer empresa ou nicho.

## Stack

| Componente | Função |
|------------|--------|
| **Chatwoot** | CRM de atendimento multicanal |
| **n8n** | Orquestração de automações e workflows |
| **WhatsApp Business API** | Canal de comunicação (via Meta ou Evolution API) |

## Estrutura

```
├── config/          # Configurações e variáveis de ambiente
├── docs/            # Documentação técnica
├── workflows/       # Templates de workflows n8n
└── scripts/         # Scripts utilitários
```

## Setup Rápido

1. Copie o arquivo de configuração:
   ```bash
   cp config/.env.example config/.env
   ```

2. Configure suas credenciais no `.env`

3. Configure o webhook do Chatwoot apontando para seu n8n

## Recursos de Contexto

- [n8n-mcp](https://github.com/almeidatech/n8n-mcp) - MCP Server para integração com Claude
- [n8n-skills](https://github.com/almeidatech/n8n-skills) - Skills para Claude Code

## Documentação

- [Configuração Chatwoot](docs/chatwoot-setup.md)
- [Workflows n8n](docs/n8n-workflows.md)
