/**
 * usePresence(ids) -> Set of the ids that are online right now.
 *
 * The green dot on a post avatar and on a profile photo. The answer comes from
 * POST /api/social/presence, which decides presence for every player the same
 * way and returns one list. This module only batches, caches and refreshes:
 *
 *   - every id any mounted surface is showing is asked for at most once per
 *     PRESENCE_TTL_MS, in batches of PRESENCE_BATCH, shared across surfaces;
 *   - a failed or signed-out request marks the batch offline until the next
 *     refresh, so a fault shows nobody online rather than anybody partially.
 *
 * Nothing here knows, or can tell, why anybody is online.
 */
import { useEffect, useMemo, useState } from 'react';
import { authedFetch, getAccessToken } from '../lib/authUtils';

export const PRESENCE_TTL_MS = 60_000;
export const PRESENCE_BATCH = 200;
const PRESENCE_URL = '/api/social/presence';
// Refresh a little before the TTL so an interval tick that lands a few
// milliseconds early still refreshes instead of waiting a whole extra minute.
const REFRESH_SLACK_MS = 5_000;
const FLUSH_DELAY_MS = 150;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cache = new Map(); // id -> { online: boolean, at: epoch ms }
const inflight = new Set();
const subscribers = new Set();
let queued = new Set();
let flushTimer = null;

function needsRefresh(id, now) {
  const entry = cache.get(id);
  return !entry || now - entry.at >= PRESENCE_TTL_MS - REFRESH_SLACK_MS;
}

function notify() {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      /* a subscriber's render problem is not presence's */
    }
  }
}

async function requestBatch(batch) {
  if (!getAccessToken()) return null;
  try {
    const res = await authedFetch(PRESENCE_URL, {
      method: 'POST',
      body: JSON.stringify({ ids: batch }),
    });
    if (!res || !res.ok) return null;
    const body = await res.json().catch(() => null);
    if (!body || !Array.isArray(body.online)) return null;
    return new Set(body.online.filter((id) => typeof id === 'string').map((id) => id.toLowerCase()));
  } catch {
    return null;
  }
}

async function flush() {
  flushTimer = null;
  const ids = [...queued];
  queued = new Set();
  if (ids.length === 0) return;
  for (const id of ids) inflight.add(id);

  const batches = [];
  for (let i = 0; i < ids.length; i += PRESENCE_BATCH) batches.push(ids.slice(i, i + PRESENCE_BATCH));

  await Promise.all(
    batches.map(async (batch) => {
      const online = await requestBatch(batch);
      const at = Date.now();
      for (const id of batch) {
        inflight.delete(id);
        cache.set(id, { online: online ? online.has(id) : false, at });
      }
    })
  );
  notify();
}

function request(ids) {
  const now = Date.now();
  for (const id of ids) {
    if (!inflight.has(id) && needsRefresh(id, now)) queued.add(id);
  }
  if (queued.size > 0 && !flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

/** Lower-cased, valid, de-duplicated, sorted: a stable key for a list of ids. */
export function presenceKey(ids) {
  if (!Array.isArray(ids)) return '';
  const out = new Set();
  for (const id of ids) {
    if (typeof id === 'string' && UUID_RE.test(id)) out.add(id.toLowerCase());
  }
  return [...out].sort().join(',');
}

export function usePresence(ids) {
  const key = useMemo(() => presenceKey(ids), [ids]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    const list = key.split(',');
    const onChange = () => setTick((t) => t + 1);
    subscribers.add(onChange);
    request(list);
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      request(list);
    }, PRESENCE_TTL_MS);
    return () => {
      subscribers.delete(onChange);
      clearInterval(timer);
    };
  }, [key]);

  // `tick` is the cache's version: a flush bumps it so the set is rebuilt.
  return useMemo(() => {
    const online = new Set();
    if (!key || tick < 0) return online;
    for (const id of key.split(',')) {
      if (cache.get(id)?.online === true) online.add(id);
    }
    return online;
  }, [key, tick]);
}

export default usePresence;
