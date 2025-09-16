import { Injectable, Logger } from '@nestjs/common';
import { encoding_for_model, TiktokenModel } from 'tiktoken';

@Injectable()
export class TokenizerService {
  private readonly logger = new Logger(TokenizerService.name);
  private encoderCache = new Map<string, ReturnType<typeof encoding_for_model>>();

  /**
   * Count tokens for a given text using the specified model
   */
  async countTokens(text: string, model: string): Promise<number> {
    try {
      // Get or create encoder for the model
      let encoder = this.encoderCache.get(model);
      if (!encoder) {
        // Try to get encoder for the specific model
        try {
          encoder = encoding_for_model(model as TiktokenModel);
          this.encoderCache.set(model, encoder);
          this.logger.debug(`Created encoder for model: ${model}`);
        } catch (_error) {
          // Fall back to cl100k_base encoding for newer/unknown models
          this.logger.warn(`No specific encoding for model ${model}, using cl100k_base`);
          encoder = encoding_for_model('gpt-4');
          this.encoderCache.set(model, encoder);
        }
      }

      // Count tokens
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch (error) {
      this.logger.error('Error counting tokens with tiktoken:', error);
      // Fallback: rough estimate based on characters
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Count tokens for all text content in a Gemini request
   */
  async countTokensInRequest(contents: any[], model?: string): Promise<number> {
    let totalTokens = 0;

    if (contents && Array.isArray(contents)) {
      for (const content of contents) {
        if (content.parts && Array.isArray(content.parts)) {
          for (const part of content.parts) {
            if (part.text) {
              const tokens = await this.countTokens(part.text, model || 'gpt-3.5-turbo');
              totalTokens += tokens;
            }
          }
        }
      }
    }

    return totalTokens;
  }

  /**
   * Clean up encoder cache
   */
  onModuleDestroy() {
    for (const encoder of this.encoderCache.values()) {
      encoder.free();
    }
    this.encoderCache.clear();
  }
}