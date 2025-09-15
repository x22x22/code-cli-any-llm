import { IsString } from 'class-validator';

export class GeminiSafetySettingDto {
  @IsString()
  category: string;

  @IsString()
  threshold: string;
}