export enum ToolFormat {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  HERMES = 'hermes',
  XML = 'xml',
  LLAMA = 'llama',
  GEMMA = 'gemma',
}

export interface IGeminiTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCallBlock {
  type: 'tool_call';
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface ResponsesTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ITool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface StreamingToolCall {
  id: string;
  name?: string;
  parameters?: string;
  isComplete: boolean;
}

export interface IToolFormatter {
  convertGeminiToOpenAI(geminiTools: IGeminiTool[]): OpenAITool[];
  convertGeminiToAnthropic(geminiTools: IGeminiTool[]): AnthropicTool[];
  convertGeminiToFormat(
    geminiTools: IGeminiTool[],
    format: ToolFormat,
  ): unknown;
  fromProviderFormat(rawToolCall: unknown, format: ToolFormat): ToolCallBlock[];
  accumulateStreamingToolCall(
    deltaToolCall: any,
    accumulatedToolCalls: Map<string, any>,
    format: ToolFormat,
  ): void;
  toResponsesTool(tools: ITool[]): ResponsesTool[];
  fixParameterTypes(
    parameters: Record<string, any>,
    toolName: string,
  ): Record<string, any>;
}
