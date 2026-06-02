"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialAbstract = exports.NotEnoughScopes = exports.BadBody = exports.RefreshToken = void 0;
const timer_1 = require("../../../helpers/src/utils/timer");
const activity_1 = require("@temporalio/activity");
class RefreshToken extends activity_1.ApplicationFailure {
    constructor(identifier, json, body, message = '') {
        super(message, 'refresh_token', true, [
            {
                identifier,
                json,
                body,
            },
        ]);
    }
}
exports.RefreshToken = RefreshToken;
class BadBody extends activity_1.ApplicationFailure {
    constructor(identifier, json, body, message = '') {
        super(message, 'bad_body', true, [
            {
                identifier,
                json,
                body,
            },
        ]);
    }
}
exports.BadBody = BadBody;
class NotEnoughScopes {
    constructor(message = 'Not enough scopes, when choosing a provider, please add all the scopes') {
        this.message = message;
    }
}
exports.NotEnoughScopes = NotEnoughScopes;
function safeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }
        return value;
    });
}
class SocialAbstract {
    constructor() {
        this.maxConcurrentJob = 1;
    }
    handleErrors(body, status) {
        return undefined;
    }
    async mention(token, d, id, integration) {
        return { none: true };
    }
    async runInConcurrent(func, ignoreConcurrency) {
        let value;
        try {
            value = await func();
        }
        catch (err) {
            console.error('--- RAW SOCIAL API ERROR ---');
            console.error('Message:', err?.message);
            console.error('Data:', JSON.stringify(err?.data || err, null, 2));
            console.error('----------------------------');
            const handle = this.handleErrors(safeStringify(err), 200);
            const fallback = err?.data?.detail ||
                err?.data?.errors?.[0]?.message ||
                err?.data?.title ||
                err?.requestError?.message ||
                err?.cause?.message ||
                err?.message ||
                'Unknown Error';
            const rawDiag = JSON.stringify(err?.data || err?.message || '');
            value = { err: true, value: fallback, ...(handle || {}), rawDiag };
        }
        if (value && value?.err && value?.value) {
            if (value.type === 'refresh-token') {
                throw new RefreshToken('Refresh token is needed', safeStringify({}), {}, value.value || '');
            }
            const rawDiagMsg = value.rawDiag ? ` | DIAGNOSTICS: ${value.rawDiag}` : '';
            throw new BadBody('', safeStringify({}), {}, (value.value || '') + rawDiagMsg);
        }
        return value;
    }
    async fetch(url, options = {}, identifier = '', totalRetries = 0, ignoreConcurrency = false) {
        const request = await fetch(url, options);
        if (request.status === 200 || request.status === 201) {
            return request;
        }
        if (totalRetries > 2) {
            throw new BadBody(identifier, '{}', options.body || '{}');
        }
        let json = '{}';
        try {
            json = await request.text();
        }
        catch (err) {
            json = '{}';
        }
        const handleError = this.handleErrors(json || '{}', request.status);
        if (request.status === 429 ||
            (request.status === 500 && !handleError) ||
            json.includes('rate_limit_exceeded') ||
            json.includes('Rate limit')) {
            await (0, timer_1.timer)(5000);
            return this.fetch(url, options, identifier, totalRetries + 1, ignoreConcurrency);
        }
        if (handleError?.type === 'retry') {
            await (0, timer_1.timer)(5000);
            return this.fetch(url, options, identifier, totalRetries + 1, ignoreConcurrency);
        }
        if ((request.status === 401 &&
            (handleError?.type === 'refresh-token' || !handleError)) ||
            handleError?.type === 'refresh-token') {
            throw new RefreshToken(identifier, json, options.body, handleError?.value);
        }
        throw new BadBody(identifier, json, options.body, handleError?.value || '');
    }
    checkScopes(required, got) {
        if (Array.isArray(got)) {
            if (!required.every((scope) => got.includes(scope))) {
                throw new NotEnoughScopes();
            }
            return true;
        }
        const newGot = decodeURIComponent(got);
        const splitType = newGot.indexOf(',') > -1 ? ',' : ' ';
        const gotArray = newGot.split(splitType);
        if (!required.every((scope) => gotArray.includes(scope))) {
            throw new NotEnoughScopes();
        }
        return true;
    }
}
exports.SocialAbstract = SocialAbstract;
//# sourceMappingURL=social.abstract.js.map