import { Injectable, Logger } from '@nestjs/common';
import { OpenAIStreamChunk } from '../models/openai/openai-stream.model';
import { GeminiResponseDto } from '../models/gemini/gemini-response.dto';

@Injectable()
export class StreamTransformer {
  private readonly logger = new Logger(StreamTransformer.name);
  private streamingToolCalls = new Map<number, {
    id?: string;
    name?: string;
    arguments: string;
  }>();

  // Map OpenAI finish reasons to Gemini finish reasons
  private mapFinishReason(openaiReason: string | null | undefined): string {
    if (!openaiReason) return 'FINISH_REASON_UNSPECIFIED';

    const mapping: Record<string, string> = {
      'stop': 'STOP',
      'length': 'MAX_TOKENS',
      'content_filter': 'SAFETY',
      'function_call': 'STOP',
      'tool_calls': 'STOP',
    };

    return mapping[openaiReason] || 'FINISH_REASON_UNSPECIFIED';
  }

  transformStreamChunk(chunk: OpenAIStreamChunk): GeminiResponseDto {
    const geminiResponse: GeminiResponseDto = {
      candidates: [],
    };

    // Add metadata fields
    geminiResponse.responseId = chunk.id;
    geminiResponse.createTime = chunk.created?.toString() || Date.now().toString();
    geminiResponse.modelVersion = chunk.model;

    // Note: thoughtSignature should be set at the controller level based on query param

    if (chunk.choices && chunk.choices.length > 0) {
      const choice = chunk.choices[0];
      const content = {
        role: 'model' as const,
        parts: [] as any[],
      };

      // Handle content delta
      if (choice.delta.content) {
        content.parts.push({ text: choice.delta.content });
      }

      // Handle reasoning content delta (from models like GLM) - convert to thought part
      if (choice.delta.reasoning_content) {
        // Convert reasoning content to a thought part (thought: true)
        content.parts.push({
          text: choice.delta.reasoning_content,
          thought: true
        });
      }

      // Handle tool call deltas
      if (choice.delta.tool_calls) {
        for (const toolCall of choice.delta.tool_calls) {
          this.accumulateToolCall(toolCall);
        }
      }

      // If this is the final chunk, add complete tool calls
      if (choice.finish_reason) {
        const toolCallParts = this.handleStreamFinish();
        content.parts.push(...toolCallParts);
      }

      geminiResponse.candidates.push({
        content,
        index: choice.index,
        finishReason: this.mapFinishReason(choice.finish_reason),
      });
    }

    return geminiResponse;
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
    return `data: ${JSON.stringify(geminiResponse)}\n\n`;
  }

  // Create SSE end marker
  createSSEEndMarker(): string {
    return 'data: [DONE]\n\n';
  }
}