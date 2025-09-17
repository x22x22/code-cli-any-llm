import { Injectable } from '@nestjs/common';
import {
  OpenAIResponse,
  OpenAIChoice,
} from '../models/openai/openai-response.model';
import { GeminiUsageMetadataDto } from '../models/gemini/gemini-usage-metadata.dto';
import { ToolCallProcessor } from '../utils/zhipu/ToolCallProcessor';

@Injectable()
export class ResponseTransformer {
  private readonly toolCallProcessor = new ToolCallProcessor();
  transformResponse(openAIResponse: OpenAIResponse): unknown {
    const geminiResponse: Record<string, unknown> = {
      candidates: [],
    };

    // Transform choices to candidates
    if (openAIResponse.choices && openAIResponse.choices.length > 0) {
      geminiResponse.candidates = openAIResponse.choices.map((choice, index) =>
        this.transformChoice(choice, index),
      );
    }

    // Transform usage metadata
    if (openAIResponse.usage) {
      geminiResponse.usageMetadata = this.transformUsage(openAIResponse.usage);
    }

    return geminiResponse;
  }

  private transformChoice(choice: OpenAIChoice, index: number): unknown {
    const content = this.transformOpenAIMessageToGeminiContent(choice.message);

    return {
      content,
      index,
      finishReason: this.transformFinishReason(choice.finish_reason),
    };
  }

  private transformOpenAIMessageToGeminiContent(message: unknown): unknown {
    const parts: Array<Record<string, unknown>> = [];
    const messageObj = message as {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        id?: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };

    // Handle text content
    if (messageObj.content) {
      parts.push({ text: messageObj.content });
    }

    // Handle reasoning content (from models like GLM) - convert to thought part
    if (messageObj.reasoning_content) {
      parts.push({
        text: messageObj.reasoning_content,
        thought: true,
      });
    }

    // Handle tool calls
    if (messageObj.tool_calls && messageObj.tool_calls.length > 0) {
      for (const toolCall of messageObj.tool_calls) {
        // 使用 ToolCallProcessor 安全解析工具调用参数
        const args = this.toolCallProcessor.parseToolCallArguments(
          toolCall.function.arguments,
          toolCall.function.name,
          'qwen', // 默认使用 qwen 格式处理双重转义
        );

        parts.push({
          functionCall: {
            id: toolCall.id,
            name: toolCall.function.name,
            args: args as Record<string, unknown>,
          },
        });
      }
    }

    const normalizedParts =
      this.toolCallProcessor.normalizeTextToolCalls(parts);
    parts.splice(0, parts.length, ...normalizedParts);

    // If no parts were added but message exists, add empty text to ensure parts is not empty
    if (
      parts.length === 0 &&
      (messageObj.content ||
        messageObj.reasoning_content ||
        messageObj.tool_calls)
    ) {
      parts.push({ text: '' });
    }

    return {
      role: 'model',
      parts,
    };
  }

  private transformFinishReason(reason: string): string {
    const mapping: Record<string, string> = {
      stop: 'STOP',
      length: 'MAX_TOKENS',
      tool_calls: 'STOP',
      content_filter: 'SAFETY',
    };

    return mapping[reason] || 'OTHER';
  }

  private transformUsage(usage: unknown): GeminiUsageMetadataDto {
    const usageObj = usage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };

    return {
      promptTokenCount: usageObj.prompt_tokens || 0,
      candidatesTokenCount: usageObj.completion_tokens || 0,
      totalTokenCount: usageObj.total_tokens || 0,
    };
  }

  // Handle streaming response transformation
  transformStreamChunk(chunk: unknown): unknown {
    const geminiResponse: Record<string, unknown> = {
      candidates: [],
    };

    const chunkObj = chunk as {
      choices?: Array<{
        index?: number;
        finish_reason?: string;
        delta?: {
          content?: string;
          tool_calls?: Array<{
            function?: {
              name?: string;
              arguments?: string;
            };
          }>;
        };
      }>;
    };

    if (chunkObj.choices && chunkObj.choices.length > 0) {
      const choice = chunkObj.choices[0];
      const content: Record<string, unknown> = {
        role: 'model',
        parts: [],
      };

      // Handle delta content
      if (choice.delta && choice.delta.content) {
        (content.parts as unknown[]).push({ text: choice.delta.content });
      }

      // Handle tool call deltas
      if (choice.delta && choice.delta.tool_calls) {
        for (const toolCall of choice.delta.tool_calls) {
          if (toolCall.function && toolCall.function.name) {
            (content.parts as unknown[]).push({
              functionCall: {
                id: (toolCall as any).id,
                name: toolCall.function.name,
                args: toolCall.function.arguments
                  ? (JSON.parse(toolCall.function.arguments) as Record<
                      string,
                      unknown
                    >)
                  : {},
              },
            });
          }
        }
      }

      const normalizedStreamParts =
        this.toolCallProcessor.normalizeTextToolCalls(
          content.parts as Array<Record<string, unknown>>,
        );
      const targetStreamParts = content.parts as Array<unknown>;
      targetStreamParts.splice(
        0,
        targetStreamParts.length,
        ...normalizedStreamParts,
      );

      (geminiResponse.candidates as unknown[]).push({
        content,
        index: choice.index || 0,
        finishReason: choice.finish_reason
          ? this.transformFinishReason(choice.finish_reason)
          : undefined,
      });
    }

    return geminiResponse;
  }
}
