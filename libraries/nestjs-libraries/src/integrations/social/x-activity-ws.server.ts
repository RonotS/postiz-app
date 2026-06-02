import type { Server as HttpServer } from 'http';
import type { Socket } from 'net';
import { Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { XActivityStreamService } from '@gitroom/nestjs-libraries/integrations/social/x-activity-stream.service';
import { normalizeTweetStreamHandle } from '@gitroom/nestjs-libraries/integrations/social/tweetstream.normalize';

const WS_PATH = '/api/x/activity-stream';

export function attachXActivityWebSocketServer(
  httpServer: HttpServer,
  stream: XActivityStreamService
): void {
  const log = new Logger('XActivityWebSocket');

  if (!stream.isWsEnabled()) {
    return;
  }

  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const url = new URL(request.url || '/', `http://${host}`);
      if (url.pathname !== WS_PATH) {
        return;
      }

      wss.handleUpgrade(request, socket as Socket, head, (ws) => {
        const token =
          url.searchParams.get('token') ||
          (request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '');
        if (!stream.verifyClientToken(token)) {
          ws.close(4401, 'Unauthorized');
          return;
        }

        const handle = url.searchParams.get('handle')?.trim();
        const integrationId = url.searchParams.get('integrationId')?.trim();
        const organizationId = url.searchParams.get('organizationId')?.trim();

        stream.registerClient(ws, {
          handle: handle
            ? normalizeTweetStreamHandle(handle) || handle
            : undefined,
          integrationId: integrationId || undefined,
          organizationId: organizationId || undefined,
        });

        ws.send(
          JSON.stringify({
            type: 'connected',
            ts: Date.now(),
            path: WS_PATH,
            filter: {
              handle: handle || null,
              integrationId: integrationId || null,
              organizationId: organizationId || null,
            },
          })
        );

        wss.emit('connection', ws, request);
      });
    } catch (err) {
      log.error('WebSocket upgrade failed:', err);
      socket.destroy();
    }
  });

  log.log(
    `Listening on ${WS_PATH} (optional filters: ?token=&handle=&integrationId=&organizationId=)`
  );
}
