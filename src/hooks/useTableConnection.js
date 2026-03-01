/**
 * useTableConnection — React hook for live poker table connection
 * ═══════════════════════════════════════════════════════════════
 * 
 * Hybrid architecture:
 *   WRITES → HTTP API (/api/poker/engine/*)
 *   READS  → Supabase Realtime channel (broadcasts from server)
 * 
 * This ensures the GameController singleton processes all actions
 * server-side, while clients get instant updates via Realtime.
 * 
 * Backward compatible: exposes send() that maps legacy event names
 * to the correct HTTP endpoints, so LivePokerTable works unchanged.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDeviceFingerprint, getGPSLocation } from '../lib/anti-cheat/deviceFingerprint';

const HEARTBEAT_MS = 10000;
const API_BASE = '/api/poker/engine';

// ─── HTTP helpers ────────────────────────────────────────────

async function apiPost(endpoint, body, token) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.error(`[API] ${endpoint} failed:`, err);
    return { success: false, error: err.message };
  }
}

async function apiGet(endpoint, params = {}, token) {
  try {
    const qs = new URLSearchParams(params).toString();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/${endpoint}${qs ? '?' + qs : ''}`, { headers });
    return await res.json();
  } catch (err) {
    console.error(`[API] GET ${endpoint} failed:`, err);
    return null;
  }
}

// ─── Hook ────────────────────────────────────────────────────

export function useTableConnection({ supabase, tableId, userId }) {
  const [tableState, setTableState] = useState(null);
  const [myCards, setMyCards] = useState(null);
  const [legalActions, setLegalActions] = useState(null);
  const [timerState, setTimerState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [lastHandResult, setLastHandResult] = useState(null); // Persists after result clears
  const [error, setError] = useState(null);
  const [tableAlert, setTableAlert] = useState(null);
  const [seatOffer, setSeatOffer] = useState(null); // { seatIndex, timeout, offeredAt }
  const [connected, setConnected] = useState(false);
  const sessionStatsRef = useRef({ initialBuyIn: 0, totalAdded: 0, handsPlayed: 0, sessionStart: null });

  const channelRef = useRef(null);
  const resultTimeoutRef = useRef(null);
  const heartbeatRef = useRef(null);
  const tokenRef = useRef(null);

  // ── Keep auth token fresh ──
  useEffect(() => {
    if (!supabase) return;
    // Get initial token
    supabase.auth.getSession().then(({ data: { session } }) => {
      tokenRef.current = session?.access_token || null;
    });
    // Listen for refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      tokenRef.current = session?.access_token || null;
    });
    return () => subscription?.unsubscribe();
  }, [supabase]);

  // ── Authenticated API wrappers ──
  const _post = useCallback((endpoint, body) =>
    apiPost(endpoint, body, tokenRef.current), []);
  const _get = useCallback((endpoint, params) =>
    apiGet(endpoint, params, tokenRef.current), []);

  // ── Write operations (HTTP) ────────────────────────────────

  const sendAction = useCallback(async (action) => {
    const r = await _post('action', { tableId, playerId: userId, action });
    if (!r.success) { setError(r.error); setTimeout(() => setError(null), 4000); }
    return r;
  }, [tableId, userId]);

  const sitDown = useCallback(async (seatIndex, buyIn, info = {}) => {
    // Collect anti-cheat data (non-blocking, best-effort)
    let fingerprint = null;
    let latitude = null;
    let longitude = null;
    try {
      const [fp, gps] = await Promise.all([
        getDeviceFingerprint(),
        getGPSLocation(3000),
      ]);
      fingerprint = fp;
      if (gps) { latitude = gps.lat; longitude = gps.lng; }
    } catch (err) {
      console.warn('[AntiCheat] Data collection failed:', err.message);
    }

    const r = await _post('seat', {
      tableId, playerId: userId, action: 'sit_down',
      seatIndex, buyIn,
      displayName: info.displayName, avatarUrl: info.avatarUrl,
      fingerprint, latitude, longitude,
    });
    if (!r.success) { setError(r.error); setTimeout(() => setError(null), 4000); }
    return r;
  }, [tableId, userId]);

  const standUp = useCallback(() =>
    _post('seat', { tableId, playerId: userId, action: 'stand_up' }), [tableId, userId]);

  const sitOut = useCallback(() =>
    _post('seat', { tableId, playerId: userId, action: 'sit_out' }), [tableId, userId]);

  const sitIn = useCallback(() =>
    _post('seat', { tableId, playerId: userId, action: 'sit_in' }), [tableId, userId]);

  const addChips = useCallback((amount) =>
    _post('seat', { tableId, playerId: userId, action: 'add_chips', amount }), [tableId, userId]);

  const sendChat = useCallback((message) =>
    _post('connect', { tableId, playerId: userId, type: 'chat', message }), [tableId, userId]);

  const joinWaitlist = useCallback((opts = {}) =>
    _post('seat', { tableId, playerId: userId, action: 'join_waitlist', ...opts }), [tableId, userId]);

  const leaveWaitlist = useCallback(() =>
    _post('seat', { tableId, playerId: userId, action: 'leave_waitlist' }), [tableId, userId]);

  // ── Read operations ────────────────────────────────────────

  const requestState = useCallback(async () => {
    const state = await _get('state', { tableId, playerId: userId });
    if (state && !state.error) {
      setTableState(state);
      if (state.yourCards) setMyCards(state.yourCards);
      if (state.legalActions) setLegalActions(state.legalActions);
    }
    return state;
  }, [tableId, userId]);

  // ── Realtime event handler ─────────────────────────────────

  const handleEvent = useCallback((event, data) => {
    switch (event) {
      case 'table_state':
        setTableState(data);
        if (data.yourCards) setMyCards(data.yourCards);
        // Track session: record initial buy-in on first state with our seat
        if (!sessionStatsRef.current.sessionStart && data.seats) {
          const mySeat = data.seats.find(s => s.player?.id === userId);
          if (mySeat && mySeat.stack > 0) {
            sessionStatsRef.current.initialBuyIn = mySeat.stack;
            sessionStatsRef.current.sessionStart = Date.now();
          }
        }
        break;
      case 'hand_start':
        setResult(null); setMyCards(null); setLegalActions(null); setTimerState(null);
        requestState();
        break;
      case 'private_cards':
        setMyCards(data.holeCards);
        break;
      case 'your_turn':
        setLegalActions(data.legalActions);
        break;
      case 'action_required':
        if (data.playerId !== userId) setLegalActions(null);
        // Initial timer — remaining comes from first timer_update tick
        setTimerState({ playerId: data.playerId, remaining: data.turnTime || 30, isTimebank: false });
        // If it's our turn, fetch legal actions via authenticated API (not broadcast)
        if (String(data.playerId) === String(userId)) {
          requestState();
        }
        break;
      case 'action_processed':
        if (data.playerId === userId) setLegalActions(null);
        requestState();
        break;
      case 'timer_update':
        setTimerState(prev => ({ ...prev, ...data }));
        break;
      case 'showdown':
        setResult(data); setLegalActions(null); requestState();
        break;
      case 'hand_complete':
        setResult(data); setLegalActions(null);
        setLastHandResult(data);  // Persist for "last hand" review
        sessionStatsRef.current.handsPlayed++;
        if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = setTimeout(() => setResult(null), 5000);
        requestState();
        break;
      case 'payout':
        setResult(prev => prev ? { ...prev, ...data } : data);
        break;
      case 'chat_message':
        setChatMessages(prev => [...prev.slice(-100), data]);
        break;
      case 'table_error':
        setError(data.error); setTimeout(() => setError(null), 4000);
        break;
      case 'bbj_won':
        // BBJ jackpot was won! Pass to parent for overlay display
        setResult(prev => ({
          ...prev,
          bbj: data,
        }));
        break;
      case 'insurance_offered':
        // Insurance offer for leading player when all-in
        setResult(prev => ({ ...prev, insuranceOffer: data }));
        break;
      case 'insurance_purchased':
      case 'insurance_declined':
      case 'insurance_payout':
      case 'insurance_expired':
        setResult(prev => ({ ...prev, insurance: data }));
        break;
      case 'run_it_multiple':
      case 'run_it_twice':
      case 'run_it_thrice':
        // Multi-board runout data
        setResult(prev => ({ ...prev, runItMultiple: data }));
        requestState();
        break;
      case 'run_it_offer':
        // Both players asked to choose: twice, thrice, or decline
        setResult(prev => ({ ...prev, runItOffer: data }));
        break;
      case 'run_it_response':
        // A player responded to the offer
        setResult(prev => ({ ...prev, runItResponse: data }));
        break;
      case 'run_it_agreed':
        // Both agreed — boards will be dealt
        setResult(prev => ({ ...prev, runItOffer: null, runItAgreed: data }));
        break;
      case 'run_it_declined':
        // At least one declined — single board
        setResult(prev => ({ ...prev, runItOffer: null, runItDeclined: data }));
        break;
      case 'straddle_posted':
        requestState();
        break;
      case 'all_in_equity':
        // Store equity data for UI display
        setResult(prev => ({ ...prev, allInEquity: data }));
        break;
      case 'variant_changed':
        // Mixed game rotation — refresh state to get new variant config
        requestState();
        // Add chat message so players see the change
        setChatMessages(prev => [...prev.slice(-100), {
          type: 'system', message: `🔄 Game changed to ${data.variant?.toUpperCase() || 'next variant'}`,
        }]);
        break;
      case 'emoji_thrown':
        // Emoji/sticker thrown between players (handled by LivePokerTable)
        setChatMessages(prev => [...prev.slice(-100), { type: 'emoji', ...data }]);
        break;
      case 'cards_dealt':
      case 'blinds_posted':
        requestState();
        break;
      case 'street_start':
        // If all-in street has equity data attached, update it
        if (data?.allIn && data?.equity) {
          setResult(prev => ({ ...prev, allInEquity: data.equity }));
        }
        requestState();
        break;
      case 'seven_deuce_bonus':
        // 7-2 bonus game — winner collected bonus from other players
        setResult(prev => ({ ...prev, sevenDeuceBonus: data }));
        setTimeout(() => setResult(prev => prev ? { ...prev, sevenDeuceBonus: null } : prev), 6000);
        requestState();
        break;
      case 'bbj_triggered':
        // Bad Beat Jackpot hit — same as bbj_won
        setResult(prev => ({ ...prev, bbj: data }));
        break;
      case 'game_length_warning':
        setTableAlert({ type: 'warning', message: `Table closing in ${data.minutesRemaining || 5} minutes`, expiresAt: data.closeAt });
        break;
      case 'game_length_expired':
        setTableAlert({ type: 'expired', message: 'Game time has ended — table closing after current hand' });
        break;
      case 'game_length_extended':
        setTableAlert({ type: 'extended', message: `Game extended (${data.seatedPlayers} players still seated)` });
        setTimeout(() => setTableAlert(null), 8000);
        break;
      case 'table_paused':
        setTableAlert({ type: 'paused', message: 'Table paused by admin' });
        requestState();
        break;
      case 'table_resumed':
        setTableAlert(null);
        requestState();
        break;
      case 'cards_shown':
        requestState();
        break;
      case 'player_auto_removed':
        if (String(data.playerId) === String(userId)) {
          setTableAlert({ type: 'removed', message: `You were removed: ${data.reason?.replace(/_/g, ' ')}` });
          setTimeout(() => setTableAlert(null), 8000);
        }
        requestState();
        break;
      case 'nit_warning':
        if (String(data.playerId) === String(userId)) {
          setTableAlert({ type: 'warning', message: `⚠️ VPIP warning: ${data.vpip}% — play more hands or you'll be sat out` });
          setTimeout(() => setTableAlert(null), 8000);
        }
        break;
      case 'nit_sitout':
        if (String(data.playerId) === String(userId)) {
          setTableAlert({ type: 'removed', message: `Sat out for low VPIP (${data.vpip}%). Play more hands to continue.` });
          setTimeout(() => setTableAlert(null), 10000);
        }
        requestState();
        break;
      case 'config_updated':
        // Table settings changed by admin — refresh full state
        requestState();
        setChatMessages(prev => [...prev.slice(-100), {
          type: 'system', message: '⚙️ Table settings updated by admin',
        }]);
        break;
      case 'bomb_pot_starting':
        setChatMessages(prev => [...prev.slice(-100), {
          type: 'system', message: '💣 BOMB POT! Everyone posts!',
        }]);
        requestState();
        break;
      case 'player_kicked':
        if (String(data.playerId) === String(userId)) {
          setTableAlert({ type: 'removed', message: `You were kicked from the table: ${data.reason?.replace(/_/g, ' ') || 'admin decision'}` });
        }
        requestState();
        break;
      case 'seat_offered':
        if (String(data.playerId) === String(userId)) {
          setSeatOffer({ seatIndex: data.seatIndex, timeout: data.timeout || 30000, offeredAt: Date.now() });
          setTableAlert({ type: 'success', message: `🎉 A seat is available! Seat #${data.seatIndex + 1} reserved for you` });
        }
        requestState();
        break;
      case 'reservation_expired':
        if (String(data.playerId) === String(userId)) {
          setSeatOffer(null);
          setTableAlert({ type: 'warning', message: 'Seat reservation expired' });
          setTimeout(() => setTableAlert(null), 5000);
        }
        requestState();
        break;
      default:
        requestState();
        break;
    }
  }, [userId, requestState]);

  // ── Connect: Realtime for reads + HTTP heartbeat ───────────

  useEffect(() => {
    if (!supabase || !tableId || !userId) return;

    requestState(); // initial HTTP fetch

    const channel = supabase.channel(`table:${tableId}`);

    const events = [
      'table_state', 'hand_start', 'blinds_posted', 'cards_dealt',
      'street_start', 'action_required', 'action_processed',
      'timer_update', 'showdown', 'payout', 'hand_complete',
      'player_seated', 'player_left', 'player_sitting_out',
      'player_sitting_in', 'player_disconnected', 'player_reconnected',
      'chat_message', 'table_error', 'seat_offered', 'reservation_expired', 'bbj_won',
      'insurance_offered', 'insurance_purchased', 'insurance_declined',
      'insurance_payout', 'insurance_expired',
      'run_it_multiple', 'run_it_twice', 'run_it_thrice',
      'run_it_offer', 'run_it_response', 'run_it_agreed', 'run_it_declined',
      'straddle_posted', 'straddle_declared',
      'all_in_equity',
      'emoji_thrown',
      'bbj_triggered',
      'discard_required', 'card_discarded',
      'chips_added',
      'seven_deuce_bonus',
      'auto_topup_success', 'auto_topup_attempt',
      'auto_rebuy_success', 'auto_rebuy_attempt',
      'buyin_authorization_requested', 'buyin_authorized', 'buyin_rejected',
      'game_length_warning', 'game_length_expired', 'game_length_extended',
      'nit_warning', 'nit_sitout',
      'config_updated',
      'table_paused', 'table_resumed', 'table_waiting',
      'cards_shown', 'variant_changed',
      'player_auto_removed', 'bomb_pot_starting',
      'player_kicked',
    ];

    for (const evt of events) {
      channel.on('broadcast', { event: evt }, (payload) => {
        handleEvent(evt, payload.payload);
      });
    }

    // Private events — no longer sent via broadcast channel for security.
    // Cards and legal actions are fetched via authenticated GET /engine/state.
    // Keep table_state and table_error per-player subscriptions for reconnect support.
    for (const evt of ['table_state', 'table_error']) {
      channel.on('broadcast', { event: `${evt}:${userId}` }, (payload) => {
        handleEvent(evt, payload.payload);
      });
    }

    channel.on('presence', { event: 'sync' }, () => { });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        heartbeatRef.current = setInterval(() => {
          // Send GPS on every heartbeat — feeds the anti-cheat background
          // monitor for continuous proximity scanning. Fully automated.
          getGPSLocation(2000).then(gps => {
            _post('connect', {
              tableId, playerId: userId, type: 'heartbeat',
              latitude: gps?.lat || null,
              longitude: gps?.lng || null,
            }).catch(() => {});
          }).catch(() => {
            _post('connect', { tableId, playerId: userId, type: 'heartbeat' }).catch(() => {});
          });
        }, HEARTBEAT_MS);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Connection dropped mid-session — mark disconnected and try state recovery
        setConnected(false);
        console.warn(`[useTableConnection] Channel ${status} — will auto-reconnect`);
        // Supabase client auto-reconnects channels, but refresh state when it does
        setTimeout(() => requestState(), 2000);
      }
    });

    channelRef.current = channel;

    return () => {
      setConnected(false);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      _post('connect', { tableId, playerId: userId, type: 'disconnect' }).catch(() => { });
      channel.untrack().catch(() => { });
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, tableId, userId, handleEvent, requestState]);

  // ── Legacy send() — backward compat with LivePokerTable ────

  const send = useCallback((event, payload = {}) => {
    switch (event) {
      case 'player_action': return sendAction(payload.action);
      case 'sit_down': return sitDown(payload.seatIndex, payload.buyIn, payload);
      case 'stand_up': return standUp();
      case 'sit_out': return sitOut();
      case 'sit_in': return sitIn();
      case 'add_chips': return addChips(payload.amount);
      case 'send_chat': return sendChat(payload.message);
      case 'request_state': return requestState();
      case 'join_waitlist': return joinWaitlist(payload);
      case 'leave_waitlist': return leaveWaitlist();
      case 'declare_straddle': return _post('seat', { tableId, playerId: userId, action: 'declare_straddle' });
      case 'cancel_straddle': return _post('seat', { tableId, playerId: userId, action: 'cancel_straddle' });
      case 'discard': return _post('seat', { tableId, playerId: userId, action: 'discard', cardIndex: payload?.cardIndex });
      case 'set_auto_rebuy': return _post('seat', { tableId, playerId: userId, action: 'set_auto_rebuy', enabled: payload.enabled });
      case 'set_auto_topup': return _post('seat', { tableId, playerId: userId, action: 'set_auto_topup', enabled: payload.enabled, amount: payload.amount });
      case 'throw_emoji': return _post('action', { tableId, playerId: userId, type: 'throw_emoji', ...payload });
      case 'buy_insurance': return _post('action', { tableId, playerId: userId, type: 'buy_insurance', amount: payload.amount });
      case 'decline_insurance': return _post('action', { tableId, playerId: userId, type: 'decline_insurance' });
      case 'respond_run_it': return _post('seat', { tableId, playerId: userId, action: 'respond_run_it', choice: payload.choice });
      case 'show_cards': return _post('seat', { tableId, playerId: userId, action: 'show_cards' });
      case 'kick_player': return _post('seat', { tableId, playerId: userId, action: 'kick_player', targetPlayerId: payload.targetPlayerId, role: payload.role, reason: payload.reason });
      case 'invite_player': return _post('seat', { tableId, playerId: userId, action: 'invite_player', targetPlayerId: payload.targetPlayerId });
      case 'approve_buyin': return _post('seat', { tableId, playerId: userId, action: 'approve_buyin', targetPlayerId: payload.targetPlayerId });
      case 'reject_buyin': return _post('seat', { tableId, playerId: userId, action: 'reject_buyin', targetPlayerId: payload.targetPlayerId });
      default: console.warn('[useTableConnection] Unknown event:', event);
    }
  }, [sendAction, sitDown, standUp, sitOut, sitIn, addChips, sendChat, requestState, joinWaitlist, leaveWaitlist]);

  return {
    tableState, myCards, legalActions, timerState, chatMessages,
    result, lastHandResult, error, connected, tableAlert, seatOffer,
    sessionStats: sessionStatsRef.current,
    send, requestState,
    sendAction, sitDown, standUp, sitOut, sitIn, addChips, sendChat,
    joinWaitlist, leaveWaitlist,
  };
}

export default useTableConnection;
