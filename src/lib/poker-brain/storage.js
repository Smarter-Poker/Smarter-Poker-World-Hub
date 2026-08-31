/**
 * Poker Brain — Supabase Persistence Layer
 * ------------------------------------------
 * PokerBrainStorage class + usePokerBrainStorage React hook.
 * Features: offline queue via IndexedDB, retry with exponential backoff,
 * Realtime subscriptions for cross-device sync.
 *
 * Requires: @supabase/supabase-js
 *
 * Usage:
 *   import { PokerBrainStorage, usePokerBrainStorage } from './storage';
 *
 *   const storage = new PokerBrainStorage(supabase);
 *   await storage.startSession({ gameType: 'nlhe', playerCount: 6, ... });
 *   await storage.logHand({ ... });
 *   await storage.endSession({ finalStack: 120 });
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// IndexedDB offline queue
// ---------------------------------------------------------------------------
const DB_NAME = 'poker-brain-db';
const DB_VERSION = 2;
const STORE_QUEUE = 'offline_queue';
const STORE_IDMAP = 'session_id_map';

// Pooled IndexedDB connection — avoids opening a new connection per operation.
// During flush cycles 10+ operations run in sequence; without pooling each
// would pay the full IDB open overhead (~5-20ms).
let _dbInstance = null;
let _dbPromise = null;

function openDB() {
  // Return cached connection if still open
  if (_dbInstance) {
    try {
      // Verify the connection is still alive by checking objectStoreNames
      _dbInstance.objectStoreNames;
      return Promise.resolve(_dbInstance);
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }
  // Deduplicate concurrent open requests
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
      // v2: persist temp->real session ID mappings so they survive page reload.
      // Without this, offline-queued log_hand/end_session entries with
      // p_session_id = 'local_<ts>' become unresolvable after a refresh.
      if (!db.objectStoreNames.contains(STORE_IDMAP)) {
        db.createObjectStore(STORE_IDMAP, { keyPath: 'tempId' });
      }
    };
    req.onsuccess = () => {
      _dbInstance = req.result;
      // Clear cached instance if the connection closes unexpectedly
      _dbInstance.onclose = () => { _dbInstance = null; _dbPromise = null; };
      resolve(_dbInstance);
    };
    req.onerror = () => {
      _dbPromise = null;
      reject(req.error);
    };
  });
  return _dbPromise;
}

async function idMapPut(tempId, realId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IDMAP, 'readwrite');
    tx.objectStore(STORE_IDMAP).put({ tempId, realId, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idMapGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IDMAP, 'readonly');
    const req = tx.objectStore(STORE_IDMAP).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idMapDelete(tempId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IDMAP, 'readwrite');
    tx.objectStore(STORE_IDMAP).delete(tempId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queuePut(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).add({ ...item, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queueAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function queueDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// PokerBrainStorage class
// ---------------------------------------------------------------------------
export class PokerBrainStorage {
  constructor(supabase) {
    this.supabase = supabase;
    this.sessionId = null;
    this.handNumber = 0;
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;

    // Store bound listener refs so destroy() can actually remove them.
    // Anonymous arrow listeners can't be removed, so the old code leaked
    // one set of window listeners per instance.
    this._onOnline = () => { this.online = true; this.flushQueue().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); };
    this._onOffline = () => { this.online = false; };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._onOnline);
      window.addEventListener('offline', this._onOffline);
    }
  }

  /**
   * Remove window event listeners. Call when discarding a storage instance
   * (e.g., the React hook unmounting or the supabase client changing).
   * Without this, every instance leaks two listeners for the lifetime of
   * the tab.
   */
  destroy() {
    if (typeof window !== 'undefined') {
      if (this._onOnline) window.removeEventListener('online', this._onOnline);
      if (this._onOffline) window.removeEventListener('offline', this._onOffline);
    }
    this._onOnline = null;
    this._onOffline = null;
  }

  async _rpcWithRetry(fn, args, attempts = 4) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        const { data, error } = await this.supabase.rpc(fn, args);
        if (error) throw error;
        return data;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, i)));
      }
    }
    throw lastErr;
  }

  // --- Sessions ---
  async startSession({ gameType, playerCount, captureMode, clientProfile, startingStack }) {
    if (!this.online) {
      // Generate client-side temp id and queue
      const tempId = `local_${Date.now()}`;
      this.sessionId = tempId;
      this.handNumber = 0;
      await queuePut({ type: 'start_session', args: { gameType, playerCount, captureMode, clientProfile, startingStack }, tempId });
      return tempId;
    }
    const id = await this._rpcWithRetry('pb_start_session', {
      p_game_type: gameType,
      p_player_count: playerCount,
      p_capture_mode: captureMode,
      p_client_profile: clientProfile ?? null,
      p_starting_stack: startingStack ?? null,
    });
    this.sessionId = id;
    this.handNumber = 0;
    return id;
  }

  async logHand(hand) {
    this.handNumber += 1;
    // Serialize card objects to string notation ('As', 'Kh', etc.)
    // The matcher returns full objects {rank,suit,confidence,...} but
    // Supabase stores text[] — we need 'Rs' format.
    const serializeCards = (cards) => {
      if (!Array.isArray(cards)) return [];
      return cards
        .filter(c => c && c.rank && c.suit)
        .map(c => `${c.rank}${c.suit}`);
    };
    const args = {
      p_session_id: this.sessionId,
      p_hand_number: this.handNumber,
      p_position: hand.position ?? null,
      p_hole_cards: serializeCards(hand.holeCards),
      p_board: serializeCards(hand.board),
      p_game_type: hand.gameType,
      p_pot_size: hand.potSize ?? null,
      p_bet_to_call: hand.betToCall ?? null,
      p_stack_size: hand.stackSize ?? null,
      p_equity: hand.equity ?? null,
      p_pot_odds: hand.potOdds ?? null,
      p_decision: hand.decision ?? null,
      p_raise_amount: hand.raiseAmount ?? null,
      p_confidence: hand.confidence ?? null,
      p_reasoning: hand.reasoning ?? null,
      p_detected_auto: !!hand.detectedAuto,
      p_street_decisions: hand.streetDecisions ? JSON.parse(JSON.stringify(hand.streetDecisions)) : null,
      p_engine_suggestion: hand.engineSuggestion ?? null,
    };
    if (!this.online) {
      await queuePut({ type: 'log_hand', args });
      return null;
    }
    try {
      return await this._rpcWithRetry('pb_log_hand', args);
    } catch (err) {
      await queuePut({ type: 'log_hand', args });
      throw err;
    }
  }

  async endSession({ finalStack, notes } = {}) {
    const args = { p_session_id: this.sessionId, p_final_stack: finalStack ?? null, p_notes: notes ?? null };
    if (!this.online) {
      await queuePut({ type: 'end_session', args });
      return;
    }
    try {
      await this._rpcWithRetry('pb_end_session', args);
    } catch (err) {
      await queuePut({ type: 'end_session', args });
      throw err;
    } finally {
      this.sessionId = null;
      this.handNumber = 0;
    }
  }

  // --- Profiles ---
  async saveProfile({ name, slug, regions, videoSize }) {
    return this._rpcWithRetry('pb_save_profile', {
      p_name: name,
      p_slug: slug,
      p_regions: regions,
      p_video_size: videoSize ?? null,
    });
  }

  async listProfiles() {
    const { data, error } = await this.supabase
      .from('pb_profiles')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // --- History ---
  async listRecentSessions(limit = 20) {
    const { data, error } = await this.supabase
      .from('pb_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async listHands(sessionId, limit = 100) {
    const { data, error } = await this.supabase
      .from('pb_hands')
      .select('*')
      .eq('session_id', sessionId)
      .order('hand_number', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async getStats() {
    const { data, error } = await this.supabase.from('pb_stats').select('*').maybeSingle();
    if (error) throw error;
    return data;
  }

  // --- Realtime ---
  subscribeToHands(sessionId, onInsert) {
    const channel = this.supabase
      .channel(`pb_hands_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pb_hands', filter: `session_id=eq.${sessionId}` },
        (payload) => onInsert(payload.new)
      )
      .subscribe();
    return () => this.supabase.removeChannel(channel);
  }

  // --- Offline queue flush ---
  async flushQueue() {
    if (!this.online) return;
    const items = await queueAll();
    // Order items so start_session runs before its dependent log_hand /
    // end_session entries even if insertion order was interleaved.
    items.sort((a, b) => {
      const rank = (t) => (t === 'start_session' ? 0 : t === 'log_hand' ? 1 : 2);
      return (rank(a.type) - rank(b.type)) || (a.id - b.id);
    });

    // Build a tempId -> realId map as we replay start_session rows.
    // Without this, any log_hand / end_session queued while offline
    // still has p_session_id = 'local_<ts>' which the DB rejects,
    // poisoning the queue forever.
    //
    // Restore any previously persisted mappings from IndexedDB so that
    // a page reload doesn't lose the temp→real ID associations created
    // by earlier flush runs that succeeded for start_session but not
    // for the dependent log_hand/end_session entries.
    const idMap = new Map();
    try {
      const persisted = await idMapGetAll();
      for (const entry of persisted) {
        idMap.set(entry.tempId, entry.realId);
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    for (const item of items) {
      try {
        switch (item.type) {
          case 'start_session': {
            const id = await this._rpcWithRetry('pb_start_session', {
              p_game_type: item.args.gameType,
              p_player_count: item.args.playerCount,
              p_capture_mode: item.args.captureMode,
              p_client_profile: item.args.clientProfile ?? null,
              p_starting_stack: item.args.startingStack ?? null,
            });
            if (item.tempId) {
              idMap.set(item.tempId, id);
              // Persist to IndexedDB so the mapping survives page reload
              try { await idMapPut(item.tempId, id); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
              if (this.sessionId === item.tempId) this.sessionId = id;
            }
            break;
          }
          case 'log_hand': {
            // Remap any tempId → real id captured from the start_session
            // replay. If the session id is still a tempId and we never
            // saw its start_session (shouldn't happen after sort, but
            // defensive), skip so the poison pill doesn't block later
            // well-formed items.
            const args = { ...item.args };
            if (typeof args.p_session_id === 'string' && args.p_session_id.startsWith('local_')) {
              const real = idMap.get(args.p_session_id);
              if (!real) {
                console.warn('[storage] log_hand with unresolved temp session id - skipping', args.p_session_id);
                await queueDelete(item.id);
                continue;
              }
              args.p_session_id = real;
            }
            await this._rpcWithRetry('pb_log_hand', args);
            break;
          }
          case 'end_session': {
            const args = { ...item.args };
            if (typeof args.p_session_id === 'string' && args.p_session_id.startsWith('local_')) {
              const real = idMap.get(args.p_session_id);
              if (!real) {
                console.warn('[storage] end_session with unresolved temp session id - skipping', args.p_session_id);
                await queueDelete(item.id);
                continue;
              }
              args.p_session_id = real;
            }
            await this._rpcWithRetry('pb_end_session', args);
            break;
          }
          default:
            // Unknown type — drop it rather than poison the queue.
            console.warn('[storage] dropping unknown queue item type', item.type);
        }
        await queueDelete(item.id);
      } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    }
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------
export function usePokerBrainStorage(supabase) {
  const storageRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    storageRef.current = new PokerBrainStorage(supabase);
    setReady(true);
    storageRef.current.flushQueue().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    storageRef.current.getStats().then(setStats).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener('online', onOn);
    window.addEventListener('offline', onOff);
    return () => {
      window.removeEventListener('online', onOn);
      window.removeEventListener('offline', onOff);
      // Tear down the PokerBrainStorage instance's own window listeners
      // so we don't leak one set per hook mount (Fast Refresh, Strict
      // Mode double-invoke, supabase client changes, etc.).
      if (storageRef.current && typeof storageRef.current.destroy === 'function') {
        storageRef.current.destroy();
      }
      storageRef.current = null;
    };
  }, [supabase]);

  const startSession = useCallback(async (opts) => {
    return storageRef.current?.startSession(opts);
  }, []);

  const logHand = useCallback(async (hand) => {
    return storageRef.current?.logHand(hand);
  }, []);

  const endSession = useCallback(async (opts) => {
    const r = await storageRef.current?.endSession(opts);
    storageRef.current?.getStats().then(setStats).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    return r;
  }, []);

  const saveProfile = useCallback(async (p) => storageRef.current?.saveProfile(p), []);
  const listProfiles = useCallback(async () => storageRef.current?.listProfiles(), []);
  const listRecentSessions = useCallback(async (n) => storageRef.current?.listRecentSessions(n), []);
  const listHands = useCallback(async (id, n) => storageRef.current?.listHands(id, n), []);

  // Memoize the returned object so consumers using `[storage]` as an
  // effect dependency don't see a new reference every render. Without
  // this, effects like HUD's state-machine-creator re-run on EVERY
  // render (any setState in the HUD → new storage object → effect fires
  // → state machine destroyed & rebuilt → hand tracking loses state).
  //
  // We intentionally DON'T include `storageRef.current` in the deps:
  // the ref is written once inside a useEffect, so the first non-null
  // snapshot is stable for the rest of the component's lifetime.
  return useMemo(
    () => ({
      ready,
      online,
      stats,
      startSession,
      logHand,
      endSession,
      saveProfile,
      listProfiles,
      listRecentSessions,
      listHands,
      storage: storageRef.current,
    }),
    [
      ready,
      online,
      stats,
      startSession,
      logHand,
      endSession,
      saveProfile,
      listProfiles,
      listRecentSessions,
      listHands,
    ],
  );
}

export default PokerBrainStorage;
