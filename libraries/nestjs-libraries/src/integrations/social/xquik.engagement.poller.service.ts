import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  getXquikEngagementPollIntervalMs,
  getXquikFollowersPollIntervalMs,
  getXquikWebhookSecret,
  getXquikWebhookUrl,
  isXquikEngagementPollerEnabled,
  isXquikWebhookAutoRegisterEnabled,
} from '@gitroom/helpers/x/xquik.env';
import { isPostizBackendWorker } from '@gitroom/helpers/x/tweetstream.env';
import { XquikApiClient } from '@gitroom/nestjs-libraries/integrations/social/xquik.api';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { X_FOLLOWER_DM_POLL_RELEASE_ID } from '@gitroom/nestjs-libraries/temporal/x.follower.dm.constants';

/**
 * Fast engagement polling via Xquik read APIs (replies/likes/RT/followers).
 * Runs on backend when X_DISABLE_ENGAGEMENT_POLLING would otherwise stop Temporal pollers.
 */
@Injectable()
export class XquikEngagementPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(XquikEngagementPollerService.name);
  private engagementTimer?: NodeJS.Timeout;
  private followerTimer?: NodeJS.Timeout;

  constructor(
    private readonly _integrationService: IntegrationService,
    private readonly _integrationRepository: IntegrationRepository
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isXquikEngagementPollerEnabled() || !isPostizBackendWorker()) {
      return;
    }

    const engagementMs = getXquikEngagementPollIntervalMs();
    const followerMs = getXquikFollowersPollIntervalMs();

    this.log.log(
      `Xquik engagement poller starting (engagement=${engagementMs}ms, followers=${followerMs}ms)`
    );

    void this.syncMonitors().catch((err) =>
      this.log.error('Xquik initial monitor sync failed:', err)
    );

    void this.syncWebhook().catch((err) =>
      this.log.error('Xquik webhook sync failed:', err)
    );

    void this.runEngagementTick().catch((err) =>
      this.log.error('Xquik engagement tick failed:', err)
    );

    this.engagementTimer = setInterval(() => {
      void this.runEngagementTick().catch((err) =>
        this.log.error('Xquik engagement tick failed:', err)
      );
    }, engagementMs);

    void this.runFollowerTick().catch((err) =>
      this.log.error('Xquik follower tick failed:', err)
    );

    this.followerTimer = setInterval(() => {
      void this.runFollowerTick().catch((err) =>
        this.log.error('Xquik follower tick failed:', err)
      );
    }, followerMs);
  }

  onModuleDestroy(): void {
    if (this.engagementTimer) {
      clearInterval(this.engagementTimer);
    }
    if (this.followerTimer) {
      clearInterval(this.followerTimer);
    }
  }

  private async syncWebhook(): Promise<void> {
    if (!isXquikWebhookAutoRegisterEnabled()) {
      const url = getXquikWebhookUrl();
      if (!url) {
        this.log.warn(
          'Xquik webhooks: set XQUIK_WEBHOOK_URL to your public HTTPS URL (e.g. ngrok …/api/x/xquik/webhook) to auto-register, or create POST https://xquik.com/api/v1/webhooks manually'
        );
      }
      return;
    }

    const targetUrl = getXquikWebhookUrl()!;
    const client = new XquikApiClient();
    const { webhook, created } = await client.ensureWebhook(targetUrl);

    if (!webhook.id) {
      this.log.warn('Xquik webhook sync: no webhook id in response');
      return;
    }

    if (created) {
      this.log.warn(
        `Xquik webhook CREATED id=${webhook.id} url=${targetUrl} — copy the new secret into XQUIK_WEBHOOK_SECRET in .env (shown once by Xquik; restart backend after)`
      );
      if (webhook.secret && !getXquikWebhookSecret()) {
        this.log.warn(
          `Xquik webhook secret (save to .env): ${webhook.secret}`
        );
      }
    } else {
      this.log.log(
        `Xquik webhook ready id=${webhook.id} url=${webhook.url ?? targetUrl}`
      );
    }

    if (getXquikWebhookSecret()) {
      try {
        await client.testWebhook(webhook.id);
        this.log.log(`Xquik webhook test sent to id=${webhook.id}`);
      } catch (err) {
        this.log.warn(
          `Xquik webhook test failed for id=${webhook.id} (check ngrok + XQUIK_WEBHOOK_SECRET):`,
          err
        );
      }
    } else {
      this.log.warn(
        `Xquik webhook id=${webhook.id} — set XQUIK_WEBHOOK_SECRET then restart to verify signatures`
      );
    }
  }

  private async syncMonitors(): Promise<void> {
    const rows =
      await this._integrationRepository.listXIntegrationsForTweetStreamSync();
    const client = new XquikApiClient();
    for (const row of rows) {
      const handle = row.profile?.trim();
      if (!handle) continue;
      try {
        const monitor = await client.ensureAccountMonitor(handle);
        if (monitor?.id) {
          this.log.log(
            `Xquik monitor ready @${handle} id=${monitor.id} events=${(monitor.eventTypes ?? []).join(',')}`
          );
        }
      } catch (err) {
        this.log.warn(`Xquik monitor sync failed for @${handle}:`, err);
      }
    }
  }

  private async runEngagementTick(): Promise<void> {
    const rows =
      await this._integrationRepository.listXIntegrationsWithActiveEngagementPlugs();
    for (const row of rows) {
      try {
        await this._integrationService.runXEngagementPollerTick(
          row.organizationId,
          row.integrationId
        );
      } catch (err) {
        this.log.error(
          `Xquik engagement tick integration=${row.integrationId}:`,
          err
        );
      }
    }
  }

  private async runFollowerTick(): Promise<void> {
    const plugs =
      await this._integrationRepository.listActiveFollowerDmPlugs();
    for (const plug of plugs) {
      try {
        await this._integrationService.processPlugs({
          plugId: plug.id,
          postId: X_FOLLOWER_DM_POLL_RELEASE_ID,
          delay: 0,
          totalRuns: 1,
          currentRun: 1,
        });
      } catch (err) {
        this.log.error(
          `Xquik follower tick integration=${plug.integrationId}:`,
          err
        );
      }
    }
  }
}
