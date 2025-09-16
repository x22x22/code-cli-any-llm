import { IsArray, IsOptional, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { GeminiCandidateDto } from './gemini-candidate.dto';
import { GeminiUsageMetadataDto } from './gemini-usage-metadata.dto';
import { GeminiPromptFeedbackDto } from './gemini-prompt-feedback.dto';

export class GeminiResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiCandidateDto)
  candidates: GeminiCandidateDto[];

  @IsOptional()
  @IsString()
  responseId?: string;

  @IsOptional()
  @IsString()
  createTime?: string;

  @IsOptional()
  @IsString()
  modelVersion?: string;

  @IsOptional()
  @IsString()
  thoughtSignature?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeminiUsageMetadataDto)
  usageMetadata?: GeminiUsageMetadataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeminiPromptFeedbackDto)
  promptFeedback?: GeminiPromptFeedbackDto;
}
