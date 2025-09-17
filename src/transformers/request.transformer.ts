import { Injectable } from '@nestjs/common';
import { ToolFormatter } from './enhanced/ToolFormatter';
import { GeminiRequestDto } from '../models/gemini/gemini-request.dto';
import { GeminiContentDto } from '../models/gemini/gemini-content.dto';
import {
  OpenAIRequest,
  OpenAIMessage,
  OpenAITool,
} from '../models/openai/openai-request.model';

@Injectable()
export class RequestTransformer {
  constructor(private readonly toolFormatter: ToolFormatter) {}
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

    // Map toolConfig -> tool_choice when present
    if (geminiRequest.toolConfig) {
      const toolChoice = this.transformToolConfig(geminiRequest.toolConfig);
      if (toolChoice) {
        openAIRequest.tool_choice = toolChoice;
      }
    }
    if (openAIRequest.tools && openAIRequest.tools.length > 0 && !openAIRequest.tool_choice) {
      openAIRequest.tool_choice = 'auto';
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
    if (!contents || !Array.isArray(contents)) {
      return [];
    }
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
          message.tool_calls = functionCallParts.map((part) => {
            const anyPart = part as unknown as {
              functionCall?: { id?: string; name: string; args: unknown };
            };
            const id =
              anyPart.functionCall?.id ||
              `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            return {
              id,
              type: 'function' as const,
              function: {
                name: part.functionCall!.name,
                arguments: JSON.stringify(part.functionCall!.args),
              },
            };
          });
        }

        if (functionResponseParts.length > 0) {
          const anyResp = functionResponseParts[0] as unknown as {
            functionResponse?: { id?: string; name?: string; response?: unknown };
          };
          message.role = 'tool';
          message.content = JSON.stringify(
            anyResp.functionResponse?.response,
          );
          // Prefer the tool call id if present; fall back to undefined
          // (OpenAI expects the id of the original tool_call.)
          if (anyResp.functionResponse?.id) {
            message.tool_call_id = anyResp.functionResponse.id;
          }
        }

        return message;
      })
      .filter((message) => {
        // Filter out empty messages without tool calls
        return message.content || message.tool_calls;
      });
  }

  /**
   * 将 Gemini 的 toolConfig 映射为 OpenAI 的 tool_choice
   */
  private transformToolConfig(toolConfig: unknown):
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } }
    | undefined {
    try {
      const cfg = toolConfig as
        | { functionCallingConfig?: unknown }
        | string
        | Record<string, unknown>;

      // 直接字符串形式：'AUTO' | 'NONE'
      if (typeof cfg === 'string') {
        const mode = cfg.toUpperCase();
        if (mode === 'AUTO') return 'auto';
        if (mode === 'NONE') return 'none';
      }

      // 常见形式：{ functionCallingConfig: 'AUTO' | 'NONE' | { mode, allowedFunctionNames? } }
      const fcc = (cfg as { functionCallingConfig?: unknown }).functionCallingConfig;
      if (typeof fcc === 'string') {
        const mode = fcc.toUpperCase();
        if (mode === 'AUTO') return 'auto';
        if (mode === 'NONE') return 'none';
      } else if (fcc && typeof fcc === 'object') {
        const obj = fcc as { mode?: string; allowedFunctionNames?: string[] };
        const mode = obj.mode?.toUpperCase();
        if (mode === 'NONE') return 'none';
        // OpenAI 无法指定多个函数，只能选择一个或使用 auto
        if (Array.isArray(obj.allowedFunctionNames) && obj.allowedFunctionNames.length === 1) {
          return {
            type: 'function',
            function: { name: obj.allowedFunctionNames[0]! },
          };
        }
        // 其他情况视为自动
        return 'auto';
      }
    } catch {
      // 忽略解析失败，保持默认
    }
    return undefined;
  }

  private transformTools(geminiTools: unknown[]): OpenAITool[] {
    const openAITools: OpenAITool[] = [];

    for (const tool of geminiTools) {
      const toolObj = tool as {
        functionDeclarations?: Array<{
          name: string;
          description?: string;
          parameters?: Record<string, unknown>;
          parametersJsonSchema?: Record<string, unknown>;
        }>;
      };

      if (toolObj.functionDeclarations) {
        for (const func of toolObj.functionDeclarations) {
          const rawParams =
            (func.parametersJsonSchema as Record<string, unknown> | undefined) ??
            (func.parameters as Record<string, unknown> | undefined) ??
            {};
          const normalizedParams = this.toolFormatter
            .convertGeminiSchemaToStandard(rawParams) as Record<
            string,
            unknown
          >;
          openAITools.push({
            type: 'function',
            function: {
              name: func.name,
              description: func.description || '',
              parameters: normalizedParams,
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
