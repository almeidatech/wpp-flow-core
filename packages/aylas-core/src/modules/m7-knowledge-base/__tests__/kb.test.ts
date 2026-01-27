import { KnowledgeBase, KBQueryRequest } from '../knowledge-base';
import { VectorStore } from '../vector-store';
import { TenantConfigStore } from '../../../config/tenant';
import { TenantConfig } from '../../../config/types';
import { setKBConfig } from '../prompts';
import OpenAI from 'openai';

// Mock dependencies
jest.mock('openai');
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('KnowledgeBase', () => {
  let knowledgeBase: KnowledgeBase;
  let mockConfigStore: jest.Mocked<TenantConfigStore>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  const mockTenantConfig: TenantConfig = {
    id: 'tenant-1',
    name: 'Test Tenant',
    chatwoot: {
      account_id: 123,
      api_url: 'https://app.chatwoot.com',
      api_token: 'test-token',
    },
    baserow: {
      api_url: 'https://api.baserow.io',
      api_token: 'baserow-token',
      tables: {
        contacts: 1,
        events: 2,
      },
    },
    llm: {
      provider: 'openai',
      api_key: 'test-openai-key',
      model: 'gpt-4',
      temperature: 0.7,
    },
    routing: {
      default_intent: 'general',
      auto_assign: true,
    },
    policies: [],
  };

  // Mock embeddings (1536-dimensional for text-embedding-3-small)
  const mockEmbedding = Array(1536).fill(0).map(() => Math.random() * 0.1);
  const mockQueryEmbedding = Array(1536).fill(0).map(() => Math.random() * 0.1 + 0.5);

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock config store
    mockConfigStore = {
      get: jest.fn().mockResolvedValue(mockTenantConfig),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TenantConfigStore>;

    // Mock OpenAI client
    mockOpenAI = {
      embeddings: {
        create: jest.fn(),
      },
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as unknown as jest.Mocked<OpenAI>;

    // Mock OpenAI constructor
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

    // Mock embeddings responses
    (mockOpenAI.embeddings.create as jest.Mock).mockImplementation((params) => {
      if (Array.isArray(params.input)) {
        return Promise.resolve({
          data: params.input.map(() => ({ embedding: mockEmbedding })),
        });
      }
      return Promise.resolve({
        data: [{ embedding: mockQueryEmbedding }],
      });
    });

    // Mock chat completions
    (mockOpenAI.chat.completions.create as jest.Mock).mockResolvedValue({
      choices: [
        {
          message: {
            content: 'This is a generated answer based on the knowledge base.',
          },
        },
      ],
    });

    knowledgeBase = new KnowledgeBase(mockConfigStore);
  });

  describe('addDocuments', () => {
    it('should add documents with embeddings', async () => {
      const documents = [
        {
          id: 'doc-1',
          content: 'Our business hours are 9 AM to 5 PM Monday through Friday.',
          metadata: { category: 'hours' },
        },
        {
          id: 'doc-2',
          content: 'We offer free shipping on orders over $50.',
          metadata: { category: 'shipping' },
        },
      ];

      await knowledgeBase.addDocuments('tenant-1', documents);

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: documents.map((d) => d.content),
      });

      const stats = knowledgeBase.getStats('tenant-1');
      expect(stats.document_count).toBe(2);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Add test documents
      const documents = [
        {
          id: 'doc-1',
          content: 'Our business hours are 9 AM to 5 PM Monday through Friday.',
          metadata: { category: 'hours' },
        },
        {
          id: 'doc-2',
          content: 'We offer free shipping on orders over $50.',
          metadata: { category: 'shipping' },
        },
        {
          id: 'doc-3',
          content: 'Our return policy allows returns within 30 days of purchase.',
          metadata: { category: 'returns' },
        },
      ];

      await knowledgeBase.addDocuments('tenant-1', documents);
    });

    it('should perform similarity search and return augmented answer', async () => {
      const request: KBQueryRequest = {
        tenant_id: 'tenant-1',
        query: 'What are your business hours?',
        top_k: 3,
      };

      const result = await knowledgeBase.query(request);

      expect(result.answer).toBe('This is a generated answer based on the knowledge base.');
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);

      // Verify LLM was called
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should enforce multi-tenant isolation', async () => {
      // Add documents to tenant-2
      const tenant2Docs = [
        {
          id: 'doc-tenant2',
          content: 'Tenant 2 specific information.',
          metadata: {},
        },
      ];

      await knowledgeBase.addDocuments('tenant-2', tenant2Docs);

      // Query tenant-1 should not see tenant-2 docs
      const request: KBQueryRequest = {
        tenant_id: 'tenant-1',
        query: 'Tenant 2 information',
        top_k: 5,
      };

      await knowledgeBase.query(request);

      // Should only search within tenant-1's documents
      const stats1 = knowledgeBase.getStats('tenant-1');
      const stats2 = knowledgeBase.getStats('tenant-2');

      expect(stats1.document_count).toBe(3); // Original 3 docs
      expect(stats2.document_count).toBe(1); // Separate tenant
    });

    it('should augment response with RAG context', async () => {
      const request: KBQueryRequest = {
        tenant_id: 'tenant-1',
        query: 'Do you offer free shipping?',
        context: 'Customer is asking about shipping costs.',
        top_k: 2,
      };

      const result = await knowledgeBase.query(request);

      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.answer).toBeTruthy();

      // Verify chat completion was called with context
      const chatCall = (mockOpenAI.chat.completions.create as jest.Mock).mock.calls[0][0];
      expect(chatCall.messages[0].content).toContain('shipping');
    });

    it('should calculate confidence score', async () => {
      const request: KBQueryRequest = {
        tenant_id: 'tenant-1',
        query: 'What are your hours?',
        top_k: 3,
      };

      const result = await knowledgeBase.query(request);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.confidence).toBe('number');
    });

    it('should return fallback when no relevant documents found', async () => {
      // Configure high minimum confidence
      setKBConfig('tenant-1', {
        min_confidence: 0.99, // Very high threshold
      });

      const request: KBQueryRequest = {
        tenant_id: 'tenant-1',
        query: 'Completely unrelated query about quantum physics',
        top_k: 3,
      };

      const result = await knowledgeBase.query(request);

      expect(result.answer).toContain("don't have enough information");
      expect(result.sources).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });

    it('should support domain-specific prompts', async () => {
      // Reset config to default
      setKBConfig('tenant-1', {
        min_confidence: 0.5, // Back to default
      });

      const salesRequest: KBQueryRequest = {
        tenant_id: 'tenant-1',
        query: 'I want to buy a product',
        domain: 'sales',
        top_k: 2,
      };

      const result = await knowledgeBase.query(salesRequest);

      expect(result.answer).toBeTruthy();
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();

      // Verify domain-specific prompt was used
      const chatCall = (mockOpenAI.chat.completions.create as jest.Mock).mock.calls[0][0];
      expect(chatCall.messages[0].content).toContain('sales');
    });
  });

  describe('clearKnowledgeBase', () => {
    it('should clear all documents for tenant', async () => {
      // Add documents
      await knowledgeBase.addDocuments('tenant-1', [
        { id: 'doc-1', content: 'Test document' },
      ]);

      expect(knowledgeBase.getStats('tenant-1').document_count).toBe(1);

      // Clear
      knowledgeBase.clearKnowledgeBase('tenant-1');

      expect(knowledgeBase.getStats('tenant-1').document_count).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return accurate document count', async () => {
      const documents = [
        { id: 'doc-1', content: 'Document 1' },
        { id: 'doc-2', content: 'Document 2' },
        { id: 'doc-3', content: 'Document 3' },
      ];

      await knowledgeBase.addDocuments('tenant-1', documents);

      const stats = knowledgeBase.getStats('tenant-1');
      expect(stats.document_count).toBe(3);
    });

    it('should return zero for non-existent tenant', () => {
      const stats = knowledgeBase.getStats('non-existent-tenant');
      expect(stats.document_count).toBe(0);
    });
  });
});

