import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateStripePromotionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  /** Percent off (1–100). Omit if using amountOffCents. */
  @ValidateIf((o) => o.amountOffCents == null)
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  /** Fixed discount in USD cents. Omit if using percentOff. */
  @ValidateIf((o) => o.percentOff == null)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountOffCents?: number;

  @IsIn(['once', 'repeating', 'forever'])
  duration!: 'once' | 'repeating' | 'forever';

  @ValidateIf((o) => o.duration === 'repeating')
  @IsInt()
  @Min(1)
  @Max(36)
  durationInMonths?: number;

  /** Total redemptions allowed for this code across all customers. Omit for unlimited. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxRedemptions?: number;
}
