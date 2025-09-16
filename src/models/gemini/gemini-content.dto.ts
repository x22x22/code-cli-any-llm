import { IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GeminiPartDto } from './gemini-part.dto';

export class GeminiContentDto {
  @IsEnum(['user', 'model'])
  role: 'user' | 'model';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiPartDto)
  parts: GeminiPartDto[];
}
