import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class HistoryItemDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content: string;
}

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  question: string;

  /** Optional: restrict the search to one document */
  @IsOptional()
  @IsUUID()
  documentId?: string;

  /** Optional: last few messages so follow-up questions make sense */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => HistoryItemDto)
  history?: HistoryItemDto[];
}