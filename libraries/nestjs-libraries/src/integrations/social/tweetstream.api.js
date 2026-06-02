"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TweetStreamApiClient = void 0;
const tweetstream_env_1 = require("../../../../helpers/src/x/tweetstream.env");
const tweetstream_normalize_1 = require("./tweetstream.normalize");
const ALREADY_TRACKED_STATES = new Set([
    'already_following',
    'already_tracked',
    'already_exists',
    'already_monitored',
]);
function isBenignAccountState(state) {
    if (!state)
        return false;
    return ALREADY_TRACKED_STATES.has(String(state).toLowerCase());
}
function isAccountLimitMessage(message) {
    return /account limit reached/i.test(String(message ?? ''));
}
function normalizeAddAccountBody(body, httpStatus) {
    const results = body.results ?? [];
    const normalized = results.map((row) => {
        const ok = row.success === true ||
            isBenignAccountState(row.state) ||
            (httpStatus === 400 && isBenignAccountState(row.state));
        return { ...row, success: ok };
    });
    const succeeded = normalized.filter((r) => r.success).length;
    const failed = normalized.length - succeeded;
    return {
        ...body,
        results: normalized,
        summary: {
            total: normalized.length,
            succeeded,
            failed,
        },
    };
}
class TweetStreamApiClient {
    constructor(apiKey) {
        const key = apiKey ?? (0, tweetstream_env_1.getTweetStreamApiKey)();
        if (!key) {
            throw new Error('TWEETSTREAM_API_KEY is not set');
        }
        this.apiKey = key;
        this.base = (0, tweetstream_env_1.getTweetStreamApiBase)();
    }
    headers(json = false) {
        const h = {
            Authorization: `Bearer ${this.apiKey}`,
        };
        if (json) {
            h['Content-Type'] = 'application/json';
        }
        return h;
    }
    async getMe() {
        const res = await fetch(`${this.base}/api/me`, {
            method: 'GET',
            headers: this.headers(),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`TweetStream /api/me failed (${res.status}): ${text}`);
        }
        return (await res.json());
    }
    async addAccounts(handles) {
        const accounts = handles
            .map((h) => (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(h))
            .filter(Boolean);
        if (!accounts.length) {
            return { results: [], summary: { total: 0, succeeded: 0, failed: 0 } };
        }
        const res = await fetch(`${this.base}/api/add-account`, {
            method: 'POST',
            headers: this.headers(true),
            body: JSON.stringify({ accounts }),
        });
        const body = (await res.json().catch(() => ({})));
        const normalized = normalizeAddAccountBody(body, res.status);
        const allBenign = normalized.results?.length &&
            normalized.results.every((r) => r.success);
        const allAccountLimit = normalized.results?.length &&
            normalized.results.every((r) => !r.success && isAccountLimitMessage(r.message ?? r.error));
        if (!res.ok && res.status !== 207 && !allBenign && !allAccountLimit) {
            throw new Error(`TweetStream add-account failed (${res.status}): ${JSON.stringify(body)}`);
        }
        return normalized;
    }
    async removeAccounts(handles) {
        const accounts = handles
            .map((h) => (0, tweetstream_normalize_1.normalizeTweetStreamHandle)(h))
            .filter(Boolean);
        if (!accounts.length) {
            return { results: [], summary: { total: 0, succeeded: 0, failed: 0 } };
        }
        const res = await fetch(`${this.base}/api/remove-account`, {
            method: 'DELETE',
            headers: this.headers(true),
            body: JSON.stringify({ accounts }),
        });
        const body = (await res.json().catch(() => ({})));
        if (!res.ok && res.status !== 207) {
            throw new Error(`TweetStream remove-account failed (${res.status}): ${JSON.stringify(body)}`);
        }
        return body;
    }
}
exports.TweetStreamApiClient = TweetStreamApiClient;
//# sourceMappingURL=tweetstream.api.js.map