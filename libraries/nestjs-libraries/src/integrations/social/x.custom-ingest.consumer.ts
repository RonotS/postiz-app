import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  isXCustomIngestEnabled,
  isXCustomWsClientEnabled,
} from '@gitroom/helpers/x/x.custom-ingest.env';
import { isPostizBackendWorker } from '@gitroom/helpers/x/tweetstream.env';
import { isCustomRealtimeIngest } from '@gitroom/helpers/x/x.realtime.env';
import { XCustomIngestService } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.service';
import { XCustomIngestWebSocketClient } from '@gitroom/nestjs-libraries/integrations/social/x.custom-ingest.ws-client';

@Injectable()
export class XCustomIngestConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(XCustomIngestConsumer.name);
  private wsClient: XCustomIngestWebSocketClient | null = null;

  constructor(private readonly _ingest: XCustomIngestService) {}

  onModuleInit(): void {
    if (!isXCustomIngestEnabled() || !isCustomRealtimeIngest()) {
      return;
    }
    if (!isPostizBackendWorker()) {
      this.log.log(
        'Custom ingest: orchestrator worker — WS client runs on backend only.'
      );
      return;
    }
    if (!isXCustomWsClientEnabled()) {
      this.log.log(
        'Custom ingest: HTTP POST /api/x/activity-ingest ready (X_CUSTOM_WS_CLIENT_ENABLED=false).'
      );
      return;
    }

    this.wsClient = new XCustomIngestWebSocketClient(this._ingest);
    this.wsClient.start();
    this.log.log('Custom ingest: WebSocket client started (X_CUSTOM_WS_URL).');
  }

  onModuleDestroy(): void {
    this.wsClient?.stop();
    this.wsClient = null;
  }
}
