import { Injectable, Logger } from '@nestjs/common';
import { Integration } from '@prisma/client';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { XProvider } from '@gitroom/nestjs-libraries/integrations/social/x.provider';
import { isXAccountActivityWebhooksEnabled } from '@gitroom/helpers/x/x.account-activity.env';

type PlugFields = Record<string, string>;

@Injectable()
export class XAccountActivityHandler {
  private readonly log = new Logger(XAccountActivityHandler.name);

  constructor(
    private readonly _integrationRepository: IntegrationRepository,
    private readonly _integrationManager: IntegrationManager
  ) {}

  async handlePayload(payload: Record<string, unknown>): Promise<void> {
    if (!isXAccountActivityWebhooksEnabled()) {
      return;
    }

    const forUserId = String(payload.for_user_id ?? '');
    if (!forUserId) {
      return;
    }

    const integrations =
      await this._integrationRepository.findActiveXIntegrationsByInternalId(
        forUserId
      );
    if (!integrations.length) {
      return;
    }

    const xProvider = this._integrationManager.getSocialIntegration(
      'x'
    ) as XProvider;

    for (const integration of integrations) {
      try {
        await this.dispatchForIntegration(xProvider, integration, payload);
      } catch (err) {
        this.log.error(
          `handlePayload integration=${integration.id}:`,
          err
        );
      }
    }
  }

  private parsePlugFields(dataJson: string): PlugFields {
    try {
      const arr = JSON.parse(dataJson) as { name: string; value: string }[];
      return arr.reduce((all, cur) => {
        all[cur.name] = cur.value;
        return all;
      }, {} as PlugFields);
    } catch {
      return {};
    }
  }

