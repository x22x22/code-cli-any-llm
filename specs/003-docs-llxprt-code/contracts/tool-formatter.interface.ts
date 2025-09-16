/**
 * ToolFormatter 核心接口合约
 * 基于 llxprt-code 项目的 ToolFormatter 设计
 */

export enum ToolFormat {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  HERMES = 'hermes',
  XML = 'xml',
  LLAMA = 'llama',
  GEMMA = 'gemma'
}

export interface IToolFormatter {
  /**
   * 将 Gemini 工具格式转换为 OpenAI 格式
   */
  convertGeminiToOpenAI(geminiTools: IGeminiTool[]): OpenAITool[]

  /**
   * 将 Gemini 工具格式转换为 Anthropic 格式
   */
  convertGeminiToAnthropic(geminiTools: IGeminiTool[]): AnthropicTool[]

  /**
   * 将 Gemini 工具格式转换为指定格式
   */
  convertGeminiToFormat(geminiTools: IGeminiTool[], format: ToolFormat): unknown

  /**
   * 从提供者特定格式转换为内部格式
   */
  fromProviderFormat(rawToolCall: unknown, format: ToolFormat): ToolCallBlock[]

  /**
   * 累积流式工具调用数据
   */
  accumulateStreamingToolCall(
    deltaToolCall: any,
    accumulatedToolCalls: Map<string, any>,
    format: ToolFormat
  ): void

  /**
   * 转换为 Responses API 格式
   */
  toResponsesTool(tools: ITool[]): ResponsesTool[]

  /**
   * 检测并修复工具参数中的类型问题
   */
  fixParameterTypes(parameters: Record<string, any>, toolName: string): Record<string, any>
}

export interface IGeminiTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, any>
      required?: string[]
    }
  }
}

export interface AnthropicTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

export interface ToolCallBlock {
  type: 'tool_call'
  id: string
  name: string
  parameters: Record<string, any>
}

export interface ResponsesTool {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, any>
}

export interface ITool {
  name: string
  description: string
  parameters: Record<string, any>
}

export interface StreamingToolCall {
  id: string
  name?: string
  parameters?: string
  isComplete: boolean
}