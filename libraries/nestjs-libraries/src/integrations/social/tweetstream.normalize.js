"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTweetStreamHandle = normalizeTweetStreamHandle;
exports.authorToAaUser = authorToAaUser;
/** Strip leading @ and lowercase for profile / handle matching. */
function normalizeTweetStreamHandle(handle) {
    return (handle ?? '').trim().replace(/^@+/i, '').toLowerCase();
}
function authorToAaUser(author) {
    if (!author?.id) {
        return undefined;
    }
    return { id_str: String(author.id), id: String(author.id) };
}
//# sourceMappingURL=tweetstream.normalize.js.map