import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class XMassFollowDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  userIds: string[];
}
