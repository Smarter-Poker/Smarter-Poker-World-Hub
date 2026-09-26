import { describe, expect, it, vi } from 'vitest';

import { createLatestRequestGuard } from '../src/lib/latestRequestGuard.mjs';
import { scanReelsContinuations } from '../src/lib/reelsContinuation.mjs';
import {
  loadWatchedReelIds,
  loadNotInterestedReelIds,
  normalizeWatchedReelIds,
  persistWatchedReelIds,
  persistNotInterestedReelIds,
  readReelsSessionFlag,
  safeSetReelsSessionStorage,
} from '../src/lib/reelsWatchedStorage.mjs';
import {
  REEL_PUBLICATION_KIND,
  isOwnedUploadObject,
  probeUploadRecoveryCandidate,
} from '../src/lib/uploadRecoveryIdentity.mjs';

const OWNER_ID = '8f6d9be8-a7de-4d79-9c9a-4533a0539012';
const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const STORAGE_PATH = `reels/${OWNER_ID}/phase-one.mp4`;
const PUBLIC_URL = `${SUPABASE_URL}/storage/v1/object/public/social-media/${STORAGE_PATH}`;

function recoveryIntent(overrides = {}) {
  return {
    publicationKind: REEL_PUBLICATION_KIND,
    storageCandidate: true,
    storageCommitted: false,
    candidateCreatedAt: 1_700_000_000_000,
    timestamp: 1_700_000_000_000,
    userId: OWNER_ID,
    folder: 'reels',
    bucket: 'social-media',
    storagePath: STORAGE_PATH,
    publicUrl: PUBLIC_URL,
    ...overrides,
  };
}

