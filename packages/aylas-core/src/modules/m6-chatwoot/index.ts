/**
 * M6: Chatwoot Adapter Module
 *
 * Provides type-safe integration with Chatwoot API for:
 * - Sending messages
 * - Updating conversation labels
 * - Updating contact attributes
 * - Idempotent operations
 */

export {
  ChatwootAdapter,
  type ExecutionPlan,
  type PersistConfig,
  type ChatwootSyncResult,
  type ChatwootSyncRequest,
} from './adapter';

export {
  ChatwootClient,
  type ChatwootClientConfig,
  type SendMessageRequest,
  type UpdateConversationRequest,
  type AddLabelsRequest,
  type RemoveLabelsRequest,
  type ChatwootMessageResponse,
  type ChatwootConversationResponse,
} from './chatwoot-client';
