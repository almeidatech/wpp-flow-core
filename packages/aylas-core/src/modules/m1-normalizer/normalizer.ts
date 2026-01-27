import { z } from 'zod';
import { WebhookPayload, NormalizedMessage, TenantId, MessageType, Attachment } from '../../config/types';
import { AylasError, ErrorCode } from '../../utils/errors';
import { logger } from '../../utils/logger';

const AttachmentSchema = z.object({
  id: z.number(),
  file_url: z.string().url(),
  data_url: z.string().url(),
  file_type: z.string(),
});

const WebhookPayloadSchema = z.object({
  event: z.enum(['message_created', 'conversation_status_changed']),
  body: z.object({
    conversation: z.object({
      id: z.number(),
      contact: z.object({
        phone_number: z.string(),
      }),
    }),
    message: z.object({
      content: z.string(),
      content_type: z.string(),
      attachments: z.array(AttachmentSchema).optional(),
    }).optional(),
    custom_attributes: z.record(z.unknown()).optional(),
  }),
});

export class MessageNormalizer {
  validate(payload: WebhookPayload): boolean {
    try {
      WebhookPayloadSchema.parse(payload);
      return true;
    } catch (error) {
      logger.error('Webhook validation failed', { error });
      return false;
    }
  }

  async normalize(payload: WebhookPayload, tenant_id: TenantId): Promise<NormalizedMessage> {
    if (!this.validate(payload)) {
      throw new AylasError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid webhook payload',
        { event: payload?.event }
      );
    }

    const { conversation, message, custom_attributes } = payload.body;

    if (!message) {
      throw new AylasError(
        ErrorCode.MISSING_FIELD,
        'Message field is required for message_created events'
      );
    }

    const phone = this.normalizePhone(conversation.contact.phone_number);
    const type = this.detectMessageType(message.content_type, message.attachments);
    const attachments = message.attachments || [];

    const normalized: NormalizedMessage = {
      tenant_id,
      conversation_id: conversation.id.toString(),
      phone,
      timestamp: Date.now(),
      type,
      content: message.content || '',
      attachments,
      metadata: {
        custom_attributes: custom_attributes || {},
        content_type: message.content_type,
      },
    };

    logger.info('Message normalized', {
      tenant_id,
      conversation_id: normalized.conversation_id,
      type,
      has_attachments: attachments.length > 0,
    });

    return normalized;
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private detectMessageType(_content_type: string, attachments?: Attachment[]): MessageType {
    if (!attachments || attachments.length === 0) {
      return 'text';
    }

    const firstAttachment = attachments[0];
    if (!firstAttachment) {
      return 'text';
    }

    const fileType = firstAttachment.file_type.toLowerCase();

    if (fileType.startsWith('audio/') || fileType.includes('ogg')) {
      return 'audio';
    }
    if (fileType.startsWith('image/')) {
      return 'image';
    }
    if (fileType.startsWith('video/')) {
      return 'video';
    }
    if (fileType === 'application/pdf' || fileType.includes('document')) {
      return 'document';
    }

    return 'text';
  }
}
