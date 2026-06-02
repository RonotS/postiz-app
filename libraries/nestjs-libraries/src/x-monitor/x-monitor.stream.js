"use strict";
var XMonitorStreamService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XMonitorStreamService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const twitter_api_v2_1 = require("twitter-api-v2");
const x_monitor_env_1 = require("../../../helpers/src/x/x.monitor.env");
const x_monitor_rules_1 = require("./x-monitor.rules");
const x_monitor_registry_1 = require("./x-monitor.registry");
const x_monitor_mapper_1 = require("./x-monitor.mapper");
const x_monitor_state_1 = require("./x-monitor.state");
const x_monitor_ingest_client_1 = require("./x-monitor.ingest.client");
const x_monitor_ws_1 = require("./x-monitor.ws");
let XMonitorStreamService = XMonitorStreamService_1 = class XMonitorStreamService {
    constructor(registry, ingest, ws) {
        this.registry = registry;
        this.ingest = ingest;
        this.ws = ws;
        this.log = new common_1.Logger(XMonitorStreamService_1.name);
        this.stopped = false;
        this.running = false;
        this.activeStream = null;
    }
    stop() {
        this.stopped = true;
        try {
            this.activeStream?.close();
        }
        catch {
            /* ignore */
        }
        this.activeStream = null;
    }
    async syncRules(handles) {
        if (!process.env.X_API_KEY?.trim() || !process.env.X_API_SECRET?.trim()) {
            throw new Error('X_API_KEY and X_API_SECRET required for filtered stream');
        }
        const rules = (0, x_monitor_rules_1.buildStreamRules)(handles);
        this.registry.setRuleTagHandles(rules);
        const client = await this.appClient();
        const prefix = (0, x_monitor_env_1.getXMonitorRuleTagPrefix)();
        const existing = await client.v2.streamRules();
        const toDelete = existing.data
            ?.filter((r) => r.tag?.startsWith(prefix))
            .map((r) => r.id)
            .filter(Boolean) ?? [];
        if (toDelete.length) {
            await client.v2.updateStreamRules({ delete: { ids: toDelete } });
        }
        if (!rules.length) {
            this.log.warn('No stream rules — connect X channels in Postiz or set X_MONITOR_HANDLES');
            return;
        }
        await client.v2.updateStreamRules({
            add: rules.map((r) => ({ value: r.value, tag: r.tag })),
        });
        this.log.log(`Filtered stream rules: ${rules.length} batch(es), ${handles.length} @handle(s) (push, not polling)`);
    }
    startStreamLoop() {
        if (this.running) {
            return;
        }
        this.running = true;
        this.stopped = false;
        void this.runForever();
    }
    async appClient() {
        const app = new twitter_api_v2_1.TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
        });
        return app.appLogin();
    }
    async runForever() {
        while (!this.stopped) {
            try {
                await this.consumeStream();
            }
            catch (err) {
                this.log.error('Filtered stream error (reconnecting):', err?.data || err?.message || err);
            }
            if (this.stopped) {
                break;
            }
            await sleep((0, x_monitor_env_1.getXMonitorStreamReconnectMs)());
        }
        this.running = false;
    }
    consumeStream() {
        return new Promise(async (resolve, reject) => {
            try {
                const client = await this.appClient();
                const stream = await client.v2.searchStream({
                    'tweet.fields': [
                        'author_id',
                        'referenced_tweets',
                        'created_at',
                        'text',
                    ],
                });
                stream.autoReconnect = true;
                this.activeStream = stream;
                stream.on(twitter_api_v2_1.ETwitterStreamEvent.Data, (payload) => {
                    void this.onStreamPayload(payload).catch((err) => this.log.error('onStreamPayload:', err));
                });
                stream.on(twitter_api_v2_1.ETwitterStreamEvent.Error, (err) => {
                    this.log.error('Stream error event:', err);
                    reject(err);
                });
                stream.on(twitter_api_v2_1.ETwitterStreamEvent.ConnectionError, (err) => {
                    this.log.error('Stream connection error:', err);
                    reject(err);
                });
                stream.on(twitter_api_v2_1.ETwitterStreamEvent.ConnectionClosed, () => {
                    this.log.warn('Stream connection closed');
                    resolve();
                });
                stream.on(twitter_api_v2_1.ETwitterStreamEvent.Connected, () => {
                    this.log.log('X filtered stream connected — X pushes matching tweets (not polling)');
                });
            }
            catch (err) {
                reject(err);
            }
        });
    }
    async onStreamPayload(payload) {
        const tweet = payload.data;
        if (!tweet?.id) {
            return;
        }
        const ruleTag = payload.matching_rules?.[0]?.tag;
        const events = (0, x_monitor_mapper_1.mapStreamTweetToIngestEvents)(tweet, this.registry, ruleTag);
        for (const event of events) {
            const integrationId = this.registry
                .getHandles()
                .find((h) => h.handle === event.handle)?.integrationIds[0] ?? 'stream';
            const first = await (0, x_monitor_state_1.markEngagementOnce)(integrationId, event.kind, event.userId, event.tweetId);
            if (!first) {
                continue;
            }
            this.ws.broadcast(event);
            if ((0, x_monitor_env_1.isXMonitorPushIngestViaHttp)()) {
                void this.ingest.push(event);
            }
        }
    }
};
exports.XMonitorStreamService = XMonitorStreamService;
exports.XMonitorStreamService = XMonitorStreamService = XMonitorStreamService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [x_monitor_registry_1.XMonitorRegistry,
        x_monitor_ingest_client_1.XMonitorIngestClient,
        x_monitor_ws_1.XMonitorWebSocketHub])
], XMonitorStreamService);
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=x-monitor.stream.js.map