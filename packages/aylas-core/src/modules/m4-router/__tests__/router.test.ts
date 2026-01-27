import { AgentRouter, RoutingRequest } from '../router';
import { TenantConfigStore } from '../../../config/tenant';
import { NormalizedMessage, Contact } from '../../../config/types';

jest.mock('openai');

const mockConfigStore = {
  get: jest.fn().mockResolvedValue({
    id: 'tenant_123',
    llm: {
      provider: 'openai',
      api_key: 'test-key',
      model: 'gpt-4o-mini',
      temperature: 0.7,
    },
    routing: {
      default_intent: 'general',
      auto_assign: true,
    },
  }),
} as unknown as TenantConfigStore;

describe('AgentRouter', () => {
  let router: AgentRouter;

  beforeEach(() => {
    router = new AgentRouter(mockConfigStore);
    jest.clearAllMocks();
  });

  const createMessage = (content: string): NormalizedMessage => ({
    tenant_id: 'tenant_123',
    conversation_id: '123',
    phone: '5511999999999',
    timestamp: Date.now(),
    type: 'text',
    content,
    attachments: [],
    metadata: {},
  });

  const createContact = (): Contact => ({
    id: 42,
    phone: '5511999999999',
    name: 'Test User',
    custom_fields: {},
    created_at: Date.now(),
  });

  describe('classify - pattern matching', () => {
    it('should classify sales intent', async () => {
      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Quanto custa este produto? Gostaria de comprar'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('sales');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify support intent', async () => {
      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Estou com um problema, preciso de ajuda'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('support');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify appointment intent', async () => {
      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Gostaria de agendar uma consulta para amanhã'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('appointment');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should default to general for ambiguous messages', async () => {
      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Olá'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('general');
    });
  });

  describe('classify - LLM fallback', () => {
    it('should use LLM when pattern confidence is low', async () => {
      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      intent: 'sales',
                      confidence: 0.95,
                      sentiment: 'positive',
                    }),
                  },
                },
              ],
            }),
          },
        },
      }));

      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Estou interessado em saber mais sobre seus serviços'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('sales');
      expect(result.confidence).toBe(0.95);
      expect(result.metadata.sentiment).toBe('positive');
    });

    it('should handle LLM failures gracefully', async () => {
      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      }));

      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Random message'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('general');
    });

    it('should handle empty LLM response', async () => {
      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: '' } }],
            }),
          },
        },
      }));

      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Test'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('general');
    });
  });

  describe('assignAgent', () => {
    it('should assign agent to conversation', async () => {
      await expect(router.assignAgent('123', 456)).resolves.toBeUndefined();
    });
  });

  describe('Pattern matching edge cases', () => {
    it('should handle message with no matching patterns', async () => {
      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('XYZABC123456'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0.3);
    });

    it('should handle message with multiple pattern types', async () => {
      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Quero comprar um produto e agendar uma consulta'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.intent).toBeDefined();
    });

    it('should be case insensitive', async () => {
      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('COMPRAR PRODUTO AGORA'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('sales');
    });

    it('should handle empty message', async () => {
      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage(''),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0.3);
    });
  });


  describe('LLM response parsing', () => {
    it('should handle LLM response without sentiment', async () => {
      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      intent: 'support',
                      confidence: 0.85,
                    }),
                  },
                },
              ],
            }),
          },
        },
      }));

      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Test message'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('support');
      expect(result.confidence).toBe(0.85);
      expect(result.metadata.sentiment).toBeUndefined();
    });

    it('should handle LLM response with null content', async () => {
      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: null } }],
            }),
          },
        },
      }));

      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Test'),
        contact: createContact(),
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('general');
    });
  });


  describe('Conversation history support', () => {
    it('should include conversation history in LLM prompt', async () => {
      const OpenAI = require('openai');
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'sales',
                confidence: 0.9,
              }),
            },
          },
        ],
      });

      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const history: NormalizedMessage[] = [
        createMessage('Previous message 1'),
        createMessage('Previous message 2'),
      ];

      const req: RoutingRequest = {
        tenant_id: 'tenant_123',
        message: createMessage('Current message'),
        contact: createContact(),
        conversation_history: history,
      };

      const result = await router.classify(req);

      expect(result.intent).toBe('sales');
      const callArgs = mockCreate.mock.calls[0];
      expect(callArgs[0].messages[1].content).toContain('Histórico');
    });
  });
});
