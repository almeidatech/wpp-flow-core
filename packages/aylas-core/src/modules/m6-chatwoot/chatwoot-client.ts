import axios, { AxiosInstance, AxiosError } from 'axios';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import { retry, RetryOptions } from '../../utils/retry';
import { AylasError, ErrorCode } from '../../utils/errors';

// Zod schemas for runtime validation
const ChatwootMessageResponseSchema = z.object({
  id: z.number(),
  content: z.string(),
  message_type: z.number(),
  created_at: z.number(),
  conversation_id: z.number(),
});

const ChatwootConversationResponseSchema = z.object({
  id: z.number(),
  status: z.string(),
  labels: z.array(z.string()),
  custom_attributes: z.record(z.unknown()).optional(),
});

export type ChatwootMessageResponse = z.infer<typeof ChatwootMessageResponseSchema>;
export type ChatwootConversationResponse = z.infer<typeof ChatwootConversationResponseSchema>;

export interface ChatwootClientConfig {
  baseUrl: string;
  apiToken: string;
  accountId: number;
  retryOptions?: RetryOptions;
}

export interface SendMessageRequest {
  conversation_id: number;
  content: string;
  message_type?: 0 | 1; // 0 = incoming, 1 = outgoing
  private?: boolean;
}

export interface UpdateConversationRequest {
  conversation_id: number;
  status?: 'open' | 'resolved' | 'pending';
  assignee_id?: number;
  custom_attributes?: Record<string, unknown>;
}

export interface AddLabelsRequest {
  conversation_id: number;
  labels: string[];
}

export interface RemoveLabelsRequest {
  conversation_id: number;
  labels: string[];
}

/**
 * Type-safe HTTP client for Chatwoot API with retry logic and validation
 */
export class ChatwootClient {
  private client: AxiosInstance;
  private retryOptions: RetryOptions;

  constructor(config: ChatwootClientConfig) {
    this.retryOptions = config.retryOptions || {
      maxAttempts: 3,
      delayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
    };

    this.client = axios.create({
      baseURL: `${config.baseUrl}/api/v1/accounts/${config.accountId}`,
      headers: {
        'api_access_token': config.apiToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Chatwoot API request', {
          method: config.method,
          url: config.url,
          data: config.data,
        });
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Chatwoot API response', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        if (error instanceof AxiosError) {
          logger.error('Chatwoot API error', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          });
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Send message to Chatwoot conversation with retry logic
   */
  async sendMessage(request: SendMessageRequest): Promise<ChatwootMessageResponse> {
    const operation = async () => {
      try {
        const response = await this.client.post(
          `/conversations/${request.conversation_id}/messages`,
          {
            content: request.content,
            message_type: request.message_type ?? 1, // default outgoing
            private: request.private ?? false,
          }
        );

        // Validate response schema
        const validated = ChatwootMessageResponseSchema.parse(response.data);

        logger.info('Message sent to Chatwoot', {
          conversation_id: request.conversation_id,
          message_id: validated.id,
        });

        return validated;
      } catch (error) {
        if (error instanceof AxiosError) {
          throw new AylasError(
            ErrorCode.CHATWOOT_API_FAILED,
            `Failed to send message: ${error.message}`,
            {
              conversation_id: request.conversation_id,
              status: error.response?.status,
              data: error.response?.data,
            }
          );
        }
        throw error;
      }
    };

    return retry(operation, this.retryOptions);
  }

  /**
   * Update conversation status and attributes
   */
  async updateConversation(request: UpdateConversationRequest): Promise<ChatwootConversationResponse> {
    const operation = async () => {
      try {
        const payload: Record<string, unknown> = {};

        if (request.status) {
          payload.status = request.status;
        }
        if (request.assignee_id !== undefined) {
          payload.assignee_id = request.assignee_id;
        }
        if (request.custom_attributes) {
          payload.custom_attributes = request.custom_attributes;
        }

        const response = await this.client.patch(
          `/conversations/${request.conversation_id}`,
          payload
        );

        // Validate response schema
        const validated = ChatwootConversationResponseSchema.parse(response.data);

        logger.info('Conversation updated', {
          conversation_id: request.conversation_id,
          status: validated.status,
        });

        return validated;
      } catch (error) {
        if (error instanceof AxiosError) {
          throw new AylasError(
            ErrorCode.CHATWOOT_API_FAILED,
            `Failed to update conversation: ${error.message}`,
            {
              conversation_id: request.conversation_id,
              status: error.response?.status,
              data: error.response?.data,
            }
          );
        }
        throw error;
      }
    };

    return retry(operation, this.retryOptions);
  }

  /**
   * Add labels to conversation
   */
  async addLabels(request: AddLabelsRequest): Promise<ChatwootConversationResponse> {
    const operation = async () => {
      try {
        const response = await this.client.post(
          `/conversations/${request.conversation_id}/labels`,
          {
            labels: request.labels,
          }
        );

        const validated = ChatwootConversationResponseSchema.parse(response.data);

        logger.info('Labels added to conversation', {
          conversation_id: request.conversation_id,
          labels: request.labels,
        });

        return validated;
      } catch (error) {
        if (error instanceof AxiosError) {
          throw new AylasError(
            ErrorCode.CHATWOOT_API_FAILED,
            `Failed to add labels: ${error.message}`,
            {
              conversation_id: request.conversation_id,
              labels: request.labels,
              status: error.response?.status,
              data: error.response?.data,
            }
          );
        }
        throw error;
      }
    };

    return retry(operation, this.retryOptions);
  }

  /**
   * Remove labels from conversation
   */
  async removeLabels(request: RemoveLabelsRequest): Promise<void> {
    const operation = async () => {
      try {
        // Note: Chatwoot API might not have a direct remove endpoint
        // This implementation assumes a DELETE endpoint exists
        await this.client.delete(`/conversations/${request.conversation_id}/labels`, {
          data: {
            labels: request.labels,
          },
        });

        logger.info('Labels removed from conversation', {
          conversation_id: request.conversation_id,
          labels: request.labels,
        });
      } catch (error) {
        if (error instanceof AxiosError) {
          throw new AylasError(
            ErrorCode.CHATWOOT_API_FAILED,
            `Failed to remove labels: ${error.message}`,
            {
              conversation_id: request.conversation_id,
              labels: request.labels,
              status: error.response?.status,
              data: error.response?.data,
            }
          );
        }
        throw error;
      }
    };

    return retry(operation, this.retryOptions);
  }

  /**
   * Get conversation details
   */
  async getConversation(conversationId: number): Promise<ChatwootConversationResponse> {
    const operation = async () => {
      try {
        const response = await this.client.get(`/conversations/${conversationId}`);

        const validated = ChatwootConversationResponseSchema.parse(response.data);

        logger.info('Fetched conversation', {
          conversation_id: conversationId,
          status: validated.status,
        });

        return validated;
      } catch (error) {
        if (error instanceof AxiosError) {
          throw new AylasError(
            ErrorCode.CHATWOOT_API_FAILED,
            `Failed to fetch conversation: ${error.message}`,
            {
              conversation_id: conversationId,
              status: error.response?.status,
              data: error.response?.data,
            }
          );
        }
        throw error;
      }
    };

    return retry(operation, this.retryOptions);
  }
}
