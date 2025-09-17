import { Injectable } from '@nestjs/common';

/**
 * 智谱模型优化器
 * 提供智谱GLM模型的特殊优化和配置
 */
@Injectable()
export class ZhipuOptimizer {
  /**
   * 检查是否为智谱模型
   */
  isZhipuModel(model: string): boolean {
    if (!model || typeof model !== 'string') {
      return false;
    }

    const zhipuPatterns = ['glm-', 'GLM-', 'zhipu-', 'chatglm-'];

    return zhipuPatterns.some((pattern) =>
      model.toLowerCase().includes(pattern.toLowerCase()),
    );
  }

  /**
   * 获取推荐的工具格式
   */
  getRecommendedToolFormat(model: string): string {
    return this.isZhipuModel(model) ? 'qwen' : 'openai';
  }

  /**
   * 优化请求参数
   */
  optimizeRequest(
    request: Record<string, unknown>,
    model: string,
  ): Record<string, unknown> {
    if (!this.isZhipuModel(model)) {
      return request;
    }

    const optimized = { ...request };

    // 智谱模型优化
    if (this.isZhipuModel(model)) {
      // 智谱模型通常需要更保守的temperature
      if (!optimized.temperature) {
        optimized.temperature = 0.7;
      }

      // 智谱模型禁用流式响应的某些情况
      if (optimized.stream === undefined) {
        // 保持默认行为
      }
    }

    return optimized;
  }
}