  private buildEngagementPlugContext(
    plugFunction: string,
    integrationId: string,
    postReleaseId: string
  ) {
    return {
      loadDmdUserIds: async (userIds: string[]): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map((uid) => `${postReleaseId}:${uid}`);
        const existing = await this._integrationRepository.loadExisingData(
          plugFunction,
          integrationId,
          candidates
        );
        const existingValues = new Set(existing.map((e: any) => e.value));
        return new Set(
          userIds.filter((uid) =>
            existingValues.has(`${postReleaseId}:${uid}`)
          )
        );
      },
      saveDmdUserIds: async (userIds: string[]) => {
        if (userIds.length === 0) return;
        const values = userIds.map((uid) => `${postReleaseId}:${uid}`);
        await this._integrationRepository.saveExisingData(
          plugFunction,
          integrationId,
          values
        );
      },
    };
  }

  private buildFollowerPlugContext(plugFunction: string, integrationId: string) {
    const followerBaselineKey = '__fdm_baseline_v1__';
    return {
      loadDmdUserIds: async (userIds: string[]): Promise<Set<string>> => {
        if (userIds.length === 0) return new Set();
        const candidates = userIds.map((uid) => `fdm:${uid}`);
        const existing = await this._integrationRepository.loadExisingData(
          plugFunction,
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
          plugFunction,
          integrationId,
          values
        );
      },
      hasFollowerBaselineMarker: async () => {
        const rows = await this._integrationRepository.loadExisingData(
          plugFunction,
          integrationId,
          [followerBaselineKey]
        );
        return rows.length > 0;
      },
      setFollowerBaselineMarker: async () => {
        await this._integrationRepository.saveExisingData(
          plugFunction,
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
          plugFunction,
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
          plugFunction,
          integrationId,
          values
        );
      },
    };
  }

  private async loadPostSettings(integrationId: string, releaseId: string) {
    const post = await this._integrationRepository.getPostByReleaseId(
      integrationId,
      releaseId
    );
    if (!post?.settings) return undefined;
    try {
      return JSON.parse(post.settings);
    } catch {
      return undefined;
    }
  }

  private tweetIdFromStatus(status: any): string | undefined {
    if (!status) return undefined;
    return String(status.id_str ?? status.id ?? '').trim() || undefined;
  }

  private userIdFromUser(user: any): string | undefined {
    if (!user) return undefined;
    return String(user.id_str ?? user.id ?? '').trim() || undefined;
  }

  private async tryPinnedPostDm(
    xProvider: XProvider,
    integration: Integration,
    orgId: string,
    integrationId: string,
    tweetId: string,
    engagerUserId: string,
    eventType: 'like' | 'retweet' | 'reply',
    pinnedTweetId: string | undefined
  ) {
    if (!pinnedTweetId || tweetId !== pinnedTweetId) return;
    const pinnedPlug =
      await this._integrationRepository.getActivePlugByFunction(
        orgId,
        integrationId,
        'autoDmPinnedPost'
      );
    if (!pinnedPlug) return;
    const fields = this.parsePlugFields(pinnedPlug.data);
    const ctx = this.buildEngagementPlugContext(
      'autoDmPinnedPost',
      integrationId,
      pinnedTweetId
    );
    await xProvider.webhookPinnedPostDm(
      integration,
      pinnedTweetId,
      engagerUserId,
      eventType,
      fields as any,
      ctx
    );
  }

  private async dispatchForIntegration(
    xProvider: XProvider,
    integration: Integration,
    payload: Record<string, unknown>
  ) {
    const orgId = integration.organizationId;
    const integrationId = integration.id;
    const pinnedTweetId = await xProvider.resolvePinnedTweetId(integration);

    const favorites = (payload.favorite_events as any[]) || [];
    for (const ev of favorites) {
      const tweetId = this.tweetIdFromStatus(ev.favorited_status);
      const likerId = this.userIdFromUser(ev.user);
      if (!tweetId || !likerId) continue;

      await this.tryPinnedPostDm(
        xProvider,
        integration,
        orgId,
        integrationId,
        tweetId,
        likerId,
        'like',
        pinnedTweetId
      );

      const postSettings = await this.loadPostSettings(integrationId, tweetId);
      const dmPlug = await this._integrationRepository.getActivePlugByFunction(
        orgId,
        integrationId,
        'autoDmEngagers'
      );
      if (dmPlug) {
        const fields = this.parsePlugFields(dmPlug.data);
        const ctx = this.buildEngagementPlugContext(
          'autoDmEngagers',
          integrationId,
          tweetId
        );
        const sent = await xProvider.webhookDmEngager(
          integration,
          tweetId,
          likerId,
          'like',
          fields as any,
          postSettings,
          ctx
        );
        if (sent) {
          await this._integrationRepository.incrementAutoDmSentCountForPost(
            integrationId,
            tweetId,
            1
          );
        }
      }

      await this.runThresholdPlugs(
        xProvider,
        integration,
        orgId,
        integrationId,
        tweetId,
        postSettings
      );
    }

    const follows = (payload.follow_events as any[]) || [];
    const followerPlug = await this._integrationRepository.getActivePlugByFunction(
      orgId,
      integrationId,
      'autoDmFollowers'
    );
    if (followerPlug) {
      const fields = this.parsePlugFields(followerPlug.data);
      const fCtx = this.buildFollowerPlugContext(
        'autoDmFollowers',
        integrationId
      );
      for (const ev of follows) {
        const followerId = this.userIdFromUser(ev.source);
        if (!followerId) continue;
        await xProvider.webhookDmFollower(
          integration,
          followerId,
          fields as any,
          undefined,
          fCtx
        );
      }
    }

    const tweets = (payload.tweet_create_events as any[]) || [];
    for (const tw of tweets) {
      const authorId = this.userIdFromUser(tw.user);
      if (!authorId || authorId === integration.internalId) {
        continue;
      }

      const rtStatus = tw.retweeted_status;
      if (rtStatus) {
        const originalId = this.tweetIdFromStatus(rtStatus);
        if (!originalId) continue;

        await this.tryPinnedPostDm(
          xProvider,
          integration,
          orgId,
          integrationId,
          originalId,
          authorId,
          'retweet',
          pinnedTweetId
        );

        const postSettings = await this.loadPostSettings(
          integrationId,
          originalId
        );
        const dmPlug =
          await this._integrationRepository.getActivePlugByFunction(
            orgId,
            integrationId,
            'autoDmEngagers'
          );
        if (dmPlug) {
          const fields = this.parsePlugFields(dmPlug.data);
          const ctx = this.buildEngagementPlugContext(
            'autoDmEngagers',
            integrationId,
            originalId
          );
          await xProvider.webhookDmEngager(
            integration,
            originalId,
            authorId,
            'retweet',
            fields as any,
            postSettings,
            ctx
          );
        }
        continue;
      }

      const replyToId = String(
        tw.in_reply_to_status_id_str ?? tw.in_reply_to_status_id ?? ''
      ).trim();
      if (replyToId) {
        await this.tryPinnedPostDm(
          xProvider,
          integration,
          orgId,
          integrationId,
          replyToId,
          authorId,
          'reply',
          pinnedTweetId
        );

        const postSettings = await this.loadPostSettings(
          integrationId,
          replyToId
        );
        const dmPlug =
          await this._integrationRepository.getActivePlugByFunction(
            orgId,
            integrationId,
            'autoDmEngagers'
          );
        if (dmPlug) {
          const fields = this.parsePlugFields(dmPlug.data);
          const ctx = this.buildEngagementPlugContext(
            'autoDmEngagers',
            integrationId,
            replyToId
          );
          await xProvider.webhookDmEngager(
            integration,
            replyToId,
            authorId,
            'reply',
            fields as any,
            postSettings,
            ctx
          );
        }
      }
    }
  }

  private async runThresholdPlugs(
    xProvider: XProvider,
    integration: Integration,
    orgId: string,
    integrationId: string,
    tweetId: string,
    postSettings: any
  ) {
    const plugs: {
      autoRepostPost?: { likesAmount: string };
      autoPlugPost?: { likesAmount: string; post: string };
      autoThreadReply?: { likesAmount: string; thread: string };
    } = {};

    const repost = await this._integrationRepository.getActivePlugByFunction(
      orgId,
      integrationId,
      'autoRepostPost'
    );
    if (repost) {
      plugs.autoRepostPost = this.parsePlugFields(repost.data) as any;
    }
    const plugReply = await this._integrationRepository.getActivePlugByFunction(
      orgId,
      integrationId,
      'autoPlugPost'
    );
    if (plugReply) {
      plugs.autoPlugPost = this.parsePlugFields(plugReply.data) as any;
    }
    const thread = await this._integrationRepository.getActivePlugByFunction(
      orgId,
      integrationId,
      'autoThreadReply'
    );
    if (thread) {
      plugs.autoThreadReply = this.parsePlugFields(thread.data) as any;
    }

    if (!plugs.autoRepostPost && !plugs.autoPlugPost && !plugs.autoThreadReply) {
      return;
    }

    const ctx = this.buildEngagementPlugContext(
      'autoThreadReply',
      integrationId,
      tweetId
    );
    await xProvider.webhookRunLikeThresholdPlugs(
      integration,
      tweetId,
      plugs,
      postSettings,
      ctx
    );
  }
}
