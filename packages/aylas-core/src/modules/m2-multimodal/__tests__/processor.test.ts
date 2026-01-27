import { MultimodalProcessor, ProcessRequest } from '../processor';
import { TenantConfigStore } from '../../../config/tenant';
import { Attachment } from '../../../config/types';
import { AylasError, ErrorCode } from '../../../utils/errors';

jest.mock('openai');
jest.mock('axios');
jest.mock('pdf-parse');

const mockConfigStore = {
  get: jest.fn().mockResolvedValue({
    id: 'tenant_123',
    llm: { api_key: 'test-key', provider: 'openai', model: 'gpt-4o-mini', temperature: 0.7 },
  }),
} as unknown as TenantConfigStore;

describe('MultimodalProcessor', () => {
  jest.setTimeout(15000);

  let processor: MultimodalProcessor;

  beforeEach(() => {
    processor = new MultimodalProcessor(mockConfigStore);
    jest.clearAllMocks();
  });

  const createAttachment = (file_type: string): Attachment => ({
    id: 1,
    file_url: 'https://example.com/file',
    data_url: 'https://example.com/file',
    file_type,
  });

  describe('process', () => {
    it('should process audio attachment', async () => {
      const req: ProcessRequest = {
        tenant_id: 'tenant_123',
        attachment: createAttachment('audio/ogg'),
        type: 'audio',
      };

      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        audio: {
          transcriptions: {
            create: jest.fn().mockResolvedValue({ text: 'Transcribed text' }),
          },
        },
      }));

      const axios = require('axios');
      axios.get.mockResolvedValue({ data: Buffer.from('audio data') });

      const result = await processor.process(req);

      expect(result.text).toBe('Transcribed text');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should process image attachment', async () => {
      const req: ProcessRequest = {
        tenant_id: 'tenant_123',
        attachment: createAttachment('image/jpeg'),
        type: 'image',
      };

      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'Image description' } }],
            }),
          },
        },
      }));

      const result = await processor.process(req);

      expect(result.text).toBe('Image description');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should process PDF attachment', async () => {
      const req: ProcessRequest = {
        tenant_id: 'tenant_123',
        attachment: createAttachment('application/pdf'),
        type: 'document',
      };

      const axios = require('axios');
      axios.get.mockResolvedValue({ data: Buffer.from('pdf data') });

      const pdfParse = require('pdf-parse');
      pdfParse.mockResolvedValue({ text: 'PDF content' });

      const result = await processor.process(req);

      expect(result.text).toBe('PDF content');
      expect(result.confidence).toBe(1.0);
    });

    it('should handle video attachment', async () => {
      const req: ProcessRequest = {
        tenant_id: 'tenant_123',
        attachment: createAttachment('video/mp4'),
        type: 'video',
      };

      const result = await processor.process(req);

      expect(result.text).toContain('Video');
      expect(result.text).toContain(req.attachment.file_url);
    });

    it('should handle text type gracefully', async () => {
      const req: ProcessRequest = {
        tenant_id: 'tenant_123',
        attachment: createAttachment('text/plain'),
        type: 'text',
      };

      const result = await processor.process(req);

      expect(result.text).toBe('');
      expect(result.metadata).toEqual({});
    });

    it('should handle transcription errors', async () => {
      const req: ProcessRequest = {
        tenant_id: 'tenant_123',
        attachment: createAttachment('audio/ogg'),
        type: 'audio',
      };

      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        audio: {
          transcriptions: {
            create: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      }));

      const axios = require('axios');
      axios.get.mockResolvedValue({ data: Buffer.from('audio data') });

      await expect(processor.process(req)).rejects.toThrow(AylasError);
      await expect(processor.process(req)).rejects.toMatchObject({
        code: ErrorCode.TRANSCRIPTION_FAILED,
      });
    });

    it('should handle OCR errors', async () => {
      const req: ProcessRequest = {
        tenant_id: 'tenant_123',
        attachment: createAttachment('image/jpeg'),
        type: 'image',
      };

      const OpenAI = require('openai');
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      }));

      await expect(processor.process(req)).rejects.toThrow(AylasError);
      await expect(processor.process(req)).rejects.toMatchObject({
        code: ErrorCode.OCR_FAILED,
      });
    });

    it('should handle PDF parsing errors', async () => {
      const req: ProcessRequest = {
        tenant_id: 'tenant_123',
        attachment: createAttachment('application/pdf'),
        type: 'document',
      };

      const axios = require('axios');
      axios.get.mockRejectedValue(new Error('Network error'));

      await expect(processor.process(req)).rejects.toThrow(AylasError);
      await expect(processor.process(req)).rejects.toMatchObject({
        code: ErrorCode.PDF_PARSE_FAILED,
      });
    });
  });
});
