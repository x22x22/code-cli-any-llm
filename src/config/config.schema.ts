import {
  IsString,
  IsOptional,
  IsUrl,
  IsNumber,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import os from 'os';
import path from 'path';

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
  gateway!: GatewayConfig;
}
