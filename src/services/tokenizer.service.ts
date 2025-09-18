import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { GeminiUsageMetadataDto } from '../models/gemini/gemini-usage-metadata.dto';

export interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

@Injectable()
export class TokenizerService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenizerService.name);
  private encoderCache = new Map<
    string,
    ReturnType<typeof encoding_for_model>
  >();

  /**
   * Count tokens for a given text using the specified model
   */
  countTokens(text: string, model: string): number {
    try {
      // Get or create encoder for the model
      let encoder = this.encoderCache.get(model);
      if (!encoder) {
        // Try to get encoder for the specific model
        try {
          encoder = encoding_for_model(model as TiktokenModel);
          this.encoderCache.set(model, encoder);
          this.logger.debug(`Created encoder for model: ${model}`);
        } catch {
          // Fall back to cl100k_base encoding for newer/unknown models
          this.logger.warn(
            `No specific encoding for model ${model}, using cl100k_base`,
          );
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
  countTokensInRequest(
    contents: Array<{
      parts?: Array<{ text?: string }>;
    }>,
    model?: string,
  ): number {
    let totalTokens = 0;

    if (contents && Array.isArray(contents)) {
      for (const content of contents) {
        if (content.parts && Array.isArray(content.parts)) {
          for (const part of content.parts) {
            if (part.text) {
              const tokens = this.countTokens(
                part.text,
                model || 'gpt-3.5-turbo',
              );
              totalTokens += tokens;
            }
          }
        }
      }
    }

    return totalTokens;
  }

  /**
   * Combine API-provided usage information with local token calculation
   * Prioritizes API usage data, fills gaps with local calculation
   */
  combineUsageInfo(
    apiUsage: UsageInfo | null,
    localText: {
      promptText?: string;
      candidateText?: string;
      thoughtText?: string;
    },
    model?: string,
  ): GeminiUsageMetadataDto {
    const usedModel = model || 'gpt-3.5-turbo';

    // If we have complete API usage info, use it directly
    if (
      apiUsage?.prompt_tokens &&
      apiUsage?.completion_tokens &&
      apiUsage?.total_tokens
    ) {
      this.logger.debug('Using complete API usage information');
      return {
        promptTokenCount: apiUsage.prompt_tokens,
        candidatesTokenCount: apiUsage.completion_tokens,
        totalTokenCount: apiUsage.total_tokens,
      };
    }

    // Calculate missing parts locally
    const localPromptTokens = localText.promptText
      ? this.countTokens(localText.promptText, usedModel)
      : 0;
    const localCandidateTokens = localText.candidateText
      ? this.countTokens(localText.candidateText, usedModel)
      : 0;
    const localThoughtTokens = localText.thoughtText
      ? this.countTokens(localText.thoughtText, usedModel)
      : 0;

    // Use API values when available, fall back to local calculation
    const promptTokenCount = apiUsage?.prompt_tokens ?? localPromptTokens;
    const candidatesTokenCount =
      apiUsage?.completion_tokens ?? localCandidateTokens;
    const totalTokenCount =
      apiUsage?.total_tokens ??
      promptTokenCount + candidatesTokenCount + localThoughtTokens;

    const result: GeminiUsageMetadataDto = {
      promptTokenCount,
      candidatesTokenCount,
      totalTokenCount,
    };

    if (localThoughtTokens > 0) {
      result.thoughtsTokenCount = localThoughtTokens;
    }

    const usageSource = apiUsage ? 'hybrid (API + local)' : 'local only';
    this.logger.debug(`Token usage calculated using ${usageSource}:`, result);

    return result;
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
