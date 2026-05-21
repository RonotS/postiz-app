'use client';

const storageKey = (integrationId: string, kind: 'whitelist' | 'blacklist') =>
  `x-follower-explorer:${integrationId}:${kind}`;

function readIds(integrationId: string, kind: 'whitelist' | 'blacklist'): Set<string> {
  if (typeof window === 'undefined' || !integrationId) return new Set();
  try {
    const raw = localStorage.getItem(storageKey(integrationId, kind));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeIds(
  integrationId: string,
  kind: 'whitelist' | 'blacklist',
  ids: Set<string>
) {
  if (typeof window === 'undefined' || !integrationId) return;
  localStorage.setItem(
    storageKey(integrationId, kind),
    JSON.stringify([...ids])
  );
}

export function loadExplorerListIds(
  integrationId: string,
  kind: 'whitelist' | 'blacklist'
): Set<string> {
  return readIds(integrationId, kind);
}

export function toggleExplorerListId(
  integrationId: string,
  kind: 'whitelist' | 'blacklist',
  userId: string,
  current: Set<string>
): Set<string> {
  const next = new Set(current);
  if (next.has(userId)) {
    next.delete(userId);
  } else {
    next.add(userId);
    if (kind === 'whitelist') {
      const blacklist = readIds(integrationId, 'blacklist');
      if (blacklist.has(userId)) {
        blacklist.delete(userId);
        writeIds(integrationId, 'blacklist', blacklist);
      }
    } else {
      const whitelist = readIds(integrationId, 'whitelist');
      if (whitelist.has(userId)) {
        whitelist.delete(userId);
        writeIds(integrationId, 'whitelist', whitelist);
      }
    }
  }
  writeIds(integrationId, kind, next);
  return next;
}
