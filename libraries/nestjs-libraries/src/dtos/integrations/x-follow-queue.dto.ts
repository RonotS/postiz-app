import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
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

  /** Follow selected: run the first 25-slot batch immediately after enqueue. */
  @IsOptional()
  @IsBoolean()
  processFirstBatch?: boolean;
}

export class XFollowQueueClearItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  itemIds: string[];
}
