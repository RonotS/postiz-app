import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  AnalyticsData,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration, Organization } from '@prisma/client';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';
import { timer } from '@gitroom/helpers/utils/timer';
import { isStripeBillingEnabled } from '@gitroom/helpers/stripe/stripe.billing.env';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { difference, uniq } from 'lodash';
import utc from 'dayjs/plugin/utc';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { TemporalService } from 'nestjs-temporal-core';
import {
  xFollowerDmPollerWorkflowId,
  xEngagementPollerWorkflowId,
  xProfileAutomationsPollerWorkflowId,
  X_ENGAGEMENT_PLUG_FUNCTIONS,
  X_PROFILE_AUTOMATION_PLUG_FUNCTIONS,
  type XEngagementPlugFunction,
  type XProfileAutomationPlugFunction,
} from '@gitroom/nestjs-libraries/temporal/x.follower.dm.constants';
import { resolveXPollIntervalMs } from '@gitroom/helpers/x/x.poll-interval.env';
import {
  X_ENGAGEMENT_MAX_POSTS_PER_TICK,
} from '@gitroom/nestjs-libraries/integrations/social/x-plug-batch-rate-limit';
import {
  addQueuedEstimate,
  buildXPlugBatchRateLimitStatus,
  createDmBatchGate,
  decayQueuedEstimate,
} from '@gitroom/nestjs-libraries/integrations/social/x-plug-batch-rate-limit.store';
import { XAccountActivityService } from '@gitroom/nestjs-libraries/integrations/social/x.account-activity.service';
import { XAccountActivityHandler } from '@gitroom/nestjs-libraries/integrations/social/x.account-activity.handler';
import {
  XProvider,
  formatXApiErrorMessage,
} from '@gitroom/nestjs-libraries/integrations/social/x.provider';
import {
  X_FOLLOW_BATCH_MAX,
  formatFollowRateLimitMessage,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit';
import {
  getXFollowRateLimitForIntegration,
  getXUnfollowRateLimitForIntegration,
  recordXFollowsForIntegration,
  recordXUnfollowsForIntegration,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-rate-limit.store';
import {
  getXAccountActivityRedisSubscribedKey,
  isXAccountActivityPollingDisabled,
  isXAccountActivityWebhooksEnabled,
} from '@gitroom/helpers/x/x.account-activity.env';

dayjs.extend(utc);

@Injectable()
export class IntegrationService implements OnModuleInit {
  private storage = UploadFactory.createStorage();
  constructor(
    private _integrationRepository: IntegrationRepository,
    private _autopostsRepository: AutopostRepository,
    private _integrationManager: IntegrationManager,
    private _notificationService: NotificationService,
    @Inject(forwardRef(() => RefreshIntegrationService))
    private _refreshIntegrationService: RefreshIntegrationService,
    private _temporalService: TemporalService,
    private _xAccountActivity: XAccountActivityService,
    private _xAccountActivityHandler: XAccountActivityHandler
  ) { }

  async onModuleInit(): Promise<void> {
    if (process.env.RUN_CRON) {
      void this.bootstrapXPlugPollers().catch((err) =>
        console.error('bootstrapXPlugPollers:', err)
      );
    }
  }

  async changeActiveCron(orgId: string) {
    const data = await this._autopostsRepository.getAutoposts(orgId);

    for (const item of data.filter((f) => f.active)) {
      try {
        await this._temporalService.terminateWorkflow(`autopost-${item.id}`);
      } catch (err) { }
    }

    return true;
  }

  getMentions(platform: string, q: string) {
    return this._integrationRepository.getMentions(platform, q);
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    return this._integrationRepository.insertMentions(platform, mentions);
  }

  async setTimes(
    orgId: string,
    integrationId: string,
    times: IntegrationTimeDto
  ) {
    return this._integrationRepository.setTimes(orgId, integrationId, times);
  }

  updateProviderSettings(org: string, id: string, additionalSettings: string) {
    return this._integrationRepository.updateProviderSettings(
      org,
      id,
      additionalSettings
    );
  }

  checkPreviousConnections(org: string, id: string) {
    return this._integrationRepository.checkPreviousConnections(org, id);
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
        title: string;
        description: string;
        type: 'checkbox' | 'text' | 'textarea';
        value: any;
        regex?: string;
      }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn?: number,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string
  ) {
    const uploadedPicture = picture
      ? picture?.indexOf('imagedelivery.net') > -1
        ? picture
        : await this.storage.uploadSimple(picture)
      : undefined;

    const row = await this._integrationRepository.createOrUpdateIntegration(
      additionalSettings,
      oneTimeToken,
      org,
      name,
      uploadedPicture,
      type,
      internalId,
      provider,
      token,
      refreshToken,
      expiresIn,
      username,
      isBetweenSteps,
      refresh,
      timezone,
      customInstanceDetails
    );

    if (provider === 'x') {
      void this.syncXAccountActivitySubscription(row).catch((err) =>
        console.error('syncXAccountActivitySubscription:', err)
      );
    }

    return row;
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integrationRepository.updateIntegrationGroup(org, id, group);
  }

  updateOnCustomerName(org: string, id: string, name: string) {
    return this._integrationRepository.updateOnCustomerName(org, id, name);
  }

  getIntegrationsList(org: string) {
    return this._integrationRepository.getIntegrationsList(org);
  }

  getIntegrationForOrder(id: string, order: string, user: string, org: string) {
    return this._integrationRepository.getIntegrationForOrder(
      id,
      order,
      user,
      org
    );
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integrationRepository.updateNameAndUrl(id, name, url);
  }

  getIntegrationById(org: string, id: string) {
    return this._integrationRepository.getIntegrationById(org, id);
  }

  /** Per-tweet count of recorded auto-DM engager sends (dedup store). */
  countAutoDmEngagersByTweetIds(integrationId: string, tweetIds: string[]) {
    return this._integrationRepository.countAutoDmEngagersByTweetIds(
      integrationId,
      tweetIds
    );
  }

  async refreshToken(provider: SocialProvider, refresh: string) {
    try {
      const { refreshToken, accessToken, expiresIn } =
        await provider.refreshToken(refresh);

      if (!refreshToken || !accessToken || !expiresIn) {
        return false;
      }

      return { refreshToken, accessToken, expiresIn };
    } catch (e) {
      return false;
    }
  }

  async disconnectChannel(orgId: string, integration: Integration) {
    if (integration.providerIdentifier === 'x') {
      void this.unsyncXAccountActivitySubscription(integration).catch((err) =>
        console.error('unsyncXAccountActivitySubscription:', err)
      );
    }
    await this._integrationRepository.disconnectChannel(orgId, integration.id);
    await this.informAboutRefreshError(orgId, integration);
  }

  /** Inbound X Account Activity webhook payload (CRC + events). */
  async handleXAccountActivityPayload(
    payload: Record<string, unknown>
  ): Promise<void> {
    return this._xAccountActivityHandler.handlePayload(payload);
  }

  async syncXAccountActivitySubscription(
    integration: Integration
  ): Promise<void> {
    if (
      integration.providerIdentifier !== 'x' ||
      !this._xAccountActivity.isEnabled()
    ) {
      return;
    }
    const webhookId = await this._xAccountActivity.ensureWebhookRegistered();
    if (!webhookId) {
      return;
    }
    const ok = await this._xAccountActivity.subscribeUser(
      integration.token,
      webhookId
    );
    if (ok) {
      await ioRedis.set(
        getXAccountActivityRedisSubscribedKey(integration.id),
        '1',
        'EX',
        60 * 60 * 24 * 365
      );
    }
  }

  async unsyncXAccountActivitySubscription(
    integration: Integration
  ): Promise<void> {
    if (integration.providerIdentifier !== 'x') {
      return;
    }
    const webhookId = await this._xAccountActivity.getStoredWebhookId();
    if (!webhookId || !integration.internalId) {
      return;
    }
    await this._xAccountActivity.unsubscribeUser(
      integration.token,
      webhookId,
      integration.internalId
    );
    await ioRedis.del(getXAccountActivityRedisSubscribedKey(integration.id));
  }

  private async syncXAccountActivityForIntegrationId(
    orgId: string,
    integrationId: string
  ): Promise<void> {
    const integration = await this._integrationRepository.getIntegrationById(
      orgId,
      integrationId
    );
    if (integration) {
      await this.syncXAccountActivitySubscription(integration);
    }
  }

  async informAboutRefreshError(
    orgId: string,
    integration: Integration,
    err = ''
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}`,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}. Please go back to the system and connect it again ${process.env.FRONTEND_URL}/launches`,
      true,
      false,
      'info'
    );
  }

  async refreshNeeded(org: string, id: string) {
    return this._integrationRepository.refreshNeeded(org, id);
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integrationRepository.setBetweenRefreshSteps(id);
  }

  async refreshTokens() {
    const integrations = await this._integrationRepository.needsToBeRefreshed();
    for (const integration of integrations) {
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      const data = await this.refreshToken(provider, integration.refreshToken!);

      if (!data) {
        await this.informAboutRefreshError(
          integration.organizationId,
          integration
        );
        await this._integrationRepository.refreshNeeded(
          integration.organizationId,
          integration.id
        );
        return;
      }

      const { refreshToken, accessToken, expiresIn } = data;

      await this.createOrUpdateIntegration(
        undefined,
        !!provider.oneTimeToken,
        integration.organizationId,
        integration.name,
        undefined,
        'social',
        integration.internalId,
        integration.providerIdentifier,
        accessToken,
        refreshToken,
        expiresIn
      );
    }
  }

  async disableChannel(org: string, id: string) {
    return this._integrationRepository.disableChannel(org, id);
  }

  async enableChannel(org: string, totalChannels: number, id: string) {
    const integrations = (
      await this._integrationRepository.getIntegrationsList(org)
    ).filter((f) => !f.disabled);
    if (
      isStripeBillingEnabled() &&
      integrations.length >= totalChannels
    ) {
      throw new Error('You have reached the maximum number of channels');
    }

    return this._integrationRepository.enableChannel(org, id);
  }

  async getPostsForChannel(org: string, id: string) {
    return this._integrationRepository.getPostsForChannel(org, id);
  }

  async deleteChannel(org: string, id: string) {
    return this._integrationRepository.deleteChannel(org, id);
  }

  async disableIntegrations(org: string, totalChannels: number) {
    return this._integrationRepository.disableIntegrations(org, totalChannels);
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integrationRepository.checkForDeletedOnceAndUpdate(org, page);
  }

  async saveProviderPage(org: string, id: string, data: any) {
    const getIntegration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!getIntegration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (!getIntegration.inBetweenSteps) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    const provider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (!provider.fetchPageInformation) {
      throw new HttpException(
        'Provider does not support page selection',
        HttpStatus.BAD_REQUEST
      );
    }

    const getIntegrationInformation = await provider.fetchPageInformation(
      getIntegration.token,
      data
    );

    await this.checkForDeletedOnceAndUpdate(
      org,
      String(getIntegrationInformation.id)
    );
    await this._integrationRepository.updateIntegration(id, {
      picture: getIntegrationInformation.picture,
      internalId: String(getIntegrationInformation.id),
      organizationId: org,
      name: getIntegrationInformation.name,
      inBetweenSteps: false,
      token: getIntegrationInformation.access_token,
      profile: getIntegrationInformation.username,
    });

    return { success: true };
  }

  async checkAnalytics(
    org: Organization,
    integration: string,
    date: string,
    forceRefresh = false
  ): Promise<AnalyticsData[]> {
    const getIntegration = await this.getIntegrationById(org.id, integration);

    if (!getIntegration) {
      throw new Error('Invalid integration');
    }

    if (getIntegration.type !== 'social') {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this.disconnectChannel(org.id, getIntegration);
        return [];
      }
    }

    const getIntegrationData = await ioRedis.get(
      `integration:${org.id}:${integration}:${date}`
    );
    if (getIntegrationData) {
      return JSON.parse(getIntegrationData);
    }

    if (integrationProvider.analytics) {
      try {
        const loadAnalytics = await integrationProvider.analytics(
          getIntegration.internalId,
          getIntegration.token,
          +date
        );
        await ioRedis.set(
          `integration:${org.id}:${integration}:${date}`,
          JSON.stringify(loadAnalytics),
          'EX',
          !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
            ? 1
            : 3600
        );
        return loadAnalytics;
      } catch (e) {
        if (e instanceof RefreshToken) {
          return this.checkAnalytics(org, integration, date, true);
        }
      }
    }

    return [];
  }

  customers(orgId: string) {
    return this._integrationRepository.customers(orgId);
  }

  getPlugsByIntegrationId(org: string, integrationId: string) {
    return this._integrationRepository.getPlugsByIntegrationId(
      org,
      integrationId
    );
  }

  async processInternalPlug(
    data: {
      post: string;
      originalIntegration: string;
      integration: string;
      plugName: string;
      orgId: string;
      delay: number;
      information: any;
    },
    forceRefresh = false
  ): Promise<any> {
    const originalIntegration =
      await this._integrationRepository.getIntegrationById(
        data.orgId,
        data.originalIntegration
      );

    const getIntegration = await this._integrationRepository.getIntegrationById(
      data.orgId,
      data.integration
    );

    if (!getIntegration || !originalIntegration) {
      return;
    }

    const getAllInternalPlugs = this._integrationManager
      .getInternalPlugs(getIntegration.providerIdentifier)
      .internalPlugs.find((p: any) => p.identifier === data.plugName);

    if (!getAllInternalPlugs) {
      return;
    }

    const getSocialIntegration = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    // @ts-ignore
    await getSocialIntegration?.[getAllInternalPlugs.methodName]?.(
      getIntegration,
      originalIntegration,
      data.post,
      data.information
    );

    return;
  }

  async processPlugs(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    const getPlugById = await this._integrationRepository.getPlug(data.plugId);
    if (!getPlugById) {
      return true;
    }

    const integration = this._integrationManager.getSocialIntegration(
      getPlugById.integration.providerIdentifier
    );

    // Look up the Postiz post that was published as this tweet (data.postId is
    // the platform-side release ID, e.g. the X tweet ID). Pass its settings
    // JSON to the plug method so plugs can honor per-post overrides
    // (e.g. auto-DM message, target toggles) without breaking older plugs that
    // don't use the parameter.
    let postSettings: any = undefined;
    try {
      const post = await this._integrationRepository.getPostByReleaseId(
        getPlugById.integration.id,
        data.postId
      );
      if (post?.settings) {
        try {
          postSettings = JSON.parse(post.settings);
        } catch {
          /* invalid JSON in post.settings — ignore, plug will fall back to plug-level defaults */
        }
      }
    } catch (err) {
      console.error('processPlugs: failed to load post settings:', err);
    }

    // Build a small per-plug context that lets the plug method persist state
    // across runs (e.g., the auto-DM plug uses this to remember which user IDs
    // have already received a DM for this post, so a user who liked first and
    // then later retweeted the same post doesn't receive a second DM).
    //
    // Stored values are scoped to (methodName, integrationId, value) where
    // value is "<postReleaseId>:<userId>" — prefixing with the post ID makes
    // dedup per-post, not global. Different posts can DM the same user.
    //
    // autoDmFollowers uses integration-wide keys (fdm:/fds:) instead of tweet id.
    const integrationId = getPlugById.integration.id;
    const followerBaselineKey = '__fdm_baseline_v1__';

    const dmGate =
      getPlugById.integration.providerIdentifier === 'x'
        ? createDmBatchGate(integrationId)
        : null;

    const mergeDmBatchGate = <T extends Record<string, unknown>>(ctx: T) =>
      dmGate
        ? {
            ...ctx,
            tryReserveDm: dmGate.tryReserveDm,
            confirmDmSent: dmGate.confirmDmSent,
          }
        : ctx;

    const engagementPlugContext = mergeDmBatchGate({
      // Returns the subset of `userIds` that have ALREADY been recorded for
      // this post (i.e., already DM'd in a prior run). Caller filters them out
      // before sending DMs.
      loadDmdUserIds: async (userIds: string[]): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map((uid) => `${data.postId}:${uid}`);
        const existing = await this._integrationRepository.loadExisingData(
          getPlugById.plugFunction,
          integrationId,
          candidates
        );
        const existingValues = new Set(existing.map((e: any) => e.value));
        return new Set(
          userIds.filter((uid) => existingValues.has(`${data.postId}:${uid}`))
        );
      },
      // Persist the user IDs that were successfully DM'd in this run so the
      // next run doesn't DM them again.
      saveDmdUserIds: async (userIds: string[]) => {
        if (userIds.length === 0) return;
        const values = userIds.map((uid) => `${data.postId}:${uid}`);
        await this._integrationRepository.saveExisingData(
          getPlugById.plugFunction,
          integrationId,
          values
        );
      },
    });

    const followerPlugContext = mergeDmBatchGate({
      loadDmdUserIds: async (userIds: string[]): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map((uid) => `fdm:${uid}`);
        const existing = await this._integrationRepository.loadExisingData(
          getPlugById.plugFunction,
          integrationId,
          candidates
        );
        const existingValues = new Set(existing.map((e: any) => e.value));
        return new Set(
          userIds.filter((uid) => existingValues.has(`fdm:${uid}`))
        );
      },
      saveDmdUserIds: async (userIds: string[]) => {
        if (userIds.length === 0) return;
        const values = userIds.map((uid) => `fdm:${uid}`);
        await this._integrationRepository.saveExisingData(
          getPlugById.plugFunction,
          integrationId,
          values
        );
      },
      hasFollowerBaselineMarker: async () => {
        const rows = await this._integrationRepository.loadExisingData(
          getPlugById.plugFunction,
          integrationId,
          [followerBaselineKey]
        );
        return rows.length > 0;
      },
      setFollowerBaselineMarker: async () => {
        await this._integrationRepository.saveExisingData(
          getPlugById.plugFunction,
          integrationId,
          [followerBaselineKey]
        );
      },
      loadFollowerSnapshotContains: async (
        userIds: string[]
      ): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map((uid) => `fds:${uid}`);
        const existing = await this._integrationRepository.loadExisingData(
          getPlugById.plugFunction,
          integrationId,
          candidates
        );
        const existingValues = new Set(existing.map((e: any) => e.value));
        return new Set(
          userIds.filter((uid) => existingValues.has(`fds:${uid}`))
        );
      },
      saveFollowerSnapshotIds: async (userIds: string[]) => {
        if (userIds.length === 0) return;
        const values = userIds.map((uid) => `fds:${uid}`);
        await this._integrationRepository.saveExisingData(
          getPlugById.plugFunction,
          integrationId,
          values
        );
      },
    });

    let engagementReleaseId = data.postId;
    if (getPlugById.plugFunction === 'autoDmPinnedPost') {
      const xProvider = integration as XProvider;
      const pinnedId = await xProvider.resolvePinnedTweetId(
        getPlugById.integration
      );
      if (pinnedId) {
        engagementReleaseId = pinnedId;
      }
    }

    const pinnedEngagementPlugContext = mergeDmBatchGate({
      loadDmdUserIds: async (userIds: string[]): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map(
          (uid) => `${engagementReleaseId}:${uid}`
        );
        const existing = await this._integrationRepository.loadExisingData(
          getPlugById.plugFunction,
          integrationId,
          candidates
        );
        const existingValues = new Set(existing.map((e: any) => e.value));
        return new Set(
          userIds.filter((uid) =>
            existingValues.has(`${engagementReleaseId}:${uid}`)
          )
        );
      },
      saveDmdUserIds: async (userIds: string[]) => {
        if (userIds.length === 0) return;
        const values = userIds.map(
          (uid) => `${engagementReleaseId}:${uid}`
        );
        await this._integrationRepository.saveExisingData(
          getPlugById.plugFunction,
          integrationId,
          values
        );
      },
    });

    const plugContext =
      getPlugById.plugFunction === 'autoDmFollowers'
        ? followerPlugContext
        : getPlugById.plugFunction === 'autoDmPinnedPost'
          ? pinnedEngagementPlugContext
          : engagementPlugContext;

    // @ts-ignore
    const process = await integration[getPlugById.plugFunction](
      getPlugById.integration,
      data.postId,
      JSON.parse(getPlugById.data).reduce((all: any, current: any) => {
        all[current.name] = current.value;
        return all;
      }, {}),
      postSettings,
      plugContext
    );

    if (process) {
      return true;
    }

    if (data.totalRuns === data.currentRun) {
      return true;
    }

    return false;
  }

  /**
   * Dashboard homepage enables Auto DM / Auto retweet without the Plugs UI.
   * Global workflows only schedule plugs that exist in DB with activated=true
   * (see PostsService.checkPlugs). Upsert the matching X plug rows here.
   */
  async ensureXHomepageAutomaticPlugs(
    organizationId: string,
    integrationId: string,
    settings: Record<string, unknown> | null | undefined
  ): Promise<void> {
    if (!settings || (settings as { __type?: string }).__type !== 'x') {
      return;
    }
    const s = settings as Record<string, unknown>;

    if (s.auto_dm_enabled === true) {
      const rawMsg =
        typeof s.auto_dm_message === 'string'
          ? (s.auto_dm_message as string).trim()
          : '';
      const message =
        rawMsg.length >= 3 ? rawMsg : 'Thanks for your support!';
      const targets = (s.auto_dm_targets || {}) as Record<string, unknown>;
      const boolStr = (v: unknown) =>
        v === true || v === 'true' || v === 1 || v === '1' ? 'true' : 'false';

      const fields: { name: string; value: string }[] = [
        { name: 'message', value: message },
        { name: 'targetLikes', value: boolStr(targets.likes) },
        { name: 'targetRetweets', value: boolStr(targets.retweets) },
        { name: 'targetReplies', value: boolStr(targets.replies) },
      ];

      await this.createOrUpdatePlug(organizationId, integrationId, {
        func: 'autoDmEngagers',
        fields,
      });
    } else if (s.auto_dm_enabled === false) {
      await this._integrationRepository.deactivatePlugByFunction(
        organizationId,
        integrationId,
        'autoDmEngagers'
      );
    }

    if (s.auto_retweet_enabled === true) {
      // autoRepostPost only uses likesAmount today. Homepage interval / #times are
      // stored on the post but not yet read by the plug (fixed poll interval in
      // @Plug metadata). Optional post setting auto_retweet_like_threshold if added later.
      const likesTrigger = String(
        Math.max(1, Number(s.auto_retweet_like_threshold ?? 1) || 1)
      );
      await this.createOrUpdatePlug(organizationId, integrationId, {
        func: 'autoRepostPost',
        fields: [{ name: 'likesAmount', value: likesTrigger }],
      });
    } else if (s.auto_retweet_enabled === false) {
      await this._integrationRepository.deactivatePlugByFunction(
        organizationId,
        integrationId,
        'autoRepostPost'
      );
    }

    if (s.auto_thread_reply_enabled === true) {
      const rawText =
        typeof s.auto_thread_reply_text === 'string'
          ? (s.auto_thread_reply_text as string).trim()
          : '';
      if (rawText.length >= 3) {
        const likesTrigger = String(
          Math.max(1, Number(s.auto_thread_reply_likes ?? 1) || 1)
        );
        await this.createOrUpdatePlug(organizationId, integrationId, {
          func: 'autoThreadReply',
          fields: [
            { name: 'likesAmount', value: likesTrigger },
            { name: 'thread', value: rawText },
          ],
        });
      }
    } else if (s.auto_thread_reply_enabled === false) {
      await this._integrationRepository.deactivatePlugByFunction(
        organizationId,
        integrationId,
        'autoThreadReply'
      );
    }

    await this.syncEngagementPoller(organizationId, integrationId);
  }

  private async startXFollowerDmPollerWorkflow(
    organizationId: string,
    integrationId: string,
    plugId: string
  ): Promise<void> {
    if (isXAccountActivityPollingDisabled()) {
      return;
    }
    const raw = this._temporalService.client?.getRawClient();
    if (!raw) return;
    const workflowId = xFollowerDmPollerWorkflowId(integrationId);
    const pollIntervalMs = resolveXPollIntervalMs(
      'X_FOLLOWER_DM_POLL_INTERVAL_MS'
    );
    try {
      await raw.workflow.start('xFollowerDmPollerWorkflow', {
        taskQueue: 'main',
        workflowId,
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
        args: [{ organizationId, integrationId, plugId, pollIntervalMs }],
      });
    } catch (err) {
      console.error('startXFollowerDmPollerWorkflow:', err);
    }
  }

  private async stopXFollowerDmPollerWorkflow(
    integrationId: string
  ): Promise<void> {
    try {
      await this._temporalService.terminateWorkflow(
        xFollowerDmPollerWorkflowId(integrationId)
      );
    } catch {
      /* workflow may not exist */
    }
  }

  /**
   * Follower-DM poller workflow calls this each tick to self-terminate when the
   * plug is disabled or removed.
   */
  async isFollowerDmPlugActive(plugId: string): Promise<boolean> {
    const plug = await this._integrationRepository.getPlug(plugId);
    if (!plug) return false;
    return (
      plug.activated === true && plug.plugFunction === 'autoDmFollowers'
    );
  }

  async listActiveProfileAutomationPlugIds(
    integrationId: string
  ): Promise<string[]> {
    return this._integrationRepository.listActiveProfileAutomationPlugIds(
      integrationId
    );
  }

  private isProfileAutomationPlug(
    func: string
  ): func is XProfileAutomationPlugFunction {
    return (X_PROFILE_AUTOMATION_PLUG_FUNCTIONS as readonly string[]).includes(
      func
    );
  }

  private async startXProfileAutomationsPollerWorkflow(
    organizationId: string,
    integrationId: string
  ): Promise<void> {
    if (isXAccountActivityPollingDisabled()) {
      return;
    }
    const raw = this._temporalService.client?.getRawClient();
    if (!raw) return;
    const workflowId = xProfileAutomationsPollerWorkflowId(integrationId);
    const pollIntervalMs = resolveXPollIntervalMs(
      'X_PROFILE_AUTOMATIONS_POLL_INTERVAL_MS'
    );
    try {
      await raw.workflow.start('xProfileAutomationsPollerWorkflow', {
        taskQueue: 'main',
        workflowId,
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
        args: [{ organizationId, integrationId, pollIntervalMs }],
      });
    } catch (err) {
      console.error('startXProfileAutomationsPollerWorkflow:', err);
    }
  }

  private async stopXProfileAutomationsPollerWorkflow(
    integrationId: string
  ): Promise<void> {
    try {
      await this._temporalService.terminateWorkflow(
        xProfileAutomationsPollerWorkflowId(integrationId)
      );
    } catch {
      /* workflow may not exist */
    }
  }

  private async syncProfileAutomationsPoller(
    organizationId: string,
    integrationId: string
  ): Promise<void> {
    const plugIds =
      await this.listActiveProfileAutomationPlugIds(integrationId);
    if (plugIds.length) {
      await this.startXProfileAutomationsPollerWorkflow(
        organizationId,
        integrationId
      );
    } else {
      await this.stopXProfileAutomationsPollerWorkflow(integrationId);
    }
  }

  private isEngagementPlug(func: string): func is XEngagementPlugFunction {
    return (X_ENGAGEMENT_PLUG_FUNCTIONS as readonly string[]).includes(func);
  }

  async hasActiveXEngagementPlugs(integrationId: string): Promise<boolean> {
    const rows =
      await this._integrationRepository.listActiveEngagementPlugIds(
        integrationId
      );
    return rows.length > 0;
  }

  /**
   * Start a forever poller only when it is not already RUNNING.
   * Avoids TERMINATE_EXISTING on every plug upsert (attach flow), which caused
   * Temporal "Workflow task not found" warnings and reset the poll timer.
   */
  private async startForeverPollerIfNotRunning(
    workflowType: string,
    workflowId: string,
    args: unknown[]
  ): Promise<void> {
    const raw = this._temporalService.client?.getRawClient();
    if (!raw) {
      return;
    }

    try {
      const handle = raw.workflow.getHandle(workflowId);
      const description = await handle.describe();
      if (description.status.name === 'RUNNING') {
        return;
      }
    } catch {
      /* workflow does not exist yet */
    }

    try {
      await raw.workflow.start(workflowType, {
        taskQueue: 'main',
        workflowId,
        workflowIdConflictPolicy: 'USE_EXISTING',
        args,
      });
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === 'WorkflowExecutionAlreadyStartedError') {
        return;
      }
      console.error(`startForeverPollerIfNotRunning ${workflowType}:`, err);
    }
  }

  private async startXEngagementPollerWorkflow(
    organizationId: string,
    integrationId: string
  ): Promise<void> {
    if (isXAccountActivityPollingDisabled()) {
      return;
    }
    const pollIntervalMs = resolveXPollIntervalMs(
      'X_ENGAGEMENT_POLL_INTERVAL_MS'
    );
    await this.startForeverPollerIfNotRunning(
      'xEngagementPollerWorkflow',
      xEngagementPollerWorkflowId(integrationId),
      [{ organizationId, integrationId, pollIntervalMs }]
    );
  }

  private async stopXEngagementPollerWorkflow(
    integrationId: string
  ): Promise<void> {
    try {
      await this._temporalService.terminateWorkflow(
        xEngagementPollerWorkflowId(integrationId)
      );
    } catch {
      /* workflow may not exist */
    }
  }

  private async syncEngagementPoller(
    organizationId: string,
    integrationId: string
  ): Promise<void> {
    const active = await this.hasActiveXEngagementPlugs(integrationId);
    if (active) {
      await this.startXEngagementPollerWorkflow(organizationId, integrationId);
    } else {
      await this.stopXEngagementPollerWorkflow(integrationId);
    }
  }

  /**
   * One 5-minute (default) engagement poller tick: run post-bound plugs on recent
   * published tweets, respecting DM batch caps (defer to next tick when limited).
   */
  /** Run engagement plugs for one tweet id (e.g. right after attach-published-tweet). */
  async runEngagementPlugsForReleaseId(
    organizationId: string,
    integrationId: string,
    releaseId: string,
    postSettings?: Record<string, unknown>
  ): Promise<void> {
    const status = await buildXPlugBatchRateLimitStatus(integrationId);
    if (status.limited) {
      return;
    }

    const plugs =
      await this._integrationRepository.listActiveEngagementPlugIds(
        integrationId
      );
    if (!plugs.length || !releaseId?.trim()) {
      return;
    }

    const enabledFuncs = new Set<string>();
    if (postSettings?.auto_dm_enabled === true) {
      enabledFuncs.add('autoDmEngagers');
    }
    if (postSettings?.auto_retweet_enabled === true) {
      enabledFuncs.add('autoRepostPost');
    }
    if (postSettings?.auto_thread_reply_enabled === true) {
      enabledFuncs.add('autoThreadReply');
    }

    for (const plug of plugs) {
      if (enabledFuncs.size > 0 && !enabledFuncs.has(plug.plugFunction)) {
        continue;
      }
      try {
        await this.processPlugs({
          plugId: plug.id,
          postId: releaseId,
          delay: 0,
          totalRuns: 1,
          currentRun: 1,
        });
      } catch (err) {
        console.error(
          `runEngagementPlugsForReleaseId plug=${plug.plugFunction} release=${releaseId}:`,
          err
        );
      }
    }
  }

  async runXEngagementPollerTick(
    organizationId: string,
    integrationId: string
  ): Promise<void> {
    const status = await buildXPlugBatchRateLimitStatus(integrationId);
    if (status.limited) {
      return;
    }

    const plugs =
      await this._integrationRepository.listActiveEngagementPlugIds(
        integrationId
      );
    if (!plugs.length) {
      return;
    }

    const posts =
      await this._integrationRepository.listPublishedPostReleaseIds(
        integrationId,
        100
      );
    const releaseIds = posts
      .map((p) => p.releaseId)
      .filter((id): id is string => !!id && id.trim().length > 0);

    const toProcess = releaseIds.slice(0, X_ENGAGEMENT_MAX_POSTS_PER_TICK);
    const skippedPosts = Math.max(0, releaseIds.length - toProcess.length);
    if (skippedPosts > 0) {
      await addQueuedEstimate(integrationId, skippedPosts * plugs.length);
    }

    for (const releaseId of toProcess) {
      for (const plug of plugs) {
        try {
          await this.processPlugs({
            plugId: plug.id,
            postId: releaseId,
            delay: 0,
            totalRuns: 1,
            currentRun: 1,
          });
        } catch (err) {
          console.error(
            `runXEngagementPollerTick plug=${plug.plugFunction} release=${releaseId}:`,
            err
          );
        }
      }
      await decayQueuedEstimate(integrationId, plugs.length);
    }
  }

  async getXPlugBatchRateLimit(orgId: string, integrationId: string) {
    const integration = await this.getIntegrationById(orgId, integrationId);
    if (!integration || integration.providerIdentifier !== 'x') {
      throw new HttpException('Invalid X integration', HttpStatus.BAD_REQUEST);
    }
    return buildXPlugBatchRateLimitStatus(integrationId);
  }

  /** Restarts forever X plug pollers at the current default interval (5 min). */
  async bootstrapXPlugPollers(): Promise<void> {
    if (isXAccountActivityPollingDisabled()) {
      return;
    }

    const engagement =
      await this._integrationRepository.listXIntegrationsWithActiveEngagementPlugs();
    for (const row of engagement) {
      await this.syncEngagementPoller(row.organizationId, row.integrationId);
    }

    const followerPlugs =
      await this._integrationRepository.listActiveFollowerDmPlugs();
    for (const plug of followerPlugs) {
      await this.startXFollowerDmPollerWorkflow(
        plug.organizationId,
        plug.integrationId,
        plug.id
      );
    }

    const profile =
      await this._integrationRepository.listXIntegrationsWithActiveProfileAutomationPlugs();
    for (const row of profile) {
      await this.syncProfileAutomationsPoller(
        row.organizationId,
        row.integrationId
      );
    }
  }

  async createOrUpdatePlug(
    orgId: string,
    integrationId: string,
    body: PlugDto
  ) {
    const row = await this._integrationRepository.createOrUpdatePlug(
      orgId,
      integrationId,
      body
    );

    if (body.func === 'autoDmFollowers' && row.activated) {
      if (!isXAccountActivityPollingDisabled()) {
        await this.startXFollowerDmPollerWorkflow(orgId, integrationId, row.id);
      }
    }

    if (this.isProfileAutomationPlug(body.func) && row.activated) {
      await this.syncProfileAutomationsPoller(orgId, integrationId);
    }

    if (this.isEngagementPlug(body.func)) {
      await this.syncEngagementPoller(orgId, integrationId);
    }

    if (row.activated && isXAccountActivityWebhooksEnabled()) {
      void this.syncXAccountActivityForIntegrationId(orgId, integrationId).catch(
        (err) => console.error('syncXAccountActivityForIntegrationId:', err)
      );
    }

    return {
      activated: row.activated,
      id: row.id,
    };
  }

  async changePlugActivation(orgId: string, plugId: string, status: boolean) {
    const updated = await this._integrationRepository.changePlugActivation(
      orgId,
      plugId,
      status
    );

    if (updated.plugFunction === 'autoDmFollowers') {
      if (status) {
        if (!isXAccountActivityPollingDisabled()) {
          await this.startXFollowerDmPollerWorkflow(
            orgId,
            updated.integrationId,
            plugId
          );
        }
        if (isXAccountActivityWebhooksEnabled()) {
          void this.syncXAccountActivityForIntegrationId(
            orgId,
            updated.integrationId
          ).catch((err) =>
            console.error('syncXAccountActivityForIntegrationId:', err)
          );
        }
      } else {
        await this.stopXFollowerDmPollerWorkflow(updated.integrationId);
      }
    }

    if (this.isProfileAutomationPlug(updated.plugFunction)) {
      await this.syncProfileAutomationsPoller(orgId, updated.integrationId);
    }

    if (this.isEngagementPlug(updated.plugFunction)) {
      await this.syncEngagementPoller(orgId, updated.integrationId);
    }

    return { id: updated.id };
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._integrationRepository.getPlugs(orgId, integrationId);
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    const exisingData = await this._integrationRepository.loadExisingData(
      methodName,
      integrationId,
      id
    );
    const loadOnlyIds = exisingData.map((p) => p.value);
    return difference(id, loadOnlyIds);
  }

  async listXFollowers(
    orgId: string,
    integrationId: string,
    subjectUserId?: string,
    paginationToken?: string,
    username?: string,
    listType: 'followers' | 'following' = 'followers'
  ) {
    const integration = await this.getIntegrationById(orgId, integrationId);
    if (!integration || integration.providerIdentifier !== 'x') {
      throw new HttpException('Invalid X integration', HttpStatus.BAD_REQUEST);
    }
    if (integration.disabled || integration.deletedAt) {
      throw new HttpException('Channel is disabled', HttpStatus.BAD_REQUEST);
    }

    const x = this._integrationManager.getSocialIntegration(
      'x'
    ) as XProvider;

    let subject = subjectUserId?.trim() || '';
    if (username?.trim()) {
      const resolved = await x.resolveUserByUsername(
        integration,
        username.trim()
      );
      subject = resolved.id;
    }
    if (!subject) {
      subject = integration.internalId || '';
    }
    if (!subject) {
      throw new HttpException('Missing user id', HttpStatus.BAD_REQUEST);
    }

    try {
      if (listType === 'following') {
        return await x.listFollowingPage(
          integration,
          subject,
          paginationToken?.trim() || undefined
        );
      }
      return await x.listFollowersPage(
        integration,
        subject,
        paginationToken?.trim() || undefined
      );
    } catch (err: unknown) {
      const fallback =
        listType === 'following'
          ? 'Could not load following list'
          : 'Could not load followers';
      const msg = formatXApiErrorMessage(err, fallback);
      console.error(
        `listXFollowers (${listType}) integration=${integrationId} subject=${subject}:`,
        msg,
        err
      );
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  async getXFollowRateLimit(orgId: string, integrationId: string) {
    const integration = await this.getIntegrationById(orgId, integrationId);
    if (!integration || integration.providerIdentifier !== 'x') {
      throw new HttpException('Invalid X integration', HttpStatus.BAD_REQUEST);
    }

    return getXFollowRateLimitForIntegration(integrationId);
  }

  async getXPinnedTweet(orgId: string, integrationId: string) {
    const integration = await this.getIntegrationById(orgId, integrationId);
    if (!integration || integration.providerIdentifier !== 'x') {
      throw new HttpException('Invalid X integration', HttpStatus.BAD_REQUEST);
    }

    const x = this._integrationManager.getSocialIntegration('x') as XProvider;
    return x.getPinnedTweetPreview(integration);
  }

  async getXUnfollowRateLimit(orgId: string, integrationId: string) {
    const integration = await this.getIntegrationById(orgId, integrationId);
    if (!integration || integration.providerIdentifier !== 'x') {
      throw new HttpException('Invalid X integration', HttpStatus.BAD_REQUEST);
    }

    return getXUnfollowRateLimitForIntegration(integrationId);
  }

  async massFollowXUsers(
    orgId: string,
    integrationId: string,
    userIds: string[]
  ) {
    const integration = await this.getIntegrationById(orgId, integrationId);
    if (!integration || integration.providerIdentifier !== 'x') {
      throw new HttpException('Invalid X integration', HttpStatus.BAD_REQUEST);
    }
    if (integration.disabled || integration.deletedAt) {
      throw new HttpException('Channel is disabled', HttpStatus.BAD_REQUEST);
    }
    if (integration.refreshNeeded) {
      throw new HttpException(
        'Reconnect this X channel before following users',
        HttpStatus.BAD_REQUEST
      );
    }

    const rateBefore = await getXFollowRateLimitForIntegration(integrationId);
    if (rateBefore.limited) {
      throw new HttpException(
        {
          message: formatFollowRateLimitMessage(rateBefore),
          rateLimit: rateBefore,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const cappedIds = userIds.slice(
      0,
      Math.min(X_FOLLOW_BATCH_MAX, rateBefore.remaining)
    );

    if (cappedIds.length === 0) {
      throw new HttpException(
        {
          message: formatFollowRateLimitMessage(rateBefore),
          rateLimit: rateBefore,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const x = this._integrationManager.getSocialIntegration(
      'x'
    ) as XProvider;

    try {
      const result = await x.followUsers(integration, cappedIds);
      const rateLimit = await recordXFollowsForIntegration(
        integrationId,
        result.succeeded.length
      );
      return { ...result, rateLimit };
    } catch (err: any) {
      const msg =
        err?.data?.detail ||
        err?.data?.title ||
        err?.message ||
        'Follow request failed';
      throw new HttpException(String(msg), HttpStatus.BAD_REQUEST);
    }
  }

  async massUnfollowXUsers(
    orgId: string,
    integrationId: string,
    userIds: string[]
  ) {
    const integration = await this.getIntegrationById(orgId, integrationId);
    if (!integration || integration.providerIdentifier !== 'x') {
      throw new HttpException('Invalid X integration', HttpStatus.BAD_REQUEST);
    }
    if (integration.disabled || integration.deletedAt) {
      throw new HttpException('Channel is disabled', HttpStatus.BAD_REQUEST);
    }
    if (integration.refreshNeeded) {
      throw new HttpException(
        'Reconnect this X channel before unfollowing users',
        HttpStatus.BAD_REQUEST
      );
    }

    const rateBefore = await getXUnfollowRateLimitForIntegration(integrationId);
    if (rateBefore.limited) {
      throw new HttpException(
        {
          message: `Unfollow limit reached (${rateBefore.limit} per ${rateBefore.windowMinutes} minutes). Try again after ${rateBefore.resetsAt}.`,
          rateLimit: rateBefore,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const cappedIds = userIds.slice(
      0,
      Math.min(X_FOLLOW_BATCH_MAX, rateBefore.remaining)
    );

    if (cappedIds.length === 0) {
      throw new HttpException(
        {
          message: `Unfollow limit reached (${rateBefore.limit} per ${rateBefore.windowMinutes} minutes).`,
          rateLimit: rateBefore,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const x = this._integrationManager.getSocialIntegration(
      'x'
    ) as XProvider;

    try {
      const result = await x.unfollowUsers(integration, cappedIds);
      const rateLimit = await recordXUnfollowsForIntegration(
        integrationId,
        result.succeeded.length
      );
      return { ...result, rateLimit };
    } catch (err: any) {
      const msg =
        err?.data?.detail ||
        err?.data?.title ||
        err?.message ||
        'Unfollow request failed';
      throw new HttpException(String(msg), HttpStatus.BAD_REQUEST);
    }
  }

  async findFreeDateTime(
    orgId: string,
    integrationsId?: string
  ): Promise<number[]> {
    const findTimes = await this._integrationRepository.getPostingTimes(
      orgId,
      integrationsId
    );
    return uniq(
      findTimes.reduce((all: any, current: any) => {
        return [
          ...all,
          ...JSON.parse(current.postingTimes).map(
            (p: { time: number }) => p.time
          ),
        ];
      }, [] as number[])
    );
  }
}
