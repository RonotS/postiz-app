"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ssrfSafeDispatcher = void 0;
const tslib_1 = require("tslib");
const undici_1 = require("undici");
const node_dns_1 = tslib_1.__importDefault(require("node:dns"));
const node_net_1 = tslib_1.__importDefault(require("node:net"));
const webhook_url_validator_1 = require("./webhook.url.validator");
// Pins DNS resolution: every resolved IP is checked with `isBlockedIp` and
// the caller (undici) connects to that same set. Closes the TOCTOU window
// `isSafePublicHttpsUrl` alone leaves open (see GHSA-f7jj-p389-4w45).
exports.ssrfSafeDispatcher = new undici_1.Agent({
    connect: {
        lookup(hostname, options, callback) {
            if (node_net_1.default.isIP(hostname)) {
                const family = node_net_1.default.isIP(hostname);
                if ((0, webhook_url_validator_1.isBlockedIp)(hostname)) {
                    return callback(new Error('Blocked IP'), '', 0);
                }
                return options && options.all
                    ? callback(null, [{ address: hostname, family }], family)
                    : callback(null, hostname, family);
            }
            node_dns_1.default.lookup(hostname, options, (err, address, family) => {
                if (err)
                    return callback(err, '', 0);
                if (Array.isArray(address)) {
                    for (const entry of address) {
                        if ((0, webhook_url_validator_1.isBlockedIp)(entry.address)) {
                            return callback(new Error('Blocked IP'), '', 0);
                        }
                    }
                    return callback(null, address, 0);
                }
                if ((0, webhook_url_validator_1.isBlockedIp)(address)) {
                    return callback(new Error('Blocked IP'), '', 0);
                }
                callback(null, address, family);
            });
        },
    },
});
//# sourceMappingURL=ssrf.safe.dispatcher.js.map