describe('KnowledgeBase Error Handling', () => {
  let knowledgeBase: KnowledgeBase;
  let mockConfigStore: jest.Mocked<TenantConfigStore>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  const mockTenantConfig: TenantConfig = {
    id: 'tenant-1',
    name: 'Test Tenant',
    chatwoot: {
      account_id: 123,
      api_url: 'https://app.chatwoot.com',
      api_token: 'test-token',
    },
    baserow: {
      api_url: 'https://api.baserow.io',
      api_token: 'baserow-token',
      tables: {
        contacts: 1,
        events: 2,
      },
    },
    llm: {
      provider: 'openai',
      api_key: 'test-openai-key',
      model: 'gpt-4',
      temperature: 0.7,
    },
    routing: {
      default_intent: 'general',
      auto_assign: true,
    },
    policies: [],
  };

  const mockEmbedding = Array(1536).fill(0).map(() => Math.random() * 0.1);

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigStore = {
      get: jest.fn().mockResolvedValue(mockTenantConfig),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TenantConfigStore>;

    mockOpenAI = {
      embeddings: {
        create: jest.fn(),
      },
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as unknown as jest.Mocked<OpenAI>;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

    knowledgeBase = new KnowledgeBase(mockConfigStore);
  });

  describe('LLM Provider Validation', () => {
    it('should throw error for unsupported LLM provider', async () => {
      const { AylasError } = require('../../../utils/errors');

      const customKnowledgeBase = new KnowledgeBase(mockConfigStore);

      mockConfigStore.get.mockResolvedValueOnce({
        ...mockTenantConfig,
        llm: { ...mockTenantConfig.llm, provider: 'anthropic' },
      });

      await expect(
        customKnowledgeBase.addDocuments('tenant-custom', [{ id: 'doc-1', content: 'test' }])
      ).rejects.toThrow(AylasError);
    });
  });

  describe('Embedding Generation Errors', () => {
    it('should throw error when embedding is missing for document', async () => {
      const { AylasError } = require('../../../utils/errors');

      (mockOpenAI.embeddings.create as jest.Mock).mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding }, undefined], // Missing second embedding
      });

      await expect(
        knowledgeBase.addDocuments('tenant-1', [
          { id: 'doc-1', content: 'test 1' },
          { id: 'doc-2', content: 'test 2' },
        ])
      ).rejects.toThrow(AylasError);
    });

    it('should throw error when no embedding returned from API', async () => {
      const { AylasError } = require('../../../utils/errors');

      (mockOpenAI.embeddings.create as jest.Mock).mockResolvedValueOnce({
        data: [], // Empty response
      });

      await expect(
        knowledgeBase.addDocuments('tenant-1', [{ id: 'doc-1', content: 'test' }])
      ).rejects.toThrow(AylasError);
    });

    it('should handle embedding generation API errors', async () => {
      const { AylasError } = require('../../../utils/errors');

      (mockOpenAI.embeddings.create as jest.Mock).mockRejectedValueOnce(
        new Error('API rate limit exceeded')
      );

      await expect(
        knowledgeBase.addDocuments('tenant-1', [{ id: 'doc-1', content: 'test' }])
      ).rejects.toThrow(AylasError);
    });

    it('should handle batch embeddings errors', async () => {
      const { AylasError } = require('../../../utils/errors');

      (mockOpenAI.embeddings.create as jest.Mock).mockRejectedValueOnce(
        new Error('Service unavailable')
      );

      await expect(
        knowledgeBase.addDocuments('tenant-1', [
          { id: 'doc-1', content: 'test 1' },
          { id: 'doc-2', content: 'test 2' },
        ])
      ).rejects.toThrow(AylasError);
    });
  });

  describe('Answer Generation Errors', () => {
    it('should throw error when LLM returns empty response', async () => {
      const { AylasError } = require('../../../utils/errors');

      (mockOpenAI.embeddings.create as jest.Mock).mockImplementation((params) => {
        if (Array.isArray(params.input)) {
          return Promise.resolve({
            data: params.input.map(() => ({ embedding: mockEmbedding })),
          });
        }
        return Promise.resolve({
          data: [{ embedding: mockEmbedding }],
        });
      });

      (mockOpenAI.chat.completions.create as jest.Mock).mockResolvedValueOnce({
        choices: [{ message: { content: '' } }], // Empty response
      });

      await knowledgeBase.addDocuments('tenant-1', [
        { id: 'doc-1', content: 'Test document' },
      ]);

      await expect(
        knowledgeBase.query({
          tenant_id: 'tenant-1',
          query: 'Test query',
        })
      ).rejects.toThrow(AylasError);
    });

    it('should handle LLM API errors during answer generation', async () => {
      const { AylasError } = require('../../../utils/errors');

      (mockOpenAI.embeddings.create as jest.Mock).mockImplementation((params) => {
        if (Array.isArray(params.input)) {
          return Promise.resolve({
            data: params.input.map(() => ({ embedding: mockEmbedding })),
          });
        }
        return Promise.resolve({
          data: [{ embedding: mockEmbedding }],
        });
      });

      (mockOpenAI.chat.completions.create as jest.Mock).mockRejectedValueOnce(
        new Error('LLM service error')
      );

      await knowledgeBase.addDocuments('tenant-1', [
        { id: 'doc-1', content: 'Test document' },
      ]);

      await expect(
        knowledgeBase.query({
          tenant_id: 'tenant-1',
          query: 'Test query',
        })
      ).rejects.toThrow(AylasError);
    });
  });
});

