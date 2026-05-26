#!/usr/bin/env node
/**
 * TweetStream CLI smoke tests (REST + optional WebSocket listen).
 *
 * Usage:
 *   node scripts/tweetstream-cli.mjs me
 *   node scripts/tweetstream-cli.mjs add elonmusk billgates
 *   node scripts/tweetstream-cli.mjs remove elonmusk
 *   node scripts/tweetstream-cli.mjs listen [--seconds=30]
 *   node scripts/tweetstream-cli.mjs postiz-status   # local Postiz backend
 *   node scripts/tweetstream-cli.mjs postiz-sync     # register Postiz X handles on TweetStream
 *   node scripts/tweetstream-cli.mjs postiz-events   # recent events Postiz saw (if PUBLISH_EVENTS=true)
 *
 * Loads TWEETSTREAM_API_KEY from process.env or ../../.env
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, '../.env');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(rootEnv);

const API_KEY = process.env.TWEETSTREAM_API_KEY?.trim();
const API_BASE = (
  process.env.TWEETSTREAM_API_BASE || 'https://api.tweetstream.io'
).replace(/\/+$/, '');
const WS_URL = process.env.TWEETSTREAM_WS_URL || 'wss://ws.tweetstream.io/ws';
const POSTIZ_BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:3000';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function normalizeHandle(h) {
  return String(h || '')
    .trim()
    .replace(/^@+/i, '')
    .toLowerCase();
}

async function api(path, { method = 'GET', body } = {}) {
  if (!API_KEY) {
    die('Set TWEETSTREAM_API_KEY in .env or the environment.');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok && res.status !== 207) {
    die(`HTTP ${res.status}: ${JSON.stringify(json, null, 2)}`);
  }
  return json;
}

async function cmdMe() {
  const data = await api('/api/me');
  console.log(JSON.stringify(data, null, 2));
}

async function cmdAdd(handles) {
  const accounts = handles.map(normalizeHandle).filter(Boolean);
  if (!accounts.length) die('Usage: add <handle> [handle2 ...]');
  const data = await api('/api/add-account', {
    method: 'POST',
    body: { accounts },
  });
  console.log(JSON.stringify(data, null, 2));
}

async function cmdRemove(handles) {
  const accounts = handles.map(normalizeHandle).filter(Boolean);
  if (!accounts.length) die('Usage: remove <handle> [handle2 ...]');
  const data = await api('/api/remove-account', {
    method: 'DELETE',
    body: { accounts },
  });
  console.log(JSON.stringify(data, null, 2));
}

function parseListenSeconds(argv) {
  for (const a of argv) {
    if (a.startsWith('--seconds=')) {
      return Math.max(5, Number(a.split('=')[1]) || 30);
    }
  }
  return 30;
}

async function cmdListen(argv) {
  if (!API_KEY) die('Set TWEETSTREAM_API_KEY in .env or the environment.');
  const seconds = parseListenSeconds(argv);
  const protocols = ['tweetstream.v1', `tweetstream.auth.token.${API_KEY}`];

  try {
    const me = await api('/api/me');
    const ws = me.websocket || {};
    console.log(
      `TweetStream WebSockets: ${ws.count ?? '?'}/${ws.limit ?? '?'} in use (trial = 1 max).\n`
    );
    if ((ws.count ?? 0) >= (ws.limit ?? 1)) {
      console.log(
        'Cannot open CLI listen: connection slot already used (likely Postiz backend).\n' +
          'Stop dev:backend, wait 60s, then run listen — OR skip listen and use postiz-events while backend runs.\n'
      );
      process.exit(0);
    }
  } catch {
    /* me check optional */
  }

  console.log(`Connecting to ${WS_URL} for ${seconds}s ...`);
  console.log('(Events only arrive for handles tracked in your TweetStream account.)\n');

  await new Promise((resolvePromise, rejectPromise) => {
    const ws = new WebSocket(WS_URL, protocols);
    const timer = setTimeout(() => {
      console.log('\nDone listening.');
      ws.close();
      resolvePromise();
    }, seconds * 1000);

    ws.on('open', () => console.log('WebSocket connected.\n'));
    ws.on('message', (raw) => {
      try {
        const envelope = JSON.parse(raw.toString());
        if (envelope.t === 'control') return;
        const ts = envelope.ts
          ? new Date(envelope.ts).toISOString()
          : new Date().toISOString();
        if (envelope.t === 'tweet' && envelope.op === 'content') {
          const t = envelope.d || {};
          const author =
            t.author?.handle || t.author?.name || t.author?.id || '?';
          const ref = t.ref?.type ? ` [${t.ref.type} → ${t.ref.tweetId}]` : '';
          console.log(`[${ts}] TWEET ${author}${ref}: ${(t.text || '').slice(0, 120)}`);
        } else if (envelope.t === 'account' && envelope.op === 'follow') {
          const d = envelope.d || {};
          const actor = d.actor?.handle || d.actor?.id || '?';
          const target = d.target?.handle || d.target?.id || '?';
          console.log(`[${ts}] FOLLOW ${actor} → ${target}`);
        } else if (envelope.t === 'account' && envelope.op === 'profile_update') {
          const d = envelope.d || {};
          const actor = d.actor?.handle || d.actor?.id || '?';
          console.log(`[${ts}] PROFILE ${actor}`, d.changes || {});
        } else {
          console.log(`[${ts}] ${envelope.t}:${envelope.op}`, JSON.stringify(envelope.d).slice(0, 200));
        }
      } catch (e) {
        console.log('(non-JSON)', raw.toString().slice(0, 200));
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      const msg = String(err?.message ?? err);
      if (msg.includes('429')) {
        console.error(
          '\n429 Too Many Requests — TweetStream trial allows only 1 WebSocket.\n' +
            '• Stop Postiz backend (pnpm run dev:backend) before listen, wait ~60s\n' +
            '• Or keep backend running and use: node scripts/tweetstream-cli.mjs postiz-events\n'
        );
        resolvePromise();
        return;
      }
      rejectPromise(err);
    });
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      console.log(`Closed code=${code} reason=${reason || ''}`);
      resolvePromise();
    });
  });
}

