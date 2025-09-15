import { IsOptional, IsNumber, Min, Max, IsString, IsArray } from 'class-validator';

export class GeminiGenerationConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8)
  candidateCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxOutputTokens?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stopSequences?: string[];
}