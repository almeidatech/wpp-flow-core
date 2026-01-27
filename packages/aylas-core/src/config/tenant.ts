import { TenantConfig, TenantId } from './types';
import { AylasError, ErrorCode } from '../utils/errors';

export class TenantConfigStore {
  private configs: Map<TenantId, TenantConfig> = new Map();

  constructor() {
    this.loadFromEnv();
  }

  private loadFromEnv(): void {
    const tenantId = process.env.TENANT_ID || 'default';
    const config: TenantConfig = {
      id: tenantId,
      name: process.env.TENANT_NAME || 'Default Tenant',
      chatwoot: {
        account_id: parseInt(process.env.CHATWOOT_ACCOUNT_ID || '0', 10),
        api_url: process.env.CHATWOOT_BASE_URL || 'https://app.chatwoot.com',
        api_token: process.env.CHATWOOT_API_TOKEN || '',
      },
      baserow: {
        api_url: process.env.BASEROW_API_URL || 'https://api.baserow.io',
        api_token: process.env.BASEROW_API_TOKEN || '',
        tables: {
          contacts: parseInt(process.env.BASEROW_TABLE_CONTACTS || '0', 10),
          events: parseInt(process.env.BASEROW_TABLE_EVENTS || '0', 10),
          knowledge_base: process.env.BASEROW_TABLE_KB
            ? parseInt(process.env.BASEROW_TABLE_KB, 10)
            : undefined,
        },
      },
      llm: {
        provider: (process.env.LLM_PROVIDER || 'openai') as 'openai' | 'anthropic',
        api_key: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      },
      routing: {
        default_intent: (process.env.DEFAULT_INTENT || 'general') as 'sales' | 'support' | 'appointment' | 'general',
        auto_assign: process.env.AUTO_ASSIGN === 'true',
      },
      policies: [],
    };

    this.configs.set(tenantId, config);
  }

  async get(tenant_id: TenantId): Promise<TenantConfig> {
    const config = this.configs.get(tenant_id);
    if (!config) {
      throw new AylasError(ErrorCode.INVALID_TENANT, `Tenant not found: ${tenant_id}`);
    }
    return config;
  }

  async set(config: TenantConfig): Promise<void> {
    this.configs.set(config.id, config);
  }

  async list(): Promise<TenantConfig[]> {
    return Array.from(this.configs.values());
  }
}

export const tenantConfigStore = new TenantConfigStore();
