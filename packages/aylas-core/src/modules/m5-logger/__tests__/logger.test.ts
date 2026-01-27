import { EventLogger, EventLogRequest } from '../logger';
import { TenantConfigStore } from '../../../config/tenant';
import { BaserowClient } from '../../m3-contact/baserow-client';
import { EventLog, EventPolicy } from '../../../config/types';

jest.mock('../../m3-contact/baserow-client');

const mockPolicies: EventPolicy[] = [
  {
    event_type: 'customer_replied',
    actions: [
      { type: 'add_label', params: { label: 'active' } },
    ],
  },
  {
    event_type: 'intent_detected',
    condition: { '>=': [{ var: 'payload.confidence' }, 0.8] },
    actions: [
      { type: 'assign_agent', params: { agent_id: 123 } },
    ],
  },
];

const mockConfigStore = {
  get: jest.fn().mockResolvedValue({
    id: 'tenant_123',
    baserow: {
      api_url: 'https://api.baserow.io',
      api_token: 'test-token',
      tables: { contacts: 100, events: 101 },
    },
    policies: mockPolicies,
  }),
} as unknown as TenantConfigStore;

describe('EventLogger', () => {
  let logger: EventLogger;
  let mockClient: jest.Mocked<BaserowClient>;

  beforeEach(() => {
    logger = new EventLogger(mockConfigStore);
    mockClient = new BaserowClient('', '') as jest.Mocked<BaserowClient>;
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should log event to Baserow', async () => {
      mockClient.createRow = jest.fn().mockResolvedValue({
        id: 1,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'customer_replied',
        payload: '{}',
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: EventLogRequest = {
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'customer_replied',
        payload: { message: 'Hello' },
      };

      const result = await logger.log(req);

      expect(result.id).toBe(1);
      expect(result.event_type).toBe('customer_replied');
      expect(mockClient.createRow).toHaveBeenCalled();
    });

    it('should use provided timestamp', async () => {
      const customTimestamp = 1234567890;

      mockClient.createRow = jest.fn().mockResolvedValue({
        id: 2,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: '{}',
        timestamp: customTimestamp,
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: EventLogRequest = {
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: {},
        timestamp: customTimestamp,
      };

      const result = await logger.log(req);

      expect(result.timestamp).toBe(customTimestamp);
    });
  });

  describe('query', () => {
    it('should query events with filters', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue({
        id: 3,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'customer_replied',
        payload: JSON.stringify({ message: 'Test' }),
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', {
        contact_id: 42,
        event_type: 'customer_replied',
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.contact_id).toBe(42);
    });

    it('should return empty array if no events found', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue(null);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', { contact_id: 999 });

      expect(results).toHaveLength(0);
    });
  });

  describe('applyPolicy', () => {
    it('should match wildcard event type', async () => {
      const event: EventLog = {
        id: 4,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'any_event',
        payload: {},
        timestamp: Date.now(),
      };

      const wildcardConfig = {
        ...await mockConfigStore.get('tenant_123'),
        policies: [
          {
            event_type: '*',
            actions: [{ type: 'add_label' as const, params: { label: 'all' } }],
          },
        ],
      };
      (mockConfigStore.get as jest.Mock).mockResolvedValueOnce(wildcardConfig);

      const actions = await logger.applyPolicy(event);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe('add_label');
    });

    it('should match event with condition', async () => {
      const event: EventLog = {
        id: 5,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'intent_detected',
        payload: { confidence: 0.9 },
        timestamp: Date.now(),
      };

      const actions = await logger.applyPolicy(event);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0]?.type).toBe('assign_agent');
    });

    it('should not match event with failing condition', async () => {
      const event: EventLog = {
        id: 6,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'intent_detected',
        payload: { confidence: 0.5 },
        timestamp: Date.now(),
      };

      const actions = await logger.applyPolicy(event);

      const assignActions = actions.filter(a => a.type === 'assign_agent');
      expect(assignActions).toHaveLength(0);
    });

    it('should match multiple policies and sort by priority', async () => {
      const event: EventLog = {
        id: 7,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test_event',
        payload: {},
        timestamp: Date.now(),
      };

      const priorityConfig = {
        ...await mockConfigStore.get('tenant_123'),
        policies: [
          {
            event_type: 'test_event',
            priority: 1,
            actions: [{ type: 'add_label' as const, params: { label: 'low' } }],
          },
          {
            event_type: 'test_event',
            priority: 10,
            actions: [{ type: 'add_label' as const, params: { label: 'high' } }],
          },
        ],
      };
      (mockConfigStore.get as jest.Mock).mockResolvedValueOnce(priorityConfig);

      const actions = await logger.applyPolicy(event);

      expect(actions).toHaveLength(2);
      expect(actions[0]?.params.label).toBe('high');
      expect(actions[1]?.params.label).toBe('low');
    });
  });

  describe('Query with partial filters', () => {
    it('should query with only contact_id filter', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue({
        id: 8,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'any_event',
        payload: '{}',
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', { contact_id: 42 });

      expect(results).toHaveLength(1);
      expect(mockClient.findRow).toHaveBeenCalledWith(101, { contact_id: 42 });
    });

    it('should query with only event_type filter', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue({
        id: 9,
        tenant_id: 'tenant_123',
        contact_id: 99,
        event_type: 'customer_replied',
        payload: '{}',
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', { event_type: 'customer_replied' });

      expect(results).toHaveLength(1);
      expect(mockClient.findRow).toHaveBeenCalledWith(101, { event_type: 'customer_replied' });
    });

    it('should query with no filters', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue({
        id: 10,
        tenant_id: 'tenant_123',
        contact_id: 99,
        event_type: 'any_event',
        payload: '{}',
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', {});

      expect(results).toHaveLength(1);
      expect(mockClient.findRow).toHaveBeenCalledWith(101, {});
    });
  });

  describe('Action type execution', () => {
    it('should execute send_message action', async () => {
      const sendMessageConfig = {
        ...await mockConfigStore.get('tenant_123'),
        policies: [
          {
            event_type: 'test',
            actions: [{ type: 'send_message' as const, params: { message: 'Hello' } }],
          },
        ],
      };
      (mockConfigStore.get as jest.Mock).mockResolvedValueOnce(sendMessageConfig);

      const event: EventLog = {
        id: 11,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const actions = await logger.applyPolicy(event);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe('send_message');
    });

    it('should execute update_attributes action', async () => {
      const updateAttrConfig = {
        ...await mockConfigStore.get('tenant_123'),
        policies: [
          {
            event_type: 'test',
            actions: [{ type: 'update_attributes' as const, params: { status: 'active' } }],
          },
        ],
      };
      (mockConfigStore.get as jest.Mock).mockResolvedValueOnce(updateAttrConfig);

      const event: EventLog = {
        id: 12,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const actions = await logger.applyPolicy(event);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe('update_attributes');
    });

    it('should execute trigger_webhook action', async () => {
      const webhookConfig = {
        ...await mockConfigStore.get('tenant_123'),
        policies: [
          {
            event_type: 'test',
            actions: [{ type: 'trigger_webhook' as const, params: { url: 'http://example.com' } }],
          },
        ],
      };
      (mockConfigStore.get as jest.Mock).mockResolvedValueOnce(webhookConfig);

      const event: EventLog = {
        id: 13,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const actions = await logger.applyPolicy(event);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe('trigger_webhook');
    });

    it('should execute assign_agent action', async () => {
      const assignAgentConfig = {
        ...await mockConfigStore.get('tenant_123'),
        policies: [
          {
            event_type: 'test',
            actions: [{ type: 'assign_agent' as const, params: { agent_id: 123 } }],
          },
        ],
      };
      (mockConfigStore.get as jest.Mock).mockResolvedValueOnce(assignAgentConfig);

      const event: EventLog = {
        id: 14,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const actions = await logger.applyPolicy(event);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe('assign_agent');
    });
  });

  describe('Payload parsing edge cases', () => {
    it('should parse payload as JSON string', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue({
        id: 15,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: JSON.stringify({ key: 'value', nested: { data: 123 } }),
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', {});

      expect(results[0]?.payload).toEqual({ key: 'value', nested: { data: 123 } });
    });

    it('should handle payload as object (already parsed)', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue({
        id: 16,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: { key: 'value' }, // Already an object
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', {});

      expect(results[0]?.payload).toEqual({ key: 'value' });
    });

    it('should handle invalid JSON payload gracefully', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue({
        id: 17,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: 'invalid json {{{', // Invalid JSON
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', {});

      expect(results[0]?.payload).toEqual({});
    });

    it('should handle null payload', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue({
        id: 18,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: null,
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const results = await logger.query('tenant_123', {});

      expect(results[0]?.payload).toEqual({});
    });
  });

  describe('Client caching', () => {
    it('should reuse client for same tenant', async () => {
      mockClient.createRow = jest.fn().mockResolvedValue({
        id: 19,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: '{}',
        timestamp: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: EventLogRequest = {
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test1',
        payload: {},
      };

      await logger.log(req);
      await logger.log(req);
      await logger.log(req);

      // BaserowClient should only be called once (cached)
      expect(BaserowClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('Unknown action type', () => {
    it('should handle unknown action type gracefully', async () => {
      const unknownActionConfig = {
        ...await mockConfigStore.get('tenant_123'),
        policies: [
          {
            event_type: 'test',
            actions: [{ type: 'unknown_action' as any, params: { data: 'test' } }],
          },
        ],
      };
      (mockConfigStore.get as jest.Mock).mockResolvedValueOnce(unknownActionConfig);

      const event: EventLog = {
        id: 20,
        tenant_id: 'tenant_123',
        contact_id: 42,
        event_type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      const actions = await logger.applyPolicy(event);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe('unknown_action');
    });
  });
});