describe('Video/Reels Phase 1 hostile-state contracts', () => {
  it('chases advancing empty and client-filtered pages without losing the continuation', async () => {
    const cursors = [];
    const responses = [
      { data: [], next_cursor: 'cursor-1', partial: true },
      { data: [{ id: 'filtered' }], next_cursor: 'cursor-2', partial: false },
      { data: [{ id: 'accepted' }], next_cursor: 'cursor-3', partial: false },
    ];
    const result = await scanReelsContinuations({
      fetchPage: async (cursor) => {
        cursors.push(cursor);
        return responses.shift();
      },
      selectRows: rows => rows.filter(row => row.id !== 'filtered'),
    });

    expect(cursors).toEqual([null, 'cursor-1', 'cursor-2']);
    expect(result.data).toEqual([{ id: 'accepted' }]);
    expect(result.next_cursor).toBe('cursor-3');
    expect(result.continuation_paused).toBe(false);
    expect(result.scanned_pages).toBe(3);
  });

  it('pauses a hostile empty scan with its exact cursor for a user-driven continuation', async () => {
    const result = await scanReelsContinuations({
      cursor: 'start',
      maxPages: 2,
      fetchPage: async cursor => ({
        data: [],
        next_cursor: cursor === 'start' ? 'cursor-1' : 'cursor-2',
        partial: true,
      }),
    });

    expect(result.data).toEqual([]);
    expect(result.next_cursor).toBe('cursor-2');
    expect(result.continuation_paused).toBe(true);
    expect(result.scanned_pages).toBe(2);
  });

  it('rejects a repeating continuation cursor instead of request-looping', async () => {
    await expect(scanReelsContinuations({
      cursor: 'stuck',
      fetchPage: async () => ({ data: [], next_cursor: 'stuck', partial: true }),
    })).rejects.toMatchObject({ code: 'REELS_CONTINUATION_STALLED' });
  });

  it('invalidates a successful response that arrives after a newer refresh starts', () => {
    const guard = createLatestRequestGuard();
    const droppedRequest = guard.begin();
    const currentRequest = guard.begin();

    expect(droppedRequest.signal.aborted).toBe(true);
    expect(droppedRequest.isCurrent()).toBe(false);
    expect(droppedRequest.finish()).toBe(false);
    expect(currentRequest.isCurrent()).toBe(true);
    expect(currentRequest.finish()).toBe(true);
  });

  it('refuses an old cursor append while the authoritative refresh is unresolved', () => {
    const guard = createLatestRequestGuard();
    const refresh = guard.begin();

    expect(guard.begin({ append: true })).toBeNull();
    expect(guard.isFullRefreshPending()).toBe(true);
    expect(refresh.finish()).toBe(true);
    expect(guard.begin({ append: true })).not.toBeNull();
  });

  it('rejects stale local recovery evidence before any network probe', async () => {
    const fetchImpl = vi.fn();
    const result = await probeUploadRecoveryCandidate(recoveryIntent(), {
      userId: OWNER_ID,
      supabaseUrl: SUPABASE_URL,
      now: 1_700_000_000_000 + (8 * 24 * 60 * 60 * 1000),
      fetchImpl,
    });

    expect(result.status).toBe('invalid');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an old bookmarked object URL from any untrusted host', () => {
    expect(isOwnedUploadObject(recoveryIntent({
      publicUrl: `https://attacker.example/storage/v1/object/public/social-media/${STORAGE_PATH}`,
    }), { supabaseUrl: SUPABASE_URL })).toBe(false);
  });

  it('recovers a lost upload acknowledgement with one no-store HEAD request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await probeUploadRecoveryCandidate(recoveryIntent(), {
      userId: OWNER_ID,
      supabaseUrl: SUPABASE_URL,
      now: 1_700_000_000_000,
      fetchImpl,
    });

    expect(result.status).toBe('committed');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(PUBLIC_URL, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Cache-Control': 'no-cache' },
    });
  });

  it('treats hostile watched-history shapes as empty and keeps only 500 valid newest IDs', () => {
    expect(normalizeWatchedReelIds({ stale: true })).toEqual([]);
    expect(normalizeWatchedReelIds('not-an-array')).toEqual([]);
    const ids = Array.from({ length: 501 }, (_, index) => (
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    ));
    const normalized = normalizeWatchedReelIds([
      ids[0],
      'javascript:alert(1)',
      ...ids,
      ids[500],
    ]);
    expect(normalized).toHaveLength(500);
    expect(normalized[0]).toBe(ids[1]);
    expect(normalized.at(-1)).toBe(ids[500]);
  });

  it('keeps watched and not-interested history isolated through an A to B to A account switch', () => {
    const ownerB = '7b385637-d6e5-4323-8b3a-5c221fd42f73';
    const reelA = '36c69f71-fc4b-4868-8099-346c657d99bb';
    const reelB = '403a20cc-dab5-4cbe-8e31-003b88fa4c06';
    const values = new Map([
      ['smarter-reels-watched', JSON.stringify([reelB])],
      ['reels-not-interested', JSON.stringify([reelB])],
    ]);
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: key => values.get(key) || null,
          setItem: (key, value) => values.set(key, value),
          removeItem: key => values.delete(key),
        },
      });

      persistWatchedReelIds([reelA], OWNER_ID);
      persistNotInterestedReelIds(new Set([reelA]), OWNER_ID);
      persistWatchedReelIds([reelB], ownerB);
      persistNotInterestedReelIds(new Set([reelB]), ownerB);

      expect(loadWatchedReelIds(OWNER_ID)).toEqual([reelA]);
      expect([...loadNotInterestedReelIds(OWNER_ID)]).toEqual([reelA]);
      expect(loadWatchedReelIds(ownerB)).toEqual([reelB]);
      expect([...loadNotInterestedReelIds(ownerB)]).toEqual([reelB]);
      expect(loadWatchedReelIds(OWNER_ID)).toEqual([reelA]);
      expect([...loadNotInterestedReelIds(OWNER_ID)]).toEqual([reelA]);
      expect(values.has('smarter-reels-watched')).toBe(false);
      expect(values.has('reels-not-interested')).toBe(false);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
      } else {
        delete globalThis.localStorage;
      }
    }
  });

  it('survives unavailable, corrupt, and read-only localStorage', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('denied', 'SecurityError'); },
      });
      expect(loadWatchedReelIds()).toEqual([]);
      expect([...loadNotInterestedReelIds()]).toEqual([]);

      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: () => '{broken-json',
          setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
        },
      });
      expect(loadWatchedReelIds()).toEqual([]);
      expect(persistWatchedReelIds([OWNER_ID])).toEqual([OWNER_ID]);
      expect([...persistNotInterestedReelIds(new Set([OWNER_ID]))]).toEqual([OWNER_ID]);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
      } else {
        delete globalThis.localStorage;
      }
      warning.mockRestore();
    }
  });

  it('survives denied and read-only sessionStorage during render and gestures', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    try {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        get() { throw new DOMException('denied', 'SecurityError'); },
      });
      expect(readReelsSessionFlag('sp:reels:interacted')).toBe(false);

      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: {
          getItem: () => '1',
          setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
        },
      });
      expect(readReelsSessionFlag('sp:reels:interacted')).toBe(true);
      expect(safeSetReelsSessionStorage('sp:reels:interacted', '1')).toBe(false);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'sessionStorage', originalDescriptor);
      } else {
        delete globalThis.sessionStorage;
      }
      warning.mockRestore();
    }
  });
});
