/**
 * useMiniStatePoller (now Streamer) — Custom hook for live table mini-state (v3)
 *
 * v3 improvements:
 *   • Zero-latency WebSocket pipeline — binds to Supabase 'lobby' channel
 *   • Initial HTTP fetch — backfills idle tables before first action
 *   • Adaptive rendering — ignores updates for off-screen tables
 *   • Stale timestamps — standard _fetchedAt injection
 *
 * Usage:
 *   const { miniStates, observerRef } = useMiniStatePoller();
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

let _busEmit = null;
try {
  // Lazy load EventBus
  const mod = require('../engine/EventBus');
  _busEmit = mod.busEmit;
} catch { /* EventBus unavailable */ }

export default function useMiniStatePoller() {
  const [miniStates, setMiniStates] = useState(new Map());
  const [wsLatency, setWsLatency] = useState(null);
  const visibleIds = useRef(new Set());
  const elementsMap = useRef(new Map());
  const observerInstance = useRef(null);
  const prevHandNumbers = useRef(new Map());
  const fetchQueue = useRef(new Set());
  const fetchTimeout = useRef(null);
  const mountedRef = useRef(true);

  // ── 1. Initial HTTP Fetch (Backfill idle tables) ──
  const fetchMiniStates = useCallback(async (idsToFetch) => {
    if (!mountedRef.current || !idsToFetch || idsToFetch.length === 0) return;
    try {
      const res = await fetch(`/api/poker/engine/mini-state?tableIds=${idsToFetch.join(',')}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || !mountedRef.current) return;

      const now = Date.now();
      setMiniStates(prev => {
        const next = new Map(prev);
        for (const state of data) {
          // If websocket beat us to it, skip
          const existing = next.get(state.tableId);
          if (existing && existing._fetchedAt > now - 2000) continue;

          state._fetchedAt = now;
          next.set(state.tableId, state);
        }
        return next;
      });
    } catch {
      // Silently fail — websocket will eventually catch up on action
    }
  }, []);

  const queueInitialFetch = useCallback((tableId) => {
    fetchQueue.current.add(tableId);
    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    fetchTimeout.current = setTimeout(() => {
      const ids = Array.from(fetchQueue.current);
      fetchQueue.current.clear();
      fetchMiniStates(ids);
    }, 50);
  }, [fetchMiniStates]);

  // ── 2. WebSocket Realtime Stream with Graceful Degradation ──
  useEffect(() => {
    mountedRef.current = true;
    if (!supabase) return;

    let fallbackInterval = null;
    let latencyPinger = null;
    const channelHealthy = { current: false };

    const startFallbackPolling = () => {
      if (fallbackInterval) return; // already polling
      console.warn('[useMiniStatePoller] ⚠️ WebSocket unhealthy — falling back to HTTP polling');
      fallbackInterval = setInterval(() => {
        if (!mountedRef.current) return;
        const ids = Array.from(visibleIds.current);
        if (ids.length > 0) fetchMiniStates(ids);
      }, 4000);
    };

    const stopFallbackPolling = () => {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
        console.log('[useMiniStatePoller] 🔌 WebSocket restored — stopping HTTP fallback');
      }
    };

    const channel = supabase.channel('lobby', {
      config: { presence: { key: '' } }
    });

    channel.on(
      'broadcast',
      { event: 'mini_state_update' },
      ({ payload }) => {
        if (!mountedRef.current || !payload || !payload.tableId) return;

        // Adaptive: only process if visible
        if (!visibleIds.current.has(payload.tableId)) return;

        const now = Date.now();
        setMiniStates(prev => {
          const next = new Map(prev);
          const state = { ...payload, _fetchedAt: now };
          const existing = prev.get(state.tableId);

          // ── EventBus emissions for all significant state changes ──
          if (_busEmit) {
            // Hand number change
            if (state.handNumber) {
              const prevHand = prevHandNumbers.current.get(state.tableId);
              if (prevHand !== undefined && prevHand !== state.handNumber) {
                _busEmit.dataMutated('mini_state_hand_change');
              }
              prevHandNumbers.current.set(state.tableId, state.handNumber);
            }

            // Phase transition (preflop → flop, etc.)
            if (existing && existing.phase !== state.phase) {
              _busEmit.dataMutated('mini_state_phase_change');
            }

            // Winner flash (new hand result appeared)
            if (state.lastHandResult && (!existing?.lastHandResult || 
                existing.lastHandResult.timestamp !== state.lastHandResult.timestamp)) {
              _busEmit.dataMutated('mini_state_winner_flash');
            }

            // Chat message
            if (state.lastChatMessage && (!existing?.lastChatMessage ||
                existing.lastChatMessage.timestamp !== state.lastChatMessage.timestamp)) {
              _busEmit.dataMutated('mini_state_chat_message');
            }

            // Emoji reaction
            if (state.emojiReactions?.length > (existing?.emojiReactions?.length || 0)) {
              _busEmit.dataMutated('mini_state_emoji_reaction');
            }

            // Pot change (significant)
            if (existing && state.potTotal !== existing.potTotal && state.potTotal > 0) {
              _busEmit.dataMutated('mini_state_pot_change');
            }
          }

          next.set(state.tableId, state);
          return next;
        });
      }
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelHealthy.current = true;
        stopFallbackPolling();
        console.log('[useMiniStatePoller] 🔌 Connected to zero-latency WebSocket stream');

        // Start latency pinger — measures channel health every 10s
        latencyPinger = setInterval(() => {
          if (!mountedRef.current) return;
          const pingStart = Date.now();
          channel.send({ type: 'broadcast', event: 'ping', payload: { t: pingStart } });
        }, 10000);

      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        channelHealthy.current = false;
        startFallbackPolling();
      }
    });

    // Listen for pong responses to measure latency
    channel.on('broadcast', { event: 'ping' }, ({ payload }) => {
      if (!mountedRef.current || !payload?.t) return;
      const latency = Date.now() - payload.t;
      setWsLatency(latency);

      // Auto-degrade if latency is too high
      if (latency > 500 && channelHealthy.current) {
        console.warn(`[useMiniStatePoller] ⚠️ High latency: ${latency}ms — enabling HTTP fallback`);
        startFallbackPolling();
      }
    });

    return () => {
      mountedRef.current = false;
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
      if (latencyPinger) clearInterval(latencyPinger);
      stopFallbackPolling();
      supabase.removeChannel(channel);
    };
  }, [fetchMiniStates]);

  // ── 3. Setup IntersectionObserver ──
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    observerInstance.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const tableId = entry.target.dataset.miniStateId;
          if (!tableId) continue;

          if (entry.isIntersecting) {
            visibleIds.current.add(tableId);
            // Trigger an initial fetch when it comes into view so it's not empty
            // while waiting for the next action broadcast.
            queueInitialFetch(tableId);
          } else {
            visibleIds.current.delete(tableId);
          }
        }
      },
      { rootMargin: '100px', threshold: 0 }
    );

    return () => {
      observerInstance.current?.disconnect();
      observerInstance.current = null;
    };
  }, [queueInitialFetch]);

  // ── Register/unregister DOM elements ──
  const observerRef = useCallback((tableId, el) => {
    if (!observerInstance.current) return;

    const prev = elementsMap.current.get(tableId);
    if (prev && prev !== el) {
      observerInstance.current.unobserve(prev);
      elementsMap.current.delete(tableId);
      visibleIds.current.delete(tableId);
    }

    if (el) {
      el.dataset.miniStateId = tableId;
      observerInstance.current.observe(el);
      elementsMap.current.set(tableId, el);
    }
  }, []);

  return { miniStates, observerRef, wsLatency };
}
