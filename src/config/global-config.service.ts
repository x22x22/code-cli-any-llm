import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import {
  ConfigValidationResult,
  ConfigError,
  DefaultConfigTemplate,
  OpenAIConfig,
  GatewayConfig,
} from './global-config.interface';

@Injectable()
export class GlobalConfigService {
  private readonly configDir: string;
  private readonly configFile: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.gemini-any-llm');
    this.configFile = path.join(this.configDir, 'config.yaml');
  }

  loadGlobalConfig(): ConfigValidationResult {
    try {
      // 配置优先级：项目配置 > 全局配置 > 环境变量
      let mergedConfig: any = {};
      const configSources: string[] = [];

      // 1. 环境变量作为基础配置（最低优先级）
      const envConfig = {
        openai: {
          apiKey: process.env.OPENAI_API_KEY || '',
          baseURL:
            process.env.OPENAI_BASE_URL ||
            'https://open.bigmodel.cn/api/paas/v4',
          model: process.env.OPENAI_MODEL || 'glm-4.5',
          timeout: Number(process.env.OPENAI_TIMEOUT) || 30000,
        },
        gateway: {
          port: Number(process.env.PORT) || 23062,
          host: process.env.HOST || '0.0.0.0',
          logLevel: process.env.LOG_LEVEL || 'info',
        },
      };
      mergedConfig = this.deepMerge(mergedConfig, envConfig);
      if (
        process.env.OPENAI_API_KEY ||
        process.env.OPENAI_BASE_URL ||
        process.env.OPENAI_MODEL ||
        process.env.PORT ||
        process.env.HOST ||
        process.env.LOG_LEVEL
      ) {
        configSources.push('环境变量');
      }

      // 2. 全局配置覆盖环境变量（中等优先级）
      // 检查全局配置文件是否存在，不存在则创建
      if (!fs.existsSync(this.configFile)) {
        this.createConfigTemplate();
      }

      const globalConfigContent = fs.readFileSync(this.configFile, 'utf8');
      const globalConfig = yaml.load(globalConfigContent) as any;
      if (globalConfig) {
        mergedConfig = this.deepMerge(mergedConfig, globalConfig);
        configSources.push(this.configFile);
      }

      // 3. 项目配置覆盖全局配置（最高优先级）
      const projectConfigFile = path.join(
        process.cwd(),
        'config',
        'config.yaml',
      );

      if (fs.existsSync(projectConfigFile)) {
        const projectConfigContent = fs.readFileSync(projectConfigFile, 'utf8');
        const projectConfig = yaml.load(projectConfigContent) as any;
        if (projectConfig) {
          mergedConfig = this.deepMerge(mergedConfig, projectConfig);
          configSources.unshift(projectConfigFile); // 项目配置放在最前面
        }
      }

      // 验证合并后的配置
      const result = this.validateConfig(mergedConfig);
      if (result.config) {
        // 确定主要配置来源：优先使用配置文件而不是环境变量
        let primarySource = '默认配置';
        if (configSources.length > 0) {
          // 查找第一个文件配置来源
          const fileSource = configSources.find((source) =>
            source.includes('.yaml'),
          );
          primarySource = fileSource || configSources[0];
        }
        result.config.configSource = primarySource;
        result.config.configSources = configSources;
      }

      return result;
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            field: 'config',
            message: `配置文件加载失败: ${error.message}`,
            suggestion: '请检查配置文件格式是否正确',
            required: true,
          },
        ],
        warnings: [],
      };
    }
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (
          source[key] !== null &&
          typeof source[key] === 'object' &&
          !Array.isArray(source[key])
        ) {
          // 如果是对象，递归合并
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          // 如果不是对象，覆盖（但跳过空字符串，除非target中也没有值）
          if (source[key] !== '' || !result[key]) {
            result[key] = source[key];
          }
        }
      }
    }

    return result;
  }

  private createConfigTemplate(): void {
    // 创建配置目录
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }

    // 创建默认配置模板
    const template = this.getDefaultTemplate();
    fs.writeFileSync(this.configFile, template.template, { mode: 0o600 });
  }

  private getDefaultTemplate(): DefaultConfigTemplate {
    const template = `# Global configuration for gemini-any-llm
# Edit this file to configure your default API settings

# API Configuration (REQUIRED)
openai:
  # Your API key - REQUIRED, get it from your provider
  apiKey: ""

  # API endpoint - can customize for different providers
  baseURL: "https://open.bigmodel.cn/api/paas/v4"

  # Default model to use
  model: "glm-4.5"

  # Request timeout in milliseconds
  timeout: 30000

# Gateway Configuration
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
`;

    return {
      template,
      comments: true,
    };
  }

  private validateConfig(config: any): ConfigValidationResult {
    const errors: ConfigError[] = [];
    const warnings: string[] = [];

    // 验证openai配置
    if (!config.openai) {
      errors.push({
        field: 'openai',
        message: 'OpenAI配置缺失',
        suggestion: '请添加openai配置节',
        required: true,
      });
    } else {
      // 验证apiKey
      if (!config.openai.apiKey || config.openai.apiKey.trim() === '') {
        errors.push({
          field: 'openai.apiKey',
          message: 'API密钥为空',
          suggestion: '请在配置文件中设置有效的API密钥',
          required: true,
        });
      }

      // 验证baseURL
      if (!config.openai.baseURL) {
        warnings.push('baseURL未设置，将使用默认值');
        config.openai.baseURL = 'https://open.bigmodel.cn/api/paas/v4';
      }

      // 验证model
      if (!config.openai.model) {
        warnings.push('model未设置，将使用默认值');
        config.openai.model = 'glm-4.5';
      }

      // 验证timeout
      if (!config.openai.timeout) {
        warnings.push('timeout未设置，将使用默认值');
        config.openai.timeout = 30000;
      }
    }

    // 验证gateway配置
    if (!config.gateway) {
      warnings.push('gateway配置缺失，将使用默认值');
      config.gateway = {
        port: 23062,
        host: '0.0.0.0',
        logLevel: 'info',
      };
    }

    const isValid = errors.length === 0;
    const result: ConfigValidationResult = {
      isValid,
      errors,
      warnings,
    };

    if (isValid) {
      result.config = {
        openai: config.openai as OpenAIConfig,
        gateway: config.gateway as GatewayConfig,
        configSource: '', // 将在调用方设置
        isValid: true,
      };
    }

    return result;
  }
}
