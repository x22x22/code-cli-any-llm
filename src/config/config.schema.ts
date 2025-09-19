import {
  IsString,
  IsOptional,
  IsUrl,
  IsNumber,
  Min,
  Max,
  IsIn,
  IsObject,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';
import os from 'os';
import path from 'path';
import type {
  CodexReasoningConfig,
  CodexReasoningEffort,
  CodexReasoningSummary,
} from './global-config.interface';

const DEFAULT_GATEWAY_LOG_DIR = path.join(
  os.homedir(),
  '.gemini-any-llm',
  'logs',
);

function normalizeLogDir(value?: string): string {
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
}

export class OpenAIConfig {
  @IsString()
  @Transform(
    ({ value }: { value: string }) => value || process.env.GAL_OPENAI_API_KEY,
  )
  apiKey!: string;

  @IsUrl()
  @Transform(
    ({ value }: { value: string }) =>
      value || process.env.GAL_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  )
  baseURL!: string;

  @IsString()
  @Transform(
    ({ value }: { value: string }) =>
      value || process.env.GAL_OPENAI_MODEL || 'gpt-3.5-turbo',
  )
  model!: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(120000)
  @Transform(({ value }: { value: string }) =>
    value ? parseInt(value, 10) : 30000,
  )
  timeout?: number;

  @IsOptional()
  @IsObject()
  extraBody?: Record<string, any>;
}

export class CodexConfig {
  @IsOptional()
  @IsIn(['ApiKey', 'ChatGPT'])
  @Transform(({ value }: { value: string }) => normalizeAuthMode(value))
  authMode?: 'ApiKey' | 'ChatGPT';

  @IsOptional()
  @IsString()
  @Transform(
    ({ value }: { value: string }) => value || process.env.GAL_CODEX_API_KEY,
  )
  apiKey?: string;

  @IsOptional()
  @IsUrl()
  @Transform(
    ({ value }: { value: string }) =>
      value ||
      process.env.GAL_CODEX_BASE_URL ||
      'https://chatgpt.com/backend-api/codex',
  )
  baseURL?: string;

  @IsOptional()
  @IsString()
  @Transform(
    ({ value }: { value: string }) =>
      value || process.env.GAL_CODEX_MODEL || 'gpt-5-codex',
  )
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(120000)
  @Transform(({ value }: { value: string }) =>
    value ? parseInt(value, 10) : 60000,
  )
  timeout?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    parseReasoningConfig(value ?? process.env.GAL_CODEX_REASONING),
  )
  reasoning?: CodexReasoningConfig | null;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  @Transform(({ value }: { value: string }) =>
    (() => {
      const raw = (
        value ||
        process.env.GAL_CODEX_TEXT_VERBOSITY ||
        ''
      ).toLowerCase();
      return ['low', 'medium', 'high'].includes(raw)
        ? (raw as 'low' | 'medium' | 'high')
        : undefined;
    })(),
  )
  textVerbosity?: 'low' | 'medium' | 'high';
}

export class ClaudeCodeConfig {
  @IsString()
  @Transform(
    ({ value }: { value: string }) =>
      value ||
      process.env.GAL_CLAUDE_CODE_API_KEY ||
      process.env.GAL_ANTHROPIC_API_KEY,
  )
  apiKey!: string;

  @IsUrl()
  @Transform(
    ({ value }: { value: string }) =>
      value ||
      process.env.GAL_CLAUDE_CODE_BASE_URL ||
      'https://open.bigmodel.cn/api/anthropic',
  )
  baseURL!: string;

  @IsString()
  @Transform(
    ({ value }: { value: string }) =>
      value || process.env.GAL_CLAUDE_CODE_MODEL || 'claude-sonnet-4-20250514',
  )
  model!: string;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(120000)
  @Transform(({ value }: { value: string }) =>
    value
      ? parseInt(value, 10)
      : Number(process.env.GAL_CLAUDE_CODE_TIMEOUT) || 60000,
  )
  timeout?: number;

