import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { XquikService } from '@gitroom/nestjs-libraries/integrations/social/xquik.service';
import { isXquikEnabled } from '@gitroom/helpers/x/xquik.env';

@ApiTags('Xquik')
@Controller('/x/xquik')
export class XquikController {
  private readonly log = new Logger(XquikController.name);

  constructor(
    private readonly _xquikService: XquikService,
    private readonly _integrationService: IntegrationService
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: RawBodyRequest<Request>) {
    if (!isXquikEnabled()) {
      return { ok: true };
    }

    const raw = req.rawBody;
    if (!raw?.length) {
      throw new BadRequestException('Missing request body');
    }

    if (
      !this._xquikService.verifyWebhookSignature(raw, {
        timestamp: req.headers['x-xquik-timestamp'] as string | undefined,
        nonce: req.headers['x-xquik-nonce'] as string | undefined,
        signature: req.headers['x-xquik-signature'] as string | undefined,
      })
    ) {
      this.log.warn(
        'Xquik webhook rejected: invalid signature (check XQUIK_WEBHOOK_SECRET matches Xquik dashboard; signing string is timestamp.nonce.rawBody)'
      );
      throw new UnauthorizedException('Invalid Xquik webhook signature');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }

    const eventType = String(
      (payload as any).eventType ??
        (payload as any).type ??
        (payload as any).events?.[0]?.eventType ??
        (payload as any).events?.[0]?.type ??
        'unknown'
    );
    const deliveryId = (payload as any).deliveryId;
    const streamEventId = (payload as any).streamEventId;
    const username = String((payload as any).username ?? '').trim() || undefined;
    const tweetId = String((payload as any).data?.id ?? '').trim() || undefined;
    const inReplyToId = String((payload as any).data?.inReplyToId ?? '').trim() || undefined;
    const isReply = (payload as any).data?.isReply === true;

    this.log.log(
      [
        `Xquik webhook received type=${eventType}`,
        tweetId ? `tweetId=${tweetId}` : null,
        username ? `@${username}` : null,
        inReplyToId ? `inReplyToId=${inReplyToId}` : null,
        isReply ? 'isReply=true' : null,
        deliveryId ? `deliveryId=${deliveryId}` : null,
        streamEventId ? `streamEventId=${streamEventId}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    );

    if (eventType === 'tweet.new' && tweetId) {
      this.log.log(
        `Xquik tweet.new id=${tweetId} — your post went live (not a comment). Auto-DM runs when someone else replies; watch for tweet.mention or poller fetchRepliers on this id.`
      );
    }

    if (eventType === 'webhook.test') {
      return { ok: true, test: true };
    }

    setImmediate(() => {
      this._integrationService
        .handleXquikPayload(payload)
        .catch((err) => this.log.error('Xquik handler failed:', err));
    });

    return { ok: true };
  }
}
