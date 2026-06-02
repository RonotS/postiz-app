import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  getXCustomIngestSecret,
  isXCustomIngestEnabled,
} from '@gitroom/helpers/x/x.custom-ingest.env';
import { XCustomIngestService } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.service';
import { normalizeCustomIngestBody } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.mapper';
import type { XCustomIngestBody } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';

@ApiTags('X Custom Ingest')
@Controller('/x/activity-ingest')
export class XActivityIngestController {
  private readonly log = new Logger(XActivityIngestController.name);

  constructor(private readonly _ingest: XCustomIngestService) {}

  private verifyToken(req: { headers: Record<string, unknown> }): void {
    const secret = getXCustomIngestSecret();
    if (!secret) {
      throw new UnauthorizedException(
        'X_CUSTOM_INGEST_SECRET is not configured'
      );
    }
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    const headerToken = String(req.headers['x-custom-ingest-token'] ?? '').trim();
    const token = bearer || headerToken;
    if (!token || token !== secret) {
      throw new UnauthorizedException('Invalid custom ingest token');
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  info() {
    return {
      enabled: isXCustomIngestEnabled(),
      endpoint: 'POST /api/x/activity-ingest',
      auth: 'Authorization: Bearer <X_CUSTOM_INGEST_SECRET> or x-custom-ingest-token',
      docs: 'Push events from your WebSocket bridge or call directly.',
    };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  test(@Req() req: { headers: Record<string, unknown> }) {
    if (!isXCustomIngestEnabled()) {
      return { ok: false, reason: 'X_CUSTOM_INGEST_ENABLED is not true' };
    }
    this.verifyToken(req);
    return { ok: true, test: true };
  }

  /**
   * Push realtime engagement from your own stack (no TweetStream / no X AAA).
   *
   * Single event: { "handle": "brand", "kind": "reply", "tweetId": "...", "userId": "..." }
   * Batch: { "events": [ ... ] }
   * Passthrough: { "handle": "brand", "payload": { "favorite_events": [...] } }
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async ingest(
    @Req() req: { headers: Record<string, unknown> },
    @Body() body: XCustomIngestBody
  ) {
    if (!isXCustomIngestEnabled()) {
      return { ok: true, disabled: true };
    }
    this.verifyToken(req);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('JSON body required');
    }

    const result = await this._ingest.processBody(body);
    if (result.accepted > 0 && result.processed === 0 && result.errors.length) {
      this.log.warn(`Custom ingest: ${JSON.stringify(result)}`);
    } else if (result.processed > 0) {
      const kinds = normalizeCustomIngestBody(body as Record<string, unknown>)
        .map((e) => e.kind)
        .filter(Boolean);
      if (kinds.includes('like')) {
        this.log.log(
          `Custom ingest: processed ${result.processed} event(s) (includes like → auto-DM path)`
        );
      }
    }

    return { ok: true, ...result };
  }
}
