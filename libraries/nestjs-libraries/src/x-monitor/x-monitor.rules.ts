import { getXMonitorHandlesPerRule, getXMonitorRuleTagPrefix } from '@gitroom/helpers/x/x.monitor.env';

export type StreamRuleSpec = { value: string; tag: string; handles: string[] };

/** Build @mention OR rules in batches (X filtered stream rule length limit). */
export function buildStreamRules(handles: string[]): StreamRuleSpec[] {
  const prefix = getXMonitorRuleTagPrefix();
  const perRule = getXMonitorHandlesPerRule();
  const rules: StreamRuleSpec[] = [];

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

export function ruleTagsForPrefix(): string {
  return getXMonitorRuleTagPrefix();
}
