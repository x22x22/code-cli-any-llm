import { Injectable } from '@nestjs/common';
import { OpenAIResponse, OpenAIChoice } from '../models/openai/openai-response.model';
import { GeminiResponseDto } from '../models/gemini/gemini-response.dto';
import { GeminiCandidateDto } from '../models/gemini/gemini-candidate.dto';
import { GeminiContentDto } from '../models/gemini/gemini-content.dto';
import { GeminiUsageMetadataDto } from '../models/gemini/gemini-usage-metadata.dto';

@Injectable()
export class ResponseTransformer {
  transformResponse(openAIResponse: OpenAIResponse): any {
    const geminiResponse: any = {
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

  private transformChoice(choice: OpenAIChoice, index: number): any {
    const content = this.transformOpenAIMessageToGeminiContent(choice.message);

    return {
      content,
      index,
      finishReason: this.transformFinishReason(choice.finish_reason),
    };
  }

  private transformOpenAIMessageToGeminiContent(message: any): any {
    const parts: any[] = [];

    // Handle text content
    if (message.content) {
      parts.push({ text: message.content });
    }

    // Handle reasoning content (from models like GLM) - convert to thought part
    if (message.reasoning_content) {
      parts.push({
        text: message.reasoning_content,
        thought: true
      });
    }

    // Handle tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
          },
        });
      }
    }

    // If no parts were added but message exists, add empty text to ensure parts is not empty
    if (parts.length === 0 && (message.content || message.reasoning_content || message.tool_calls)) {
      parts.push({ text: '' });
    }

    return {
      role: 'model',
      parts,
    };
  }

  private transformFinishReason(reason: string): string {
    const mapping: Record<string, string> = {
      'stop': 'STOP',
      'length': 'MAX_TOKENS',
      'tool_calls': 'STOP',
      'content_filter': 'SAFETY',
    };

    return mapping[reason] || 'OTHER';
  }

  private transformUsage(usage: any): GeminiUsageMetadataDto {
    return {
      promptTokenCount: usage.prompt_tokens,
      candidatesTokenCount: usage.completion_tokens,
      totalTokenCount: usage.total_tokens,
    };
  }

  // Handle streaming response transformation
  transformStreamChunk(chunk: any): any {
    const geminiResponse: any = {
      candidates: [],
    };

    if (chunk.choices && chunk.choices.length > 0) {
      const choice = chunk.choices[0];
      const content: any = {
        role: 'model',
        parts: [],
      };

      // Handle delta content
      if (choice.delta && choice.delta.content) {
        content.parts.push({ text: choice.delta.content });
      }

      // Handle tool call deltas
      if (choice.delta && choice.delta.tool_calls) {
        for (const toolCall of choice.delta.tool_calls) {
          if (toolCall.function && toolCall.function.name) {
            content.parts.push({
              functionCall: {
                name: toolCall.function.name,
                args: toolCall.function.arguments
                  ? JSON.parse(toolCall.function.arguments)
                  : {},
              },
            });
          }
        }
      }

      geminiResponse.candidates.push({
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