describe('VectorStore', () => {
  let vectorStore: VectorStore;

  beforeEach(() => {
    vectorStore = new VectorStore();
  });

  describe('document management', () => {
    it('should retrieve document by ID', () => {
      const doc = {
        id: 'doc-1',
        content: 'Test',
        embedding: [1, 2, 3],
        metadata: {},
      };

      vectorStore.add(doc);
      const retrieved = vectorStore.get('doc-1');

      expect(retrieved).toEqual(doc);
    });

    it('should return undefined for non-existent document', () => {
      const retrieved = vectorStore.get('nonexistent');
      expect(retrieved).toBeUndefined();
    });

    it('should remove document and return true', () => {
      const doc = {
        id: 'doc-1',
        content: 'Test',
        embedding: [1, 2, 3],
        metadata: {},
      };

      vectorStore.add(doc);
      const removed = vectorStore.remove('doc-1');

      expect(removed).toBe(true);
      expect(vectorStore.get('doc-1')).toBeUndefined();
    });

    it('should return false for non-existent removal', () => {
      const removed = vectorStore.remove('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw error on vector dimension mismatch', () => {
      const doc1 = {
        id: 'doc-1',
        content: 'Test',
        embedding: [1, 2, 3],
        metadata: {},
      };

      vectorStore.add(doc1);

      expect(() => {
        vectorStore.search([1, 2, 3, 4, 5], 1); // Different dimension
      }).toThrow('Vector dimension mismatch');
    });

    it('should return 0 similarity for zero vectors', () => {
      const doc = {
        id: 'doc-1',
        content: 'Test',
        embedding: [0, 0, 0],
        metadata: {},
      };

      vectorStore.add(doc);
      const results = vectorStore.search([0, 0, 0], 1);

      expect(results[0]?.similarity).toBe(0);
    });

    it('should handle zero vector in collection', () => {
      const doc1 = {
        id: 'doc-1',
        content: 'Test 1',
        embedding: [1, 0, 0],
        metadata: {},
      };

      const doc2 = {
        id: 'doc-2',
        content: 'Test 2',
        embedding: [0, 0, 0],
        metadata: {},
      };

      vectorStore.add(doc1);
      vectorStore.add(doc2);

      const results = vectorStore.search([1, 0, 0], 2);
      expect(results).toHaveLength(2);
      expect(results[0]?.document.id).toBe('doc-1');
    });
  });

  describe('cosine similarity', () => {
    it('should calculate correct similarity scores', () => {
      // Create test vectors
      const doc1 = {
        id: 'doc-1',
        content: 'Test document 1',
        embedding: [1, 0, 0],
        metadata: {},
      };

      const doc2 = {
        id: 'doc-2',
        content: 'Test document 2',
        embedding: [0.707, 0.707, 0], // 45 degree angle
        metadata: {},
      };

      const doc3 = {
        id: 'doc-3',
        content: 'Test document 3',
        embedding: [0, 1, 0], // 90 degree angle
        metadata: {},
      };

      vectorStore.add(doc1);
      vectorStore.add(doc2);
      vectorStore.add(doc3);

      const queryEmbedding = [1, 0, 0];
      const results = vectorStore.search(queryEmbedding, 3);

      // doc1 should have highest similarity (1.0)
      expect(results[0]?.document.id).toBe('doc-1');
      expect(results[0]?.similarity).toBeCloseTo(1.0, 2);

      // doc2 should be second
      expect(results[1]?.document.id).toBe('doc-2');

      // doc3 should have lowest similarity (0.0)
      expect(results[2]?.document.id).toBe('doc-3');
      expect(results[2]?.similarity).toBeCloseTo(0.0, 2);
    });
  });

  describe('vector normalization', () => {
    it('should normalize vectors to unit length', () => {
      const vector = [3, 4]; // Length = 5
      const normalized = VectorStore.normalizeVector(vector);

      expect(normalized[0]).toBeCloseTo(0.6, 2);
      expect(normalized[1]).toBeCloseTo(0.8, 2);

      // Verify unit length
      const val0 = normalized[0] ?? 0;
      const val1 = normalized[1] ?? 0;
      const length = Math.sqrt(val0 ** 2 + val1 ** 2);
      expect(length).toBeCloseTo(1.0, 5);
    });

    it('should handle zero vectors', () => {
      const vector = [0, 0];
      const normalized = VectorStore.normalizeVector(vector);

      expect(normalized).toEqual([0, 0]);
    });
  });
});

describe('getDomainPrompt', () => {
  it('should return domain-specific prompts for valid domains', () => {
    const { getDomainPrompt } = require('../prompts');

    const salesPrompt = getDomainPrompt('sales');
    expect(salesPrompt).toContain('sales');
    expect(salesPrompt).toContain('{context}');
    expect(salesPrompt).toContain('{query}');

    const supportPrompt = getDomainPrompt('support');
    expect(supportPrompt).toContain('support');

    const appointmentPrompt = getDomainPrompt('appointment');
    expect(appointmentPrompt).toContain('appointment');
  });

  it('should return default prompt for unknown domain', () => {
    const { getDomainPrompt, DEFAULT_SYSTEM_PROMPT } = require('../prompts');

    const unknownPrompt = getDomainPrompt('unknown-domain');
    expect(unknownPrompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('should return default prompt for empty string domain', () => {
    const { getDomainPrompt, DEFAULT_SYSTEM_PROMPT } = require('../prompts');

    const emptyPrompt = getDomainPrompt('');
    expect(emptyPrompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });
});

describe('KnowledgeBase Edge Cases', () => {
  let knowledgeBase: KnowledgeBase;
  let mockConfigStore: jest.Mocked<TenantConfigStore>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  const mockTenantConfig: TenantConfig = {
    id: 'tenant-1',
    name: 'Test Tenant',
    chatwoot: {
      account_id: 123,
      api_url: 'https://app.chatwoot.com',
      api_token: 'test-token',
    },
    baserow: {
      api_url: 'https://api.baserow.io',
      api_token: 'baserow-token',
      tables: {
        contacts: 1,
        events: 2,
      },
    },
    llm: {
      provider: 'openai',
      api_key: 'test-openai-key',
      model: 'gpt-4',
      temperature: 0.7,
    },
    routing: {
      default_intent: 'general',
      auto_assign: true,
    },
    policies: [],
  };

  const mockEmbedding = Array(1536).fill(0).map(() => Math.random() * 0.1);
  const mockQueryEmbedding = Array(1536).fill(0).map(() => Math.random() * 0.1 + 0.5);

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigStore = {
      get: jest.fn().mockResolvedValue(mockTenantConfig),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TenantConfigStore>;

    mockOpenAI = {
      embeddings: {
        create: jest.fn(),
      },
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as unknown as jest.Mocked<OpenAI>;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

    (mockOpenAI.embeddings.create as jest.Mock).mockImplementation((params) => {
      if (Array.isArray(params.input)) {
        return Promise.resolve({
          data: params.input.map(() => ({ embedding: mockEmbedding })),
        });
      }
      return Promise.resolve({
        data: [{ embedding: mockQueryEmbedding }],
      });
    });

    (mockOpenAI.chat.completions.create as jest.Mock).mockResolvedValue({
      choices: [
        {
          message: {
            content: 'This is a generated answer based on the knowledge base.',
          },
        },
      ],
    });

    knowledgeBase = new KnowledgeBase(mockConfigStore);
  });

  it('should handle empty document array gracefully', async () => {
    await expect(
      knowledgeBase.addDocuments('tenant-1', [])
    ).resolves.not.toThrow();

    const stats = knowledgeBase.getStats('tenant-1');
    expect(stats.document_count).toBe(0);
  });

  it('should handle query on empty knowledge base', async () => {
    const result = await knowledgeBase.query({
      tenant_id: 'tenant-1',
      query: 'What is the answer?',
    });

    expect(result.answer).toContain("don't have enough information");
    expect(result.sources).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it('should handle special characters in query', async () => {
    await knowledgeBase.addDocuments('tenant-1', [
      {
        id: 'doc-1',
        content: 'Special characters: !@#$%^&*()',
      },
    ]);

    const result = await knowledgeBase.query({
      tenant_id: 'tenant-1',
      query: 'What about !@#$%^&*()?',
    });

    expect(result.answer).toBeTruthy();
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
  });

  it('should handle large document batches', async () => {
    const largeDocuments = Array.from({ length: 100 }, (_, i) => ({
      id: `doc-${i}`,
      content: `Document ${i} with unique content`,
    }));

    await expect(
      knowledgeBase.addDocuments('tenant-1', largeDocuments)
    ).resolves.not.toThrow();

    const stats = knowledgeBase.getStats('tenant-1');
    expect(stats.document_count).toBe(100);
  });

  it('should handle topK larger than document count', async () => {
    await knowledgeBase.addDocuments('tenant-1', [
      { id: 'doc-1', content: 'Document 1' },
      { id: 'doc-2', content: 'Document 2' },
    ]);

    const result = await knowledgeBase.query({
      tenant_id: 'tenant-1',
      query: 'Test query',
      top_k: 100, // Much larger than document count
    });

    // Should return only available documents, not error
    expect(result.sources.length).toBeLessThanOrEqual(2);
    expect(result.answer).toBeTruthy();
  });

  it('should maintain sorted similarity order', async () => {
    await knowledgeBase.addDocuments('tenant-1', [
      { id: 'doc-1', content: 'First document' },
      { id: 'doc-2', content: 'Second document' },
      { id: 'doc-3', content: 'Third document' },
    ]);

    const result = await knowledgeBase.query({
      tenant_id: 'tenant-1',
      query: 'Test query',
      top_k: 3,
    });

    // Sources should be ordered by similarity (descending)
    for (let i = 0; i < result.sources.length - 1; i++) {
      expect(result.sources[i]!.similarity).toBeGreaterThanOrEqual(
        result.sources[i + 1]!.similarity
      );
    }
  });

  it('should handle very long document content', async () => {
    const longContent = 'This is a very long document. '.repeat(1000); // ~30KB

    await expect(
      knowledgeBase.addDocuments('tenant-1', [
        { id: 'doc-large', content: longContent },
      ])
    ).resolves.not.toThrow();

    const result = await knowledgeBase.query({
      tenant_id: 'tenant-1',
      query: 'What is this about?',
    });

    expect(result.answer).toBeTruthy();
  });

  it('should handle metadata with various types', async () => {
    const documents = [
      {
        id: 'doc-1',
        content: 'Document with metadata',
        metadata: {
          category: 'sales',
          priority: 1,
          tags: ['important', 'urgent'],
          nested: { key: 'value' },
          nullValue: null,
        },
      },
    ];

    await expect(
      knowledgeBase.addDocuments('tenant-1', documents)
    ).resolves.not.toThrow();

    const stats = knowledgeBase.getStats('tenant-1');
    expect(stats.document_count).toBe(1);
  });

  it('should support concurrent queries for different tenants', async () => {
    // Setup tenant 1
    await knowledgeBase.addDocuments('tenant-1', [
      { id: 'doc-1', content: 'Tenant 1 document' },
    ]);

    // Setup tenant 2
    mockConfigStore.get.mockResolvedValueOnce(mockTenantConfig);
    await knowledgeBase.addDocuments('tenant-2', [
      { id: 'doc-2', content: 'Tenant 2 document' },
    ]);

    // Query both concurrently
    const results = await Promise.all([
      knowledgeBase.query({
        tenant_id: 'tenant-1',
        query: 'Query 1',
      }),
      knowledgeBase.query({
        tenant_id: 'tenant-2',
        query: 'Query 2',
      }),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]!.answer).toBeTruthy();
    expect(results[1]!.answer).toBeTruthy();
  });

  it('should maintain separate stats for different tenants', async () => {
    await knowledgeBase.addDocuments('tenant-1', [
      { id: 'doc-1', content: 'T1 Doc' },
      { id: 'doc-2', content: 'T1 Doc' },
    ]);

    mockConfigStore.get.mockResolvedValueOnce(mockTenantConfig);
    await knowledgeBase.addDocuments('tenant-2', [
      { id: 'doc-3', content: 'T2 Doc' },
    ]);

    const stats1 = knowledgeBase.getStats('tenant-1');
    const stats2 = knowledgeBase.getStats('tenant-2');

    expect(stats1.document_count).toBe(2);
    expect(stats2.document_count).toBe(1);
  });
});
