import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GeminiContentDto } from './gemini-content.dto';
import { GeminiSafetyRatingDto } from './gemini-safety-rating.dto';

export class GeminiCandidateDto {
  @ValidateNested()
  @Type(() => GeminiContentDto)
  content: GeminiContentDto;

  @IsOptional()
  @IsEnum([
    'FINISH_REASON_UNSPECIFIED',
    'STOP',
    'MAX_TOKENS',
    'SAFETY',
    'RECITATION',
    'OTHER',
  ])
  finishReason?: string;

  @IsNumber()
  index: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiSafetyRatingDto)
  safetyRatings?: GeminiSafetyRatingDto[];
}
