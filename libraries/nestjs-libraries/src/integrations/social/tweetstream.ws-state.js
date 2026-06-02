"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markTweetStreamWsConsumerActive = markTweetStreamWsConsumerActive;
exports.clearTweetStreamWsConsumerActive = clearTweetStreamWsConsumerActive;
exports.isTweetStreamWsConsumerActive = isTweetStreamWsConsumerActive;
const tweetstream_env_1 = require("../../../../helpers/src/x/tweetstream.env");
const redis_service_1 = require("../../redis/redis.service");
const ACTIVE_TTL_SEC = 120;
async function markTweetStreamWsConsumerActive() {
    await redis_service_1.ioRedis.set((0, tweetstream_env_1.getTweetStreamWsConsumerActiveRedisKey)(), '1', 'EX', ACTIVE_TTL_SEC);
}
async function clearTweetStreamWsConsumerActive() {
    await redis_service_1.ioRedis.del((0, tweetstream_env_1.getTweetStreamWsConsumerActiveRedisKey)());
}
async function isTweetStreamWsConsumerActive() {
    const v = await redis_service_1.ioRedis.get((0, tweetstream_env_1.getTweetStreamWsConsumerActiveRedisKey)());
    return v === '1';
}
//# sourceMappingURL=tweetstream.ws-state.js.map