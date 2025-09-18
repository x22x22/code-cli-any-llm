import { Injectable, Logger } from '@nestjs/common';
import { OpenAIStreamChunk } from '../models/openai/openai-stream.model';
import { GeminiResponseDto } from '../models/gemini/gemini-response.dto';
import { ToolCallProcessor } from '../utils/zhipu/ToolCallProcessor';
import { TokenizerService } from '../services/tokenizer.service';
import { GeminiUsageMetadataDto } from '../models/gemini/gemini-usage-metadata.dto';

@Injectable()
export class StreamTransformer {
  private readonly logger = new Logger(StreamTransformer.name);
  private streamingToolCalls = new Map<
    number,
    {
      id?: string;
      name?: string;
      arguments: string;
    }
  >();

  // Buffer for GLM models to avoid formatting issues
  private textBuffer = '';
  private isGLMModel = false;
  private promptTokenCount = 0;
  private cumulativeCandidateText = '';
  private cumulativeThoughtText = '';
  private lastUsageMetadata: GeminiUsageMetadataDto | null = null;
  private tokenizerModel: string | null = null;
  private apiUsageMetadata: GeminiUsageMetadataDto | null = null;

  // Initialize for specific model type
  constructor(
    private readonly tokenizerService: TokenizerService,
    private readonly toolCallProcessor: ToolCallProcessor,
  ) {}

  initializeForModel(model: string, promptTokens = 0): void {
    this.isGLMModel = model?.toLowerCase().includes('glm') || false;
    this.textBuffer = '';
    this.streamingToolCalls.clear();
    this.promptTokenCount = promptTokens;
    this.cumulativeCandidateText = '';
    this.cumulativeThoughtText = '';
    this.lastUsageMetadata = null;
    this.tokenizerModel = model;
    this.apiUsageMetadata = null;
  }

