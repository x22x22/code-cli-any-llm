import { Injectable } from '@nestjs/common';
import { GeminiRequestDto } from '../models/gemini/gemini-request.dto';
import { GeminiContentDto } from '../models/gemini/gemini-content.dto';
import {
  OpenAIRequest,
  OpenAIMessage,
  OpenAITool,
} from '../models/openai/openai-request.model';

@Injectable()
export class RequestTransformer {
  transformRequest(
    geminiRequest: GeminiRequestDto,
    model: string,
  ): OpenAIRequest {
    const openAIRequest: OpenAIRequest = {
      model,
      messages: this.transformMessages(geminiRequest.contents),
    };

    // Transform tools if present
    if (geminiRequest.tools && geminiRequest.tools.length > 0) {
      openAIRequest.tools = this.transformTools(geminiRequest.tools);
    }

    // Transform generation config
    if (geminiRequest.generationConfig) {
      const config = this.transformGenerationConfig(
        geminiRequest.generationConfig,
      );
      Object.assign(openAIRequest, config);
    }

    // Handle system instruction
    if (geminiRequest.systemInstruction) {
      const systemMessage = this.transformSystemInstruction(
        geminiRequest.systemInstruction,
      );
      if (systemMessage) {
        openAIRequest.messages.unshift(systemMessage);
      }
    }

    return openAIRequest;
  }

  private transformMessages(contents: GeminiContentDto[]): OpenAIMessage[] {
    return contents
      .map((content) => {
        const message: OpenAIMessage = {
          role: content.role === 'model' ? 'assistant' : 'user',
        };

        // Handle different part types
        const textParts = content.parts.filter((part) => part.text);
        const functionCallParts = content.parts.filter(
          (part) => part.functionCall,
        );
        const functionResponseParts = content.parts.filter(
          (part) => part.functionResponse,
        );

        if (textParts.length > 0) {
          message.content = textParts.map((part) => part.text).join('');
        }

        if (functionCallParts.length > 0) {
          message.tool_calls = functionCallParts.map((part) => ({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function' as const,
            function: {
              name: part.functionCall!.name,
              arguments: JSON.stringify(part.functionCall!.args),
            },
          }));
        }

        if (functionResponseParts.length > 0) {
          message.role = 'tool';
          message.content = JSON.stringify(
            functionResponseParts[0].functionResponse?.response,
          );
          message.tool_call_id =
            functionResponseParts[0].functionResponse?.name;
        }

        return message;
      })
      .filter((message) => {
        // Filter out empty messages without tool calls
        return message.content || message.tool_calls;
      });
  }

  private transformTools(geminiTools: unknown[]): OpenAITool[] {
    const openAITools: OpenAITool[] = [];

    for (const tool of geminiTools) {
      const toolObj = tool as {
        functionDeclarations?: Array<{
          name: string;
          description?: string;
          parameters?: Record<string, unknown>;
        }>;
      };

      if (toolObj.functionDeclarations) {
        for (const func of toolObj.functionDeclarations) {
          openAITools.push({
            type: 'function',
            function: {
              name: func.name,
              description: func.description,
              parameters: func.parameters || {},
            },
          });
        }
      }
    }

    return openAITools;
  }

  private transformGenerationConfig(config: unknown): Partial<OpenAIRequest> {
    const result: Partial<OpenAIRequest> = {};
    const configObj = config as {
      temperature?: number;
      topP?: number;
      maxOutputTokens?: number;
      stopSequences?: string[];
      candidateCount?: number;
    };

    if (configObj.temperature !== undefined) {
      result.temperature = configObj.temperature;
    }

    if (configObj.topP !== undefined) {
      result.top_p = configObj.topP;
    }

    if (configObj.maxOutputTokens !== undefined) {
      result.max_tokens = configObj.maxOutputTokens;
    }

    if (configObj.stopSequences) {
      result.stop = configObj.stopSequences;
    }

    if (configObj.candidateCount && configObj.candidateCount > 1) {
      // OpenAI doesn't support multiple candidates natively
      // We'll handle this in the response transformation
    }

    return result;
  }

  private transformSystemInstruction(
    instruction: GeminiContentDto | string,
  ): OpenAIMessage | null {
    if (typeof instruction === 'string') {
      return {
        role: 'system',
        content: instruction,
      };
    } else if (instruction.parts && instruction.parts.length > 0) {
      const textPart = instruction.parts.find((part) => part.text);
      if (textPart) {
        return {
          role: 'system',
          content: textPart.text,
        };
      }
    }
    return null;
  }

  // Clean up messages - merge consecutive assistant messages with tool calls
  cleanMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
    const cleaned: OpenAIMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];

      if (
        i > 0 &&
        current.role === 'assistant' &&
        messages[i - 1].role === 'assistant' &&
        !current.tool_calls &&
        messages[i - 1].tool_calls
      ) {
        // Merge consecutive assistant messages without tool calls
        const prev = cleaned[cleaned.length - 1];
        prev.content = (prev.content || '') + (current.content || '');
      } else {
        cleaned.push(current);
      }
    }

    return cleaned;
  }
}
