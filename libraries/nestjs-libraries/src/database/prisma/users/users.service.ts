import { Injectable } from '@nestjs/common';
import { UsersRepository } from '@gitroom/nestjs-libraries/database/prisma/users/users.repository';
import { Provider } from '@prisma/client';
import { UserDetailDto } from '@gitroom/nestjs-libraries/dtos/users/user.details.dto';
import { EmailNotificationsDto } from '@gitroom/nestjs-libraries/dtos/users/email-notifications.dto';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';

@Injectable()
export class UsersService {
  constructor(
    private _usersRepository: UsersRepository,
    private _organizationRepository: OrganizationRepository
  ) {}

  getUserByEmail(email: string) {
    return this._usersRepository.getUserByEmail(email);
  }

  getUserById(id: string) {
    return this._usersRepository.getUserById(id);
  }

  getImpersonateUser(name: string) {
    return this._organizationRepository.getImpersonateUser(name);
  }

  getUserByProvider(providerId: string, provider: Provider) {
    return this._usersRepository.getUserByProvider(providerId, provider);
  }

  activateUser(id: string) {
    return this._usersRepository.activateUser(id);
  }

  updatePassword(id: string, password: string) {
    return this._usersRepository.updatePassword(id, password);
  }

  getPersonal(userId: string) {
    return this._usersRepository.getPersonal(userId);
  }

  changePersonal(userId: string, body: UserDetailDto) {
    return this._usersRepository.changePersonal(userId, body);
  }

  getEmailNotifications(userId: string) {
    return this._usersRepository.getEmailNotifications(userId);
  }

  updateEmailNotifications(userId: string, body: EmailNotificationsDto) {
    return this._usersRepository.updateEmailNotifications(userId, body);
  }

  /** Returns true when at least one user in the given organization has the
   *  platform-level `isSuperAdmin` flag set. Used as a bypass for
   *  subscription/usage gates so platform admins can operate on FREE orgs. */
  async orgHasPlatformSuperAdmin(orgId: string): Promise<boolean> {
    return this._usersRepository.orgHasPlatformSuperAdmin(orgId);
  }

  async listUsersForPlatformAdmin(take = 200) {
    const rows = await this._usersRepository.listUsersForPlatformAdmin(take);
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      providerName: u.providerName,
      activated: u.activated,
      isSuperAdmin: u.isSuperAdmin,
      createdAt:
        u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
      organizations: u.organizations.map((m) => ({
        role: m.role,
        organizationId: m.organization.id,
        organizationName: m.organization.name,
        subscriptionTier:
          m.organization.subscription?.subscriptionTier ?? 'FREE',
        subscriptionPeriod: m.organization.subscription?.period ?? null,
        subscriptionCancelAt: m.organization.subscription?.cancelAt
          ? m.organization.subscription.cancelAt instanceof Date
            ? m.organization.subscription.cancelAt.toISOString()
            : String(m.organization.subscription.cancelAt)
          : null,
        subscriptionLifetime:
          m.organization.subscription?.isLifetime ?? false,
      })),
    }));
  }
}
