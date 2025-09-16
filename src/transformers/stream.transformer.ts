import { Injectable, Logger } from '@nestjs/common';
import { OpenAIStreamChunk } from '../models/openai/openai-stream.model';
import { GeminiResponseDto } from '../models/gemini/gemini-response.dto';

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

  // Initialize for specific model type
  initializeForModel(model: string): void {
    this.isGLMModel = model?.toLowerCase().includes('glm') || false;
    this.textBuffer = '';
    this.streamingToolCalls.clear();
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

      if (chunk.choices && chunk.choices.length > 0) {
        const choice = chunk.choices[0];
        const content = {
          role: 'model' as const,
          parts: [] as any[],
        };

        // Handle reasoning content delta first (from models like GLM and Qwen)
        // Convert reasoning content to a thought part (thought: true)
        if (choice.delta.reasoning_content) {
          const safeText = String(choice.delta.reasoning_content).replace(
            /[\x00-\x1F\x7F]/g,
            '',
          );
          if (safeText.trim()) {
            content.parts.push({
              text: safeText,
              thought: true,
            });
          }
        }

        // Handle regular content delta with safe text handling
        if (choice.delta.content) {
          // Ensure text is a string and filter out control characters
          const safeText = String(choice.delta.content).replace(
            /[\x00-\x1F\x7F]/g,
            '',
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
        if (choice.delta.tool_calls) {
          try {
            for (const toolCall of choice.delta.tool_calls) {
              this.accumulateToolCall(toolCall);
            }
          } catch (error) {
            this.logger.error('Error processing tool calls:', error);
          }
        }

        // If this is the final chunk, add complete tool calls and flush buffered text
        if (choice.finish_reason) {
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

        // Only add candidate if there are meaningful parts to include
        if (content.parts.length > 0) {
          geminiResponse.candidates.push({
            content,
            index: choice.index || 0,
            finishReason: this.mapFinishReason(choice.finish_reason),
          });
        } else if (choice.finish_reason) {
          // For finish reason only, include minimal candidate
          geminiResponse.candidates.push({
            content: {
              role: 'model' as const,
              parts: [],
            },
            index: choice.index || 0,
            finishReason: this.mapFinishReason(choice.finish_reason),
          });
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

  private accumulateToolCall(toolCall: any): void {
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
    }
  }

  private handleStreamFinish(): any[] {
    const toolCallParts: any[] = [];

    for (const [index, accumulated] of this.streamingToolCalls) {
      if (accumulated.name) {
        let args: Record<string, unknown> = {};

        // Only parse arguments if they exist and are non-empty
        if (accumulated.arguments && accumulated.arguments.trim()) {
          try {
            args = JSON.parse(accumulated.arguments);
          } catch (e) {
            // Invalid JSON, use empty object and log warning
            this.logger?.warn?.('Invalid JSON in tool call arguments:', {
              name: accumulated.name,
              arguments: accumulated.arguments,
              error: e.message,
            });
            args = {};
          }
        }

        // Generate a unique ID if none was provided
        const id = accumulated.id || `call_${index}_${Date.now()}`;

        toolCallParts.push({
          functionCall: {
            id,
            name: accumulated.name,
            args,
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
      return `data: {"error":"SSE format creation failed","message":"${error.message}"}\n\n`;
    }
  }

  // Create SSE end marker
  createSSEEndMarker(): string {
    // Return empty string - no end marker needed for Gemini format
    return '';
  }
}
