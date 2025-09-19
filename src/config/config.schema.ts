import {
  IsString,
  IsOptional,
  IsUrl,
  IsNumber,
  Min,
  Max,
  IsIn,
  IsObject,
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
  const normalized = (envRaw || 'ApiKey').toString().trim().toLowerCase();
  return normalized === 'chatgpt' ? 'ChatGPT' : 'ApiKey';
}

export class GatewayConfig {
  @IsNumber()
  @Min(1)
  @Max(65535)
  @Transform(({ value }: { value: string }) =>
    value ? parseInt(value, 10) : 3000,
  )
  port!: number;

  @IsString()
  @Transform(({ value }: { value: string }) => value || '0.0.0.0')
  host!: string;

  @IsOptional()
  @IsString()
  logLevel?: 'debug' | 'info' | 'warn' | 'error';

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) =>
    normalizeLogDir(
      value || process.env.GAL_GATEWAY_LOG_DIR || DEFAULT_GATEWAY_LOG_DIR,
    ),
  )
  logDir?: string;
}

export class AppConfig {
  openai!: OpenAIConfig;
  @IsOptional()
  codex?: CodexConfig;
  gateway!: GatewayConfig;
  @IsString()
  @IsIn(['openai', 'codex'])
  @Transform(({ value }: { value: string }) =>
    (value || process.env.GAL_AI_PROVIDER || 'openai').toLowerCase(),
  )
  aiProvider!: 'openai' | 'codex';
}
