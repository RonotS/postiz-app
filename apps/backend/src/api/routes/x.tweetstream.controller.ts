import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { isTweetStreamEnabled } from '@gitroom/helpers/x/tweetstream.env';

@ApiTags('X TweetStream')
@Controller('/x/tweetstream')
export class XTweetStreamController {
  constructor(private readonly _integrationService: IntegrationService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async status() {
    if (!isTweetStreamEnabled()) {
      return { enabled: false };
    }
    return this._integrationService.getTweetStreamStatus();
  }

  /** Browser hint: sync requires POST (see tweetstream-cli postiz-sync). */
  @Get('sync')
  @HttpCode(HttpStatus.OK)
  syncHelp() {
    return {
      message:
        'Use POST to sync handles. CLI: node scripts/tweetstream-cli.mjs postiz-sync',
    };
  }

  /** Re-register Postiz X handles on TweetStream (add-account API). */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync() {
    if (!isTweetStreamEnabled()) {
      return { enabled: false, message: 'Set TWEETSTREAM_ENABLED=true' };
    }
    return this._integrationService.syncTweetStreamMonitoredAccounts();
  }

  /** Recent engagement events (when TWEETSTREAM_PUBLISH_EVENTS=true). */
  @Get('events')
  @HttpCode(HttpStatus.OK)
  async events(@Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return {
      enabled: isTweetStreamEnabled(),
      events: await this._integrationService.listTweetStreamRecentEvents(n),
    };
  }

  /** Clear Redis event buffer (local debugging). */
  @Post('events/clear')
  @HttpCode(HttpStatus.OK)
  async clearEvents() {
    if (!isTweetStreamEnabled()) {
      return { enabled: false };
    }
    return this._integrationService.clearTweetStreamRecentEvents();
  }
}
