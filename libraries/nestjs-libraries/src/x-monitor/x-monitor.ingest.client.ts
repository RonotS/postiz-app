import { Logger } from '@nestjs/common';
import {
  getXMonitorIngestSecret,
  getXMonitorPostizIngestUrl,
} from '@gitroom/helpers/x/x.monitor.env';
import type { XCustomIngestEvent } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.types';

export class XMonitorIngestClient {
  private readonly log = new Logger(XMonitorIngestClient.name);

  async push(event: XCustomIngestEvent): Promise<boolean> {
    const secret = getXMonitorIngestSecret();
    if (!secret) {
      this.log.warn('X_MONITOR_INGEST_SECRET / X_CUSTOM_INGEST_SECRET not set');
      return false;
    }

    const url = `${getXMonitorPostizIngestUrl()}/api/x/activity-ingest`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.log.warn(`Ingest POST ${res.status}: ${text.slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.log.warn('Ingest POST failed:', err);
      return false;
    }
  }

  async pushBatch(events: XCustomIngestEvent[]): Promise<void> {
    if (!events.length) {
      return;
    }
    const secret = getXMonitorIngestSecret();
    if (!secret) {
      return;
    }
    const url = `${getXMonitorPostizIngestUrl()}/api/x/activity-ingest`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.log.warn(`Ingest batch ${res.status}: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      this.log.warn('Ingest batch failed:', err);
    }
  }
}
