import OpenAI from 'openai';
import { TenantId } from '../../config/types';
import { TenantConfigStore } from '../../config/tenant';
import { logger } from '../../utils/logger';
import { AylasError, ErrorCode } from '../../utils/errors';
import { VectorStore, VectorDocument, SearchResult } from './vector-store';
import { getKBConfig, formatPrompt, getDomainPrompt } from './prompts';

/**
 * Knowledge base query request
 */
export interface KBQueryRequest {
  tenant_id: TenantId;
  query: string;
  context?: string; // conversation history
  top_k?: number; // default 3
  domain?: string; // sales, support, appointment, general
}

/**
 * Knowledge base query result
 */
export interface KBQueryResult {
  answer: string;
  sources: Array<{
    document: string;
    similarity: number;
  }>;
  confidence: number;
}

/**
 * RAG (Retrieval-Augmented Generation) engine for knowledge base queries
 */
export class KnowledgeBase {
  private vectorStores: Map<TenantId, VectorStore> = new Map();
  private llmClients: Map<TenantId, OpenAI> = new Map();

  constructor(private configStore: TenantConfigStore) {}

  /**
   * Get or create vector store for tenant
   */
  private getVectorStore(tenantId: TenantId): VectorStore {
    let store = this.vectorStores.get(tenantId);

    if (!store) {
      store = new VectorStore();
      this.vectorStores.set(tenantId, store);
      logger.info('Created vector store for tenant', { tenant_id: tenantId });
    }

    return store;
  }

  /**
   * Get or create OpenAI client for tenant
   */
  private async getLLMClient(tenantId: TenantId): Promise<OpenAI> {
    let client = this.llmClients.get(tenantId);

    if (!client) {
      const config = await this.configStore.get(tenantId);

      if (config.llm.provider !== 'openai') {
        throw new AylasError(
          ErrorCode.LLM_API_FAILED,
          `Unsupported LLM provider: ${config.llm.provider}`,
          { tenant_id: tenantId, provider: config.llm.provider }
        );
      }

      client = new OpenAI({
        apiKey: config.llm.api_key,
      });

      this.llmClients.set(tenantId, client);
      logger.info('Created LLM client for tenant', { tenant_id: tenantId });
    }

    return client;
  }

  /**
   * Add documents to knowledge base
   */
  async addDocuments(
    tenantId: TenantId,
    documents: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    const client = await this.getLLMClient(tenantId);
    const vectorStore = this.getVectorStore(tenantId);

    logger.info('Adding documents to knowledge base', {
      tenant_id: tenantId,
      count: documents.length,
    });

    // Generate embeddings in batch
    const texts = documents.map((doc) => doc.content);
    const embeddings = await this.generateEmbeddings(client, texts);

    // Add to vector store
    const vectorDocs: VectorDocument[] = documents.map((doc, index) => {
      const embedding = embeddings[index];
      if (!embedding) {
        throw new AylasError(
          ErrorCode.LLM_API_FAILED,
          'Missing embedding for document',
          { document_id: doc.id }
        );
      }
      return {
        id: doc.id,
        content: doc.content,
        embedding,
        metadata: doc.metadata || {},
      };
    });

    vectorStore.addBatch(vectorDocs);

    logger.info('Documents added to knowledge base', {
      tenant_id: tenantId,
      count: vectorDocs.length,
    });
  }

  /**
   * Query knowledge base with RAG
   */
  async query(request: KBQueryRequest): Promise<KBQueryResult> {
    const { tenant_id, query, context, top_k = 3, domain = 'general' } = request;

    logger.info('Knowledge base query', {
      tenant_id,
      query,
      top_k,
      domain,
    });

    const client = await this.getLLMClient(tenant_id);
    const vectorStore = this.getVectorStore(tenant_id);
    const kbConfig = getKBConfig(tenant_id);

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(client, query);

    // Search similar documents
    const searchResults = vectorStore.search(queryEmbedding, top_k);

    // Filter by minimum confidence
    const filteredResults = searchResults.filter(
      (result) => result.similarity >= kbConfig.min_confidence
    );

    logger.debug('Search results', {
      tenant_id,
      total_results: searchResults.length,
      filtered_results: filteredResults.length,
      min_confidence: kbConfig.min_confidence,
    });

    // No relevant documents found
    if (filteredResults.length === 0) {
      return {
        answer: "I don't have enough information to answer that question.",
        sources: [],
        confidence: 0,
      };
    }

    // Build context from search results
    const contextText = this.buildContext(filteredResults, context);

    // Get domain-specific prompt
    const systemPrompt = getDomainPrompt(domain);
    const prompt = formatPrompt(systemPrompt, contextText, query);

    // Generate answer with LLM
    const answer = await this.generateAnswer(client, prompt, kbConfig.temperature);

    // Calculate average confidence
    const avgConfidence =
      filteredResults.reduce((sum, r) => sum + r.similarity, 0) / filteredResults.length;

    const result: KBQueryResult = {
      answer,
      sources: filteredResults.map((r) => ({
        document: r.document.content,
        similarity: r.similarity,
      })),
      confidence: avgConfidence,
    };

    logger.info('Knowledge base query completed', {
      tenant_id,
      answer_length: answer.length,
      sources_count: result.sources.length,
      confidence: result.confidence,
    });

    return result;
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(client: OpenAI, text: string): Promise<number[]> {
    try {
      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from API');
      }

      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AylasError(
        ErrorCode.LLM_API_FAILED,
        'Failed to generate embedding',
        { error: String(error) }
      );
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  private async generateEmbeddings(client: OpenAI, texts: string[]): Promise<number[][]> {
    try {
      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      logger.error('Failed to generate embeddings', {
        count: texts.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AylasError(
        ErrorCode.LLM_API_FAILED,
        'Failed to generate embeddings',
        { error: String(error), count: texts.length }
      );
    }
  }

  /**
   * Generate answer using LLM
   */
  private async generateAnswer(
    client: OpenAI,
    prompt: string,
    temperature: number
  ): Promise<string> {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature,
        max_tokens: 500,
      });

      const answer = response.choices[0]?.message?.content || '';

      if (!answer) {
        throw new Error('Empty response from LLM');
      }

      return answer;
    } catch (error) {
      logger.error('Failed to generate answer', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AylasError(
        ErrorCode.LLM_API_FAILED,
        'Failed to generate answer',
        { error: String(error) }
      );
    }
  }

  /**
   * Build context text from search results
   */
  private buildContext(results: SearchResult[], conversationContext?: string): string {
    const documents = results.map((r, index) => {
      return `[Source ${index + 1}] (Relevance: ${(r.similarity * 100).toFixed(1)}%)\n${r.document.content}`;
    }).join('\n\n');

    if (conversationContext) {
      return `Previous conversation:\n${conversationContext}\n\nRelevant knowledge base articles:\n${documents}`;
    }

    return documents;
  }

  /**
   * Clear knowledge base for tenant
   */
  clearKnowledgeBase(tenantId: TenantId): void {
    const vectorStore = this.vectorStores.get(tenantId);
    if (vectorStore) {
      vectorStore.clear();
      logger.info('Cleared knowledge base', { tenant_id: tenantId });
    }
  }

  /**
   * Get knowledge base statistics
   */
  getStats(tenantId: TenantId): { document_count: number } {
    const vectorStore = this.vectorStores.get(tenantId);
    return {
      document_count: vectorStore?.size() || 0,
    };
  }
}
