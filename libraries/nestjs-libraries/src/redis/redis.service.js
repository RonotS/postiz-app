"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ioRedis = void 0;
const ioredis_1 = require("ioredis");
// Create a mock Redis implementation for testing environments
class MockRedis {
    constructor() {
        this.data = new Map();
        // Add other Redis methods as needed for your tests
    }
    async get(key) {
        return this.data.get(key);
    }
    async set(key, value) {
        this.data.set(key, value);
        return 'OK';
    }
    async del(key) {
        this.data.delete(key);
        return 1;
    }
}
// Use real Redis if REDIS_URL is defined, otherwise use MockRedis
exports.ioRedis = process.env.REDIS_URL
    ? new ioredis_1.Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        connectTimeout: 10000,
    })
    : new MockRedis(); // Type cast to Redis to maintain interface compatibility
//# sourceMappingURL=redis.service.js.map