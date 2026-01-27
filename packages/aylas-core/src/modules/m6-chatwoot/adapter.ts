import { TenantId, PolicyAction } from '../../config/types';
import { TenantConfigStore } from '../../config/tenant';
import { logger } from '../../utils/logger';
import {
  ChatwootClient,
  ChatwootClientConfig,
  SendMessageRequest,
  UpdateConversationRequest,
  AddLabelsRequest,
  RemoveLabelsRequest,
} from './chatwoot-client';

/**
 * Execution plan from M5 Event Logger
 */
export interface ExecutionPlan {
  persist: Record<string, PersistConfig>;
  labels: {
    add: string[];
    remove: string[];
  };
  contact_attributes: Record<string, unknown>;
  emit_events: string[];
}

export interface PersistConfig {
  type: 'message' | 'attribute' | 'label';
  value: unknown;
}

/**
 * Result of Chatwoot synchronization
 */
export interface ChatwootSyncResult {
  messages_sent: number;
  labels_updated: number;
  attributes_updated: number;
  errors?: string[];
}

/**
 * Request for syncing execution plan to Chatwoot
 */
export interface ChatwootSyncRequest {
  tenant_id: TenantId;
  conversation_id: number;
  execution_plan: ExecutionPlan;
}

/**
 * Adapter for syncing execution plans to Chatwoot with idempotency
 */
export class ChatwootAdapter {
  private clients: Map<TenantId, ChatwootClient> = new Map();
  private processedMessageIds: Set<string> = new Set(); // Track sent messages for idempotency

  constructor(private configStore: TenantConfigStore) {}

  /**
   * Get or create Chatwoot client for tenant
   */
  private async getClient(tenantId: TenantId): Promise<ChatwootClient> {
    let client = this.clients.get(tenantId);

    if (!client) {
      const config = await this.configStore.get(tenantId);

      const clientConfig: ChatwootClientConfig = {
        baseUrl: config.chatwoot.api_url,
        apiToken: config.chatwoot.api_token,
        accountId: config.chatwoot.account_id,
      };

      client = new ChatwootClient(clientConfig);
      this.clients.set(tenantId, client);

      logger.info('Created Chatwoot client', { tenant_id: tenantId });
    }

    return client;
  }

  /**
   * Sync execution plan to Chatwoot
   */
  async sync(request: ChatwootSyncRequest): Promise<ChatwootSyncResult> {
    const { tenant_id, conversation_id, execution_plan } = request;

    logger.info('Starting Chatwoot sync', {
      tenant_id,
      conversation_id,
      plan: execution_plan,
    });

    const result: ChatwootSyncResult = {
      messages_sent: 0,
      labels_updated: 0,
      attributes_updated: 0,
      errors: [],
    };

    const client = await this.getClient(tenant_id);

    // Process messages
    for (const [key, config] of Object.entries(execution_plan.persist)) {
      if (config.type === 'message') {
        try {
          const messageId = `${tenant_id}:${conversation_id}:${key}`;

          // Idempotency check
          if (this.processedMessageIds.has(messageId)) {
            logger.info('Skipping duplicate message', { messageId });
            continue;
          }

          await this.sendMessage(client, conversation_id, String(config.value));
          this.processedMessageIds.add(messageId);
          result.messages_sent++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors?.push(`Failed to send message: ${errorMessage}`);
          logger.error('Failed to send message', { key, error: errorMessage });
        }
      }
    }

    // Process labels
    if (execution_plan.labels.add.length > 0 || execution_plan.labels.remove.length > 0) {
      try {
        await this.updateLabels(
          client,
          conversation_id,
          execution_plan.labels.add,
          execution_plan.labels.remove
        );
        result.labels_updated =
          execution_plan.labels.add.length + execution_plan.labels.remove.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors?.push(`Failed to update labels: ${errorMessage}`);
        logger.error('Failed to update labels', { error: errorMessage });
      }
    }

    // Process contact attributes
    if (Object.keys(execution_plan.contact_attributes).length > 0) {
      try {
        await this.updateAttributes(client, conversation_id, execution_plan.contact_attributes);
        result.attributes_updated = Object.keys(execution_plan.contact_attributes).length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors?.push(`Failed to update attributes: ${errorMessage}`);
        logger.error('Failed to update attributes', { error: errorMessage });
      }
    }

    logger.info('Chatwoot sync completed', {
      tenant_id,
      conversation_id,
      result,
    });

    return result;
  }

  /**
   * Send message to Chatwoot conversation
   */
  async sendMessage(
    client: ChatwootClient,
    conversationId: number,
    content: string
  ): Promise<void> {
    const request: SendMessageRequest = {
      conversation_id: conversationId,
      content,
      message_type: 1, // outgoing
      private: false,
    };

    await client.sendMessage(request);
  }

  /**
   * Update conversation labels
   */
  async updateLabels(
    client: ChatwootClient,
    conversationId: number,
    addLabels: string[],
    removeLabels: string[]
  ): Promise<void> {
    // Add labels
    if (addLabels.length > 0) {
      const addRequest: AddLabelsRequest = {
        conversation_id: conversationId,
        labels: addLabels,
      };
      await client.addLabels(addRequest);
    }

    // Remove labels
    if (removeLabels.length > 0) {
      const removeRequest: RemoveLabelsRequest = {
        conversation_id: conversationId,
        labels: removeLabels,
      };
      await client.removeLabels(removeRequest);
    }
  }

  /**
   * Update conversation custom attributes
   */
  async updateAttributes(
    client: ChatwootClient,
    conversationId: number,
    attributes: Record<string, unknown>
  ): Promise<void> {
    const request: UpdateConversationRequest = {
      conversation_id: conversationId,
      custom_attributes: attributes,
    };

    await client.updateConversation(request);
  }

  /**
   * Execute policy actions (alternative interface for M5 compatibility)
   */
  async executeActions(
    tenantId: TenantId,
    conversationId: number,
    actions: PolicyAction[]
  ): Promise<void> {
    const client = await this.getClient(tenantId);

    for (const action of actions) {
      try {
        await this.executeAction(client, conversationId, action);
      } catch (error) {
        logger.error('Failed to execute action', {
          action: action.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Execute single policy action
   */
  private async executeAction(
    client: ChatwootClient,
    conversationId: number,
    action: PolicyAction
  ): Promise<void> {
    switch (action.type) {
      case 'send_message':
        await this.sendMessage(client, conversationId, String(action.params.content || ''));
        break;

      case 'add_label':
        if (action.params.label) {
          await this.updateLabels(client, conversationId, [String(action.params.label)], []);
        }
        break;

      case 'update_attributes':
        if (action.params.attributes) {
          await this.updateAttributes(
            client,
            conversationId,
            action.params.attributes as Record<string, unknown>
          );
        }
        break;

      case 'assign_agent':
        if (action.params.agent_id) {
          const request: UpdateConversationRequest = {
            conversation_id: conversationId,
            assignee_id: Number(action.params.agent_id),
          };
          await client.updateConversation(request);
        }
        break;

      default:
        logger.warn('Unsupported action type', { action: action.type });
    }
  }

  /**
   * Clear idempotency cache (useful for testing)
   */
  clearCache(): void {
    this.processedMessageIds.clear();
    logger.info('Cleared idempotency cache');
  }
}
