import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAutomationPagesFlagsDto {
  @IsOptional()
  @IsBoolean()
  profileAutomationsPublic?: boolean;

  /** @deprecated use profileAutomationsPublic */
  @IsOptional()
  @IsBoolean()
  tweetAutomationsPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  followAutomationsPublic?: boolean;
}
