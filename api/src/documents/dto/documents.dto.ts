import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename: string;

  @IsIn(['application/pdf', 'text/plain', 'text/markdown'])
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  size: number;
}