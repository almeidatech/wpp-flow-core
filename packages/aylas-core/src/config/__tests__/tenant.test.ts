import { TenantConfigStore } from '../tenant';
import { TenantConfig, ErrorCode } from '../types';
import { AylasError } from '../../utils/errors';

describe('TenantConfigStore', () => {
  let store: TenantConfigStore;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Constructor and Environment Loading', () => {
    it('should load default tenant from environment on initialization', () => {
      process.env.TENANT_ID = 'test_tenant';
      process.env.TENANT_NAME = 'Test Company';
      store = new TenantConfigStore();

      expect(store).toBeDefined();
    });

    it('should use default tenant_id if TENANT_ID not set', () => {
      delete process.env.TENANT_ID;
      store = new TenantConfigStore();

      // Should initialize without error and use 'default'
      expect(store).toBeDefined();
    });

    it('should use default tenant_name if TENANT_NAME not set', async () => {
      delete process.env.TENANT_NAME;
      store = new TenantConfigStore();

      const config = await store.get('default');
      expect(config.name).toBe('Default Tenant');
    });

    it('should set chatwoot config from environment variables', async () => {
      process.env.CHATWOOT_ACCOUNT_ID = '123';
      process.env.CHATWOOT_BASE_URL = 'https://custom.chatwoot.com';
      process.env.CHATWOOT_API_TOKEN = 'test_token_123';

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.chatwoot.account_id).toBe(123);
      expect(config.chatwoot.api_url).toBe('https://custom.chatwoot.com');
      expect(config.chatwoot.api_token).toBe('test_token_123');
    });

    it('should use default chatwoot values if env vars not set', async () => {
      delete process.env.CHATWOOT_ACCOUNT_ID;
      delete process.env.CHATWOOT_BASE_URL;
      delete process.env.CHATWOOT_API_TOKEN;

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.chatwoot.account_id).toBe(0);
      expect(config.chatwoot.api_url).toBe('https://app.chatwoot.com');
      expect(config.chatwoot.api_token).toBe('');
    });

    it('should set baserow config from environment variables', async () => {
      process.env.BASEROW_API_URL = 'https://custom.baserow.io';
      process.env.BASEROW_API_TOKEN = 'baserow_token_456';
      process.env.BASEROW_TABLE_CONTACTS = '789';
      process.env.BASEROW_TABLE_EVENTS = '790';

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.baserow.api_url).toBe('https://custom.baserow.io');
      expect(config.baserow.api_token).toBe('baserow_token_456');
      expect(config.baserow.tables.contacts).toBe(789);
      expect(config.baserow.tables.events).toBe(790);
    });

    it('should use default baserow values if env vars not set', async () => {
      delete process.env.BASEROW_API_URL;
      delete process.env.BASEROW_API_TOKEN;
      delete process.env.BASEROW_TABLE_CONTACTS;
      delete process.env.BASEROW_TABLE_EVENTS;

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.baserow.api_url).toBe('https://api.baserow.io');
      expect(config.baserow.api_token).toBe('');
      expect(config.baserow.tables.contacts).toBe(0);
      expect(config.baserow.tables.events).toBe(0);
    });

    it('should set optional knowledge base table id', async () => {
      process.env.BASEROW_TABLE_KB = '999';

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.baserow.tables.knowledge_base).toBe(999);
    });

    it('should not set knowledge_base if BASEROW_TABLE_KB not provided', async () => {
      delete process.env.BASEROW_TABLE_KB;

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.baserow.tables.knowledge_base).toBeUndefined();
    });

    it('should set llm config from environment variables', async () => {
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'claude_key_789';
      process.env.LLM_MODEL = 'claude-3-opus';
      process.env.LLM_TEMPERATURE = '0.5';

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.llm.provider).toBe('anthropic');
      expect(config.llm.api_key).toBe('claude_key_789');
      expect(config.llm.model).toBe('claude-3-opus');
      expect(config.llm.temperature).toBe(0.5);
    });

    it('should prefer OPENAI_API_KEY over ANTHROPIC_API_KEY', async () => {
      process.env.OPENAI_API_KEY = 'openai_key';
      process.env.ANTHROPIC_API_KEY = 'anthropic_key';

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.llm.api_key).toBe('openai_key');
    });

    it('should use default llm provider if not set', async () => {
      delete process.env.LLM_PROVIDER;
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.llm.provider).toBe('openai');
    });

    it('should use default llm model if not set', async () => {
      delete process.env.LLM_MODEL;
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.llm.model).toBe('gpt-4o-mini');
    });

    it('should use default temperature (0.7) if not set', async () => {
      delete process.env.LLM_TEMPERATURE;
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.llm.temperature).toBe(0.7);
    });

    it('should parse temperature as float', async () => {
      process.env.LLM_TEMPERATURE = '0.95';
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.llm.temperature).toBe(0.95);
      expect(typeof config.llm.temperature).toBe('number');
    });

    it('should set routing config from environment variables', async () => {
      process.env.DEFAULT_INTENT = 'sales';
      process.env.AUTO_ASSIGN = 'true';

      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.routing.default_intent).toBe('sales');
      expect(config.routing.auto_assign).toBe(true);
    });

    it('should use default intent (general) if not set', async () => {
      delete process.env.DEFAULT_INTENT;
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.routing.default_intent).toBe('general');
    });

    it('should parse AUTO_ASSIGN as boolean', async () => {
      process.env.AUTO_ASSIGN = 'false';
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.routing.auto_assign).toBe(false);
    });

    it('should default AUTO_ASSIGN to false if not set', async () => {
      delete process.env.AUTO_ASSIGN;
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.routing.auto_assign).toBe(false);
    });

    it('should initialize with empty policies', async () => {
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(config.policies).toEqual([]);
      expect(Array.isArray(config.policies)).toBe(true);
    });

    it('should handle non-numeric account_id gracefully', async () => {
      process.env.CHATWOOT_ACCOUNT_ID = 'invalid';
      store = new TenantConfigStore();
      const config = await store.get('default');

      // parseInt('invalid') returns NaN, which should be handled
      expect(isNaN(config.chatwoot.account_id)).toBe(true);
    });

    it('should handle non-numeric baserow tables gracefully', async () => {
      process.env.BASEROW_TABLE_CONTACTS = 'not_a_number';
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(isNaN(config.baserow.tables.contacts)).toBe(true);
    });

    it('should handle non-numeric temperature gracefully', async () => {
      process.env.LLM_TEMPERATURE = 'invalid_temp';
      store = new TenantConfigStore();
      const config = await store.get('default');

      expect(isNaN(config.llm.temperature)).toBe(true);
    });
  });

  describe('get()', () => {
    beforeEach(() => {
      process.env.TENANT_ID = 'test_tenant';
      store = new TenantConfigStore();
    });

    it('should return config for existing tenant', async () => {
      const config = await store.get('test_tenant');

      expect(config).toBeDefined();
      expect(config.id).toBe('test_tenant');
    });

    it('should throw INVALID_TENANT error for non-existent tenant', async () => {
      await expect(store.get('non_existent_tenant')).rejects.toThrow(AylasError);

      try {
        await store.get('non_existent_tenant');
      } catch (err) {
        if (err instanceof AylasError) {
          expect(err.code).toBe(ErrorCode.INVALID_TENANT);
        }
      }
    });

    it('should return complete config structure', async () => {
      const config = await store.get('test_tenant');

      expect(config).toHaveProperty('id');
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('chatwoot');
      expect(config).toHaveProperty('baserow');
      expect(config).toHaveProperty('llm');
      expect(config).toHaveProperty('routing');
      expect(config).toHaveProperty('policies');
    });

    it('should be callable multiple times with same result', async () => {
      const results = await Promise.all([
        store.get('test_tenant'),
        store.get('test_tenant'),
        store.get('test_tenant'),
      ]);

      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    });
  });

  describe('set()', () => {
    beforeEach(() => {
      process.env.TENANT_ID = 'default';
      store = new TenantConfigStore();
    });

    it('should store a new tenant config', async () => {
      const newConfig: TenantConfig = {
        id: 'new_tenant',
        name: 'New Company',
        chatwoot: {
          account_id: 456,
          api_url: 'https://new.chatwoot.com',
          api_token: 'new_token',
        },
        baserow: {
          api_url: 'https://new.baserow.io',
          api_token: 'new_baserow_token',
          tables: { contacts: 100, events: 101 },
        },
        llm: {
          provider: 'anthropic',
          api_key: 'new_llm_key',
          model: 'claude-3',
          temperature: 0.3,
        },
        routing: {
          default_intent: 'support',
          auto_assign: true,
        },
        policies: [],
      };

      await store.set(newConfig);
      const retrieved = await store.get('new_tenant');

      expect(retrieved).toEqual(newConfig);
    });

    it('should overwrite existing tenant config', async () => {
      const originalConfig = await store.get('default');

      const updatedConfig: TenantConfig = {
        ...originalConfig,
        name: 'Updated Name',
        chatwoot: { ...originalConfig.chatwoot, api_token: 'updated_token' },
      };

      await store.set(updatedConfig);
      const retrieved = await store.get('default');

      expect(retrieved.name).toBe('Updated Name');
      expect(retrieved.chatwoot.api_token).toBe('updated_token');
    });

    it('should handle setting multiple tenants', async () => {
      const tenant1: TenantConfig = {
        id: 'tenant_1',
        name: 'Company 1',
        chatwoot: {
          account_id: 1,
          api_url: 'https://c1.chatwoot.com',
          api_token: 'token_1',
        },
        baserow: {
          api_url: 'https://baserow.io',
          api_token: 'br_token_1',
          tables: { contacts: 10, events: 11 },
        },
        llm: {
          provider: 'openai',
          api_key: 'key_1',
          model: 'gpt-4',
          temperature: 0.5,
        },
        routing: { default_intent: 'sales', auto_assign: false },
        policies: [],
      };

      const tenant2: TenantConfig = {
        id: 'tenant_2',
        name: 'Company 2',
        chatwoot: {
          account_id: 2,
          api_url: 'https://c2.chatwoot.com',
          api_token: 'token_2',
        },
        baserow: {
          api_url: 'https://baserow.io',
          api_token: 'br_token_2',
          tables: { contacts: 20, events: 21 },
        },
        llm: {
          provider: 'anthropic',
          api_key: 'key_2',
          model: 'claude-3',
          temperature: 0.7,
        },
        routing: { default_intent: 'support', auto_assign: true },
        policies: [],
      };

      await store.set(tenant1);
      await store.set(tenant2);

      const retrieved1 = await store.get('tenant_1');
      const retrieved2 = await store.get('tenant_2');

      expect(retrieved1.name).toBe('Company 1');
      expect(retrieved2.name).toBe('Company 2');
      expect(retrieved1.chatwoot.api_token).toBe('token_1');
      expect(retrieved2.chatwoot.api_token).toBe('token_2');
    });

    it('should preserve all config fields when setting', async () => {
      const testConfig: TenantConfig = {
        id: 'test_id',
        name: 'Test',
        chatwoot: { account_id: 123, api_url: 'url', api_token: 'token' },
        baserow: { api_url: 'url', api_token: 'token', tables: { contacts: 1, events: 2 } },
        llm: { provider: 'openai', api_key: 'key', model: 'model', temperature: 0.5 },
        routing: { default_intent: 'general', auto_assign: false },
        policies: [],
      };

      await store.set(testConfig);
      const retrieved = await store.get('test_id');

      expect(retrieved.id).toBe(testConfig.id);
      expect(retrieved.name).toBe(testConfig.name);
      expect(retrieved.chatwoot).toEqual(testConfig.chatwoot);
      expect(retrieved.baserow).toEqual(testConfig.baserow);
      expect(retrieved.llm).toEqual(testConfig.llm);
      expect(retrieved.routing).toEqual(testConfig.routing);
      expect(retrieved.policies).toEqual(testConfig.policies);
    });
  });

  describe('list()', () => {
    beforeEach(() => {
      process.env.TENANT_ID = 'default';
      store = new TenantConfigStore();
    });

    it('should return array of all tenant configs', async () => {
      const configs = await store.list();

      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBeGreaterThanOrEqual(1);
    });

    it('should include default tenant in list', async () => {
      const configs = await store.list();
      const hasDefault = configs.some((c) => c.id === 'default');

      expect(hasDefault).toBe(true);
    });

    it('should return all stored tenants', async () => {
      const tenant1: TenantConfig = {
        id: 'company_1',
        name: 'Company 1',
        chatwoot: { account_id: 1, api_url: 'url', api_token: 'token' },
        baserow: { api_url: 'url', api_token: 'token', tables: { contacts: 1, events: 2 } },
        llm: { provider: 'openai', api_key: 'key', model: 'model', temperature: 0.5 },
        routing: { default_intent: 'general', auto_assign: false },
        policies: [],
      };

      const tenant2: TenantConfig = {
        id: 'company_2',
        name: 'Company 2',
        chatwoot: { account_id: 2, api_url: 'url', api_token: 'token' },
        baserow: { api_url: 'url', api_token: 'token', tables: { contacts: 3, events: 4 } },
        llm: { provider: 'anthropic', api_key: 'key', model: 'model', temperature: 0.7 },
        routing: { default_intent: 'support', auto_assign: true },
        policies: [],
      };

      await store.set(tenant1);
      await store.set(tenant2);

      const configs = await store.list();

      expect(configs.length).toBeGreaterThanOrEqual(3); // default + 2 new
      expect(configs.some((c) => c.id === 'company_1')).toBe(true);
      expect(configs.some((c) => c.id === 'company_2')).toBe(true);
    });

    it('should return empty-looking list if only default exists', async () => {
      const configs = await store.list();

      expect(configs.length).toBeGreaterThanOrEqual(1);
      expect(configs[0]?.id).toBe('default');
    });

    it('should be callable multiple times with same result', async () => {
      const result1 = await store.list();
      const result2 = await store.list();

      expect(result1.length).toBe(result2.length);
      expect(result1).toEqual(result2);
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      process.env.TENANT_ID = 'test_multi';
      store = new TenantConfigStore();
    });

    it('should support complete CRUD workflow', async () => {
      // Create
      const newConfig: TenantConfig = {
        id: 'workflow_test',
        name: 'Workflow Test',
        chatwoot: { account_id: 999, api_url: 'https://test.com', api_token: 'token_999' },
        baserow: { api_url: 'https://baserow.com', api_token: 'br_999', tables: { contacts: 50, events: 51 } },
        llm: { provider: 'openai', api_key: 'key_999', model: 'gpt-4', temperature: 0.6 },
        routing: { default_intent: 'sales', auto_assign: true },
        policies: [],
      };

      await store.set(newConfig);

      // Read
      const retrieved = await store.get('workflow_test');
      expect(retrieved.name).toBe('Workflow Test');

      // Update
      const updated: TenantConfig = {
        ...retrieved,
        name: 'Updated Workflow Test',
      };
      await store.set(updated);

      // Verify update
      const verified = await store.get('workflow_test');
      expect(verified.name).toBe('Updated Workflow Test');

      // List
      const allConfigs = await store.list();
      expect(allConfigs.some((c) => c.id === 'workflow_test')).toBe(true);
    });

    it('should handle concurrent operations', async () => {
      const operations = [];

      for (let i = 0; i < 5; i++) {
        const config: TenantConfig = {
          id: `concurrent_${i}`,
          name: `Concurrent ${i}`,
          chatwoot: { account_id: i, api_url: 'url', api_token: 'token' },
          baserow: { api_url: 'url', api_token: 'token', tables: { contacts: i, events: i + 1 } },
          llm: { provider: 'openai', api_key: 'key', model: 'model', temperature: 0.5 },
          routing: { default_intent: 'general', auto_assign: false },
          policies: [],
        };

        operations.push(store.set(config));
        operations.push(store.get(`concurrent_${i}`));
      }

      const results = await Promise.all(operations);
      expect(results.length).toBe(10); // 5 sets + 5 gets
    });

    it('should maintain config integrity through multiple operations', async () => {
      const originalConfig: TenantConfig = {
        id: 'integrity_test',
        name: 'Integrity Test',
        chatwoot: { account_id: 777, api_url: 'https://integrity.com', api_token: 'integ_token' },
        baserow: {
          api_url: 'https://baserow.io',
          api_token: 'integ_br',
          tables: { contacts: 77, events: 78, knowledge_base: 79 },
        },
        llm: { provider: 'anthropic', api_key: 'integ_key', model: 'claude-3', temperature: 0.9 },
        routing: { default_intent: 'support', auto_assign: true },
        policies: [{ event_type: 'test', actions: [] }],
      };

      await store.set(originalConfig);

      // Perform multiple reads
      const retrieved1 = await store.get('integrity_test');
      const retrieved2 = await store.get('integrity_test');

      // Verify data integrity
      expect(retrieved1).toEqual(originalConfig);
      expect(retrieved2).toEqual(originalConfig);
      expect(retrieved1).toEqual(retrieved2);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      store = new TenantConfigStore();
    });

    it('should handle tenant_id with special characters', async () => {
      const specialId = 'tenant-123_special.id';
      const config: TenantConfig = {
        id: specialId,
        name: 'Special',
        chatwoot: { account_id: 1, api_url: 'url', api_token: 'token' },
        baserow: { api_url: 'url', api_token: 'token', tables: { contacts: 1, events: 2 } },
        llm: { provider: 'openai', api_key: 'key', model: 'model', temperature: 0.5 },
        routing: { default_intent: 'general', auto_assign: false },
        policies: [],
      };

      await store.set(config);
      const retrieved = await store.get(specialId);

      expect(retrieved.id).toBe(specialId);
    });

    it('should handle very long tenant names', async () => {
      const longName = 'A'.repeat(1000);
      const config: TenantConfig = {
        id: 'long_name_test',
        name: longName,
        chatwoot: { account_id: 1, api_url: 'url', api_token: 'token' },
        baserow: { api_url: 'url', api_token: 'token', tables: { contacts: 1, events: 2 } },
        llm: { provider: 'openai', api_key: 'key', model: 'model', temperature: 0.5 },
        routing: { default_intent: 'general', auto_assign: false },
        policies: [],
      };

      await store.set(config);
      const retrieved = await store.get('long_name_test');

      expect(retrieved.name.length).toBe(1000);
    });

    it('should handle empty policies array', async () => {
      const config: TenantConfig = {
        id: 'empty_policies',
        name: 'Empty Policies',
        chatwoot: { account_id: 1, api_url: 'url', api_token: 'token' },
        baserow: { api_url: 'url', api_token: 'token', tables: { contacts: 1, events: 2 } },
        llm: { provider: 'openai', api_key: 'key', model: 'model', temperature: 0.5 },
        routing: { default_intent: 'general', auto_assign: false },
        policies: [],
      };

      await store.set(config);
      const retrieved = await store.get('empty_policies');

      expect(retrieved.policies).toEqual([]);
    });

    it('should handle extreme temperature values', async () => {
      const config: TenantConfig = {
        id: 'extreme_temp',
        name: 'Extreme',
        chatwoot: { account_id: 1, api_url: 'url', api_token: 'token' },
        baserow: { api_url: 'url', api_token: 'token', tables: { contacts: 1, events: 2 } },
        llm: { provider: 'openai', api_key: 'key', model: 'model', temperature: 999.99 },
        routing: { default_intent: 'general', auto_assign: false },
        policies: [],
      };

      await store.set(config);
      const retrieved = await store.get('extreme_temp');

      expect(retrieved.llm.temperature).toBe(999.99);
    });

    it('should handle zero as account_id', async () => {
      const config: TenantConfig = {
        id: 'zero_account',
        name: 'Zero',
        chatwoot: { account_id: 0, api_url: 'url', api_token: 'token' },
        baserow: { api_url: 'url', api_token: 'token', tables: { contacts: 0, events: 0 } },
        llm: { provider: 'openai', api_key: 'key', model: 'model', temperature: 0 },
        routing: { default_intent: 'general', auto_assign: false },
        policies: [],
      };

      await store.set(config);
      const retrieved = await store.get('zero_account');

      expect(retrieved.chatwoot.account_id).toBe(0);
      expect(retrieved.llm.temperature).toBe(0);
    });
  });
});
