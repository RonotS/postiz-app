"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultAutomationPagesFlags = defaultAutomationPagesFlags;
exports.readAutomationPagesFlagsFromDisk = readAutomationPagesFlagsFromDisk;
exports.writeAutomationPagesFlagsToDisk = writeAutomationPagesFlagsToDisk;
exports.sanitizeAutomationPagesFlags = sanitizeAutomationPagesFlags;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const path_1 = tslib_1.__importDefault(require("path"));
function envBool(raw, fallback) {
    if (raw === undefined || raw === '')
        return fallback;
    return /^(1|true|yes|on)$/i.test(String(raw).trim());
}
function defaultAutomationPagesFlags() {
    return {
        profileAutomationsPublic: envBool(process.env.AUTOMATION_PAGES_PROFILE_PUBLIC ??
            process.env.AUTOMATION_PAGES_TWEET_PUBLIC, false),
        followAutomationsPublic: envBool(process.env.AUTOMATION_PAGES_FOLLOW_PUBLIC, false),
    };
}
function resolveFilePath() {
    const raw = process.env.AUTOMATION_PAGES_FLAGS_FILE?.trim();
    if (raw) {
        return path_1.default.isAbsolute(raw) ? raw : path_1.default.join(process.cwd(), raw);
    }
    return path_1.default.join(process.cwd(), '.data', 'automation-pages-flags.json');
}
async function readAutomationPagesFlagsFromDisk() {
    const file = resolveFilePath();
    try {
        const text = await fs_1.promises.readFile(file, 'utf8');
        const parsed = JSON.parse(text);
        return sanitizeAutomationPagesFlags(parsed);
    }
    catch {
        return defaultAutomationPagesFlags();
    }
}
async function writeAutomationPagesFlagsToDisk(data) {
    const file = resolveFilePath();
    await fs_1.promises.mkdir(path_1.default.dirname(file), { recursive: true });
    await fs_1.promises.writeFile(file, JSON.stringify(sanitizeAutomationPagesFlags(data), null, 2), 'utf8');
}
function sanitizeAutomationPagesFlags(raw) {
    return {
        profileAutomationsPublic: !!(raw.profileAutomationsPublic ?? raw.tweetAutomationsPublic),
        followAutomationsPublic: !!raw.followAutomationsPublic,
    };
}
//# sourceMappingURL=automation-pages-flags.store.js.map