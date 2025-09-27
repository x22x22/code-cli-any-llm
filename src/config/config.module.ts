import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import os from 'os';
import path from 'path';
import { GlobalConfigService } from './global-config.service';

const DEFAULT_GATEWAY_LOG_DIR = path.join(
  os.homedir(),
  '.code-cli-any-llm',
  'logs',
);

const resolveLogDir = (value?: string): string => {
  if (!value || !value.trim()) {
    return DEFAULT_GATEWAY_LOG_DIR;
  }
  const trimmed = value.trim();
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

@Module({})
export class ConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: ConfigModule,
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => {
              // Use GlobalConfigService to load configuration with proper hierarchy
              const globalConfigService = new GlobalConfigService();
              const globalConfigResult = globalConfigService.loadGlobalConfig();

              // If global config is valid, use it; otherwise fallback to environment variables
              if (globalConfigResult.isValid && globalConfigResult.config) {
                const config = globalConfigResult.config;
                return {
                  openai: {
                    apiKey: config.openai.apiKey,
                    baseURL: config.openai.baseURL,
                    model: config.openai.model,
                    timeout: config.openai.timeout,
                    extraBody: config.openai.extraBody,
                  },
                  codex: config.codex
                    ? {
                        apiKey: config.codex.apiKey,
                        baseURL: config.codex.baseURL,
                        model: config.codex.model,
                        timeout: config.codex.timeout,
                        reasoning: config.codex.reasoning,
                        textVerbosity: config.codex.textVerbosity,
                        authMode: config.codex.authMode || 'ApiKey',
                      }
                    : undefined,
                  claudeCode: config.claudeCode
                    ? {
                        apiKey: config.claudeCode.apiKey,
                        baseURL: config.claudeCode.baseURL,
                        model: config.claudeCode.model,
                        timeout: config.claudeCode.timeout,
                        anthropicVersion: config.claudeCode.anthropicVersion,
                        beta: config.claudeCode.beta,
                        userAgent: config.claudeCode.userAgent,
                        xApp: config.claudeCode.xApp,
                        dangerousDirectBrowserAccess:
                          config.claudeCode.dangerousDirectBrowserAccess,
                        maxOutputTokens: config.claudeCode.maxOutputTokens,
                        extraHeaders: config.claudeCode.extraHeaders,
                      }
                    : undefined,
                  gateway: {
                    port: config.gateway.port,
                    host: config.gateway.host,
                    logLevel: config.gateway.logLevel,
                    logDir: resolveLogDir(config.gateway.logDir),
                    requestTimeout: config.gateway.requestTimeout ?? 3600000,
                    apiMode: config.gateway.apiMode ?? 'gemini',
                    cliMode: config.gateway.cliMode ?? 'gemini',
                    apiKey: config.gateway.apiKey,
                  },
                  aiProvider: config.aiProvider,
                };
              }

              // Fallback to environment variables if global config fails
              return {
                openai: {
                  apiKey: process.env.GAL_OPENAI_API_KEY,
                  baseURL:
                    process.env.GAL_OPENAI_BASE_URL ||
                    'https://api.openai.com/v1',
                  model: process.env.GAL_OPENAI_MODEL || 'gpt-3.5-turbo',
                  organization: process.env.GAL_OPENAI_ORGANIZATION,
                  timeout: Number(process.env.GAL_OPENAI_TIMEOUT) || 1800000,
                  extraBody: undefined,
                },
                codex: (() => {
                  const authModeRaw = (
                    process.env.GAL_CODEX_AUTH_MODE || 'ApiKey'
                  )
                    .trim()
                    .toLowerCase();
                  const authMode =
                    authModeRaw === 'chatgpt' ? 'ChatGPT' : 'ApiKey';
                  const hasApiKey = !!(
                    process.env.GAL_CODEX_API_KEY || ''
                  ).trim();
                  if (!hasApiKey && authMode !== 'ChatGPT') {
                    return undefined;
                  }
                  return {
                    apiKey: hasApiKey
                      ? process.env.GAL_CODEX_API_KEY
                      : undefined,
                    baseURL:
                      process.env.GAL_CODEX_BASE_URL ||
                      'https://chatgpt.com/backend-api/codex',
                    model: process.env.GAL_CODEX_MODEL || 'gpt-5-codex',
                    timeout: Number(process.env.GAL_CODEX_TIMEOUT) || 1800000,
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
                    authMode,
                  };
                })(),
                claudeCode: (() => {
                  const apiKey =
                    process.env.GAL_CLAUDE_CODE_API_KEY ||
                    process.env.GAL_ANTHROPIC_API_KEY ||
                    '';
                  if (!apiKey.trim()) {
                    return undefined;
                  }
                  return {
                    apiKey: apiKey.trim(),
                    baseURL:
                      process.env.GAL_CLAUDE_CODE_BASE_URL ||
                      'https://open.bigmodel.cn/api/anthropic',
                    model:
                      process.env.GAL_CLAUDE_CODE_MODEL ||
                      'claude-sonnet-4-20250514',
                    timeout:
                      Number(process.env.GAL_CLAUDE_CODE_TIMEOUT) || 1800000,
                    anthropicVersion:
                      process.env.GAL_CLAUDE_CODE_VERSION || '2023-06-01',
                    beta: parseBetaEnv(process.env.GAL_CLAUDE_CODE_BETA),
                    userAgent:
                      process.env.GAL_CLAUDE_CODE_USER_AGENT ||
                      'claude-cli/1.0.119 (external, cli)',
                    xApp: process.env.GAL_CLAUDE_CODE_X_APP || 'cli',
                    dangerousDirectBrowserAccess: normalizeBoolean(
                      process.env.GAL_CLAUDE_CODE_DANGEROUS_DIRECT,
                      true,
                    ),
                    maxOutputTokens: process.env.GAL_CLAUDE_CODE_MAX_OUTPUT
                      ? Number(process.env.GAL_CLAUDE_CODE_MAX_OUTPUT)
                      : undefined,
                    extraHeaders: undefined,
                  };
                })(),
                gateway: {
                  port: Number(process.env.GAL_PORT) || 23062,
                  host: process.env.GAL_HOST || '0.0.0.0',
                  logLevel: process.env.GAL_LOG_LEVEL || 'info',
                  logDir: resolveLogDir(process.env.GAL_GATEWAY_LOG_DIR),
                  requestTimeout:
                    Number(process.env.GAL_REQUEST_TIMEOUT) || 3600000,
                  apiMode:
                    (process.env.GAL_GATEWAY_API_MODE || 'gemini')
                      .toString()
                      .trim()
                      .toLowerCase() === 'openai'
                      ? 'openai'
                      : 'gemini',
                  cliMode: (() => {
                    const raw = (process.env.GAL_GATEWAY_CLI_MODE || 'gemini')
                      .toString()
                      .trim()
                      .toLowerCase();
                    if (raw === 'opencode') {
                      return 'opencode';
                    }
                    if (raw === 'crush') {
                      return 'crush';
                    }
                    return 'gemini';
                  })(),
                  apiKey: process.env.GAL_GATEWAY_API_KEY,
                },
                aiProvider: (
                  process.env.GAL_AI_PROVIDER || 'openai'
                ).toLowerCase(),
              };
            },
          ],
        }),
      ],
      exports: [NestConfigModule],
      global: true,
    };
  }
}
