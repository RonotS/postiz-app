"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTweetStreamEnvelope = mapTweetStreamEnvelope;
exports.buildMappedFromTweetContent = buildMappedFromTweetContent;
const tweetstream_normalize_1 = require("./tweetstream.normalize");
/**
 * Map TweetStream envelopes into X Account Activity–shaped payloads for the shared handler.
 */
function mapTweetStreamEnvelope(envelope) {
    if (envelope.t === 'account' && envelope.op === 'follow') {
        return mapFollowEvent(envelope.d);
    }
    if (envelope.t === 'tweet' && envelope.op === 'content') {
        return mapTweetContent(envelope.d);
    }
    return null;
}
function mapFollowEvent(data) {
    const followerId = data.actor?.id;
    const targetHandle = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(data.target?.handle);
    if (!followerId || !targetHandle) {
        return null;
    }
    return {
        monitoredHandle: targetHandle,
        payload: {
            follow_events: [
                {
                    source: (0, tweetstream_normalize_1.authorToAaUser)(data.actor),
                    target: (0, tweetstream_normalize_1.authorToAaUser)(data.target),
                },
            ],
        },
        eventSummary: {
            kind: 'follow',
            engagerUserId: String(followerId),
            engagerHandle: (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(data.actor?.handle),
        },
    };
}
function mapTweetContent(tweet) {
    const ref = tweet.ref;
    if (!ref?.type || !ref.tweetId) {
        return null;
    }
    const engagerId = tweet.author?.id;
    if (!engagerId) {
        return null;
    }
    const originalId = String(ref.tweetId).trim();
    const engagerUser = (0, tweetstream_normalize_1.authorToAaUser)(tweet.author);
    if (ref.type === 'retweet') {
        const monitoredHandle = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(ref.author?.handle) ||
            (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(tweet.author?.handle);
        if (!monitoredHandle) {
            return null;
        }
        return {
            monitoredHandle,
            payload: {
                tweet_create_events: [
                    {
                        user: engagerUser,
                        retweeted_status: { id_str: originalId, id: originalId },
                    },
                ],
            },
            eventSummary: {
                kind: 'retweet',
                tweetId: originalId,
                engagerUserId: String(engagerId),
                engagerHandle: (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(tweet.author?.handle),
            },
        };
    }
    if (ref.type === 'reply') {
        const monitoredHandle = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(ref.author?.handle);
        if (!monitoredHandle) {
            return null;
        }
        return buildReplyMapping(tweet, monitoredHandle, originalId, engagerUser, engagerId);
    }
    return null;
}
/** When TweetStream omits ref.author, resolve monitoredHandle via Postiz post releaseId. */
function buildMappedFromTweetContent(tweet, monitoredHandle) {
    const ref = tweet.ref;
    const engagerId = tweet.author?.id;
    if (!ref?.type || !ref.tweetId || !engagerId) {
        return null;
    }
    const handle = (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(monitoredHandle);
    if (!handle) {
        return null;
    }
    const originalId = String(ref.tweetId).trim();
    const engagerUser = (0, tweetstream_normalize_1.authorToAaUser)(tweet.author);
    if (ref.type === 'retweet') {
        return {
            monitoredHandle: handle,
            payload: {
                tweet_create_events: [
                    {
                        user: engagerUser,
                        retweeted_status: { id_str: originalId, id: originalId },
                    },
                ],
            },
            eventSummary: {
                kind: 'retweet',
                tweetId: originalId,
                engagerUserId: String(engagerId),
                engagerHandle: (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(tweet.author?.handle),
            },
        };
    }
    if (ref.type === 'reply') {
        return buildReplyMapping(tweet, handle, originalId, engagerUser, engagerId);
    }
    return null;
}
function buildReplyMapping(tweet, monitoredHandle, originalId, engagerUser, engagerId) {
    return {
        monitoredHandle,
        payload: {
            tweet_create_events: [
                {
                    user: engagerUser,
                    in_reply_to_status_id_str: originalId,
                    in_reply_to_status_id: originalId,
                },
            ],
        },
        eventSummary: {
            kind: 'reply',
            tweetId: originalId,
            engagerUserId: String(engagerId),
            engagerHandle: (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(tweet.author?.handle),
        },
    };
}
//# sourceMappingURL=tweetstream.mapper.js.map