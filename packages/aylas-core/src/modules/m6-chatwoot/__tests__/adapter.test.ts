import { ChatwootAdapter, ExecutionPlan, ChatwootSyncRequest } from '../adapter';
import { ChatwootClient } from '../chatwoot-client';
import { TenantConfigStore } from '../../../config/tenant';
import { TenantConfig, PolicyAction } from '../../../config/types';

// Mock dependencies
jest.mock('../chatwoot-client');
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ChatwootAdapter', () => {
  let adapter: ChatwootAdapter;
  let mockConfigStore: jest.Mocked<TenantConfigStore>;
  let mockClient: jest.Mocked<ChatwootClient>;

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
      api_key: 'openai-key',
      model: 'gpt-4',
      temperature: 0.7,
    },
    routing: {
      default_intent: 'general',
      auto_assign: true,
    },
    policies: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock config store
    mockConfigStore = {
      get: jest.fn().mockResolvedValue(mockTenantConfig),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TenantConfigStore>;

    // Mock Chatwoot client
    mockClient = {
      sendMessage: jest.fn().mockResolvedValue({
        id: 1,
        content: 'Test message',
        message_type: 1,
        created_at: Date.now(),
        conversation_id: 456,
      }),
      updateConversation: jest.fn().mockResolvedValue({
        id: 456,
        status: 'open',
        labels: [],
        custom_attributes: {},
      }),
      addLabels: jest.fn().mockResolvedValue({
        id: 456,
        status: 'open',
        labels: ['urgent'],
        custom_attributes: {},
      }),
      removeLabels: jest.fn().mockResolvedValue(undefined),
      getConversation: jest.fn().mockResolvedValue({
        id: 456,
        status: 'open',
        labels: [],
        custom_attributes: {},
      }),
    } as unknown as jest.Mocked<ChatwootClient>;

    (ChatwootClient as jest.MockedClass<typeof ChatwootClient>).mockImplementation(
      () => mockClient
    );

    adapter = new ChatwootAdapter(mockConfigStore);
  });

  describe('sync', () => {
    it('should send messages successfully', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'Hello, customer!',
          },
        },
        labels: {
          add: [],
          remove: [],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.messages_sent).toBe(1);
      expect(result.labels_updated).toBe(0);
      expect(result.attributes_updated).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockClient.sendMessage).toHaveBeenCalledWith({
        conversation_id: 456,
        content: 'Hello, customer!',
        message_type: 1,
        private: false,
      });
    });

    it('should add labels successfully', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: {
          add: ['urgent', 'vip'],
          remove: [],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.messages_sent).toBe(0);
      expect(result.labels_updated).toBe(2);
      expect(result.attributes_updated).toBe(0);
      expect(mockClient.addLabels).toHaveBeenCalledWith({
        conversation_id: 456,
        labels: ['urgent', 'vip'],
      });
    });

    it('should remove labels successfully', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: {
          add: [],
          remove: ['spam', 'archived'],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.messages_sent).toBe(0);
      expect(result.labels_updated).toBe(2);
      expect(result.attributes_updated).toBe(0);
      expect(mockClient.removeLabels).toHaveBeenCalledWith({
        conversation_id: 456,
        labels: ['spam', 'archived'],
      });
    });

    it('should upsert contact attributes successfully', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: {
          add: [],
          remove: [],
        },
        contact_attributes: {
          subscription_tier: 'premium',
          last_purchase_date: '2024-01-15',
          lifetime_value: 5000,
        },
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.messages_sent).toBe(0);
      expect(result.labels_updated).toBe(0);
      expect(result.attributes_updated).toBe(3);
      expect(mockClient.updateConversation).toHaveBeenCalledWith({
        conversation_id: 456,
        custom_attributes: {
          subscription_tier: 'premium',
          last_purchase_date: '2024-01-15',
          lifetime_value: 5000,
        },
      });
    });

    it('should handle API errors gracefully', async () => {
      mockClient.sendMessage.mockRejectedValueOnce(new Error('API timeout'));

      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'Test message',
          },
        },
        labels: {
          add: [],
          remove: [],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.messages_sent).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toContain('Failed to send message');
    });

    it('should ensure idempotency for duplicate messages', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'Duplicate message',
          },
        },
        labels: {
          add: [],
          remove: [],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      // First sync
      const result1 = await adapter.sync(request);
      expect(result1.messages_sent).toBe(1);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);

      // Second sync (should be idempotent)
      const result2 = await adapter.sync(request);
      expect(result2.messages_sent).toBe(0);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should handle batch operations successfully', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'First message',
          },
          message2: {
            type: 'message',
            value: 'Second message',
          },
        },
        labels: {
          add: ['urgent', 'vip'],
          remove: ['spam'],
        },
        contact_attributes: {
          last_interaction: Date.now(),
          engagement_score: 95,
        },
        emit_events: ['conversation_updated'],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.messages_sent).toBe(2);
      expect(result.labels_updated).toBe(3); // 2 added + 1 removed
      expect(result.attributes_updated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockClient.addLabels).toHaveBeenCalledTimes(1);
      expect(mockClient.removeLabels).toHaveBeenCalledTimes(1);
      expect(mockClient.updateConversation).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeActions', () => {
    it('should execute send_message action', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'send_message',
          params: {
            content: 'Welcome to our support!',
          },
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.sendMessage).toHaveBeenCalledWith({
        conversation_id: 456,
        content: 'Welcome to our support!',
        message_type: 1,
        private: false,
      });
    });

    it('should execute add_label action', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'add_label',
          params: {
            label: 'priority',
          },
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.addLabels).toHaveBeenCalledWith({
        conversation_id: 456,
        labels: ['priority'],
      });
    });

    it('should execute update_attributes action', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'update_attributes',
          params: {
            attributes: {
              status: 'active',
              tier: 'gold',
            },
          },
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.updateConversation).toHaveBeenCalledWith({
        conversation_id: 456,
        custom_attributes: {
          status: 'active',
          tier: 'gold',
        },
      });
    });

    it('should execute assign_agent action', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'assign_agent',
          params: {
            agent_id: 789,
          },
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.updateConversation).toHaveBeenCalledWith({
        conversation_id: 456,
        assignee_id: 789,
      });
    });
  });

  describe('clearCache', () => {
    it('should clear idempotency cache', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'Test message',
          },
        },
        labels: {
          add: [],
          remove: [],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      // First sync
      await adapter.sync(request);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);

      // Clear cache
      adapter.clearCache();

      // Second sync after clear (should send again)
      await adapter.sync(request);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('getClient', () => {
    it('should create new client for first-time tenant', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'new-tenant',
        conversation_id: 789,
        execution_plan: executionPlan,
      };

      mockConfigStore.get.mockResolvedValueOnce({
        ...mockTenantConfig,
        id: 'new-tenant',
      });

      await adapter.sync(request);

      expect(ChatwootClient).toHaveBeenCalled();
    });

    it('should return cached client for subsequent calls', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      // First call
      await adapter.sync(request);
      const clientCallsAfterFirst = (ChatwootClient as jest.MockedClass<typeof ChatwootClient>).mock.calls.length;

      // Second call with same tenant
      await adapter.sync(request);
      const clientCallsAfterSecond = (ChatwootClient as jest.MockedClass<typeof ChatwootClient>).mock.calls.length;

      expect(clientCallsAfterSecond).toBe(clientCallsAfterFirst);
    });

    it('should throw if tenant config not found', async () => {
      mockConfigStore.get.mockRejectedValueOnce(new Error('Tenant not found'));

      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'nonexistent',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      await expect(adapter.sync(request)).rejects.toThrow();
    });

    it('should use tenant config for client initialization', async () => {
      const customConfig = {
        ...mockTenantConfig,
        id: 'custom-tenant',
        chatwoot: {
          account_id: 999,
          api_url: 'https://custom.chatwoot.com',
          api_token: 'custom-token',
        },
      };

      mockConfigStore.get.mockResolvedValueOnce(customConfig);

      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'custom-tenant',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      await adapter.sync(request);

      expect(mockConfigStore.get).toHaveBeenCalledWith('custom-tenant');
    });
  });

  describe('sync error scenarios', () => {
    it('should handle label add failure', async () => {
      mockClient.addLabels.mockRejectedValueOnce(new Error('Label service down'));

      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: {
          add: ['urgent'],
          remove: [],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.labels_updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toContain('Failed to update labels');
    });

    it('should handle label remove failure', async () => {
      mockClient.removeLabels.mockRejectedValueOnce(new Error('Delete failed'));

      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: {
          add: [],
          remove: ['spam'],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.labels_updated).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle attribute update failure', async () => {
      mockClient.updateConversation.mockRejectedValueOnce(new Error('Update failed'));

      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: { add: [], remove: [] },
        contact_attributes: { status: 'active' },
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.attributes_updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toContain('Failed to update attributes');
    });

    it('should accumulate multiple errors in result', async () => {
      mockClient.sendMessage.mockRejectedValueOnce(new Error('Send failed'));
      mockClient.addLabels.mockRejectedValueOnce(new Error('Label failed'));

      const executionPlan: ExecutionPlan = {
        persist: {
          msg1: { type: 'message', value: 'Test' },
        },
        labels: {
          add: ['urgent'],
          remove: [],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.errors).toHaveLength(2);
      expect(result.messages_sent).toBe(0);
      expect(result.labels_updated).toBe(0);
    });

    it('should continue processing after partial failures', async () => {
      mockClient.sendMessage.mockRejectedValueOnce(new Error('Send failed'));
      mockClient.addLabels.mockResolvedValueOnce({
        id: 456,
        status: 'open',
        labels: ['urgent'],
        custom_attributes: {},
      });

      const executionPlan: ExecutionPlan = {
        persist: {
          msg1: { type: 'message', value: 'Test' },
        },
        labels: {
          add: ['urgent'],
          remove: [],
        },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      const result = await adapter.sync(request);

      expect(result.messages_sent).toBe(0);
      expect(result.labels_updated).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('executeAction branch coverage', () => {
    it('should handle send_message with empty content', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'send_message',
          params: {
            content: '',
          },
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.sendMessage).toHaveBeenCalledWith({
        conversation_id: 456,
        content: '',
        message_type: 1,
        private: false,
      });
    });

    it('should handle add_label with missing label param', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'add_label',
          params: {},
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.addLabels).not.toHaveBeenCalled();
    });

    it('should handle update_attributes with empty attributes', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'update_attributes',
          params: {
            attributes: {},
          },
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.updateConversation).toHaveBeenCalledWith({
        conversation_id: 456,
        custom_attributes: {},
      });
    });

    it('should handle assign_agent with missing agent_id', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'assign_agent',
          params: {},
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.updateConversation).not.toHaveBeenCalled();
    });

    it('should log unsupported action types', async () => {
      const { logger: mockLogger } = require('../../../utils/logger');

      const actions: PolicyAction[] = [
        {
          type: 'unknown_action' as any,
          params: {},
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle retry failure in executeAction', async () => {
      const { logger: mockLogger } = require('../../../utils/logger');

      mockClient.sendMessage.mockRejectedValueOnce(new Error('API failed'));

      const actions: PolicyAction[] = [
        {
          type: 'send_message',
          params: { content: 'Message' },
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('idempotency advanced', () => {
    it('should allow same message to different conversations', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'Same message',
          },
        },
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      // Send to conversation 1
      await adapter.sync({
        tenant_id: 'tenant-1',
        conversation_id: 111,
        execution_plan: executionPlan,
      });

      // Send same message to conversation 2
      await adapter.sync({
        tenant_id: 'tenant-1',
        conversation_id: 222,
        execution_plan: executionPlan,
      });

      // Should send both messages (different conversations)
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should allow same message to different tenants', async () => {
      mockConfigStore.get.mockResolvedValue(mockTenantConfig);

      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'Same message',
          },
        },
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      // Send to tenant 1
      await adapter.sync({
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      });

      // Send same message to tenant 2
      await adapter.sync({
        tenant_id: 'tenant-2',
        conversation_id: 456,
        execution_plan: executionPlan,
      });

      // Should send both messages (different tenants)
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should track message IDs across multiple sync calls', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'Message 1',
          },
        },
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      // First sync
      await adapter.sync(request);
      // Duplicate sync (same message)
      await adapter.sync(request);
      // Duplicate sync again
      await adapter.sync(request);

      // Only first sync should send
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should clear cache and allow re-sending', async () => {
      const executionPlan: ExecutionPlan = {
        persist: {
          message1: {
            type: 'message',
            value: 'Message',
          },
        },
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      const request: ChatwootSyncRequest = {
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      };

      // First sync
      await adapter.sync(request);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);

      // Duplicate (should not send)
      await adapter.sync(request);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);

      // Clear and try again
      adapter.clearCache();
      await adapter.sync(request);
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('integration', () => {
    it('should handle executeActions with mixed action types', async () => {
      const actions: PolicyAction[] = [
        {
          type: 'send_message',
          params: { content: 'Hello' },
        },
        {
          type: 'add_label',
          params: { label: 'priority' },
        },
        {
          type: 'update_attributes',
          params: { attributes: { tier: 'gold' } },
        },
      ];

      await adapter.executeActions('tenant-1', 456, actions);

      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockClient.addLabels).toHaveBeenCalledTimes(1);
      expect(mockClient.updateConversation).toHaveBeenCalledTimes(1);
    });

    it('should maintain client pool across multiple tenants', async () => {
      mockConfigStore.get.mockResolvedValue(mockTenantConfig);

      const executionPlan: ExecutionPlan = {
        persist: {},
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      // Sync with tenant 1
      await adapter.sync({
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      });

      // Sync with tenant 2
      await adapter.sync({
        tenant_id: 'tenant-2',
        conversation_id: 789,
        execution_plan: executionPlan,
      });

      // Both tenants should have clients created
      const clientInstances = (ChatwootClient as jest.MockedClass<typeof ChatwootClient>).mock.instances.length;
      expect(clientInstances).toBeGreaterThanOrEqual(2);
    });

    it('should respect tenant isolation', async () => {
      const tenant1Config = { ...mockTenantConfig, id: 'tenant-1' };
      const tenant2Config = { ...mockTenantConfig, id: 'tenant-2', chatwoot: { ...mockTenantConfig.chatwoot, api_token: 'tenant2-token' } };

      mockConfigStore.get.mockImplementation((tenantId) => {
        if (tenantId === 'tenant-1') return Promise.resolve(tenant1Config);
        if (tenantId === 'tenant-2') return Promise.resolve(tenant2Config);
        return Promise.reject(new Error('Tenant not found'));
      });

      const executionPlan: ExecutionPlan = {
        persist: {
          msg: { type: 'message', value: 'Test' },
        },
        labels: { add: [], remove: [] },
        contact_attributes: {},
        emit_events: [],
      };

      // Add document to tenant 1
      await adapter.sync({
        tenant_id: 'tenant-1',
        conversation_id: 456,
        execution_plan: executionPlan,
      });

      // Add same document to tenant 2
      await adapter.sync({
        tenant_id: 'tenant-2',
        conversation_id: 456,
        execution_plan: executionPlan,
      });

      // Both should use different configurations
      expect(mockConfigStore.get).toHaveBeenCalledWith('tenant-1');
      expect(mockConfigStore.get).toHaveBeenCalledWith('tenant-2');
    });
  });
});
