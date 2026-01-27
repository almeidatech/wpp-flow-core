import { Attachment, MessageType, TenantId } from '../../config/types';
import { TenantConfigStore } from '../../config/tenant';
import { logger } from '../../utils/logger';
import { MediaProvider, OpenAIProvider } from './providers';

export interface ProcessRequest {
  tenant_id: TenantId;
  attachment: Attachment;
  type: MessageType;
}

export interface ExtractedContent {
  text: string;
  metadata: {
    duration?: number;
    pages?: number;
    dimensions?: { width: number; height: number };
  };
  confidence?: number;
}

export class MultimodalProcessor {
  private providers: Map<TenantId, MediaProvider> = new Map();

  constructor(private configStore: TenantConfigStore) {}

  private async getProvider(tenant_id: TenantId): Promise<MediaProvider> {
    let provider = this.providers.get(tenant_id);

    if (!provider) {
      const config = await this.configStore.get(tenant_id);
      provider = new OpenAIProvider(config.llm.api_key);
      this.providers.set(tenant_id, provider);
    }

    return provider;
  }

  async process(req: ProcessRequest): Promise<ExtractedContent> {
    const provider = await this.getProvider(req.tenant_id);

    logger.info('Processing multimodal content', {
      tenant_id: req.tenant_id,
      type: req.type,
      attachment_id: req.attachment.id,
    });

    switch (req.type) {
      case 'audio':
        return this.transcribe(provider, req.attachment.file_url);
      case 'image':
        return this.extractText(provider, req.attachment.file_url);
      case 'document':
        return this.parsePDF(provider, req.attachment.file_url);
      case 'video':
        return this.handleVideo(req.attachment.file_url);
      default:
        return { text: '', metadata: {} };
    }
  }

  private async transcribe(provider: MediaProvider, audio_url: string): Promise<ExtractedContent> {
    const text = await provider.transcribe(audio_url);

    logger.info('Audio transcribed', {
      url: audio_url,
      text_length: text.length,
    });

    return {
      text,
      metadata: {},
      confidence: 0.95,
    };
  }

  private async extractText(provider: MediaProvider, image_url: string): Promise<ExtractedContent> {
    const text = await provider.extractImageText(image_url);

    logger.info('Image text extracted', {
      url: image_url,
      text_length: text.length,
    });

    return {
      text,
      metadata: {},
      confidence: 0.9,
    };
  }

  private async parsePDF(provider: MediaProvider, pdf_url: string): Promise<ExtractedContent> {
    const text = await provider.parsePDF(pdf_url);

    logger.info('PDF parsed', {
      url: pdf_url,
      text_length: text.length,
    });

    return {
      text,
      metadata: {},
      confidence: 1.0,
    };
  }

  private async handleVideo(video_url: string): Promise<ExtractedContent> {
    logger.info('Video processing not implemented, returning URL', {
      url: video_url,
    });

    return {
      text: `[Video: ${video_url}]`,
      metadata: {},
      confidence: 0.5,
    };
  }
}
