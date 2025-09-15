import { IsString } from 'class-validator';

export class GeminiSafetyRatingDto {
  @IsString()
  category: string;

  @IsString()
  probability: string;
}