import { IsNumber, IsOptional } from 'class-validator';

export class GeminiUsageMetadataDto {
  @IsNumber()
  promptTokenCount: number;

  @IsNumber()
  candidatesTokenCount: number;

  @IsNumber()
  totalTokenCount: number;

  @IsOptional()
  @IsNumber()
  thoughtsTokenCount?: number;

  @IsOptional()
  @IsNumber()
  cachedContentTokenCount?: number;
}
