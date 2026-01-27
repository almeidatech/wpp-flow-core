import OpenAI from 'openai';
import { NormalizedMessage, Contact, RoutingDecision, IntentType, TenantId } from '../../config/types';
import { TenantConfigStore } from '../../config/tenant';
import { logger } from '../../utils/logger';
import { retry } from '../../utils/retry';
import { AylasError, ErrorCode } from '../../utils/errors';

export interface RoutingRequest {
  tenant_id: TenantId;
  message: NormalizedMessage;
  contact: Contact;
  conversation_history?: NormalizedMessage[];
}

const INTENT_PATTERNS: Record<IntentType, string[]> = {
  sales: ['comprar', 'preço', 'quanto custa', 'orçamento', 'vender', 'produto', 'catálogo'],
  support: ['problema', 'ajuda', 'não funciona', 'erro', 'suporte', 'dúvida', 'como fazer'],
  appointment: ['agendar', 'horário', 'marcar', 'consulta', 'reunião', 'disponibilidade'],
  general: [],
};

export class AgentRouter {
  private clients: Map<TenantId, OpenAI> = new Map();

  constructor(private configStore: TenantConfigStore) {}

  private async getClient(tenant_id: TenantId): Promise<OpenAI> {
    let client = this.clients.get(tenant_id);

    if (!client) {
      const config = await this.configStore.get(tenant_id);
      if (config.llm.provider !== 'openai') {
        throw new AylasError(
          ErrorCode.LLM_API_FAILED,
          'Only OpenAI provider is supported for routing'
        );
      }
      client = new OpenAI({ apiKey: config.llm.api_key });
      this.clients.set(tenant_id, client);
    }

    return client;
  }

  async classify(req: RoutingRequest): Promise<RoutingDecision> {
    logger.info('Classifying message intent', {
      tenant_id: req.tenant_id,
      conversation_id: req.message.conversation_id,
    });

    const patternMatch = this.patternBasedClassification(req.message.content);

    if (patternMatch.confidence > 0.7) {
      logger.info('Using pattern-based classification', {
        intent: patternMatch.intent,
        confidence: patternMatch.confidence,
      });
      return patternMatch;
    }

    try {
      const llmDecision = await this.llmBasedClassification(req);
      logger.info('Using LLM-based classification', {
        intent: llmDecision.intent,
        confidence: llmDecision.confidence,
      });
      return llmDecision;
    } catch (error) {
      logger.warn('LLM classification failed, using fallback', { error });
      return patternMatch.confidence > 0 ? patternMatch : this.getDefaultDecision(req.tenant_id);
    }
  }

  private patternBasedClassification(content: string): RoutingDecision {
    const lowerContent = content.toLowerCase();
    const scores: Record<IntentType, number> = {
      sales: 0,
      support: 0,
      appointment: 0,
      general: 0,
    };

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      const matches = patterns.filter(pattern => lowerContent.includes(pattern));
      scores[intent as IntentType] = matches.length;
    }

    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) {
      return {
        intent: 'general',
        confidence: 0.3,
        metadata: {},
      };
    }

    const intent = (Object.keys(scores) as IntentType[]).find(
      key => scores[key] === maxScore
    ) || 'general';

    return {
      intent,
      confidence: Math.min(0.8, 0.5 + maxScore * 0.15),
      metadata: {
        keywords: INTENT_PATTERNS[intent],
      },
    };
  }

  private async llmBasedClassification(req: RoutingRequest): Promise<RoutingDecision> {
    const client = await this.getClient(req.tenant_id);
    const config = await this.configStore.get(req.tenant_id);

    const systemPrompt = `Você é um assistente de classificação de intenções para CRM.
Classifique a mensagem do cliente em uma das seguintes categorias:
- sales: Cliente interessado em comprar produtos ou serviços
- support: Cliente com problemas técnicos ou dúvidas
- appointment: Cliente quer agendar horário/reunião
- general: Outras mensagens

Responda APENAS com um JSON no formato:
{"intent": "sales|support|appointment|general", "confidence": 0.0-1.0, "sentiment": "positive|neutral|negative"}`;

    const userPrompt = `Mensagem: "${req.message.content}"
Cliente: ${req.contact.name}
${req.conversation_history ? `Histórico: ${req.conversation_history.map(m => m.content).join('\n')}` : ''}`;

    return await retry(async () => {
      const response = await client.chat.completions.create({
        model: config.llm.model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty LLM response');
      }

      const parsed = JSON.parse(content) as {
        intent: IntentType;
        confidence: number;
        sentiment?: 'positive' | 'neutral' | 'negative';
      };

      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        metadata: {
          sentiment: parsed.sentiment,
        },
      };
    });
  }

  private async getDefaultDecision(tenant_id: TenantId): Promise<RoutingDecision> {
    const config = await this.configStore.get(tenant_id);
    return {
      intent: config.routing.default_intent,
      confidence: 0.5,
      metadata: {},
    };
  }

  async assignAgent(conversation_id: string, agent_id: number): Promise<void> {
    logger.info('Assigning agent to conversation', {
      conversation_id,
      agent_id,
    });
  }
}
