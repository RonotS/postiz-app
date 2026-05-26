import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class XFollowQueueEntryDto {
  @IsString()
  targetUserId: string;

  @IsOptional()
  @IsString()
  targetUsername?: string;

  @IsOptional()
  @IsString()
  targetName?: string;
}

export class XFollowQueueEnqueueDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2500)
  @ValidateNested({ each: true })
  @Type(() => XFollowQueueEntryDto)
  entries: XFollowQueueEntryDto[];
}
