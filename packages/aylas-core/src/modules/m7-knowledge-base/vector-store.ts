import { logger } from '../../utils/logger';

/**
 * Document with embedding vector
 */
export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  document: VectorDocument;
  similarity: number;
}

/**
 * In-memory vector store with cosine similarity search
 */
export class VectorStore {
  private documents: Map<string, VectorDocument> = new Map();

  /**
   * Add document with embedding to the store
   */
  add(document: VectorDocument): void {
    this.documents.set(document.id, document);
    logger.debug('Added document to vector store', {
      id: document.id,
      content_length: document.content.length,
      embedding_dim: document.embedding.length,
    });
  }

  /**
   * Add multiple documents in batch
   */
  addBatch(documents: VectorDocument[]): void {
    for (const doc of documents) {
      this.add(doc);
    }
    logger.info('Added batch to vector store', { count: documents.length });
  }

  /**
   * Search documents by embedding similarity
   */
  search(queryEmbedding: number[], topK: number = 3): SearchResult[] {
    const results: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
      results.push({
        document: doc,
        similarity,
      });
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    const topResults = results.slice(0, topK);

    logger.debug('Vector search completed', {
      total_documents: this.documents.size,
      top_k: topK,
      results: topResults.map((r) => ({
        id: r.document.id,
        similarity: r.similarity,
      })),
    });

    return topResults;
  }

  /**
   * Get document by ID
   */
  get(id: string): VectorDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Remove document by ID
   */
  remove(id: string): boolean {
    const deleted = this.documents.delete(id);
    if (deleted) {
      logger.debug('Removed document from vector store', { id });
    }
    return deleted;
  }

  /**
   * Clear all documents
   */
  clear(): void {
    const count = this.documents.size;
    this.documents.clear();
    logger.info('Cleared vector store', { documents_removed: count });
  }

  /**
   * Get total document count
   */
  size(): number {
    return this.documents.size;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error(
        `Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`
      );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i];
      const b = vecB[i];
      if (a !== undefined && b !== undefined) {
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
      }
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Normalize vector to unit length
   */
  static normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) {
      return vector;
    }
    return vector.map((val) => val / norm);
  }
}
