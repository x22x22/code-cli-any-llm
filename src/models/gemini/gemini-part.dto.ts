import { IsOptional, IsString, IsObject, IsBoolean } from 'class-validator';

export class GeminiPartDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsBoolean()
  thought?: boolean;

  @IsOptional()
  @IsObject()
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };

  @IsOptional()
  @IsObject()
  functionResponse?: {
    name: string;
    response: any;
  };

  @IsOptional()
  @IsObject()
  inlineData?: {
    mimeType: string;
    data: string;
  };

  @IsOptional()
  @IsObject()
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
}
