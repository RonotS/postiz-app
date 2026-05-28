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
  X_FOLLOWER_DM_POLL_RELEASE_ID,
  X_PROFILE_AUTOMATION_PLUG_FUNCTIONS,
  X_PROFILE_AUTOMATIONS_POLL_RELEASE_ID,
  type XEngagementPlugFunction,
  type XProfileAutomationPlugFunction,
} from '@gitroom/nestjs-libraries/temporal/x.follower.dm.constants';
import { acquireXPollerTickLock } from '@gitroom/nestjs-libraries/integrations/social/x-poller-tick.guard';
import {
  resolveXPollIntervalMs,
  resolveXEngagementPollIntervalMs,
} from '@gitroom/helpers/x/x.poll-interval.env';
import {
  X_ENGAGEMENT_MAX_POSTS_PER_TICK,
  X_PLUG_DM_BATCH_MAX_PER_TICK,
} from '@gitroom/nestjs-libraries/integrations/social/x-plug-batch-rate-limit';
import {
  getXquikDmBatchMaxPerTick,
  getXquikEngagementMaxPostsPerTick,
  isXquikEngagementPollerEnabled,
} from '@gitroom/helpers/x/xquik.env';
import {
  addQueuedEstimate,
  buildXPlugBatchRateLimitStatus,
  createDmBatchGate,
  isXPlugDmWindowFull,
  isXPlugApiReadPaused,
  decayQueuedEstimate,
} from '@gitroom/nestjs-libraries/integrations/social/x-plug-batch-rate-limit.store';
import { isTweetStreamEnabled } from '@gitroom/helpers/x/tweetstream.env';
import { isTweetStreamWsConsumerActive } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.ws-state';
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
  cancelXFollowQueueItem,
  clearXFollowQueueCompleted,
  enqueueXFollowQueueItems,
  getXFollowQueueStatus,
  listIntegrationIdsWithPendingQueue,
  processXFollowQueueBatch,
} from '@gitroom/nestjs-libraries/integrations/social/x-follow-queue.store';
import {
  getXAccountActivityRedisSubscribedKey,
  isXAccountActivityPollingDisabled,
  isXAccountActivityWebhooksEnabled,
  isXEngagementPollingDisabled,
} from '@gitroom/helpers/x/x.account-activity.env';
import {
  isPostizBackendWorker,
  isTweetStreamFollowerPollingDisabled,
} from '@gitroom/helpers/x/tweetstream.env';
import { TweetStreamService } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.service';

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
    @Inject(forwardRef(() => XAccountActivityHandler))
    private _xAccountActivityHandler: XAccountActivityHandler,
    private _tweetStream: TweetStreamService
  ) { }

  async onModuleInit(): Promise<void> {
    if (process.env.RUN_CRON && isPostizBackendWorker()) {
      void this.bootstrapXPlugPollersWhenTemporalReady().catch((err) =>
        console.error('bootstrapXPlugPollers:', err)
      );
    }
    const queueIntervalMs = Math.max(
      15_000,
      Number(process.env.X_FOLLOW_QUEUE_POLL_MS) || 60_000
    );
    setInterval(() => {
      void this.processAllPendingXFollowQueues().catch((err) =>
        console.error('processAllPendingXFollowQueues:', err)
      );
    }, queueIntervalMs);
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
      void this.syncTweetStreamForIntegration(row).catch((err) =>
        console.error('syncTweetStreamForIntegration:', err)
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
      void this.syncTweetStreamMonitoredAccounts().catch((err) =>
        console.error('syncTweetStreamMonitoredAccounts:', err)
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

  /** Inbound Xquik webhook payload (monitor events). */
  async handleXquikPayload(payload: Record<string, unknown>): Promise<void> {
    return this._xAccountActivityHandler.handleXquikPayload(payload);
  }

  /**
   * Run engagement plugs immediately for published tweet ids (likes/RTs are poller-first;
   * this reduces delay right after tweet.new or when a retweet hints at new engagers).
   */
  async runImmediateEngagementPollForReleaseIds(
    releaseIds: string[]
  ): Promise<void> {
    const seen = new Set<string>();
    for (const releaseId of releaseIds) {
      const id = String(releaseId ?? '').trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      const channels =
        await this._integrationRepository.findXChannelsByPostReleaseId(id);
      for (const ch of channels) {
        if (!ch?.id || !ch.organizationId) {
          continue;
        }
        try {
          await this.runEngagementPlugsForReleaseId(
            ch.organizationId,
            ch.id,
            id
          );
        } catch (err) {
          console.error(
            `Xquik immediate engagement poll failed release=${id} integration=${ch.id}:`,
            err
          );
        }
      }
    }
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

  async syncTweetStreamMonitoredAccounts() {
    if (!this._tweetStream.isEnabled()) {
      return { desired: [] as string[] };
    }
    return this._tweetStream.syncMonitoredAccounts();
  }

  async getTweetStreamStatus() {
    return this._tweetStream.getStatus();
  }

  async listTweetStreamRecentEvents(limit?: number) {
    return this._tweetStream.listRecentEvents(limit);
  }

  async clearTweetStreamRecentEvents() {
    return this._tweetStream.clearRecentEvents();
  }

  private async syncTweetStreamForIntegration(integration: Integration) {
    if (integration.providerIdentifier !== 'x' || !integration.profile?.trim()) {
      return;
    }
    await this.syncTweetStreamMonitoredAccounts();
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

    if (getPlugById.integration.providerIdentifier === 'x') {
      const integrationId = getPlugById.integration.id;
      if (data.postId === X_FOLLOWER_DM_POLL_RELEASE_ID) {
        const intervalMs = resolveXPollIntervalMs(
          'X_FOLLOWER_DM_POLL_INTERVAL_MS'
        );
        const acquired = await acquireXPollerTickLock(
          'follower',
          integrationId,
          intervalMs
        );
        if (!acquired) {
          return true;
        }
      } else if (data.postId === X_PROFILE_AUTOMATIONS_POLL_RELEASE_ID) {
        const intervalMs = resolveXPollIntervalMs(
          'X_PROFILE_AUTOMATIONS_POLL_INTERVAL_MS'
        );
        const acquired = await acquireXPollerTickLock(
          'profile',
          integrationId,
          intervalMs
        );
        if (!acquired) {
          return true;
        }
      }
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

    const engagerSnapshotPrefix = `esnap:${data.postId}:`;
    const loadEngagerSnapshotForPost = async (): Promise<Set<string>> => {
      const rows = await this._integrationRepository.listExisingDataWithPrefix(
        getPlugById.plugFunction,
        integrationId,
        engagerSnapshotPrefix
      );
      return new Set(
        rows
          .map((r: { value: string }) => r.value.slice(engagerSnapshotPrefix.length))
          .filter(Boolean)
      );
    };
    const saveEngagerSnapshotForPost = async (userIds: string[]) => {
      const rows = await this._integrationRepository.listExisingDataWithPrefix(
        getPlugById.plugFunction,
        integrationId,
        engagerSnapshotPrefix
      );
      if (rows.length) {
        await this._integrationRepository.deleteExisingDataValues(
          getPlugById.plugFunction,
          integrationId,
          rows.map((r: { value: string }) => r.value)
        );
      }
      if (userIds.length) {
        await this._integrationRepository.saveExisingData(
          getPlugById.plugFunction,
          integrationId,
          userIds.map((uid) => `${engagerSnapshotPrefix}${uid}`)
        );
      }
    };

    const engagementPlugContext = mergeDmBatchGate({
      loadEngagerSnapshot: loadEngagerSnapshotForPost,
      saveEngagerSnapshot: saveEngagerSnapshotForPost,
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
        if (
          getPlugById.plugFunction === 'autoDmEngagers' &&
          userIds.length > 0
        ) {
          await this._integrationRepository.incrementAutoDmSentCountForPost(
            integrationId,
            data.postId,
            userIds.length
          );
        }
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
      listFollowerSnapshotUserIds: async () => {
        const rows = await this._integrationRepository.listExisingDataWithPrefix(
          getPlugById.plugFunction,
          integrationId,
          'fds:'
        );
        return rows
          .map((r) => r.value.replace(/^fds:/, ''))
          .filter(Boolean);
      },
      removeFollowerTracking: async (userIds: string[]) => {
        if (!userIds.length) return;
        const values = userIds.flatMap((uid) => [
          `fdm:${uid}`,
          `fds:${uid}`,
          `fprev:${uid}`,
        ]);
        await this._integrationRepository.deleteExisingDataValues(
          getPlugById.plugFunction,
          integrationId,
          values
        );
      },
      /** Follower ids seen on the previous poll tick (for unfollow/re-follow delta). */
      loadPreviousFollowerPollIds: async (): Promise<Set<string>> => {
        const rows = await this._integrationRepository.listExisingDataWithPrefix(
          getPlugById.plugFunction,
          integrationId,
          'fprev:'
        );
        return new Set(
          rows.map((r) => r.value.replace(/^fprev:/, '')).filter(Boolean)
        );
      },
      savePreviousFollowerPollIds: async (userIds: string[]) => {
        const rows = await this._integrationRepository.listExisingDataWithPrefix(
          getPlugById.plugFunction,
          integrationId,
          'fprev:'
        );
        if (rows.length) {
          await this._integrationRepository.deleteExisingDataValues(
            getPlugById.plugFunction,
            integrationId,
            rows.map((r) => r.value)
          );
        }
        if (userIds.length) {
          await this._integrationRepository.saveExisingData(
            getPlugById.plugFunction,
            integrationId,
            userIds.map((uid) => `fprev:${uid}`)
          );
        }
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

    const pinnedSnapshotPrefix = `esnap:${engagementReleaseId}:`;
    const loadPinnedEngagerSnapshot = async (): Promise<Set<string>> => {
      const rows = await this._integrationRepository.listExisingDataWithPrefix(
        getPlugById.plugFunction,
        integrationId,
        pinnedSnapshotPrefix
      );
      return new Set(
        rows
          .map((r: { value: string }) => r.value.slice(pinnedSnapshotPrefix.length))
          .filter(Boolean)
      );
    };
    const savePinnedEngagerSnapshot = async (userIds: string[]) => {
      const rows = await this._integrationRepository.listExisingDataWithPrefix(
        getPlugById.plugFunction,
        integrationId,
        pinnedSnapshotPrefix
      );
      if (rows.length) {
        await this._integrationRepository.deleteExisingDataValues(
          getPlugById.plugFunction,
          integrationId,
          rows.map((r: { value: string }) => r.value)
        );
      }
      if (userIds.length) {
        await this._integrationRepository.saveExisingData(
          getPlugById.plugFunction,
          integrationId,
          userIds.map((uid) => `${pinnedSnapshotPrefix}${uid}`)
        );
      }
    };

    const pinnedEngagementPlugContext = mergeDmBatchGate({
      loadEngagerSnapshot: loadPinnedEngagerSnapshot,
      saveEngagerSnapshot: savePinnedEngagerSnapshot,
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

  /**
   * Follower-DM poller runs when TweetStream WS is down, even if
   * TWEETSTREAM_DISABLE_FOLLOWER_POLLING=true (that flag only applies while WS is live).
   */
  private async shouldRunFollowerDmPoller(): Promise<boolean> {
    if (isXAccountActivityPollingDisabled()) {
      return false;
    }
    if (!isTweetStreamFollowerPollingDisabled()) {
      return true;
    }
    return !(await isTweetStreamWsConsumerActive());
  }

  /**
   * Start/stop follower-DM pollers based on TweetStream WebSocket availability.
   */
  async syncFollowerDmPollersWithTweetStreamFallback(): Promise<void> {
    const plugs =
      await this._integrationRepository.listActiveFollowerDmPlugs();
    const wsActive = await isTweetStreamWsConsumerActive();
    for (const plug of plugs) {
      if (wsActive && isTweetStreamFollowerPollingDisabled()) {
        await this.stopXFollowerDmPollerWorkflow(plug.integrationId);
        continue;
      }
      if (await this.shouldRunFollowerDmPoller()) {
        await this.startXFollowerDmPollerWorkflow(
          plug.organizationId,
          plug.integrationId,
          plug.id
        );
      }
    }
  }

  private async startXFollowerDmPollerWorkflow(
    organizationId: string,
    integrationId: string,
    plugId: string
  ): Promise<void> {
    if (!(await this.shouldRunFollowerDmPoller())) {
      return;
    }
    const pollIntervalMs = resolveXPollIntervalMs(
      'X_FOLLOWER_DM_POLL_INTERVAL_MS'
    );
    await this.startForeverPollerIfNotRunning(
      'xFollowerDmPollerWorkflow',
      xFollowerDmPollerWorkflowId(integrationId),
      [{ organizationId, integrationId, plugId, pollIntervalMs }]
    );
  }

  private async stopXFollowerDmPollerWorkflow(
    integrationId: string
  ): Promise<void> {
    await this.terminateForeverPollerIfRunning(
      xFollowerDmPollerWorkflowId(integrationId),
      'TweetStream WebSocket active — follower-DM poller paused'
    );
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
    if (isXEngagementPollingDisabled()) {
      return;
    }
    const pollIntervalMs = resolveXPollIntervalMs(
      'X_PROFILE_AUTOMATIONS_POLL_INTERVAL_MS'
    );
    await this.startForeverPollerIfNotRunning(
      'xProfileAutomationsPollerWorkflow',
      xProfileAutomationsPollerWorkflowId(integrationId),
      [{ organizationId, integrationId, pollIntervalMs }]
    );
  }

  private async stopXProfileAutomationsPollerWorkflow(
    integrationId: string
  ): Promise<void> {
    await this.terminateForeverPollerIfRunning(
      xProfileAutomationsPollerWorkflowId(integrationId)
    );
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
  /** Avoid throwing when nestjs-temporal-core is not connected yet (backend boot). */
  private getTemporalRawClientSafe() {
    try {
      return this._temporalService.client?.getRawClient() ?? null;
    } catch {
      return null;
    }
  }

  private async bootstrapXPlugPollersWhenTemporalReady(): Promise<void> {
    const maxAttempts = 24;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.getTemporalRawClientSafe()) {
        await this.bootstrapXPlugPollers();
        return;
      }
      await timer(5000);
    }
    console.warn(
      'bootstrapXPlugPollers: Temporal client not ready after retries; pollers start on next plug sync or publish'
    );
  }

  /** Terminate only RUNNING forever pollers (avoids Temporal ERROR on completed workflows). */
  private async terminateForeverPollerIfRunning(
    workflowId: string,
    reason = 'Stopped by Postiz'
  ): Promise<void> {
    const raw = this.getTemporalRawClientSafe();
    if (!raw) {
      return;
    }
    try {
      const handle = raw.workflow.getHandle(workflowId);
      const description = await handle.describe();
      if (description.status.name !== 'RUNNING') {
        return;
      }
      await handle.terminate(reason);
    } catch {
      /* workflow not found or already completed */
    }
  }

  private async startForeverPollerIfNotRunning(
    workflowType: string,
    workflowId: string,
    args: unknown[]
  ): Promise<void> {
    const raw = this.getTemporalRawClientSafe();
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
    if (isXEngagementPollingDisabled()) {
      return;
    }
    const pollIntervalMs = resolveXEngagementPollIntervalMs();
    await this.startForeverPollerIfNotRunning(
      'xEngagementPollerWorkflow',
      xEngagementPollerWorkflowId(integrationId),
      [{ organizationId, integrationId, pollIntervalMs }]
    );
  }

  private async stopXEngagementPollerWorkflow(
    integrationId: string
  ): Promise<void> {
    await this.terminateForeverPollerIfRunning(
      xEngagementPollerWorkflowId(integrationId)
    );
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
    if (await isXPlugDmWindowFull(integrationId)) {
      return;
    }

    const plugs =
      await this._integrationRepository.listActiveEngagementPlugIds(
        integrationId
      );
    if (!plugs.length || !releaseId?.trim()) {
      return;
    }

    let plugsForPost = plugs.filter((plug) =>
      this.isEngagementPlugActiveForPost(plug.plugFunction, postSettings)
    );
    // Right after publish there are no engagers yet; realtime/poller handles DMs.
    if (isTweetStreamEnabled() && !isXquikEngagementPollerEnabled()) {
      plugsForPost = plugsForPost.filter(
        (plug) => plug.plugFunction !== 'autoDmEngagers'
      );
    }

    for (const plug of plugsForPost) {
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
    void organizationId;

    const pollIntervalMs = resolveXEngagementPollIntervalMs();
    const acquired = await acquireXPollerTickLock(
      'engagement',
      integrationId,
      pollIntervalMs
    );
    if (!acquired) {
      return;
    }

    if (await isXPlugDmWindowFull(integrationId)) {
      const status = await buildXPlugBatchRateLimitStatus(integrationId);
      console.warn(
        `X engagement poller: skipping tick integration=${integrationId} dmWindow=${status.dmWindow.count}/${status.dmWindow.limit}`
      );
      return;
    }

    const xquikMode = isXquikEngagementPollerEnabled();

    const readPause = await isXPlugApiReadPaused(integrationId);
    if (readPause.paused && !xquikMode) {
      console.warn(
        `X engagement poller: skipping tick integration=${integrationId} — X API 429 cooldown until ${readPause.until}. TweetStream realtime DMs still work.`
      );
      return;
    }

    const tweetStreamWsActive = xquikMode
      ? false
      : await isTweetStreamWsConsumerActive();

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

    const maxPosts = xquikMode
      ? getXquikEngagementMaxPostsPerTick()
      : tweetStreamWsActive
        ? Math.min(3, X_ENGAGEMENT_MAX_POSTS_PER_TICK)
        : X_ENGAGEMENT_MAX_POSTS_PER_TICK;

    const published = posts.filter((p) => !!p.releaseId?.trim());
    let toProcess = published.slice(0, maxPosts);

    if (xquikMode && published.length > 0) {
      const integration = await this._integrationRepository.getIntegrationById(
        organizationId,
        integrationId
      );
      const xProvider = this._integrationManager.getSocialIntegration(
        'x'
      ) as XProvider;
      const ownerId = integration?.internalId;
      const scan = published.slice(0, Math.min(15, published.length));
      const scored = await Promise.all(
        scan.map(async (post) => ({
          post,
          repliers: await xProvider.countInboundRepliersViaXquik(
            post.releaseId!.trim(),
            ownerId
          ),
        }))
      );
      scored.sort((a, b) => b.repliers - a.repliers);
      const withReplies = scored
        .filter((s) => s.repliers > 0)
        .map((s) => s.post);
      const newestFirst = published.slice(0, Math.min(5, published.length));
      const merged = new Map<string, (typeof published)[0]>();
      for (const p of [...withReplies, ...newestFirst]) {
        merged.set(p.releaseId!.trim(), p);
      }
      toProcess = Array.from(merged.values()).slice(0, maxPosts);
      if (toProcess.length > 0) {
        console.log(
          `Xquik engagement poller: tick posts (ids=${toProcess.map((p) => p.releaseId).join(',')}${withReplies.length ? `; ${withReplies.length} with Xquik repliers` : ''})`
        );
      }
    }

    if (!xquikMode && tweetStreamWsActive && published.length > 0) {
      const integration = await this._integrationRepository.getIntegrationById(
        organizationId,
        integrationId
      );
      const xProvider = this._integrationManager.getSocialIntegration(
        'x'
      ) as XProvider;
      if (integration?.token) {
        try {
          const ids = published
            .map((p) => p.releaseId!.trim())
            .slice(0, 20);
          const metrics = await xProvider.batchTweetPublicMetrics(
            integration.token,
            ids
          );
          const withEngagement = published.filter((p) => {
            const m = metrics[p.releaseId!.trim()];
            return (m?.replyCount ?? 0) > 0 || (m?.likeCount ?? 0) > 0;
          });
          if (withEngagement.length > 0) {
            toProcess = withEngagement.slice(0, maxPosts);
          }
        } catch (err) {
          console.warn(
            `X engagement poller: metrics prefetch failed integration=${integrationId}:`,
            err
          );
        }
      }
    }

    const skippedPosts = Math.max(0, posts.length - toProcess.length);
    if (skippedPosts > 0) {
      await addQueuedEstimate(integrationId, skippedPosts * plugs.length);
    }

    for (const post of toProcess) {
      const releaseId = post.releaseId!.trim();
      let postSettings: Record<string, unknown> | undefined;
      if (post.settings) {
        try {
          postSettings = JSON.parse(post.settings) as Record<string, unknown>;
        } catch {
          postSettings = undefined;
        }
      }

      let plugsForPost = plugs.filter((plug) =>
        this.isEngagementPlugActiveForPost(plug.plugFunction, postSettings)
      );
      if (tweetStreamWsActive && !xquikMode) {
        plugsForPost = plugsForPost.filter((plug) =>
          ['autoDmPinnedPost', 'autoDmEngagers'].includes(plug.plugFunction)
        );
      }
      if (!plugsForPost.length) {
        continue;
      }

      for (const plug of plugsForPost) {
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
      await decayQueuedEstimate(integrationId, plugsForPost.length);
    }
  }

  /** Skip X API calls for posts with per-tweet automations turned off. */
  private isEngagementPlugActiveForPost(
    plugFunction: string,
    postSettings?: Record<string, unknown>
  ): boolean {
    if (plugFunction === 'autoDmEngagers') {
      return postSettings?.auto_dm_enabled !== false;
    }
    if (plugFunction === 'autoRepostPost') {
      return postSettings?.auto_retweet_enabled === true;
    }
    if (plugFunction === 'autoThreadReply') {
      return postSettings?.auto_thread_reply_enabled === true;
    }
    if (plugFunction === 'autoPlugPost') {
      const text =
        typeof postSettings?.auto_plug_reply_text === 'string'
          ? postSettings.auto_plug_reply_text.trim()
          : '';
      return text.length >= 3;
    }
    return true;
  }

  async getXPlugBatchRateLimit(orgId: string, integrationId: string) {
    const integration = await this.getIntegrationById(orgId, integrationId);
    if (!integration || integration.providerIdentifier !== 'x') {
      throw new HttpException('Invalid X integration', HttpStatus.BAD_REQUEST);
    }
    return buildXPlugBatchRateLimitStatus(integrationId);
  }

  /**
   * Ensures forever X pollers exist. Does not terminate running workflows (avoids
   * restart API credit spikes). Skips kinds disabled via env / TweetStream.
   */
  async bootstrapXPlugPollers(): Promise<void> {
    if (!isXEngagementPollingDisabled() && !isXquikEngagementPollerEnabled()) {
      const engagement =
        await this._integrationRepository.listXIntegrationsWithActiveEngagementPlugs();
      for (const row of engagement) {
        await this.syncEngagementPoller(row.organizationId, row.integrationId);
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

    const followerPlugs =
      await this._integrationRepository.listActiveFollowerDmPlugs();
    for (const plug of followerPlugs) {
      await this.startXFollowerDmPollerWorkflow(
        plug.organizationId,
        plug.integrationId,
        plug.id
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
      await this.startXFollowerDmPollerWorkflow(orgId, integrationId, row.id);
    }

    if (
      (body.func === 'autoDmEngagers' ||
        body.func === 'autoDmFollowers' ||
        body.func === 'autoDmPinnedPost') &&
      row.activated
    ) {
      void this.syncTweetStreamMonitoredAccounts().catch((err) =>
        console.error('syncTweetStreamMonitoredAccounts:', err)
      );
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
        await this.startXFollowerDmPollerWorkflow(
          orgId,
          updated.integrationId,
          plugId
        );
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

  private async assertActiveXIntegration(orgId: string, integrationId: string) {
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
    return integration;
  }

  async processAllPendingXFollowQueues(): Promise<void> {
    const pending = await listIntegrationIdsWithPendingQueue();
    for (const { integrationId, orgId } of pending) {
      try {
        await this.processXFollowQueue(orgId, integrationId);
      } catch {
        // skip invalid/disabled integrations until user fixes
      }
    }
  }

  async getXFollowQueue(orgId: string, integrationId: string) {
    await this.assertActiveXIntegration(orgId, integrationId);
    await this.processXFollowQueue(orgId, integrationId);
    return getXFollowQueueStatus(integrationId, orgId);
  }

  async enqueueXFollowQueue(
    orgId: string,
    integrationId: string,
    entries: {
      targetUserId: string;
      targetUsername?: string;
      targetName?: string;
    }[]
  ) {
    await this.assertActiveXIntegration(orgId, integrationId);
    const result = await enqueueXFollowQueueItems(
      integrationId,
      orgId,
      entries
    );
    await this.processXFollowQueue(orgId, integrationId);
    const status = await getXFollowQueueStatus(integrationId, orgId);
    return { ...result, status };
  }

  async processXFollowQueue(orgId: string, integrationId: string) {
    const integration = await this.assertActiveXIntegration(
      orgId,
      integrationId
    );
    const x = this._integrationManager.getSocialIntegration('x') as XProvider;
    return processXFollowQueueBatch(integrationId, orgId, async (userIds) => {
      try {
        return await x.followUsers(integration, userIds);
      } catch (err: any) {
        const msg =
          err?.data?.detail ||
          err?.data?.title ||
          err?.message ||
          'Follow request failed';
        throw new HttpException(String(msg), HttpStatus.BAD_REQUEST);
      }
    });
  }

  async cancelXFollowQueueItem(
    orgId: string,
    integrationId: string,
    itemId: string
  ) {
    await this.assertActiveXIntegration(orgId, integrationId);
    const ok = await cancelXFollowQueueItem(integrationId, itemId);
    if (!ok) {
      throw new HttpException('Queue item not found', HttpStatus.NOT_FOUND);
    }
    return getXFollowQueueStatus(integrationId, orgId);
  }

  async clearXFollowQueueCompleted(orgId: string, integrationId: string) {
    await this.assertActiveXIntegration(orgId, integrationId);
    const removed = await clearXFollowQueueCompleted(integrationId);
    return { removed, status: await getXFollowQueueStatus(integrationId, orgId) };
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
