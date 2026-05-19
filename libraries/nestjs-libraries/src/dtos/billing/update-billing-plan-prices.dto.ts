import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

class PlanPriceRowDto {
  @IsNumber()
  @Min(0)
  month_price: number;

  @IsNumber()
  @Min(0)
  year_price: number;
}

export class UpdateBillingPlanPricesDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PlanPriceRowDto)
  STANDARD?: PlanPriceRowDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PlanPriceRowDto)
  PRO?: PlanPriceRowDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PlanPriceRowDto)
  TEAM?: PlanPriceRowDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PlanPriceRowDto)
  ULTIMATE?: PlanPriceRowDto;
}
