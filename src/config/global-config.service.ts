import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import type {
  ConfigValidationResult,
  ConfigError,
  DefaultConfigTemplate,
  OpenAIConfig,
  CodexConfig,
  GatewayConfig,
  GlobalConfig,
} from './global-config.interface';

const DEFAULT_GATEWAY_LOG_DIR = path.join(
  os.homedir(),
  '.gemini-any-llm',
  'logs',
);

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
      let mergedConfig: Partial<GlobalConfig> = {};
      const configSources: string[] = [];

      // 1. 环境变量作为基础配置（最低优先级）
      const envAiProviderRaw = (
        process.env.GAL_AI_PROVIDER || 'openai'
      ).toLowerCase();
      const envAiProvider: 'openai' | 'codex' =
        envAiProviderRaw === 'codex' ? 'codex' : 'openai';
      const envConfig: Partial<GlobalConfig> = {
        aiProvider: envAiProvider,
        openai: {
          apiKey: process.env.GAL_OPENAI_API_KEY || '',
          baseURL:
            process.env.GAL_OPENAI_BASE_URL ||
            'https://open.bigmodel.cn/api/paas/v4',
          model: process.env.GAL_OPENAI_MODEL || 'glm-4.5',
          timeout: Number(process.env.GAL_OPENAI_TIMEOUT) || 30000,
          extraBody: undefined,
        },
        codex: process.env.GAL_CODEX_API_KEY
          ? {
              apiKey: process.env.GAL_CODEX_API_KEY || '',
              baseURL:
                process.env.GAL_CODEX_BASE_URL ||
                'https://chatgpt.com/backend-api/codex',
              model: process.env.GAL_CODEX_MODEL || 'gpt-5-codex',
              timeout: Number(process.env.GAL_CODEX_TIMEOUT) || 60000,
              reasoning: (() => {
                const raw = process.env.GAL_CODEX_REASONING;
                if (!raw) return undefined;
                try {
                  return JSON.parse(raw);
                } catch {
                  return undefined;
                }
              })(),
              textVerbosity: (() => {
                const raw = (
                  process.env.GAL_CODEX_TEXT_VERBOSITY || ''
                ).toLowerCase();
                return ['low', 'medium', 'high'].includes(raw)
                  ? (raw as 'low' | 'medium' | 'high')
                  : undefined;
              })(),
            }
          : undefined,
        gateway: {
          port: Number(process.env.GAL_PORT) || 23062,
          host: process.env.GAL_HOST || '0.0.0.0',
          logLevel: process.env.GAL_LOG_LEVEL || 'info',
          logDir: process.env.GAL_GATEWAY_LOG_DIR || DEFAULT_GATEWAY_LOG_DIR,
        },
      };
      mergedConfig = this.deepMerge(
        mergedConfig as Record<string, unknown>,
        envConfig as Record<string, unknown>,
      ) as Partial<GlobalConfig>;
      if (
        process.env.GAL_OPENAI_API_KEY ||
        process.env.GAL_OPENAI_BASE_URL ||
        process.env.GAL_OPENAI_MODEL ||
        process.env.GAL_AI_PROVIDER ||
        process.env.GAL_CODEX_API_KEY ||
        process.env.GAL_CODEX_BASE_URL ||
        process.env.GAL_CODEX_MODEL ||
        process.env.GAL_CODEX_REASONING ||
        process.env.GAL_CODEX_TEXT_VERBOSITY ||
        process.env.GAL_PORT ||
        process.env.GAL_HOST ||
        process.env.GAL_LOG_LEVEL ||
        process.env.GAL_GATEWAY_LOG_DIR
      ) {
        configSources.push('环境变量');
      }

      // 2. 全局配置覆盖环境变量（中等优先级）
      // 检查全局配置文件是否存在，不存在则创建
      if (!fs.existsSync(this.configFile)) {
        this.createConfigTemplate();
      }

      const globalConfigContent = fs.readFileSync(this.configFile, 'utf8');
      const globalConfig = yaml.load(globalConfigContent) as
        | Partial<GlobalConfig>
        | undefined;
      if (globalConfig) {
        mergedConfig = this.deepMerge(
          mergedConfig as Record<string, unknown>,
          globalConfig as Record<string, unknown>,
        ) as Partial<GlobalConfig>;
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
        const projectConfig = yaml.load(projectConfigContent) as
          | Partial<GlobalConfig>
          | undefined;
        if (projectConfig) {
          mergedConfig = this.deepMerge(
            mergedConfig as Record<string, unknown>,
            projectConfig as Record<string, unknown>,
          ) as Partial<GlobalConfig>;
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

  private deepMerge(
    target: Record<string, unknown> | undefined,
    source: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (!source) {
      return target ?? {};
    }

    const result: Record<string, unknown> = { ...(target ?? {}) };

    for (const [key, value] of Object.entries(source)) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const existing = result[key];
        result[key] = this.deepMerge(
          (existing as Record<string, unknown>) ?? {},
          value as Record<string, unknown>,
        );
      } else if (value !== '' || result[key] === undefined) {
        result[key] = value;
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

aiProvider: openai

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

# Codex configuration (optional)
codex:
  apiKey: ""
  baseURL: "https://chatgpt.com/backend-api/codex"
  model: "gpt-5-codex"
  timeout: 60000
  reasoning:
    effort: minimal
    summary: auto
  textVerbosity: low

# Gateway Configuration
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
  logDir: "~/.gemini-any-llm/logs"
`;

    return {
      template,
      comments: true,
    };
  }

  private validateConfig(
    rawConfig: Partial<GlobalConfig>,
  ): ConfigValidationResult {
    const config: Partial<GlobalConfig> = JSON.parse(
      JSON.stringify(rawConfig ?? {}),
    );
    const errors: ConfigError[] = [];
    const warnings: string[] = [];

    let openaiConfig: OpenAIConfig | undefined = config.openai;

    // 验证openai配置
    if (!openaiConfig) {
      errors.push({
        field: 'openai',
        message: 'OpenAI配置缺失',
        suggestion: '请添加openai配置节',
        required: true,
      });
      openaiConfig = {
        apiKey: '',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4.5',
        timeout: 30000,
        extraBody: undefined,
      };
      config.openai = openaiConfig;
    } else {
      const trimmedApiKey = openaiConfig.apiKey?.trim();
      // 验证apiKey
      if (!trimmedApiKey) {
        errors.push({
          field: 'openai.apiKey',
          message: 'API密钥为空',
          suggestion: '请在配置文件中设置有效的API密钥',
          required: true,
        });
      }

      // 验证baseURL
      if (!openaiConfig.baseURL) {
        warnings.push('baseURL未设置，将使用默认值');
        openaiConfig.baseURL = 'https://open.bigmodel.cn/api/paas/v4';
      }

      // 验证model
      if (!openaiConfig.model) {
        warnings.push('model未设置，将使用默认值');
        openaiConfig.model = 'glm-4.5';
      }

      // 验证timeout
      if (!openaiConfig.timeout) {
        warnings.push('timeout未设置，将使用默认值');
        openaiConfig.timeout = 30000;
      }
    }

    const aiProviderRaw = (config.aiProvider || 'openai')
      .toString()
      .toLowerCase();
    let aiProvider: 'openai' | 'codex';
    if (aiProviderRaw === 'codex') {
      aiProvider = 'codex';
    } else if (aiProviderRaw === 'openai') {
      aiProvider = 'openai';
    } else {
      errors.push({
        field: 'aiProvider',
        message: `不支持的 aiProvider: ${aiProviderRaw}`,
        suggestion: '仅支持 openai 或 codex',
        required: true,
      });
      aiProvider = 'openai';
    }
    config.aiProvider = aiProvider;

    let codexConfig: CodexConfig | undefined = config.codex;
    if (aiProvider === 'codex') {
      if (!codexConfig) {
        codexConfig = {
          apiKey: '',
          baseURL: 'https://chatgpt.com/backend-api/codex',
          model: 'gpt-5-codex',
          timeout: 60000,
          reasoning: {
            effort: 'minimal',
            summary: 'auto',
          },
          textVerbosity: 'low',
          authMode: 'ApiKey',
        };
        config.codex = codexConfig;
      }

      codexConfig = config.codex as CodexConfig;

      const authModeRaw = (codexConfig.authMode || 'ApiKey')
        .toString()
        .trim()
        .toLowerCase();
      codexConfig.authMode = authModeRaw === 'chatgpt' ? 'ChatGPT' : 'ApiKey';

      const trimmedCodexKey = codexConfig.apiKey?.trim();
      if (codexConfig.authMode === 'ApiKey') {
        if (!trimmedCodexKey) {
          errors.push({
            field: 'codex.apiKey',
            message: 'Codex API密钥为空',
            suggestion: '请在配置文件中设置 codex.apiKey',
            required: true,
          });
        } else {
          codexConfig.apiKey = trimmedCodexKey;
        }
      } else {
        if (trimmedCodexKey) {
          warnings.push('codex.apiKey 在 ChatGPT 模式下将被忽略');
        }
        codexConfig.apiKey = undefined;
      }
      if (!codexConfig.baseURL) {
        warnings.push('codex.baseURL未设置，将使用默认值');
        codexConfig.baseURL = 'https://chatgpt.com/backend-api/codex';
      }
      if (!codexConfig.model) {
        warnings.push('codex.model未设置，将使用默认值');
        codexConfig.model = 'gpt-5-codex';
      }
      if (!codexConfig.timeout) {
        warnings.push('codex.timeout未设置，将使用默认值');
        codexConfig.timeout = 60000;
      }
      if (!codexConfig.reasoning) {
        codexConfig.reasoning = {
          effort: 'minimal',
          summary: 'auto',
        };
      } else {
        const effortRaw = codexConfig.reasoning.effort;
        if (
          effortRaw &&
          typeof effortRaw === 'string' &&
          ['minimal', 'low', 'medium', 'high'].includes(effortRaw.toLowerCase())
        ) {
          codexConfig.reasoning.effort = effortRaw.toLowerCase() as
            | 'minimal'
            | 'low'
            | 'medium'
            | 'high';
        } else {
          codexConfig.reasoning.effort = 'minimal';
          warnings.push('codex.reasoning.effort无效，将使用默认值 minimal');
        }

        const summaryRaw = codexConfig.reasoning.summary;
        if (typeof summaryRaw === 'string') {
          const normalizedSummary = summaryRaw.toLowerCase();
          if (['concise', 'detailed', 'auto'].includes(normalizedSummary)) {
            codexConfig.reasoning.summary = normalizedSummary as
              | 'concise'
              | 'detailed'
              | 'auto';
          } else {
            codexConfig.reasoning.summary = 'auto';
            warnings.push('codex.reasoning.summary无效，将使用默认值 auto');
          }
        } else {
          codexConfig.reasoning.summary = 'auto';
        }
      }
      if (!codexConfig.textVerbosity) {
        codexConfig.textVerbosity = 'low';
      }
    } else {
      const authModeRaw = (codexConfig?.authMode || 'ApiKey')
        .toString()
        .trim()
        .toLowerCase();
      const normalizedAuthMode =
        authModeRaw === 'chatgpt' ? 'ChatGPT' : 'ApiKey';
      if (codexConfig) {
        codexConfig.authMode = normalizedAuthMode;
      }
      const shouldKeepCodex =
        codexConfig &&
        (codexConfig.authMode === 'ChatGPT' || !!codexConfig.apiKey);
      config.codex = shouldKeepCodex ? codexConfig : undefined;
    }

    // 验证gateway配置
    let gatewayConfig: GatewayConfig | undefined = config.gateway;
    if (!gatewayConfig) {
      warnings.push('gateway配置缺失，将使用默认值');
      gatewayConfig = {
        port: 23062,
        host: '0.0.0.0',
        logLevel: 'info',
        logDir: DEFAULT_GATEWAY_LOG_DIR,
      };
      config.gateway = gatewayConfig;
    }

    if (!gatewayConfig.logDir) {
      warnings.push('gateway.logDir未设置，将使用默认值');
      gatewayConfig.logDir = DEFAULT_GATEWAY_LOG_DIR;
    }

    gatewayConfig.logDir = this.normalizeLogDir(gatewayConfig.logDir);

    const isValid = errors.length === 0;
    const result: ConfigValidationResult = {
      isValid,
      errors,
      warnings,
    };

    if (isValid) {
      result.config = {
        openai: config.openai ?? openaiConfig,
        codex: config.codex,
        gateway: config.gateway as GatewayConfig,
        aiProvider: config.aiProvider ?? 'openai',
        configSource: '', // 将在调用方设置
        isValid: true,
      };
    }

    return result;
  }

  private normalizeLogDir(logDir: string): string {
    if (!logDir || typeof logDir !== 'string') {
      return DEFAULT_GATEWAY_LOG_DIR;
    }
    const trimmed = logDir.trim();
    if (!trimmed) {
      return DEFAULT_GATEWAY_LOG_DIR;
    }
    if (trimmed === '~') {
      return os.homedir();
    }
    if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
      const relative = trimmed.slice(2);
      return path.join(os.homedir(), relative);
    }
    if (trimmed.startsWith('~')) {
      const relative = trimmed.slice(1).replace(/^[\\/]/, '');
      return path.join(os.homedir(), relative);
    }
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
  }
}
