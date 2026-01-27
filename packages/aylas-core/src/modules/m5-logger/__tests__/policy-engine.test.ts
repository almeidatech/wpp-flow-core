import { PolicyEngine } from '../policy-engine';
import { EventLog, EventPolicy } from '../../../config/types';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  const createEvent = (type: string, payload: Record<string, unknown> = {}): EventLog => ({
    id: 1,
    tenant_id: 'tenant_123',
    contact_id: 42,
    event_type: type,
    payload,
    timestamp: Date.now(),
  });

  describe('wildcard matching', () => {
    it('should match wildcard event type', () => {
      const event = createEvent('any_event');
      const policies: EventPolicy[] = [
        {
          event_type: '*',
          actions: [{ type: 'add_label', params: { label: 'all' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe('add_label');
    });

    it('should match prefix wildcard', () => {
      const event = createEvent('customer_replied_text');
      const policies: EventPolicy[] = [
        {
          event_type: 'customer_*',
          actions: [{ type: 'add_label', params: { label: 'customer' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });

    it('should not match non-matching prefix wildcard', () => {
      const event = createEvent('agent_replied');
      const policies: EventPolicy[] = [
        {
          event_type: 'customer_*',
          actions: [{ type: 'add_label', params: { label: 'customer' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(0);
    });
  });

  describe('exact matching', () => {
    it('should match exact event type', () => {
      const event = createEvent('message_created');
      const policies: EventPolicy[] = [
        {
          event_type: 'message_created',
          actions: [{ type: 'add_label', params: { label: 'message' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });

    it('should not match different event type', () => {
      const event = createEvent('conversation_closed');
      const policies: EventPolicy[] = [
        {
          event_type: 'message_created',
          actions: [{ type: 'add_label', params: { label: 'message' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(0);
    });
  });

  describe('condition evaluation - equality', () => {
    it('should match equality condition with string', () => {
      const event = createEvent('intent_detected', { intent: 'sales' });
      const policies: EventPolicy[] = [
        {
          event_type: 'intent_detected',
          condition: { '==': [{ var: 'payload.intent' }, 'sales'] },
          actions: [{ type: 'assign_agent', params: { agent_id: 123 } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });

    it('should not match failing equality condition', () => {
      const event = createEvent('intent_detected', { intent: 'support' });
      const policies: EventPolicy[] = [
        {
          event_type: 'intent_detected',
          condition: { '==': [{ var: 'payload.intent' }, 'sales'] },
          actions: [{ type: 'assign_agent', params: { agent_id: 123 } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(0);
    });
  });

  describe('condition evaluation - comparison', () => {
    it('should match >= condition', () => {
      const event = createEvent('intent_detected', { confidence: 0.9 });
      const policies: EventPolicy[] = [
        {
          event_type: 'intent_detected',
          condition: { '>=': [{ var: 'payload.confidence' }, 0.8] },
          actions: [{ type: 'add_label', params: { label: 'high-confidence' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });

    it('should not match failing >= condition', () => {
      const event = createEvent('intent_detected', { confidence: 0.5 });
      const policies: EventPolicy[] = [
        {
          event_type: 'intent_detected',
          condition: { '>=': [{ var: 'payload.confidence' }, 0.8] },
          actions: [{ type: 'add_label', params: { label: 'high-confidence' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(0);
    });

    it('should match <= condition', () => {
      const event = createEvent('message_sent', { length: 50 });
      const policies: EventPolicy[] = [
        {
          event_type: 'message_sent',
          condition: { '<=': [{ var: 'payload.length' }, 100] },
          actions: [{ type: 'add_label', params: { label: 'short' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });
  });

  describe('condition evaluation - logical operators', () => {
    it('should match AND condition', () => {
      const event = createEvent('intent_detected', { intent: 'sales', confidence: 0.9 });
      const policies: EventPolicy[] = [
        {
          event_type: 'intent_detected',
          condition: {
            and: [
              { '==': [{ var: 'payload.intent' }, 'sales'] },
              { '>=': [{ var: 'payload.confidence' }, 0.8] },
            ],
          },
          actions: [{ type: 'assign_agent', params: { agent_id: 123 } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });

    it('should not match failing AND condition', () => {
      const event = createEvent('intent_detected', { intent: 'sales', confidence: 0.5 });
      const policies: EventPolicy[] = [
        {
          event_type: 'intent_detected',
          condition: {
            and: [
              { '==': [{ var: 'payload.intent' }, 'sales'] },
              { '>=': [{ var: 'payload.confidence' }, 0.8] },
            ],
          },
          actions: [{ type: 'assign_agent', params: { agent_id: 123 } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(0);
    });

    it('should match OR condition', () => {
      const event = createEvent('intent_detected', { intent: 'sales' });
      const policies: EventPolicy[] = [
        {
          event_type: 'intent_detected',
          condition: {
            or: [
              { '==': [{ var: 'payload.intent' }, 'sales'] },
              { '==': [{ var: 'payload.intent' }, 'support'] },
            ],
          },
          actions: [{ type: 'add_label', params: { label: 'priority' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });

    it('should not match failing OR condition', () => {
      const event = createEvent('intent_detected', { intent: 'general' });
      const policies: EventPolicy[] = [
        {
          event_type: 'intent_detected',
          condition: {
            or: [
              { '==': [{ var: 'payload.intent' }, 'sales'] },
              { '==': [{ var: 'payload.intent' }, 'support'] },
            ],
          },
          actions: [{ type: 'add_label', params: { label: 'priority' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(0);
    });
  });

  describe('nested conditions', () => {
    it('should handle nested AND/OR', () => {
      const event = createEvent('test', { type: 'A', value: 10 });
      const policies: EventPolicy[] = [
        {
          event_type: 'test',
          condition: {
            or: [
              {
                and: [
                  { '==': [{ var: 'payload.type' }, 'A'] },
                  { '>=': [{ var: 'payload.value' }, 5] },
                ],
              },
              { '==': [{ var: 'payload.type' }, 'B'] },
            ],
          },
          actions: [{ type: 'add_label', params: { label: 'matched' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });
  });

  describe('variable resolution', () => {
    it('should resolve nested payload variables', () => {
      const event = createEvent('test', { user: { name: 'John', age: 30 } });
      const policies: EventPolicy[] = [
        {
          event_type: 'test',
          condition: { '==': [{ var: 'payload.user.name' }, 'John'] },
          actions: [{ type: 'add_label', params: { label: 'john' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(1);
    });

    it('should handle missing variables gracefully', () => {
      const event = createEvent('test', {});
      const policies: EventPolicy[] = [
        {
          event_type: 'test',
          condition: { '==': [{ var: 'payload.missing.field' }, 'value'] },
          actions: [{ type: 'add_label', params: { label: 'test' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(0);
    });
  });

  describe('priority ordering', () => {
    it('should sort policies by priority (descending)', () => {
      const event = createEvent('test');
      const policies: EventPolicy[] = [
        {
          event_type: 'test',
          priority: 5,
          actions: [{ type: 'add_label', params: { label: 'medium' } }],
        },
        {
          event_type: 'test',
          priority: 10,
          actions: [{ type: 'add_label', params: { label: 'high' } }],
        },
        {
          event_type: 'test',
          priority: 1,
          actions: [{ type: 'add_label', params: { label: 'low' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(3);
      expect(actions[0]?.params.label).toBe('high');
      expect(actions[1]?.params.label).toBe('medium');
      expect(actions[2]?.params.label).toBe('low');
    });

    it('should handle undefined priority (default 0)', () => {
      const event = createEvent('test');
      const policies: EventPolicy[] = [
        {
          event_type: 'test',
          actions: [{ type: 'add_label', params: { label: 'no-priority' } }],
        },
        {
          event_type: 'test',
          priority: 5,
          actions: [{ type: 'add_label', params: { label: 'with-priority' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions[0]?.params.label).toBe('with-priority');
      expect(actions[1]?.params.label).toBe('no-priority');
    });
  });

  describe('multiple actions', () => {
    it('should return all actions from matched policy', () => {
      const event = createEvent('customer_replied');
      const policies: EventPolicy[] = [
        {
          event_type: 'customer_replied',
          actions: [
            { type: 'add_label', params: { label: 'active' } },
            { type: 'update_attributes', params: { last_active: Date.now() } },
            { type: 'trigger_webhook', params: { url: 'https://example.com' } },
          ],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(3);
      expect(actions.map(a => a.type)).toEqual([
        'add_label',
        'update_attributes',
        'trigger_webhook',
      ]);
    });
  });

  describe('no matching policies', () => {
    it('should return empty array when no policies match', () => {
      const event = createEvent('unknown_event');
      const policies: EventPolicy[] = [
        {
          event_type: 'known_event',
          actions: [{ type: 'add_label', params: { label: 'test' } }],
        },
      ];

      const actions = engine.matchPolicies(event, policies);

      expect(actions).toHaveLength(0);
    });
  });
});
