import { Injectable } from '@nestjs/common';
import {
  OpenAIResponse,
  OpenAIChoice,
} from '../models/openai/openai-response.model';
import { GeminiUsageMetadataDto } from '../models/gemini/gemini-usage-metadata.dto';

@Injectable()
export class ResponseTransformer {
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
    const parts: unknown[] = [];
    const messageObj = message as {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
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
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments) as Record<
              string,
              unknown
            >,
          },
        });
      }
    }

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
