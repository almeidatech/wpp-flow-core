import OpenAI from 'openai';
import axios from 'axios';
import pdfParse from 'pdf-parse';
import { AylasError, ErrorCode } from '../../utils/errors';
import { retry } from '../../utils/retry';

export interface MediaProvider {
  transcribe(url: string): Promise<string>;
  extractImageText(url: string): Promise<string>;
  parsePDF(url: string): Promise<string>;
}

export class OpenAIProvider implements MediaProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(url: string): Promise<string> {
    try {
      return await retry(async () => {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const audioBuffer = Buffer.from(response.data as ArrayBuffer);

        const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });

        const transcription = await this.client.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          language: 'pt',
        });

        return transcription.text;
      });
    } catch (error) {
      throw new AylasError(
        ErrorCode.TRANSCRIPTION_FAILED,
        'Failed to transcribe audio',
        { url, error: String(error) }
      );
    }
  }

  async extractImageText(url: string): Promise<string> {
    try {
      return await retry(async () => {
        const response = await this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Descreva o conteúdo desta imagem em português, incluindo qualquer texto visível.',
                },
                {
                  type: 'image_url',
                  image_url: { url },
                },
              ],
            },
          ],
          max_tokens: 500,
        });

        return response.choices[0]?.message?.content || '';
      });
    } catch (error) {
      throw new AylasError(
        ErrorCode.OCR_FAILED,
        'Failed to extract text from image',
        { url, error: String(error) }
      );
    }
  }

  async parsePDF(url: string): Promise<string> {
    try {
      return await retry(async () => {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const pdfBuffer = Buffer.from(response.data as ArrayBuffer);

        const data = await pdfParse(pdfBuffer);
        return data.text;
      });
    } catch (error) {
      throw new AylasError(
        ErrorCode.PDF_PARSE_FAILED,
        'Failed to parse PDF',
        { url, error: String(error) }
      );
    }
  }
}
