import { Injectable, Logger } from '@nestjs/common';
import {
  isXCustomIngestAutoDmEnabled,
  isXCustomIngestEnabled,
} from '@gitroom/helpers/x/x.custom-ingest.env';
import { XAccountActivityHandler } from '@gitroom/nestjs-libraries/integrations/social/x.account-activity.handler';
import {
  mapCustomIngestEventToPayload,
  normalizeCustomIngestBody,
} from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.mapper';
import type { XCustomIngestBody } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';

export type XCustomIngestResult = {
  accepted: number;
  processed: number;
  skipped: number;
  errors: string[];
};

@Injectable()
export class XCustomIngestService {
  private readonly log = new Logger(XCustomIngestService.name);

  constructor(private readonly _handler: XAccountActivityHandler) {}

  isEnabled(): boolean {
    return isXCustomIngestEnabled();
  }

  async processBody(body: XCustomIngestBody | Record<string, unknown>): Promise<XCustomIngestResult> {
    const events = normalizeCustomIngestBody(body as Record<string, unknown>);
    return this.processEvents(events);
  }

  async processRawMessage(raw: string | Buffer): Promise<XCustomIngestResult> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      return {
        accepted: 0,
        processed: 0,
        skipped: 0,
        errors: ['Invalid JSON'],
      };
    }
    return this.processBody(parsed);
  }

  async processEvents(
    events: ReturnType<typeof normalizeCustomIngestBody>
  ): Promise<XCustomIngestResult> {
    const result: XCustomIngestResult = {
      accepted: events.length,
      processed: 0,
      skipped: 0,
      errors: [],
    };

    if (!this.isEnabled()) {
      result.errors.push('X_CUSTOM_INGEST_ENABLED is not true');
      return result;
    }

    const runDm = isXCustomIngestAutoDmEnabled();

    for (const event of events) {
      const mapped = mapCustomIngestEventToPayload(event);
      if (!mapped) {
        result.skipped += 1;
        result.errors.push(
          `Invalid event for @${event.handle ?? '?'} kind=${event.kind ?? '?'}`
        );
        continue;
      }

      try {
        if (runDm) {
          await this._handler.handleMonitoredHandlePayload(
            mapped.handle,
            mapped.payload,
            'custom'
          );
        } else {
          await this._handler.emitMonitoredHandleActivityOnly(
            mapped.handle,
            mapped.payload,
            'custom'
          );
        }
        result.processed += 1;
      } catch (err: any) {
        result.skipped += 1;
        result.errors.push(
          `@${mapped.handle}: ${err?.message || String(err)}`
        );
        this.log.warn(`Custom ingest failed @${mapped.handle}:`, err);
      }
    }

    return result;
  }
}
