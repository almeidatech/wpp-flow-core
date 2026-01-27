import { EventLog, TenantId, PolicyAction } from '../../config/types';
import { TenantConfigStore } from '../../config/tenant';
import { logger as systemLogger } from '../../utils/logger';
import { BaserowClient } from '../m3-contact/baserow-client';
import { PolicyEngine } from './policy-engine';

export interface EventLogRequest {
  tenant_id: TenantId;
  contact_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  timestamp?: number;
}

export interface EventFilter {
  contact_id?: number;
  event_type?: string;
  from?: number;
  to?: number;
}

export class EventLogger {
  private clients: Map<TenantId, BaserowClient> = new Map();
  private policyEngine: PolicyEngine;

  constructor(private configStore: TenantConfigStore) {
    this.policyEngine = new PolicyEngine();
  }

  private async getClient(tenant_id: TenantId): Promise<BaserowClient> {
    let client = this.clients.get(tenant_id);

    if (!client) {
      const config = await this.configStore.get(tenant_id);
      client = new BaserowClient(config.baserow.api_url, config.baserow.api_token);
      this.clients.set(tenant_id, client);
    }

    return client;
  }

  private async getTableId(tenant_id: TenantId): Promise<number> {
    const config = await this.configStore.get(tenant_id);
    return config.baserow.tables.events;
  }

  async log(req: EventLogRequest): Promise<EventLog> {
    const client = await this.getClient(req.tenant_id);
    const tableId = await this.getTableId(req.tenant_id);

    const timestamp = req.timestamp || Date.now();

    systemLogger.info('Logging event', {
      tenant_id: req.tenant_id,
      contact_id: req.contact_id,
      event_type: req.event_type,
    });

    const row = await client.createRow(tableId, {
      tenant_id: req.tenant_id,
      contact_id: req.contact_id,
      event_type: req.event_type,
      payload: JSON.stringify(req.payload),
      timestamp,
    });

    const eventLog: EventLog = {
      id: row.id,
      tenant_id: req.tenant_id,
      contact_id: req.contact_id,
      event_type: req.event_type,
      payload: req.payload,
      timestamp,
    };

    void this.applyPolicyAsync(eventLog);

    return eventLog;
  }

  async query(tenant_id: TenantId, filters: EventFilter): Promise<EventLog[]> {
    const client = await this.getClient(tenant_id);
    const tableId = await this.getTableId(tenant_id);

    systemLogger.info('Querying events', {
      tenant_id,
      filters,
    });

    const baserowFilters: Record<string, unknown> = {};

    if (filters.contact_id) {
      baserowFilters.contact_id = filters.contact_id;
    }
    if (filters.event_type) {
      baserowFilters.event_type = filters.event_type;
    }

    const row = await client.findRow(tableId, baserowFilters);

    if (!row) {
      return [];
    }

    const event: EventLog = {
      id: row.id,
      tenant_id: String(row.tenant_id),
      contact_id: row.contact_id as number,
      event_type: String(row.event_type),
      payload: this.parsePayload(row.payload),
      timestamp: row.timestamp as number,
    };

    return [event];
  }

  async applyPolicy(event: EventLog): Promise<PolicyAction[]> {
    const config = await this.configStore.get(event.tenant_id);

    systemLogger.info('Applying policies', {
      tenant_id: event.tenant_id,
      event_type: event.event_type,
      policies_count: config.policies.length,
    });

    const actions = this.policyEngine.matchPolicies(event, config.policies);

    for (const action of actions) {
      await this.executeAction(event, action);
    }

    return actions;
  }

  private async applyPolicyAsync(event: EventLog): Promise<void> {
    try {
      await this.applyPolicy(event);
    } catch (error) {
      systemLogger.error('Policy execution failed', {
        event_id: event.id,
        error: String(error),
      });
    }
  }

  private async executeAction(event: EventLog, action: PolicyAction): Promise<void> {
    systemLogger.info('Executing policy action', {
      event_id: event.id,
      action_type: action.type,
    });

    switch (action.type) {
      case 'add_label':
        systemLogger.info('Action: add_label', { params: action.params });
        break;
      case 'update_attributes':
        systemLogger.info('Action: update_attributes', { params: action.params });
        break;
      case 'send_message':
        systemLogger.info('Action: send_message', { params: action.params });
        break;
      case 'assign_agent':
        systemLogger.info('Action: assign_agent', { params: action.params });
        break;
      case 'trigger_webhook':
        systemLogger.info('Action: trigger_webhook', { params: action.params });
        break;
      default:
        systemLogger.warn('Unknown action type', { action });
    }
  }

  private parsePayload(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    try {
      return JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
