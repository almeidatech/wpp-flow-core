# Guia de Integração n8n <> Aylas Core (Container)

Este guia orienta a configuração dos workflows do n8n para consumir a API do Aylas Core rodando em container.

**Endpoint Base:** `https://coreaylas.olmedatech.com`  
**Auth:** Nenhuma (API pública para consumo interno) ou via Headers se configurado Gateway.

---

## 1. Atualizar Endpoints no n8n

Onde antes você chamava `localhost:3000`, agora você deve usar o domínio de produção com HTTPS.

### M1: Normalização de Mensagem
*Substitui steps de tratamento de JSON puros no n8n*

*   **Node:** HTTP Request
*   **Method:** POST
*   **URL:** `https://coreaylas.olmedatech.com/api/v1/messages/normalize`
*   **Body:**
    ```json
    {
      "tenant_id": "espaço-aylas",
      "payload": {{ $json.body }}
    }
    ```

### M4: Classificação de Intenção (Router)
*O cérebro que decide para qual agente encaminhar*

*   **Node:** HTTP Request
*   **Method:** POST
*   **URL:** `https://coreaylas.olmedatech.com/api/v1/routing/classify`
*   **Body:**
    ```json
    {
      "tenant_id": "espaço-aylas",
      "message": {
        "content": "{{ $json.content }}", 
        "type": "text" 
      },
      "conversation_history": [] 
    }
    ```

---

## 2. Estratégia de Migração (Zero Downtime)

Para não quebrar o fluxo atual de produção:

1.  **Crie uma cópia** do seu workflow principal (ex: `Atendente Principal - V2`).
2.  No início do fluxo, substitua os nodes de *Javascript* ou *Set* que faziam a lógica de "limpeza" da mensagem pelo **M1 (Normalize)**.
3.  Substitua o *Switch* gigante de palavras-chave pelo **M4 (Classify)**.
4.  Teste o fluxo V2 enviando requisições manuais ou conectando a um gatilho de teste.
5.  Quando validar, troque o webhook do Chatwoot para apontar para este novo workflow.

---

## 3. Checklist de Verificação

*   [ ] **Health Check:** O n8n consegue acessar a API? 
    *   Teste um node HTTP GET para `https://coreaylas.olmedatech.com/health`.
*   [ ] **Latência:** O tempo de resposta do M4 (com LLM) deve ser < 3s.
*   [ ] **Tenant ID:** Garanta que está enviando `tenant_id: "espaço-aylas"` em todas as requisições.

---

## Dica para o Claude (Skills)

Ao pedir para o Claude ajudar com workflows, peça para ele:
1.  Ler este arquivo (`docs/N8N_CLAUDE_GUIDE.md`).
2.  Ler a documentação da API em `packages/aylas-core/API.md` para ver os schemas completos.
