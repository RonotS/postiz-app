"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X_ENGAGEMENT_PLUG_FUNCTIONS = exports.X_PROFILE_AUTOMATION_PLUG_FUNCTIONS = exports.X_PROFILE_AUTOMATIONS_POLL_RELEASE_ID = exports.X_FOLLOWER_DM_DEFAULT_POLL_INTERVAL_MS = exports.X_FOLLOWER_DM_POLL_RELEASE_ID = void 0;
exports.xFollowerDmPollerWorkflowId = xFollowerDmPollerWorkflowId;
exports.xProfileAutomationsPollerWorkflowId = xProfileAutomationsPollerWorkflowId;
exports.xEngagementPollerWorkflowId = xEngagementPollerWorkflowId;
/** Synthetic X "release id" passed to `processPlugs` — no post row uses this. */
exports.X_FOLLOWER_DM_POLL_RELEASE_ID = '__postiz_follower_poll__';
/**
 * Default ms between X plug poller ticks when env is unset (5 minutes).
 */
exports.X_FOLLOWER_DM_DEFAULT_POLL_INTERVAL_MS = 300_000;
function xFollowerDmPollerWorkflowId(integrationId) {
    return `x_follower_dm_poller_${integrationId}`;
}
/** Synthetic release id for integration-wide profile automation plugs. */
exports.X_PROFILE_AUTOMATIONS_POLL_RELEASE_ID = '__postiz_profile_automations_poll__';
exports.X_PROFILE_AUTOMATION_PLUG_FUNCTIONS = [
    'autoDeleteProfile',
    'autoDeleteReposts',
    'autoDmPinnedPost',
];
function xProfileAutomationsPollerWorkflowId(integrationId) {
    return `x_profile_automations_poller_${integrationId}`;
}
/** Post-bound engagement plugs handled by the forever engagement poller. */
exports.X_ENGAGEMENT_PLUG_FUNCTIONS = [
    'autoDmEngagers',
    'autoRepostPost',
    'autoPlugPost',
    'autoThreadReply',
];
function xEngagementPollerWorkflowId(integrationId) {
    return `x_engagement_poller_${integrationId}`;
}
//# sourceMappingURL=x.follower.dm.constants.js.map