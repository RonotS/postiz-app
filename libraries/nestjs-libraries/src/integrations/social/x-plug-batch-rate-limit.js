"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X_ENGAGEMENT_MAX_POSTS_PER_TICK = exports.X_PLUG_DM_BATCH_MAX_PER_TICK = exports.X_PLUG_DM_WINDOW_MAX = exports.X_PLUG_DM_WINDOW_MS = void 0;
/** X API DM cap per user per 15 minutes (official v2 limit). */
exports.X_PLUG_DM_WINDOW_MS = 15 * 60 * 1000;
exports.X_PLUG_DM_WINDOW_MAX = Number(process.env.X_PLUG_DM_WINDOW_MAX) > 0
    ? Number(process.env.X_PLUG_DM_WINDOW_MAX)
    : 15;
/** Max DMs to attempt per poller tick (spread across posts/plugs). */
exports.X_PLUG_DM_BATCH_MAX_PER_TICK = Number(process.env.X_PLUG_DM_BATCH_MAX_PER_TICK) > 0
    ? Number(process.env.X_PLUG_DM_BATCH_MAX_PER_TICK)
    : 3;
/** Max published posts to scan per engagement poller tick. */
exports.X_ENGAGEMENT_MAX_POSTS_PER_TICK = Number(process.env.X_ENGAGEMENT_MAX_POSTS_PER_TICK) > 0
    ? Number(process.env.X_ENGAGEMENT_MAX_POSTS_PER_TICK)
    : 5;
//# sourceMappingURL=x-plug-batch-rate-limit.js.map