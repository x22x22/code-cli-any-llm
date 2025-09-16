import { Injectable, Logger } from '@nestjs/common';
import { OpenAIStreamChunk } from '../models/openai/openai-stream.model';
import { GeminiResponseDto } from '../models/gemini/gemini-response.dto';
import { ToolCallProcessor } from '../utils/zhipu/ToolCallProcessor';

@Injectable()
export class StreamTransformer {
  private readonly logger = new Logger(StreamTransformer.name);
  private readonly toolCallProcessor = new ToolCallProcessor();
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

        // Only add candidate if there are meaningful parts to include
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
        accumulated.name || 'unknown'
      );
    }
  }

  private handleStreamFinish(): Array<{
    functionCall?: { name: string; args: Record<string, any> };
  }> {
    const toolCallParts: Array<{
      functionCall?: { name: string; args: Record<string, any> };
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
              'qwen'
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
