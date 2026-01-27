import { TenantId } from '../../config/types';

/**
 * Knowledge base configuration per tenant
 */
export interface KBConfig {
  system_prompt: string;
  max_sources: number;
  temperature: number;
  min_confidence: number;
}

/**
 * Default configurations per tenant
 */
const DEFAULT_CONFIGS: Map<TenantId, KBConfig> = new Map();

/**
 * Default system prompt template
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful customer support assistant. Use the provided context from our knowledge base to answer customer questions accurately and concisely.

Guidelines:
- Only answer based on the provided context
- If the context doesn't contain the answer, say "I don't have that information"
- Be friendly and professional
- Keep responses clear and concise
- Cite sources when possible

Context:
{context}

Question: {query}

Answer:`;

/**
 * Default configuration values
 */
export const DEFAULT_KB_CONFIG: KBConfig = {
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  max_sources: 3,
  temperature: 0.3,
  min_confidence: 0.5,
};

/**
 * Get KB configuration for tenant
 */
export function getKBConfig(tenantId: TenantId): KBConfig {
  return DEFAULT_CONFIGS.get(tenantId) || DEFAULT_KB_CONFIG;
}

/**
 * Set KB configuration for tenant
 */
export function setKBConfig(tenantId: TenantId, config: Partial<KBConfig>): void {
  const existingConfig = getKBConfig(tenantId);
  DEFAULT_CONFIGS.set(tenantId, {
    ...existingConfig,
    ...config,
  });
}

/**
 * Format system prompt with context and query
 */
export function formatPrompt(
  template: string,
  context: string,
  query: string
): string {
  return template
    .replace('{context}', context)
    .replace('{query}', query);
}

/**
 * Domain-specific system prompts
 */
export const DOMAIN_PROMPTS: Record<string, string> = {
  sales: `You are a sales assistant helping customers with product inquiries and purchases. Use the knowledge base to provide accurate product information, pricing, and availability.

Context:
{context}

Customer inquiry: {query}

Sales response:`,

  support: `You are a technical support specialist. Help customers troubleshoot issues using the knowledge base. Provide step-by-step solutions when possible.

Context:
{context}

Support ticket: {query}

Technical response:`,

  appointment: `You are a scheduling assistant helping customers book appointments. Use the knowledge base to check availability and booking policies.

Context:
{context}

Booking request: {query}

Scheduling response:`,

  general: DEFAULT_SYSTEM_PROMPT,
};

/**
 * Get domain-specific prompt
 */
export function getDomainPrompt(domain: string): string {
  return DOMAIN_PROMPTS[domain] || DEFAULT_SYSTEM_PROMPT;
}
