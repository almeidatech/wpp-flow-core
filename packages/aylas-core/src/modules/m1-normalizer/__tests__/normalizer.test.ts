import { MessageNormalizer } from '../normalizer';
import { WebhookPayload } from '../../../config/types';
import { AylasError, ErrorCode } from '../../../utils/errors';

describe('MessageNormalizer', () => {
  let normalizer: MessageNormalizer;

  beforeEach(() => {
    normalizer = new MessageNormalizer();
  });

  describe('validate', () => {
    it('should validate valid webhook payload', () => {
      const payload: WebhookPayload = {
        event: 'message_created',
        body: {
          conversation: {
            id: 123,
            contact: { phone_number: '+5511999999999' },
          },
          message: {
            content: 'Hello',
            content_type: 'text',
          },
        },
      };

      expect(normalizer.validate(payload)).toBe(true);
    });

    it('should reject invalid event type', () => {
      const payload = {
        event: 'invalid_event',
        body: {
          conversation: { id: 123, contact: { phone_number: '+5511999999999' } },
        },
      } as unknown as WebhookPayload;

      expect(normalizer.validate(payload)).toBe(false);
    });

    it('should reject missing conversation', () => {
      const payload = {
        event: 'message_created',
        body: {},
      } as unknown as WebhookPayload;

      expect(normalizer.validate(payload)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should normalize text message', async () => {
      const payload: WebhookPayload = {
        event: 'message_created',
        body: {
          conversation: {
            id: 456,
            contact: { phone_number: '+55 (11) 99999-9999' },
          },
          message: {
            content: 'Test message',
            content_type: 'text',
          },
          custom_attributes: { source: 'whatsapp' },
        },
      };

      const result = await normalizer.normalize(payload, 'tenant_123');

      expect(result).toMatchObject({
        tenant_id: 'tenant_123',
        conversation_id: '456',
        phone: '5511999999999',
        type: 'text',
        content: 'Test message',
        attachments: [],
      });
      expect(result.metadata).toMatchObject({
        custom_attributes: { source: 'whatsapp' },
        content_type: 'text',
      });
    });

    it('should detect audio message type', async () => {
      const payload: WebhookPayload = {
        event: 'message_created',
        body: {
          conversation: {
            id: 789,
            contact: { phone_number: '+5511999999999' },
          },
          message: {
            content: '',
            content_type: 'audio',
            attachments: [
              {
                id: 1,
                file_url: 'https://example.com/audio.ogg',
                data_url: 'https://example.com/audio.ogg',
                file_type: 'audio/ogg',
              },
            ],
          },
        },
      };

      const result = await normalizer.normalize(payload, 'tenant_123');

      expect(result.type).toBe('audio');
      expect(result.attachments).toHaveLength(1);
    });

    it('should detect image message type', async () => {
      const payload: WebhookPayload = {
        event: 'message_created',
        body: {
          conversation: {
            id: 101,
            contact: { phone_number: '+5511999999999' },
          },
          message: {
            content: '',
            content_type: 'image',
            attachments: [
              {
                id: 2,
                file_url: 'https://example.com/image.jpg',
                data_url: 'https://example.com/image.jpg',
                file_type: 'image/jpeg',
              },
            ],
          },
        },
      };

      const result = await normalizer.normalize(payload, 'tenant_123');

      expect(result.type).toBe('image');
    });

    it('should detect document message type', async () => {
      const payload: WebhookPayload = {
        event: 'message_created',
        body: {
          conversation: {
            id: 102,
            contact: { phone_number: '+5511999999999' },
          },
          message: {
            content: '',
            content_type: 'document',
            attachments: [
              {
                id: 3,
                file_url: 'https://example.com/doc.pdf',
                data_url: 'https://example.com/doc.pdf',
                file_type: 'application/pdf',
              },
            ],
          },
        },
      };

      const result = await normalizer.normalize(payload, 'tenant_123');

      expect(result.type).toBe('document');
    });

    it('should detect video message type', async () => {
      const payload: WebhookPayload = {
        event: 'message_created',
        body: {
          conversation: {
            id: 103,
            contact: { phone_number: '+5511999999999' },
          },
          message: {
            content: '',
            content_type: 'video',
            attachments: [
              {
                id: 4,
                file_url: 'https://example.com/video.mp4',
                data_url: 'https://example.com/video.mp4',
                file_type: 'video/mp4',
              },
            ],
          },
        },
      };

      const result = await normalizer.normalize(payload, 'tenant_123');

      expect(result.type).toBe('video');
    });

    it('should throw error for missing message', async () => {
      const payload: WebhookPayload = {
        event: 'message_created',
        body: {
          conversation: {
            id: 123,
            contact: { phone_number: '+5511999999999' },
          },
        },
      };

      await expect(normalizer.normalize(payload, 'tenant_123')).rejects.toThrow(AylasError);
      await expect(normalizer.normalize(payload, 'tenant_123')).rejects.toMatchObject({
        code: ErrorCode.MISSING_FIELD,
      });
    });

    it('should throw error for invalid payload', async () => {
      const payload = {
        event: 'invalid',
      } as unknown as WebhookPayload;

      await expect(normalizer.normalize(payload, 'tenant_123')).rejects.toThrow(AylasError);
    });
  });
});
