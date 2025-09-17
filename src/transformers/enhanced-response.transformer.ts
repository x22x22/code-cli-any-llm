import { Injectable } from '@nestjs/common';
import { ResponseTransformer } from './response.transformer';
import { ZhipuOptimizer } from '../utils/zhipu/ZhipuOptimizer';
import { DoubleEscapeUtils } from '../utils/zhipu/doubleEscapeUtils';
import { OpenAIResponse, OpenAIStreamChunk } from '../models/openai/openai-response.model';

/**
 * 文本缓冲器接口
 */
export interface TextBuffer {
  content: string;
  shouldFlush: boolean;
}

/**
 * 增强的响应转换器
 * 扩展基础转换器，添加智谱优化功能
 */
@Injectable()
export class EnhancedResponseTransformer extends ResponseTransformer {
  constructor(
    private readonly zhipuOptimizer: ZhipuOptimizer,
    private readonly doubleEscapeUtils: DoubleEscapeUtils,
  ) {
    super();
  }

  /**
   * 检查是否应该使用文本缓冲
   */
  shouldUseTextBuffering(model: string): boolean {
    return this.zhipuOptimizer.isZhipuModel(model);
  }

  /**
   * 转换响应，如果是智谱模型则应用优化
   */
  transformResponse(openAIResponse: OpenAIResponse, model?: string): unknown {
    try {
      // 如果是智谱模型，处理双重转义
      if (model && this.zhipuOptimizer.isZhipuModel(model)) {
        const processed = this.processZhipuResponse(openAIResponse);
        return super.transformResponse(processed);
      }

      return super.transformResponse(openAIResponse);
    } catch (error) {
      // 回退到基础转换
      return super.transformResponse(openAIResponse);
    }
  }

  /**
   * 创建文本缓冲器
   */
  createTextBuffer(): TextBuffer {
    return {
      content: '',
      shouldFlush: false
    };
  }

  /**
   * 转换流式响应块
   */
  transformStreamChunk(
    chunk: OpenAIStreamChunk,
    model?: string,
    textBuffer?: TextBuffer
  ): any {
    // 如果是智谱模型且提供了文本缓冲器
    if (model && this.shouldUseTextBuffering(model) && textBuffer) {
      return this.processZhipuStreamChunk(chunk, textBuffer);
    }

    // 否则使用标准处理
    return this.processStandardStreamChunk(chunk);
  }

  /**
   * 处理智谱响应中的双重转义
   */
  private processZhipuResponse(response: OpenAIResponse): OpenAIResponse {
    const processed = { ...response };

    if (processed.choices) {
      processed.choices = processed.choices.map(choice => {
        if (choice.message?.tool_calls) {
          choice.message.tool_calls = choice.message.tool_calls.map(toolCall => {
            if (toolCall.function?.arguments) {
              // 处理可能的双重转义，直接解析为对象
              const parsedArgs = this.doubleEscapeUtils.safeParse(
                toolCall.function.arguments
              );

              // 如果解析成功且不为null，将对象重新序列化为正确的JSON字符串
              // 这样基础转换器的JSON.parse就能正确处理
              const normalizedArgs = parsedArgs !== null ? JSON.stringify(parsedArgs) : toolCall.function.arguments;

              return {
                ...toolCall,
                function: {
                  ...toolCall.function,
                  arguments: normalizedArgs
                }
              };
            }
            return toolCall;
          });
        }
        return choice;
      });
    }

    return processed;
  }

  /**
   * 处理智谱流式响应块
   */
  private processZhipuStreamChunk(chunk: OpenAIStreamChunk, textBuffer: TextBuffer): any {
    const delta = chunk.choices?.[0]?.delta;

    if (delta?.content) {
      // 将内容添加到缓冲区
      textBuffer.content += delta.content;

      // 检查是否应该输出（例如遇到句号、换行等）
      const shouldFlush = this.shouldFlushBuffer(textBuffer.content);

      if (shouldFlush) {
        const result = this.processStandardStreamChunk(chunk);
        textBuffer.content = ''; // 清空缓冲区
        return result;
      }

      // 返回null表示暂不输出
      return null;
    }

    // 非文本内容直接处理
    return this.processStandardStreamChunk(chunk);
  }

  /**
   * 处理标准流式响应块
   */
  private processStandardStreamChunk(chunk: OpenAIStreamChunk): any {
    // 这里可以添加标准的流式处理逻辑
    // 暂时直接返回，实际使用时可能需要转换格式
    return chunk;
  }

  /**
   * 判断是否应该刷新缓冲区
   */
  private shouldFlushBuffer(content: string): boolean {
    // 智谱模型的中文输出可能需要等待完整的句子
    const flushTriggers = [
      '。', '！', '？', '\n',  // 中文标点
      '.', '!', '?',          // 英文标点
    ];

    return flushTriggers.some(trigger => content.endsWith(trigger)) ||
           content.length > 50; // 或者内容过长时强制输出
  }
}