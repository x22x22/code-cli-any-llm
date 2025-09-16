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
      // 优先检查项目配置文件
      const projectConfigFile = path.join(
        process.cwd(),
        'config',
        'config.yaml',
      );

      let config: any;
      let configSource: string;

      if (fs.existsSync(projectConfigFile)) {
        // 如果项目配置存在，使用项目配置（不读取全局配置）
        const projectConfigContent = fs.readFileSync(projectConfigFile, 'utf8');
        config = yaml.load(projectConfigContent) as any;
        configSource = projectConfigFile;
      } else {
        // 项目配置不存在，使用全局配置
        // 检查全局配置文件是否存在，不存在则创建
        if (!fs.existsSync(this.configFile)) {
          this.createConfigTemplate();
        }

        // 读取全局配置文件
        const globalConfigContent = fs.readFileSync(this.configFile, 'utf8');
        config = yaml.load(globalConfigContent) as any;
        configSource = this.configFile;
      }

      // 验证配置
      const result = this.validateConfig(config);
      if (result.config) {
        result.config.configSource = configSource;
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
  port: 3002
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
        port: 3002,
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
