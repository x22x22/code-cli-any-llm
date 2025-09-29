import {
  EnhancedProviderConfig,
  IEnhancedLLMProvider,
  ModelCapabilities,
  TextBufferingConfig,
  ZhipuModelConfig,
} from './enhanced-provider.types';
import { ToolFormat } from '@/transformers/enhanced/tool-formatter.types';

function createDefaultBufferingConfig(): TextBufferingConfig {
  return {
    enabled: true,
    breakPoints: ['。', '？', '！', '，', '\n', '. '],
    maxBufferSize: 1024,
    flushOnPatterns: ['\n\n', '。', '！', '？'],
  };
}

export class EnhancedOpenAIProvider implements IEnhancedLLMProvider {
  constructor(private readonly config: EnhancedProviderConfig) {}

  detectToolFormat(): ToolFormat {
    const modelConfig = this.getCurrentModelConfig();
    if (modelConfig) {
      return modelConfig.toolFormat;
    }

    if (this.isLikelyZhipuModel()) {
      return ToolFormat.QWEN;
    }

    return this.config.defaultToolFormat;
  }

  getModelCapabilities(): ModelCapabilities {
    const modelConfig = this.getCurrentModelConfig();
    const preferredFormat = modelConfig
      ? modelConfig.toolFormat
      : this.detectToolFormat();
    const isZhipu = preferredFormat === ToolFormat.QWEN;

    return {
      supportsToolCalls: true,
      supportsStreaming: true,
      hasDoubleEscapeIssues: isZhipu,
      preferredToolFormat: preferredFormat,
      bufferRequiredForChinese: isZhipu,
      supportedLanguages: isZhipu ? ['zh', 'en'] : ['en'],
      knownIssues: isZhipu ? ['double_escaping'] : [],
    };
  }

  shouldUseZhipuOptimizations(): boolean {
    if (!this.config.zhipuOptimizations.enabled) {
      return false;
    }
    if (this.isLikelyZhipuModel()) {
      return true;
    }
    const modelConfig = this.getCurrentModelConfig();
    return Boolean(modelConfig?.enableDoubleEscapeFixing);
  }

  shouldDisableStreamingForTools(): boolean {
    const modelConfig = this.getCurrentModelConfig();
    if (modelConfig) {
      return modelConfig.disableStreamingForTools;
    }
    return this.shouldUseZhipuOptimizations();
  }

  getTextBufferingConfig(): TextBufferingConfig | null {
    const modelConfig = this.getCurrentModelConfig();
    if (modelConfig) {
      return modelConfig.textBuffering;
    }
    if (this.shouldUseZhipuOptimizations()) {
      return createDefaultBufferingConfig();
    }
    return null;
  }

  transformRequest(request: any): any {
    return request;
  }

  transformResponse(response: any): any {
    return response;
  }

  private getCurrentModelConfig(): ZhipuModelConfig | undefined {
    const currentModel = this.config.model?.toLowerCase();
    if (!currentModel) {
      return undefined;
    }

    for (const [pattern, config] of this.config.modelConfigs.entries()) {
      if (currentModel.includes(pattern.toLowerCase())) {
        return config;
      }
    }

    return this.config.modelConfigs.get(currentModel);
  }

  private isLikelyZhipuModel(): boolean {
    const modelName = this.config.model?.toLowerCase() ?? '';
    return /glm|zhipu|qwen/.test(modelName);
  }
}
