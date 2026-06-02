import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { XActivityStreamService } from '@gitroom/nestjs-libraries/integrations/social/x-activity-stream.service';

@ApiTags('X Activity Stream')
@Controller('/x/activity-stream')
export class XActivityStreamController {
  constructor(private readonly _stream: XActivityStreamService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  info() {
    return this._stream.getConnectionInfo();
  }

  /** HTTP poll fallback for your website (same events as the WebSocket). */
  @Get('events')
  @HttpCode(HttpStatus.OK)
  events(
    @Query('token') token?: string,
    @Query('limit') limit?: string,
    @Query('handle') handle?: string,
    @Query('integrationId') integrationId?: string,
    @Query('organizationId') organizationId?: string
  ) {
    if (!this._stream.isEnabled()) {
      return { enabled: false, events: [] };
    }
    if (!this._stream.verifyClientToken(token)) {
      throw new UnauthorizedException('Invalid or missing token');
    }
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return {
      enabled: true,
      events: this._stream.listRecent(n, {
        handle: handle?.trim() || undefined,
        integrationId: integrationId?.trim() || undefined,
        organizationId: organizationId?.trim() || undefined,
      }),
    };
  }
}
