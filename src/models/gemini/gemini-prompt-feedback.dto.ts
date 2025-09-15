import { IsOptional, IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GeminiSafetyRatingDto } from './gemini-safety-rating.dto';

export class GeminiPromptFeedbackDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiSafetyRatingDto)
  safetyRatings?: GeminiSafetyRatingDto[];

  @IsOptional()
  @IsString()
  blockReason?: string;
}