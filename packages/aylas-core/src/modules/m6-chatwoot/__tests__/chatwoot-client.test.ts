import axios, { AxiosError } from 'axios';
import { ChatwootClient, ChatwootClientConfig } from '../chatwoot-client';

// Mock axios
jest.mock('axios');
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockAxios = axios as jest.Mocked<typeof axios>;

describe('ChatwootClient', () => {
  let client: ChatwootClient;
  let mockAxiosInstance: any;

  const mockConfig: ChatwootClientConfig = {
    baseUrl: 'https://app.chatwoot.com',
    apiToken: 'test-token-123',
    accountId: 456,
    retryOptions: {
      maxAttempts: 3,
      delayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 1000,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    mockAxios.create.mockReturnValue(mockAxiosInstance);

    client = new ChatwootClient(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with default retry options', () => {
      const basicConfig: ChatwootClientConfig = {
        baseUrl: 'https://app.chatwoot.com',
        apiToken: 'token',
        accountId: 123,
      };

      new ChatwootClient(basicConfig);

      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://app.chatwoot.com/api/v1/accounts/123',
          headers: {
            'api_access_token': 'token',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        })
      );
    });

    it('should accept custom retry options', () => {
      const customRetryConfig: ChatwootClientConfig = {
        baseUrl: 'https://app.chatwoot.com',
        apiToken: 'token',
        accountId: 123,
        retryOptions: {
          maxAttempts: 5,
          delayMs: 500,
          backoffMultiplier: 3,
          maxDelayMs: 5000,
        },
      };

      new ChatwootClient(customRetryConfig);
      expect(mockAxios.create).toHaveBeenCalled();
    });

    it('should configure axios with correct baseURL and headers', () => {
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://app.chatwoot.com/api/v1/accounts/456',
          headers: expect.objectContaining({
            'api_access_token': 'test-token-123',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should set timeout to 30000ms', () => {
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should setup request and response interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('should send outgoing message with default message_type=1', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          id: 1,
          content: 'Hello',
          message_type: 1,
          created_at: 1234567890,
          conversation_id: 123,
        },
      });

      const response = await client.sendMessage({
        conversation_id: 123,
        content: 'Hello',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/conversations/123/messages',
        expect.objectContaining({
          content: 'Hello',
          message_type: 1,
          private: false,
        })
      );
      expect(response.id).toBe(1);
      expect(response.message_type).toBe(1);
    });

    it('should send incoming message with message_type=0', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          id: 2,
          content: 'Customer message',
          message_type: 0,
          created_at: 1234567890,
          conversation_id: 123,
        },
      });

      const response = await client.sendMessage({
        conversation_id: 123,
        content: 'Customer message',
        message_type: 0,
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/conversations/123/messages',
        expect.objectContaining({
          message_type: 0,
        })
      );
      expect(response.message_type).toBe(0);
    });

    it('should send private message', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          id: 3,
          content: 'Internal note',
          message_type: 1,
          created_at: 1234567890,
          conversation_id: 123,
        },
      });

      const response = await client.sendMessage({
        conversation_id: 123,
        content: 'Internal note',
        private: true,
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/conversations/123/messages',
        expect.objectContaining({
          private: true,
        })
      );
      expect(response.content).toBe('Internal note');
    });

    it('should validate response with Zod schema', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          id: 4,
          content: 'Message',
          message_type: 1,
          created_at: 1234567890,
          conversation_id: 123,
        },
      });

      const response = await client.sendMessage({
        conversation_id: 123,
        content: 'Message',
      });

      expect(response).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          content: expect.any(String),
          message_type: expect.any(Number),
          created_at: expect.any(Number),
          conversation_id: expect.any(Number),
        })
      );
    });

    it('should throw error on API failure', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(
        new Error('API request failed')
      );

      await expect(
        client.sendMessage({
          conversation_id: 123,
          content: 'Message',
        })
      ).rejects.toThrow();
    });

    it('should retry on transient failures', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce(new AxiosError('Timeout', 'ECONNABORTED'))
        .mockRejectedValueOnce(new AxiosError('Timeout', 'ECONNABORTED'))
        .mockResolvedValueOnce({
          data: {
            id: 5,
            content: 'Message',
            message_type: 1,
            created_at: 1234567890,
            conversation_id: 123,
          },
        });

      const response = await client.sendMessage({
        conversation_id: 123,
        content: 'Message',
      });

      expect(response.id).toBe(5);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should validate all response fields', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          id: 6,
          content: 'Message',
          message_type: 1,
          created_at: 1234567890,
          conversation_id: 123,
        },
      });

      const result = await client.sendMessage({
        conversation_id: 123,
        content: 'Message',
      });

      expect(result).toEqual({
        id: 6,
        content: 'Message',
        message_type: 1,
        created_at: 1234567890,
        conversation_id: 123,
      });
    });

    it('should handle Zod validation failure', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          invalid: 'data',
        },
      });

      await expect(
        client.sendMessage({
          conversation_id: 123,
          content: 'Message',
        })
      ).rejects.toThrow();
    });
  });

  describe('updateConversation', () => {
    it('should update status only', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'resolved',
          labels: [],
          custom_attributes: {},
        },
      });

      const response = await client.updateConversation({
        conversation_id: 123,
        status: 'resolved',
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/conversations/123',
        { status: 'resolved' }
      );
      expect(response.status).toBe('resolved');
    });

    it('should update assignee_id only', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'open',
          labels: [],
          custom_attributes: {},
        },
      });

      const response = await client.updateConversation({
        conversation_id: 123,
        assignee_id: 789,
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/conversations/123',
        { assignee_id: 789 }
      );
      expect(response.id).toBe(123);
    });

    it('should update custom_attributes only', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'open',
          labels: [],
          custom_attributes: { tier: 'premium' },
        },
      });

      const response = await client.updateConversation({
        conversation_id: 123,
        custom_attributes: { tier: 'premium' },
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/conversations/123',
        { custom_attributes: { tier: 'premium' } }
      );
      expect(response.custom_attributes).toEqual({ tier: 'premium' });
    });

    it('should update multiple fields simultaneously', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'resolved',
          labels: [],
          custom_attributes: { tier: 'gold' },
        },
      });

      const response = await client.updateConversation({
        conversation_id: 123,
        status: 'resolved',
        assignee_id: 999,
        custom_attributes: { tier: 'gold' },
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/conversations/123',
        expect.objectContaining({
          status: 'resolved',
          assignee_id: 999,
          custom_attributes: { tier: 'gold' },
        })
      );
      expect(response.status).toBe('resolved');
    });

    it('should send empty payload if no fields provided', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'open',
          labels: [],
          custom_attributes: {},
        },
      });

      const response = await client.updateConversation({
        conversation_id: 123,
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/conversations/123', {});
      expect(response.id).toBe(123);
    });

    it('should validate response schema', async () => {
      mockAxiosInstance.patch.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'open',
          labels: ['urgent'],
          custom_attributes: { key: 'value' },
        },
      });

      const response = await client.updateConversation({
        conversation_id: 123,
        status: 'open',
      });

      expect(response).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          status: expect.any(String),
          labels: expect.any(Array),
          custom_attributes: expect.any(Object),
        })
      );
    });

    it('should throw error on HTTP error', async () => {
      mockAxiosInstance.patch.mockRejectedValueOnce(
        new Error('Conflict error')
      );

      await expect(
        client.updateConversation({
          conversation_id: 123,
          status: 'resolved',
        })
      ).rejects.toThrow();
    });

    it('should retry on transient failures', async () => {
      mockAxiosInstance.patch
        .mockRejectedValueOnce(new AxiosError('Service Unavailable', 'ENOTFOUND'))
        .mockResolvedValueOnce({
          data: {
            id: 123,
            status: 'resolved',
            labels: [],
            custom_attributes: {},
          },
        });

      const response = await client.updateConversation({
        conversation_id: 123,
        status: 'resolved',
      });

      expect(response.status).toBe('resolved');
      expect(mockAxiosInstance.patch).toHaveBeenCalledTimes(2);
    });
  });

  describe('addLabels', () => {
    it('should add single label', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'open',
          labels: ['urgent'],
          custom_attributes: {},
        },
      });

      const response = await client.addLabels({
        conversation_id: 123,
        labels: ['urgent'],
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/conversations/123/labels',
        { labels: ['urgent'] }
      );
      expect(response.labels).toContain('urgent');
    });

    it('should add multiple labels', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'open',
          labels: ['urgent', 'vip', 'priority'],
          custom_attributes: {},
        },
      });

      const response = await client.addLabels({
        conversation_id: 123,
        labels: ['urgent', 'vip', 'priority'],
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/conversations/123/labels',
        { labels: ['urgent', 'vip', 'priority'] }
      );
      expect(response.labels).toHaveLength(3);
    });

    it('should validate response schema', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'open',
          labels: ['test'],
          custom_attributes: {},
        },
      });

      const response = await client.addLabels({
        conversation_id: 123,
        labels: ['test'],
      });

      expect(response).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          status: expect.any(String),
          labels: expect.any(Array),
        })
      );
    });

    it('should throw error on failure', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(
        new Error('Invalid label')
      );

      await expect(
        client.addLabels({
          conversation_id: 123,
          labels: ['invalid'],
        })
      ).rejects.toThrow();
    });

    it('should retry on error', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce(new AxiosError('Timeout', 'ECONNABORTED'))
        .mockResolvedValueOnce({
          data: {
            id: 123,
            status: 'open',
            labels: ['urgent'],
            custom_attributes: {},
          },
        });

      const response = await client.addLabels({
        conversation_id: 123,
        labels: ['urgent'],
      });

      expect(response.labels).toContain('urgent');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeLabels', () => {
    it('should remove single label via DELETE', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({});

      await client.removeLabels({
        conversation_id: 123,
        labels: ['spam'],
      });

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/conversations/123/labels',
        expect.objectContaining({
          data: { labels: ['spam'] },
        })
      );
    });

    it('should remove multiple labels', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({});

      await client.removeLabels({
        conversation_id: 123,
        labels: ['spam', 'archived', 'old'],
      });

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/conversations/123/labels',
        expect.objectContaining({
          data: { labels: ['spam', 'archived', 'old'] },
        })
      );
    });

    it('should complete successfully', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({});

      await expect(
        client.removeLabels({
          conversation_id: 123,
          labels: ['spam'],
        })
      ).resolves.not.toThrow();
    });

    it('should retry on error', async () => {
      mockAxiosInstance.delete
        .mockRejectedValueOnce(new AxiosError('Network error', 'ECONNREFUSED'))
        .mockResolvedValueOnce({});

      await expect(
        client.removeLabels({
          conversation_id: 123,
          labels: ['spam'],
        })
      ).resolves.not.toThrow();

      expect(mockAxiosInstance.delete).toHaveBeenCalledTimes(2);
    });

    it('should return void on success', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({});

      const result = await client.removeLabels({
        conversation_id: 123,
        labels: ['nonexistent'],
      });

      expect(result).toBeUndefined();
    });
  });

  describe('getConversation', () => {
    it('should fetch conversation by ID', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          id: 123,
          status: 'open',
          labels: ['urgent'],
          custom_attributes: { tier: 'premium' },
        },
      });

      const response = await client.getConversation(123);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/conversations/123');
      expect(response.id).toBe(123);
    });

    it('should validate response schema', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          id: 456,
          status: 'resolved',
          labels: [],
          custom_attributes: {},
        },
      });

      const response = await client.getConversation(456);

      expect(response).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          status: expect.any(String),
          labels: expect.any(Array),
        })
      );
    });

    it('should throw error on 404', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(
        new Error('Conversation not found')
      );

      await expect(client.getConversation(999)).rejects.toThrow();
    });

    it('should retry on network error', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce(new AxiosError('Network timeout', 'ECONNABORTED'))
        .mockResolvedValueOnce({
          data: {
            id: 123,
            status: 'open',
            labels: [],
            custom_attributes: {},
          },
        });

      const response = await client.getConversation(123);

      expect(response.id).toBe(123);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should handle optional custom_attributes', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          id: 789,
          status: 'pending',
          labels: ['followup'],
        },
      });

      const response = await client.getConversation(789);

      expect(response.id).toBe(789);
      expect(response.custom_attributes).toBeUndefined();
    });
  });

  describe('axios interceptors', () => {
    it('should setup request interceptor', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should setup response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('should configure axios with headers', () => {
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'api_access_token': 'test-token-123',
          }),
        })
      );
    });
  });

  describe('retry integration', () => {
    it('should retry on transient errors', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce(new AxiosError('Timeout', 'ECONNABORTED'))
        .mockResolvedValueOnce({
          data: {
            id: 1,
            content: 'Test',
            message_type: 1,
            created_at: 1234567890,
            conversation_id: 123,
          },
        });

      const result = await client.sendMessage({
        conversation_id: 123,
        content: 'Test',
      });

      expect(result.id).toBe(1);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('should respect custom maxAttempts', () => {
      const customConfig: ChatwootClientConfig = {
        baseUrl: 'https://app.chatwoot.com',
        apiToken: 'token',
        accountId: 123,
        retryOptions: {
          maxAttempts: 5,
          delayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 1000,
        },
      };

      new ChatwootClient(customConfig);
      expect(mockAxios.create).toHaveBeenCalled();
    });

    it('should eventually fail after all retries exhausted', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce(new AxiosError('Timeout', 'ECONNABORTED'))
        .mockRejectedValueOnce(new AxiosError('Timeout', 'ECONNABORTED'))
        .mockRejectedValueOnce(new AxiosError('Timeout', 'ECONNABORTED'));

      await expect(
        client.sendMessage({
          conversation_id: 123,
          content: 'Test',
        })
      ).rejects.toThrow();

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should wrap errors properly', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(
        new Error('Bad request')
      );

      try {
        await client.sendMessage({
          conversation_id: 123,
          content: 'Test',
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        client.sendMessage({
          conversation_id: 123,
          content: 'Test',
        })
      ).rejects.toThrow();
    });
  });
});
