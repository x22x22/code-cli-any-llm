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
  ClaudeCodeConfig,
  GatewayConfig,
  GlobalConfig,
} from './global-config.interface';

const DEFAULT_GATEWAY_LOG_DIR = path.join(
  os.homedir(),
  '.code-cli-any-llm',
  'logs',
);

const parseBetaEnv = (value?: string): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const normalizeBoolean = (
  value: string | undefined,
  defaultValue = true,
): boolean => {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  return defaultValue;
};

@Injectable()
export class GlobalConfigService {
  private readonly configDir: string;
  private readonly configFile: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.code-cli-any-llm');
    this.configFile = path.join(this.configDir, 'config.yaml');
  }

  loadGlobalConfig(): ConfigValidationResult {
    try {
      // 配置优先级：项目配置 > 全局配置 > 环境变量
      let mergedConfig: Partial<GlobalConfig> = {};
      const configSources: string[] = [];

      // 1. 环境变量作为基础配置（最低优先级）
      const envAiProviderRaw = (
        process.env.CAL_AI_PROVIDER || 'openai'
      ).toLowerCase();
      const envAiProvider: 'openai' | 'codex' | 'claudeCode' =
        envAiProviderRaw === 'codex'
          ? 'codex'
          : envAiProviderRaw === 'claudecode'
            ? 'claudeCode'
            : 'openai';
      const envConfig: Partial<GlobalConfig> = {
        aiProvider: envAiProvider,
        openai: {
          apiKey: process.env.CAL_OPENAI_API_KEY || '',
          baseURL:
            process.env.CAL_OPENAI_BASE_URL ||
            'https://open.bigmodel.cn/api/paas/v4',
          model: process.env.CAL_OPENAI_MODEL || 'glm-4.5',
          timeout: Number(process.env.CAL_OPENAI_TIMEOUT) || 1800000,
          extraBody: undefined,
        },
        codex: process.env.CAL_CODEX_API_KEY
          ? {
              apiKey: process.env.CAL_CODEX_API_KEY || '',
              baseURL:
                process.env.CAL_CODEX_BASE_URL ||
                'https://chatgpt.com/backend-api/codex',
              model: process.env.CAL_CODEX_MODEL || 'gpt-5-codex',
              timeout: Number(process.env.CAL_CODEX_TIMEOUT) || 1800000,
              reasoning: (() => {
                const raw = process.env.CAL_CODEX_REASONING;
                if (!raw) return undefined;
                try {
                  return JSON.parse(raw);
                } catch {
                  return undefined;
                }
              })(),
              textVerbosity: (() => {
                const raw = (
                  process.env.CAL_CODEX_TEXT_VERBOSITY || ''
                ).toLowerCase();
                return ['low', 'medium', 'high'].includes(raw)
                  ? (raw as 'low' | 'medium' | 'high')
                  : undefined;
              })(),
            }
          : undefined,
        claudeCode: (() => {
          const apiKey =
            process.env.CAL_CLAUDE_CODE_API_KEY ||
            process.env.CAL_ANTHROPIC_API_KEY ||
            '';
          if (!apiKey.trim()) {
            return undefined;
          }
          return {
            apiKey: apiKey.trim(),
            baseURL:
              process.env.CAL_CLAUDE_CODE_BASE_URL ||
              'https://open.bigmodel.cn/api/anthropic',
            model:
              process.env.CAL_CLAUDE_CODE_MODEL || 'claude-sonnet-4-20250514',
            timeout: Number(process.env.CAL_CLAUDE_CODE_TIMEOUT) || 1800000,
            anthropicVersion:
              process.env.CAL_CLAUDE_CODE_VERSION || '2023-06-01',
            beta: parseBetaEnv(process.env.CAL_CLAUDE_CODE_BETA),
            userAgent:
              process.env.CAL_CLAUDE_CODE_USER_AGENT ||
              'claude-cli/1.0.119 (external, cli)',
            xApp: process.env.CAL_CLAUDE_CODE_X_APP || 'cli',
            dangerousDirectBrowserAccess: normalizeBoolean(
              process.env.CAL_CLAUDE_CODE_DANGEROUS_DIRECT,
              true,
            ),
            maxOutputTokens: process.env.CAL_CLAUDE_CODE_MAX_OUTPUT
              ? Number(process.env.CAL_CLAUDE_CODE_MAX_OUTPUT)
              : undefined,
            extraHeaders: undefined,
          } as ClaudeCodeConfig;
        })(),
        gateway: {
          port: Number(process.env.CAL_PORT) || 23062,
          host: process.env.CAL_HOST || '0.0.0.0',
          logLevel: process.env.CAL_LOG_LEVEL || 'info',
          logDir: process.env.CAL_GATEWAY_LOG_DIR || DEFAULT_GATEWAY_LOG_DIR,
          requestTimeout: Number(process.env.CAL_REQUEST_TIMEOUT) || 3600000,
        },
      };
      mergedConfig = this.deepMerge(
        mergedConfig as Record<string, unknown>,
        envConfig as Record<string, unknown>,
      ) as Partial<GlobalConfig>;
      if (
        process.env.CAL_OPENAI_API_KEY ||
        process.env.CAL_OPENAI_BASE_URL ||
        process.env.CAL_OPENAI_MODEL ||
        process.env.CAL_AI_PROVIDER ||
        process.env.CAL_CODEX_API_KEY ||
        process.env.CAL_CODEX_BASE_URL ||
        process.env.CAL_CODEX_MODEL ||
        process.env.CAL_CODEX_REASONING ||
        process.env.CAL_CODEX_TEXT_VERBOSITY ||
        process.env.CAL_CLAUDE_CODE_API_KEY ||
        process.env.CAL_CLAUDE_CODE_BASE_URL ||
        process.env.CAL_CLAUDE_CODE_MODEL ||
        process.env.CAL_CLAUDE_CODE_VERSION ||
        process.env.CAL_CLAUDE_CODE_BETA ||
        process.env.CAL_CLAUDE_CODE_USER_AGENT ||
        process.env.CAL_CLAUDE_CODE_X_APP ||
        process.env.CAL_CLAUDE_CODE_DANGEROUS_DIRECT ||
        process.env.CAL_CLAUDE_CODE_MAX_OUTPUT ||
        process.env.CAL_PORT ||
        process.env.CAL_HOST ||
        process.env.CAL_LOG_LEVEL ||
        process.env.CAL_GATEWAY_LOG_DIR ||
        process.env.CAL_REQUEST_TIMEOUT
      ) {
        configSources.push('Environment variables');
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
        let primarySource = 'Default configuration';
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
            message: `Failed to load configuration file: ${error.message}`,
            suggestion: 'Please verify that the configuration file format is valid.',
            required: true,
          },
        ],
        warnings: [],
      };
    }
  }

  saveConfig(config: GlobalConfig): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
    const content = yaml.dump(config, { indent: 2, lineWidth: 120 });
    fs.writeFileSync(this.configFile, content, { mode: 0o600 });
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
    const template = `# Global configuration for code-cli-any-llm
# Edit this file to configure your default API settings

aiProvider: openai

# OpenAI-compatible provider (default)
openai:
  apiKey: ""
  baseURL: "https://open.bigmodel.cn/api/paas/v4"
  model: "glm-4.5"
  timeout: 1800000

# Codex provider (optional)
codex:
  apiKey: ""
  baseURL: "https://chatgpt.com/backend-api/codex"
  model: "gpt-5-codex"
  timeout: 1800000
  reasoning:
    effort: minimal
    summary: auto
  textVerbosity: low

# Claude Code provider (optional)
claudeCode:
  apiKey: ""
  baseURL: "https://open.bigmodel.cn/api/anthropic"
  model: "claude-sonnet-4-20250514"
  timeout: 1800000
  anthropicVersion: "2023-06-01"
  beta:
    - claude-code-20250219
    - interleaved-thinking-2025-05-14
    - fine-grained-tool-streaming-2025-05-14
  userAgent: "claude-cli/1.0.119 (external, cli)"
  xApp: "cli"
  dangerousDirectBrowserAccess: true
  maxOutputTokens: 64000

# Gateway Configuration
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
  logDir: "~/.code-cli-any-llm/logs"
  requestTimeout: 3600000
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

    const gatewayCliModeRaw = (config.gateway?.cliMode || 'gemini')
      .toString()
      .trim()
      .toLowerCase();
    if (gatewayCliModeRaw === 'opencode' || gatewayCliModeRaw === 'crush') {
      config.gateway = config.gateway ?? ({} as GatewayConfig);
      config.gateway.apiMode = 'openai';
    }
    const requireOpenAIKey = (config.aiProvider ?? 'openai') === 'openai';

    // 验证openai配置
    if (!openaiConfig) {
      const defaultConfig: OpenAIConfig = {
        apiKey: '',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4.5',
        timeout: 1800000,
        extraBody: undefined,
      };
      if (requireOpenAIKey) {
        errors.push({
          field: 'openai',
          message: 'OpenAI configuration is missing',
          suggestion: 'Add an openai configuration section.',
          required: true,
        });
      }
      openaiConfig = defaultConfig;
      config.openai = openaiConfig;
    } else {
      const trimmedApiKey = openaiConfig.apiKey?.trim();
      // 验证apiKey
      if (!trimmedApiKey && requireOpenAIKey) {
        errors.push({
          field: 'openai.apiKey',
          message: 'API key is empty',
          suggestion: 'Set a valid API key in the configuration file.',
          required: true,
        });
      }
      openaiConfig.apiKey = trimmedApiKey ?? '';

      // 验证baseURL
      if (!openaiConfig.baseURL) {
        warnings.push('baseURL is not set; using the default value.');
        openaiConfig.baseURL = 'https://open.bigmodel.cn/api/paas/v4';
      }

      // 验证model
      if (!openaiConfig.model) {
        warnings.push('model is not set; using the default value.');
        openaiConfig.model = 'glm-4.5';
      }

      // 验证timeout
      if (!openaiConfig.timeout) {
        warnings.push('timeout is not set; using the default value.');
        openaiConfig.timeout = 1800000;
      }
    }

    const aiProviderRaw = (config.aiProvider || 'claudeCode')
      .toString()
      .toLowerCase();
    let aiProvider: 'openai' | 'codex' | 'claudeCode';
    if (aiProviderRaw === 'codex') {
      aiProvider = 'codex';
    } else if (aiProviderRaw === 'claudecode') {
      aiProvider = 'claudeCode';
    } else if (aiProviderRaw === 'openai') {
      aiProvider = 'openai';
    } else {
      errors.push({
        field: 'aiProvider',
        message: `Unsupported aiProvider: ${aiProviderRaw}`,
        suggestion: 'Only openai, codex, or claudeCode are supported.',
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
          timeout: 1800000,
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

      const gatewayApiKeyCandidate =
        typeof config.gateway?.apiKey === 'string'
          ? config.gateway.apiKey.trim()
          : undefined;

      const trimmedCodexKey = codexConfig.apiKey?.trim();
      if (codexConfig.authMode === 'ApiKey') {
        if (!trimmedCodexKey) {
          if (gatewayApiKeyCandidate) {
            codexConfig.apiKey = gatewayApiKeyCandidate;
          } else {
            errors.push({
              field: 'codex.apiKey',
              message: 'Codex API key is empty',
              suggestion: 'Set codex.apiKey in the configuration file.',
              required: true,
            });
          }
        } else {
          codexConfig.apiKey = trimmedCodexKey;
        }
      } else {
        if (trimmedCodexKey) {
          warnings.push('codex.apiKey is ignored when ChatGPT mode is enabled.');
        }
        codexConfig.apiKey = undefined;
      }
      if (!codexConfig.baseURL) {
        warnings.push('codex.baseURL is not set; using the default value.');
        codexConfig.baseURL = 'https://chatgpt.com/backend-api/codex';
      }
      if (!codexConfig.model) {
        warnings.push('codex.model is not set; using the default value.');
        codexConfig.model = 'gpt-5-codex';
      }
      if (!codexConfig.timeout) {
        warnings.push('codex.timeout is not set; using the default value.');
        codexConfig.timeout = 1800000;
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
          warnings.push('codex.reasoning.effort is invalid; defaulting to minimal.');
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
            warnings.push('codex.reasoning.summary is invalid; defaulting to auto.');
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

    let claudeConfig: ClaudeCodeConfig | undefined = config.claudeCode;
    const normalizeBetaList = (value: unknown): string[] | undefined => {
      if (!value) {
        return undefined;
      }
      if (Array.isArray(value)) {
        return value
          .map((item) =>
            typeof item === 'string' ? item.trim() : String(item).trim(),
          )
          .filter((item) => item.length > 0);
      }
      if (typeof value === 'string') {
        const normalized = value.trim();
        if (!normalized) {
          return undefined;
        }
        return normalized
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
      return undefined;
    };

    if (aiProvider === 'claudeCode') {
      if (!claudeConfig) {
        claudeConfig = {
          apiKey: '',
          baseURL: 'https://open.bigmodel.cn/api/anthropic',
          model: 'claude-sonnet-4-20250514',
          timeout: 1800000,
          anthropicVersion: '2023-06-01',
          beta: [
            'claude-code-20250219',
            'interleaved-thinking-2025-05-14',
            'fine-grained-tool-streaming-2025-05-14',
          ],
          userAgent: 'claude-cli/1.0.119 (external, cli)',
          xApp: 'cli',
          dangerousDirectBrowserAccess: true,
          maxOutputTokens: 64000,
          extraHeaders: undefined,
        };
        config.claudeCode = claudeConfig;
      }

      claudeConfig = config.claudeCode as ClaudeCodeConfig;

      const trimmedKey = claudeConfig.apiKey?.trim();
      if (!trimmedKey) {
        errors.push({
          field: 'claudeCode.apiKey',
          message: 'Claude Code API key is empty',
          suggestion: 'Set claudeCode.apiKey in the configuration file.',
          required: true,
        });
      } else {
        claudeConfig.apiKey = trimmedKey;
      }

      if (!claudeConfig.baseURL) {
        warnings.push('claudeCode.baseURL is not set; using the default value.');
        claudeConfig.baseURL = 'https://open.bigmodel.cn/api/anthropic';
      }

      if (!claudeConfig.model) {
        warnings.push('claudeCode.model is not set; using the default value.');
        claudeConfig.model = 'claude-sonnet-4-20250514';
      }

      if (!claudeConfig.timeout) {
        warnings.push('claudeCode.timeout is not set; using the default value.');
        claudeConfig.timeout = 1800000;
      }

      if (!claudeConfig.anthropicVersion) {
        claudeConfig.anthropicVersion = '2023-06-01';
      }

      const betaList = normalizeBetaList(claudeConfig.beta);
      claudeConfig.beta =
        betaList && betaList.length > 0
          ? betaList
          : [
              'claude-code-20250219',
              'interleaved-thinking-2025-05-14',
              'fine-grained-tool-streaming-2025-05-14',
            ];

      if (!claudeConfig.userAgent) {
        claudeConfig.userAgent = 'claude-cli/1.0.119 (external, cli)';
      }

      if (!claudeConfig.xApp) {
        claudeConfig.xApp = 'cli';
      }

      if (claudeConfig.dangerousDirectBrowserAccess === undefined) {
        claudeConfig.dangerousDirectBrowserAccess = true;
      }

      if (!claudeConfig.maxOutputTokens) {
        claudeConfig.maxOutputTokens = 64000;
      }
    } else {
      if (claudeConfig && !claudeConfig.apiKey?.trim()) {
        config.claudeCode = undefined;
      } else if (claudeConfig) {
        claudeConfig.apiKey = claudeConfig.apiKey.trim();
        claudeConfig.beta = normalizeBetaList(claudeConfig.beta);
      }
    }

    // 验证gateway配置
    let gatewayConfig: GatewayConfig | undefined = config.gateway;
    if (!gatewayConfig) {
      warnings.push('gateway configuration is missing; using default values.');
      gatewayConfig = {
        port: 23062,
        host: '0.0.0.0',
        logLevel: 'info',
        logDir: DEFAULT_GATEWAY_LOG_DIR,
        requestTimeout: 3600000,
        apiMode: 'gemini',
        cliMode: 'gemini',
        apiKey: undefined,
      };
      config.gateway = gatewayConfig;
    }

    if (!gatewayConfig.logDir) {
      warnings.push('gateway.logDir is not set; using the default value.');
      gatewayConfig.logDir = DEFAULT_GATEWAY_LOG_DIR;
    }

    gatewayConfig.logDir = this.normalizeLogDir(gatewayConfig.logDir);

    const parsedTimeout = Number(gatewayConfig.requestTimeout);
    if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
      warnings.push('gateway.requestTimeout is invalid; defaulting to 3600000 milliseconds.');
      gatewayConfig.requestTimeout = 3600000;
    } else {
      gatewayConfig.requestTimeout = parsedTimeout;
    }

    const apiModeRaw = (gatewayConfig.apiMode || 'gemini')
      .toString()
      .trim()
      .toLowerCase();
    gatewayConfig.apiMode = apiModeRaw === 'openai' ? 'openai' : 'gemini';

    const cliModeRaw = (gatewayConfig.cliMode || 'gemini')
      .toString()
      .trim()
      .toLowerCase();
    if (cliModeRaw === 'opencode') {
      gatewayConfig.cliMode = 'opencode';
    } else if (cliModeRaw === 'crush') {
      gatewayConfig.cliMode = 'crush';
    } else {
      gatewayConfig.cliMode = 'gemini';
    }

    if (typeof gatewayConfig.apiKey === 'string') {
      const trimmed = gatewayConfig.apiKey.trim();
      gatewayConfig.apiKey = trimmed.length > 0 ? trimmed : undefined;
    } else {
      gatewayConfig.apiKey = undefined;
    }

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
        claudeCode: config.claudeCode,
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
