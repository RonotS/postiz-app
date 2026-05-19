import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class BillingSubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  period: 'MONTHLY' | 'YEARLY';

  @IsIn(['STANDARD', 'PRO', 'TEAM', 'ULTIMATE'])
  billing: 'STANDARD' | 'PRO' | 'TEAM' | 'ULTIMATE';

  utm: string;

  dub: string;

  datafast_session_id: string;
  datafast_visitor_id: string;

  /** When true, Stripe subscription starts without trial_days (charge today). */
  @IsOptional()
  @IsBoolean()
  skipTrial?: boolean;
}
