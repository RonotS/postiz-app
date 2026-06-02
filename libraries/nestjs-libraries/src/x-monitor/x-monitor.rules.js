"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStreamRules = buildStreamRules;
exports.ruleTagsForPrefix = ruleTagsForPrefix;
const x_monitor_env_1 = require("../../../helpers/src/x/x.monitor.env");
/** Build @mention OR rules in batches (X filtered stream rule length limit). */
function buildStreamRules(handles) {
    const prefix = (0, x_monitor_env_1.getXMonitorRuleTagPrefix)();
    const perRule = (0, x_monitor_env_1.getXMonitorHandlesPerRule)();
    const rules = [];
    for (let i = 0; i < handles.length; i += perRule) {
        const batch = handles.slice(i, i + perRule);
        const parts = batch.map((h) => `@${h}`);
        const value = parts.join(' OR ');
        if (value.length > 500) {
            // fallback: smaller batches handled by env X_MONITOR_HANDLES_PER_RULE
            continue;
        }
        rules.push({
            value,
            tag: `${prefix}-${Math.floor(i / perRule)}`,
            handles: batch,
        });
    }
    return rules;
}
function ruleTagsForPrefix() {
    return (0, x_monitor_env_1.getXMonitorRuleTagPrefix)();
}
//# sourceMappingURL=x-monitor.rules.js.map