function postizApiBase() {
  return POSTIZ_BACKEND.replace(/\/+$/, '').replace(/\/api$/, '');
}

async function postizFetch(path, { method = 'GET' } = {}) {
  const url = `${postizApiBase()}/api/x/tweetstream${path}`;
  console.log(`${method} ${url}\n`);
  const res = await fetch(url, { method });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: res.status };
  }
}

async function cmdPostizStatus() {
  console.log(JSON.stringify(await postizFetch('/status'), null, 2));
}

async function cmdPostizSync() {
  console.log(JSON.stringify(await postizFetch('/sync', { method: 'POST' }), null, 2));
}

async function cmdClearWsLock() {
  loadEnvFile(rootEnv);
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    die('Set REDIS_URL in .env to clear the TweetStream WS lock.');
  }
  const { default: Redis } = await import('ioredis');
  const redis = new Redis(redisUrl);
  const keys = ['x:tweetstream:ws:leader', 'x:tweetstream:ws:cooldown'];
  for (const key of keys) {
    const n = await redis.del(key);
    console.log(`DEL ${key} → ${n ? 'ok' : 'not set'}`);
  }
  redis.disconnect();
  console.log('\nRestart backend once. Only one dev:backend process.');
}

async function cmdPostizEvents() {
  const data = await postizFetch('/events?limit=20');
  console.log(JSON.stringify(data, null, 2));
  if (data?.events?.length) {
    console.log(
      '\nIf events appear here but no DM on X, check: autoDmEngagers plug ON, OAuth valid, DM permissions.'
    );
  } else {
    console.log(
      '\nNo events yet. Trigger a reply/follow on a tracked handle, or set TWEETSTREAM_PUBLISH_EVENTS=true and restart backend.'
    );
  }
}

const [,, command, ...rest] = process.argv;

switch (command) {
  case 'me':
    await cmdMe();
    break;
  case 'add':
    await cmdAdd(rest);
    break;
  case 'remove':
    await cmdRemove(rest);
    break;
  case 'listen':
    await cmdListen(rest);
    break;
  case 'postiz-status':
    await cmdPostizStatus();
    break;
  case 'postiz-sync':
    await cmdPostizSync();
    break;
  case 'postiz-events':
    await cmdPostizEvents();
    break;
  case 'clear-ws-lock':
    await cmdClearWsLock();
    break;
  default:
    console.log(`TweetStream CLI

Commands:
  me                         Show plan, tracked handles, websocket limits
  add <handle> [more...]     Register handles on TweetStream
  remove <handle> [more...]  Remove handles
  listen [--seconds=30]      WebSocket smoke test (default 30s)
  postiz-status              Postiz + TweetStream wiring (backend must be up)
  postiz-sync                Postiz registers X channel handles on TweetStream
  postiz-events              Events Postiz received (not DMs — see test-auto-dm below)
  clear-ws-lock              Clear Redis WS leader/cooldown (if backend skips WebSocket)

Auto-DM cannot be sent from this CLI. DMs are sent by Postiz via official X OAuth.
Quick end-to-end test:
  1. Backend running (TWEETSTREAM_ENABLED=true, RUN_CRON=true)
  2. X channel connected; Direct Message Engagers plug ON
  3. node scripts/tweetstream-cli.mjs postiz-sync
  4. From another X account: reply to a tracked channel's tweet (or follow them)
  5. node scripts/tweetstream-cli.mjs postiz-events
  6. Check X DMs on the channel account

Examples:
  node scripts/tweetstream-cli.mjs me
  node scripts/tweetstream-cli.mjs add yourxhandle
  node scripts/tweetstream-cli.mjs listen --seconds=60
  node scripts/tweetstream-cli.mjs postiz-sync
`);
    process.exit(command ? 1 : 0);
}
