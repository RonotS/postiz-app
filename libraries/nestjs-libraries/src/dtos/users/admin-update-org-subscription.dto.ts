import { IsIn, IsOptional } from 'class-validator';

const ADMIN_TIERS = [
  'FREE',
  'STANDARD',
  'TEAM',
  'PRO',
  'ULTIMATE',
] as const;

export type AdminSubscriptionTier = (typeof ADMIN_TIERS)[number];

export class AdminUpdateOrgSubscriptionDto {
  @IsIn(ADMIN_TIERS)
  tier: AdminSubscriptionTier;

  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY'])
  period?: 'MONTHLY' | 'YEARLY';
}