  @IsOptional()
  @IsString()
  @Transform(
    ({ value }: { value: string }) =>
      value || process.env.GAL_CLAUDE_CODE_VERSION || '2023-06-01',
  )
  anthropicVersion?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }: { value: unknown }) => parseBetaList(value))
  beta?: string[];

  @IsOptional()
  @IsString()
  @Transform(
    ({ value }: { value: string }) =>
      value ||
      process.env.GAL_CLAUDE_CODE_USER_AGENT ||
      'claude-cli/1.0.119 (external, cli)',
  )
  userAgent?: string;

  @IsOptional()
  @IsString()
  @Transform(
    ({ value }: { value: string }) =>
      value || process.env.GAL_CLAUDE_CODE_X_APP || 'cli',
  )
  xApp?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    toBoolean(value ?? process.env.GAL_CLAUDE_CODE_DANGEROUS_DIRECT ?? 'true'),
  )
  dangerousDirectBrowserAccess?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(128)
  @Max(200000)
  @Transform(({ value }: { value: string }) =>
    value
      ? parseInt(value, 10)
      : process.env.GAL_CLAUDE_CODE_MAX_OUTPUT
        ? parseInt(process.env.GAL_CLAUDE_CODE_MAX_OUTPUT, 10)
        : undefined,
  )
  maxOutputTokens?: number;

  @IsOptional()
  @IsObject()
  extraHeaders?: Record<string, string>;
}

export class GatewayConfigSchema {
  @IsNumber()
  @Min(1)
  @Max(65535)
  @Transform(({ value }: { value: string }) =>
    value ? parseInt(value, 10) : Number(process.env.GAL_PORT) || 23062,
  )
  port!: number;

  @IsString()
  @Transform(({ value }: { value: string }) => value || process.env.GAL_HOST)
  host!: string;

  @IsString()
  @Transform(
    ({ value }: { value: string }) => value || process.env.GAL_LOG_LEVEL,
  )
  logLevel!: string;

  @IsString()
  @Transform(({ value }: { value: string }) => normalizeLogDir(value))
  logDir!: string;
}

function parseReasoningConfig(raw: unknown): CodexReasoningConfig | undefined {
  if (!raw) {
    return undefined;
  }

  let source: unknown = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      const normalized = raw.toLowerCase();
      if (['minimal', 'low', 'medium', 'high'].includes(normalized)) {
        return { effort: normalized as CodexReasoningEffort };
      }
      if (['concise', 'detailed', 'auto'].includes(normalized)) {
        return { summary: normalized as CodexReasoningSummary };
      }
      return undefined;
    }
  }

  if (typeof source !== 'object' || source === null) {
    return undefined;
  }

  const obj = source as Record<string, unknown>;
  const effortRaw = obj.effort;
  const summaryRaw = obj.summary;

  const effort =
    typeof effortRaw === 'string' &&
    ['minimal', 'low', 'medium', 'high'].includes(effortRaw.toLowerCase())
      ? (effortRaw.toLowerCase() as CodexReasoningEffort)
      : undefined;

  const summary =
    typeof summaryRaw === 'string' &&
    ['concise', 'detailed', 'auto'].includes(summaryRaw.toLowerCase())
      ? (summaryRaw.toLowerCase() as CodexReasoningSummary)
      : undefined;

  const result: CodexReasoningConfig = {};
  if (effort) {
    result.effort = effort;
  }
  if (summary) {
    result.summary = summary;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeAuthMode(value?: string): 'ApiKey' | 'ChatGPT' {
  const envRaw = value ?? process.env.GAL_CODEX_AUTH_MODE;
  if (!envRaw) {
    return 'ApiKey';
  }
  return envRaw.toLowerCase() === 'chatgpt' ? 'ChatGPT' : 'ApiKey';
}

function parseBetaList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
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
}

function toBoolean(value: unknown, defaultValue = true): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
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
  }
  if (typeof value === 'number') {
    if (value === 0) {
      return false;
    }
    if (value === 1) {
      return true;
    }
  }
  return defaultValue;
}
