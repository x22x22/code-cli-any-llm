import { Injectable } from '@nestjs/common';
import { RequestTransformer } from './request.transformer';
import { ZhipuOptimizer } from '../utils/zhipu/ZhipuOptimizer';
import { ToolFormatterAdapter } from './enhanced/ToolFormatterAdapter';
import { GeminiRequestDto } from '../models/gemini/gemini-request.dto';
import { OpenAIRequest } from '../models/openai/openai-request.model';

/**
 * 增强的请求转换器
 * 扩展基础转换器，添加智谱优化功能
 */
@Injectable()
export class EnhancedRequestTransformer extends RequestTransformer {
  private processingStats = {
    doubleEscapeDetections: 0,
    doubleEscapeCorrections: 0,
    typeCoercions: 0,
    failedParsings: 0,
    averageProcessingTime: 0,
    totalRequestsProcessed: 0
  };

  private optimizationReports: any[] = [];

  constructor(
    private readonly zhipuOptimizer: ZhipuOptimizer,
    private readonly toolFormatterAdapter: ToolFormatterAdapter,
  ) {
    super();
  }

  /**
   * 检查是否为智谱模型
   */
  isZhipuModel(model: string): boolean {
    return this.zhipuOptimizer.isZhipuModel(model);
  }

  /**
   * 转换请求，如果是智谱模型则应用优化
   */
  transformRequest(geminiRequest: GeminiRequestDto, model: string): OpenAIRequest {
    const startTime = Date.now();

    try {
      // 先调用基础转换
      const baseRequest = super.transformRequest(geminiRequest, model);

      // 如果是智谱模型，应用优化
      if (this.isZhipuModel(model)) {
        const optimized = this.zhipuOptimizer.optimizeRequest(
          baseRequest as unknown as Record<string, unknown>,
          model
        );

        // 应用工具格式优化
        if (optimized.tools && Array.isArray(optimized.tools)) {
          const toolFormat = this.zhipuOptimizer.getRecommendedToolFormat(model);
          optimized.tools = optimized.tools.map(tool =>
            this.toolFormatterAdapter.formatTool(tool, toolFormat as any)
          );
        }

        // 更新统计
        this.updateStats(startTime);

        return optimized as unknown as OpenAIRequest;
      }

      this.updateStats(startTime);
      return baseRequest;
    } catch (error) {
      this.processingStats.failedParsings++;
      throw error;
    }
  }

  /**
   * 获取处理统计信息
   */
  getProcessingStats() {
    return { ...this.processingStats };
  }

  /**
   * 获取优化报告
   */
  getOptimizationReport() {
    return [...this.optimizationReports];
  }

  /**
   * 更新统计信息
   */
  private updateStats(startTime: number) {
    const processingTime = Date.now() - startTime;
    this.processingStats.totalRequestsProcessed++;

    // 计算平均处理时间
    const totalTime = this.processingStats.averageProcessingTime *
      (this.processingStats.totalRequestsProcessed - 1) + processingTime;
    this.processingStats.averageProcessingTime =
      totalTime / this.processingStats.totalRequestsProcessed;
  }
}