  // Helper function to remove control characters
  private removeControlCharacters(text: string): string {
    // Remove control characters (excluding tab \t and newline \n)
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const code = char.charCodeAt(0);
      // Keep printable characters, tab (\t), line feed (\n), and carriage return (\r)
      if (
        (code >= 32 && code <= 126) ||
        code === 9 ||
        code === 10 ||
        code === 13 ||
        code > 127
      ) {
        result += char;
      }
    }
    return result;
  }

  // Get any buffered text for GLM models
  getBufferedText(): string | null {
    if (this.isGLMModel && this.textBuffer.length > 0) {
      const text = this.textBuffer;
      this.textBuffer = '';
      return text;
    }
    return null;
  }

  // Map OpenAI finish reasons to Gemini finish reasons
  private mapFinishReason(openaiReason: string | null | undefined): string {
    if (!openaiReason) return 'FINISH_REASON_UNSPECIFIED';

    const mapping: Record<string, string> = {
      stop: 'STOP',
      length: 'MAX_TOKENS',
      content_filter: 'SAFETY',
      function_call: 'STOP',
      tool_calls: 'STOP',
    };

    return mapping[openaiReason] || 'FINISH_REASON_UNSPECIFIED';
  }

  transformStreamChunk(chunk: OpenAIStreamChunk): GeminiResponseDto {
    try {
      const geminiResponse: GeminiResponseDto = {
        candidates: [],
      };

      // Add metadata fields with safe string conversion
      geminiResponse.responseId = chunk.id || 'unknown';
      geminiResponse.createTime =
        chunk.created?.toString() || Date.now().toString();
      geminiResponse.modelVersion = chunk.model || 'unknown';

      // Note: thoughtSignature should be set at the controller level based on query param

      // Process API usage information if available (prioritize over local calculation)
      if (chunk.usage) {
        const usage = chunk.usage;
        const promptTokens = usage.prompt_tokens ?? this.promptTokenCount;
        const completionTokens = usage.completion_tokens ?? 0;
        const totalTokens =
          usage.total_tokens ?? promptTokens + completionTokens;

        this.apiUsageMetadata = {
          promptTokenCount: promptTokens,
          candidatesTokenCount: completionTokens,
          totalTokenCount: totalTokens,
        };
        this.logger.debug(
          'Using API-provided usage metadata:',
          this.apiUsageMetadata,
        );
      }

      if (chunk.choices && chunk.choices.length > 0) {
        const choice = chunk.choices[0];
        const content = {
          role: 'model' as const,
          parts: [] as Array<{
            text?: string;
            thought?: boolean;
            functionCall?: { name: string; args: Record<string, any> };
            functionResponse?: { name: string; response: any };
            inlineData?: { mimeType: string; data: string };
            fileData?: { mimeType: string; fileUri: string };
          }>,
        };

        // Handle reasoning content delta first (from models like GLM and Qwen)
        // Convert reasoning content to a thought part (thought: true)
        const choiceWithDelta = choice as {
          delta: {
            reasoning_content?: string;
            content?: string;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: {
                name?: string;
                arguments?: string;
              };
            }>;
          };
          index?: number;
          finish_reason?: string;
        };

        if (choiceWithDelta.delta.reasoning_content) {
          const safeText = this.removeControlCharacters(
            String(choiceWithDelta.delta.reasoning_content),
          );
          if (safeText.trim()) {
            content.parts.push({
              text: safeText,
              thought: true,
            });
          }
        }

        // Handle regular content delta with safe text handling
        if (choiceWithDelta.delta.content) {
          // Ensure text is a string and filter out control characters
          const safeText = this.removeControlCharacters(
            String(choiceWithDelta.delta.content),
          );

          if (safeText.trim()) {
            if (this.isGLMModel) {
              // For GLM models, buffer text to avoid formatting issues
              this.textBuffer += safeText;

              // Emit buffered text when we have complete sentences or paragraphs
              // For Chinese text, also flush on Chinese punctuation marks
              if (
                this.textBuffer.includes('\n') ||
                this.textBuffer.endsWith('. ') ||
                this.textBuffer.endsWith('! ') ||
                this.textBuffer.endsWith('? ') ||
                this.textBuffer.endsWith('。') || // Chinese period
                this.textBuffer.endsWith('！') || // Chinese exclamation
                this.textBuffer.endsWith('？') || // Chinese question mark
                this.textBuffer.endsWith('：') || // Chinese colon
                this.textBuffer.length > 50 // Reduce buffer size for faster output
              ) {
                content.parts.push({ text: this.textBuffer });
                this.textBuffer = '';
              }
            } else {
              // For other models, emit immediately
              content.parts.push({ text: safeText });
            }
          }
        }

        // Handle tool call deltas
        if (choiceWithDelta.delta.tool_calls) {
          try {
            for (const toolCall of choiceWithDelta.delta.tool_calls) {
              this.accumulateToolCall(toolCall);
            }
          } catch (error) {
            this.logger.error('Error processing tool calls:', error);
          }
        }

        // If this is the final chunk, add complete tool calls and flush buffered text
        if (choiceWithDelta.finish_reason) {
          try {
            // For GLM models, flush any remaining buffered text
            if (this.isGLMModel && this.textBuffer.length > 0) {
              content.parts.push({ text: this.textBuffer });
              this.textBuffer = '';
            }

            const toolCallParts = this.handleStreamFinish();
            if (Array.isArray(toolCallParts)) {
              content.parts.push(...toolCallParts);
            }
          } catch (error) {
            this.logger.error('Error handling stream finish:', error);
          }
        }

        const normalizedParts = this.toolCallProcessor.normalizeTextToolCalls(
          content.parts as Array<Record<string, unknown>>,
        );
        (content.parts as Array<unknown>).splice(
          0,
          content.parts.length,
          ...normalizedParts,
        );

        // Only add candidate if there are meaningful parts to include
        const usageMetadata = this.buildUsageMetadata(
          content.parts as Array<Record<string, unknown>>,
        );
        geminiResponse.usageMetadata = usageMetadata;

        if (content.parts.length > 0) {
          geminiResponse.candidates.push({
            content,
            index: choiceWithDelta.index || 0,
            finishReason: this.mapFinishReason(choiceWithDelta.finish_reason),
          });
        } else if (choiceWithDelta.finish_reason) {
          // For finish reason only, include minimal candidate
          geminiResponse.candidates.push({
            content: {
              role: 'model' as const,
              parts: [],
            },
            index: choiceWithDelta.index || 0,
            finishReason: this.mapFinishReason(choiceWithDelta.finish_reason),
          });
        } else if (geminiResponse.usageMetadata) {
          // Preserve usage metadata even if we skip empty chunks
        }
      }

      return geminiResponse;
    } catch (error) {
      this.logger.error('Error transforming stream chunk:', error);
      // Return a minimal safe response
      return {
        candidates: [
          {
            content: {
              role: 'model' as const,
              parts: [],
            },
            index: 0,
            finishReason: 'FINISH_REASON_UNSPECIFIED',
          },
        ],
      };
    }
  }

  private accumulateToolCall(toolCall: {
    index: number;
    id?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }): void {
    if (!this.streamingToolCalls.has(toolCall.index)) {
      this.streamingToolCalls.set(toolCall.index, {
        arguments: '',
      });
    }

    const accumulated = this.streamingToolCalls.get(toolCall.index)!;

    if (toolCall.id) {
      accumulated.id = toolCall.id;
    }

    if (toolCall.function?.name) {
      accumulated.name = toolCall.function.name;
    }

    if (toolCall.function?.arguments) {
      accumulated.arguments += toolCall.function.arguments;

      // 检测流式工具调用中的双重转义模式
      this.toolCallProcessor.detectDoubleEscapingInStreamChunk(
        toolCall.function.arguments,
        accumulated.name || 'unknown',
      );
    }
  }

  private handleStreamFinish(): Array<{
    functionCall?: { id?: string; name: string; args: Record<string, any> };
  }> {
    const toolCallParts: Array<{
      functionCall?: { id?: string; name: string; args: Record<string, any> };
    }> = [];

    for (const [, accumulated] of this.streamingToolCalls) {
      if (accumulated.name) {
        let args: Record<string, unknown> = {};

        // Only parse arguments if they exist and are non-empty
        if (accumulated.arguments && accumulated.arguments.trim()) {
          try {
            // 使用 ToolCallProcessor 安全解析工具调用参数
            args = this.toolCallProcessor.parseToolCallArguments(
              accumulated.arguments,
              accumulated.name,
              'qwen',
            ) as Record<string, unknown>;
          } catch (e) {
            // Invalid JSON, use empty object and log warning
            this.logger?.warn?.('Invalid JSON in tool call arguments:', {
              name: accumulated.name,
              arguments: accumulated.arguments,
              error: (e as Error).message,
            });
            args = {};
          }
        }

        // Note: ID is available but not used in Gemini format
        // const id = accumulated.id || `call_${index}_${Date.now()}`;

        toolCallParts.push({
          functionCall: {
            id: accumulated.id,
            name: accumulated.name,
            args: args as Record<string, any>,
          },
        });
      }
    }

    // Clear accumulated tool calls
    this.streamingToolCalls.clear();

    return toolCallParts;
  }

  reset(): void {
    this.streamingToolCalls.clear();
  }

  applyUsageMetadata(responseChunk: Record<string, unknown>): void {
    const candidates = responseChunk?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return;
    }

    const firstCandidate = candidates[0] as {
      content?: { parts?: Array<Record<string, unknown>> };
    };
    if (!firstCandidate?.content?.parts) {
      return;
    }

    const normalizedParts = this.toolCallProcessor.normalizeTextToolCalls(
      firstCandidate.content.parts,
    );
    firstCandidate.content.parts = normalizedParts;
    const usageMetadata = this.buildUsageMetadata(normalizedParts);
    responseChunk.usageMetadata = usageMetadata;
  }

  private buildUsageMetadata(
    parts: Array<Record<string, unknown>>,
  ): GeminiUsageMetadataDto {
    // Accumulate text from parts for local calculation if needed
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const text = typeof part?.text === 'string' ? part.text : undefined;
        if (!text) {
          continue;
        }

        if ((part as { thought?: boolean }).thought) {
          this.cumulativeThoughtText += text;
        } else {
          this.cumulativeCandidateText += text;
        }
      }
    }

    const model = this.tokenizerModel || 'gpt-3.5-turbo';

    // Convert API usage to the expected format
    const apiUsage = this.apiUsageMetadata
      ? {
          prompt_tokens: this.apiUsageMetadata.promptTokenCount,
          completion_tokens: this.apiUsageMetadata.candidatesTokenCount,
          total_tokens: this.apiUsageMetadata.totalTokenCount,
        }
      : null;

    // Use the new combined approach
    const usage = this.tokenizerService.combineUsageInfo(
      apiUsage,
      {
        candidateText: this.cumulativeCandidateText || undefined,
        thoughtText: this.cumulativeThoughtText || undefined,
      },
      model,
    );

    // Override prompt tokens with our tracked value if API didn't provide it
    if (!apiUsage?.prompt_tokens && this.promptTokenCount > 0) {
      usage.promptTokenCount = this.promptTokenCount;
      usage.totalTokenCount =
        usage.promptTokenCount +
        usage.candidatesTokenCount +
        (usage.thoughtsTokenCount || 0);
    }

    this.lastUsageMetadata = usage;
    return usage;
  }

  // Convert Gemini stream chunk to SSE format
  toSSEFormat(geminiResponse: GeminiResponseDto): string {
    try {
      // Validate object before serialization
      if (!geminiResponse || typeof geminiResponse !== 'object') {
        this.logger.error('Invalid response object:', geminiResponse);
        return `data: {"error":"Invalid response object"}\n\n`;
      }

      // Filter out empty candidates to avoid sending empty chunks
      if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
        geminiResponse.candidates = geminiResponse.candidates.filter(
          (candidate) => {
            // Keep candidates that have content parts or finish reason
            return (
              (candidate.content &&
                candidate.content.parts &&
                candidate.content.parts.length > 0) ||
              candidate.finishReason !== 'FINISH_REASON_UNSPECIFIED'
            );
          },
        );

        // If no valid candidates remain, skip this chunk
        if (geminiResponse.candidates.length === 0) {
          return ''; // Return empty string to skip this chunk
        }
      } else {
        // If no candidates at all, skip this chunk
        return '';
      }

      const jsonString = JSON.stringify(geminiResponse);

      // Validate the JSON string
      if (!jsonString || jsonString === 'undefined' || jsonString === 'null') {
        this.logger.error('JSON stringification failed:', geminiResponse);
        return `data: {"error":"JSON stringification failed"}\n\n`;
      }

      // Test parse to ensure it's valid JSON
      try {
        JSON.parse(jsonString);
      } catch (parseError) {
        this.logger.error('Generated invalid JSON:', jsonString);
        this.logger.error('Parse error:', parseError);
        return `data: {"error":"Generated invalid JSON"}\n\n`;
      }

      return `data: ${jsonString}\n\n`;
    } catch (error) {
      this.logger.error('Failed to create SSE format:', error);
      this.logger.error('Response object:', geminiResponse);
      return `data: {"error":"SSE format creation failed","message":"${(error as Error).message}"}\n\n`;
    }
  }

  // Create SSE end marker
  createSSEEndMarker(): string {
    // Return empty string - no end marker needed for Gemini format
    return '';
  }
}
