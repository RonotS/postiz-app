import { IsObject, IsString, MinLength } from 'class-validator';

export class AttachPublishedTweetDto {
  @IsString()
  @MinLength(1)
  integrationId: string;

  @IsString()
  @MinLength(8)
  tweetUrl: string;

  @IsObject()
  settings: Record<string, unknown>;
}
