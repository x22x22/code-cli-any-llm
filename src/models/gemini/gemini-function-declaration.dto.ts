import { IsString, IsOptional, IsObject } from 'class-validator';

export class GeminiFunctionDeclarationDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsObject()
  parameters?: any;
}
