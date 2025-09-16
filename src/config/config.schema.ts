import {
  IsString,
  IsOptional,
  IsUrl,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class OpenAIConfig {
  @IsString()
  @Transform(
    ({ value }: { value: string }) => value || process.env.OPENAI_API_KEY,
  )
  apiKey!: string;

  @IsUrl()
  @Transform(
    ({ value }: { value: string }) =>
      value || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  )
  baseURL!: string;

  @IsString()
  @Transform(
    ({ value }: { value: string }) =>
      value || process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
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
}

export class AppConfig {
  openai!: OpenAIConfig;
  gateway!: GatewayConfig;
}
