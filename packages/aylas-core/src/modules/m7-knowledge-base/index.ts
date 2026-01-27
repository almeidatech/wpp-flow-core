/**
 * M7: Knowledge Base / RAG Module
 *
 * Provides Retrieval-Augmented Generation (RAG) capabilities:
 * - Vector-based semantic search
 * - Multi-tenant knowledge bases
 * - LLM-augmented responses
 * - Confidence scoring
 * - Domain-specific prompts
 */

export {
  KnowledgeBase,
  type KBQueryRequest,
  type KBQueryResult,
} from './knowledge-base';

export {
  VectorStore,
  type VectorDocument,
  type SearchResult,
} from './vector-store';

export {
  getKBConfig,
  setKBConfig,
  formatPrompt,
  getDomainPrompt,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_KB_CONFIG,
  DOMAIN_PROMPTS,
  type KBConfig,
} from './prompts';
