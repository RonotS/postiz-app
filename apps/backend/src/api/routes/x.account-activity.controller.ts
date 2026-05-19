import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { XAccountActivityService } from '@gitroom/nestjs-libraries/integrations/social/x.account-activity.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { isXAccountActivityWebhooksEnabled } from '@gitroom/helpers/x/x.account-activity.env';

@ApiTags('X Account Activity')
@Controller('/x/account-activity')
export class XAccountActivityController {
  private readonly log = new Logger(XAccountActivityController.name);

  constructor(
    private readonly _xAccountActivity: XAccountActivityService,
    private readonly _integrationService: IntegrationService
  ) {}

  /**
   * Challenge-Response Check (CRC) when registering the webhook in the X Developer Portal.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  crc(@Query('crc_token') crcToken?: string) {
    if (!crcToken?.trim()) {
      throw new BadRequestException('crc_token is required');
    }
    return this._xAccountActivity.buildCrcResponse(crcToken.trim());
  }

  /**
   * Real-time Account Activity events (likes, follows, DMs, replies, etc.).
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: RawBodyRequest<Request>) {
    if (!isXAccountActivityWebhooksEnabled()) {
      return { ok: true };
    }

    const signature = req.headers['x-twitter-webhooks-signature'] as
      | string
      | undefined;
    const raw = req.rawBody;
    if (!raw?.length) {
      throw new BadRequestException('Missing request body');
    }

    if (!this._xAccountActivity.verifyWebhookSignature(raw, signature)) {
      throw new UnauthorizedException('Invalid X webhook signature');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }

    setImmediate(() => {
      this._integrationService
        .handleXAccountActivityPayload(payload)
        .catch((err) =>
          this.log.error('X Account Activity handler failed:', err)
        );
    });

    return { ok: true };
  }
}
