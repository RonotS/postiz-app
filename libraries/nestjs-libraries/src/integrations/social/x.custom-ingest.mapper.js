"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorToAaUser = void 0;
exports.mapCustomIngestEventToPayload = mapCustomIngestEventToPayload;
exports.normalizeCustomIngestBody = normalizeCustomIngestBody;
const tweetstream_normalize_1 = require("./tweetstream.normalize");
Object.defineProperty(exports, "authorToAaUser", { enumerable: true, get: function () { return tweetstream_normalize_1.authorToAaUser; } });
function aaUser(userId, username) {
    return {
        id_str: String(userId),
        id: String(userId),
        ...(username?.trim() ? { screen_name: username.trim() } : {}),
    };
}
function mapCustomIngestEventToPayload(event) {
    const handle = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(event.handle);
    if (!handle) {
        return null;
    }
    if (event.payload && typeof event.payload === 'object') {
        return { handle, payload: event.payload };
    }
    const userId = String(event.userId ?? '').trim();
    if (!userId) {
        return null;
    }
    const user = aaUser(userId, event.username);
    const tweetId = String(event.tweetId ?? '').trim();
    switch (event.kind) {
        case 'follow':
            return {
                handle,
                payload: {
                    follow_events: [{ source: user }],
                },
            };
        case 'like':
            if (!tweetId)
                return null;
            return {
                handle,
                payload: {
                    favorite_events: [
                        {
                            user,
                            favorited_status: { id_str: tweetId, id: tweetId },
                        },
                    ],
                },
            };
        case 'retweet':
            if (!tweetId)
                return null;
            return {
                handle,
                payload: {
                    tweet_create_events: [
                        {
                            user,
                            retweeted_status: { id_str: tweetId, id: tweetId },
                        },
                    ],
                },
            };
        case 'reply':
            if (!tweetId)
                return null;
            return {
                handle,
                payload: {
                    tweet_create_events: [
                        {
                            user,
                            in_reply_to_status_id_str: tweetId,
                            in_reply_to_status_id: tweetId,
                        },
                    ],
                },
            };
        default:
            return null;
    }
}
/** Normalize request body to a list of events. */
function normalizeCustomIngestBody(body) {
    const rows = Array.isArray(body.events) ? body.events : null;
    if (rows?.length) {
        return rows.filter((r) => r && typeof r === 'object');
    }
    if (body.handle && body.kind) {
        return [body];
    }
    return [];
}
//# sourceMappingURL=x.custom-ingest.mapper.js.map