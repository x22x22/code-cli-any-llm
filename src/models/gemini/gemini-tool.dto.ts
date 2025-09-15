import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GeminiFunctionDeclarationDto } from './gemini-function-declaration.dto';

export class GeminiToolDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiFunctionDeclarationDto)
  functionDeclarations: GeminiFunctionDeclarationDto[];
}