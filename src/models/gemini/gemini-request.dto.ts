import {
  IsArray,
  IsOptional,
  IsObject,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GeminiContentDto } from './gemini-content.dto';
import { GeminiToolDto } from './gemini-tool.dto';
import { GeminiGenerationConfigDto } from './gemini-generation-config.dto';
import { GeminiSafetySettingDto } from './gemini-safety-setting.dto';

export class GeminiRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiContentDto)
  contents: GeminiContentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiToolDto)
  tools?: GeminiToolDto[];

  @IsOptional()
  @IsObject()
  toolConfig?: any;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeminiGenerationConfigDto)
  generationConfig?: GeminiGenerationConfigDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiSafetySettingDto)
  safetySettings?: GeminiSafetySettingDto[];

  @IsOptional()
  systemInstruction?: GeminiContentDto | string;

  @IsOptional()
  @IsBoolean()
  includeThoughts?: boolean;
}
