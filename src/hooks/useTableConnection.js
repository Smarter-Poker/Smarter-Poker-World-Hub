/**
 * useTableConnection — React hook for Supabase Realtime table connection
 * 
 * Manages:
 *   - Channel subscription and cleanup
 *   - Heartbeat
 *   - State request on connect
 *   - Private card channel
 *   - Event dispatch to state
 * 
 * Usage:
 *   const { tableState, myCards, legalActions, timerState, chatMessages, error, send }
 *     = useTableConnection({ supabase, tableId, userId });
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const HEARTBEAT_MS = 10000;

export function useTableConnection({ supabase, tableId, userId }) {
  const [tableState, setTableState] = useState(null);
  const [myCards, setMyCards] = useState(null);
  const [legalActions, setLegalActions] = useState(null);
  const [timerState, setTimerState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  
  const channelRef = useRef(null);
  const resultTimeoutRef = useRef(null);
  
  // Send helper
  const send = useCallback((event, payload = {}) => {
    channelRef.current?.send({
      type: 'broadcast',
      event,
      payload: { playerId: userId, ...payload },
    });
  }, [userId]);
  
  // Request fresh state
  const requestState = useCallback(() => {
    send('request_state');
  }, [send]);
  
  // Event handler
  const handleEvent = useCallback((event, data) => {
    switch (event) {
      case 'table_state':
        setTableState(data);
        if (data.yourCards) setMyCards(data.yourCards);
        break;
      case 'hand_start':
        setResult(null);
        setMyCards(null);
        setLegalActions(null);
        break;
      case 'private_cards':
        setMyCards(data.holeCards);
        break;
      case 'your_turn':
        setLegalActions(data.legalActions);
        break;
      case 'action_required':
        if (data.playerId !== userId) setLegalActions(null);
        break;
      case 'action_processed':
        if (data.playerId === userId) setLegalActions(null);
        requestState();
        break;
      case 'timer_update':
        setTimerState(data);
        break;
      case 'showdown':
      case 'hand_complete':
        setResult(data);
        setLegalActions(null);
        if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = setTimeout(() => setResult(null), 5000);
        break;
      case 'chat_message':
        setChatMessages(prev => [...prev.slice(-100), data]);
        break;
      case 'table_error':
        setError(data.error);
        setTimeout(() => setError(null), 4000);
        break;
      default:
        // State-changing events — request fresh state
        requestState();
        break;
    }
  }, [userId, requestState]);
  
  // Connect
  useEffect(() => {
    if (!supabase || !tableId || !userId) return;
    
    const channel = supabase.channel(`table:${tableId}`);
    
    // Public server events
    const events = [
      'table_state', 'hand_start', 'blinds_posted', 'cards_dealt',
      'street_start', 'action_required', 'action_processed',
      'timer_update', 'showdown', 'payout', 'hand_complete',
      'player_seated', 'player_left', 'player_sitting_out',
      'player_sitting_in', 'player_disconnected', 'player_reconnected',
      'chat_message', 'table_error', 'seat_offered',
    ];
    
    for (const evt of events) {
      channel.on('broadcast', { event: evt }, (payload) => {
        handleEvent(evt, payload.payload);
      });
    }
    
    // Private events
    for (const evt of ['private_cards', 'your_turn', 'table_state', 'table_error']) {
      channel.on('broadcast', { event: `${evt}:${userId}` }, (payload) => {
        handleEvent(evt, payload.payload);
      });
    }
    
    // Presence
    channel.on('presence', { event: 'sync' }, () => {});
    
    // Subscribe
    let hb;
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        
        // Request state
        channel.send({
          type: 'broadcast',
          event: 'request_state',
          payload: { playerId: userId },
        });
        
        // Heartbeat
        hb = setInterval(() => {
          channel.send({
            type: 'broadcast',
            event: 'heartbeat',
            payload: { playerId: userId },
          });
        }, HEARTBEAT_MS);
      }
    });
    
    channelRef.current = channel;
    
    return () => {
      setConnected(false);
      if (hb) clearInterval(hb);
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, tableId, userId, handleEvent]);
  
  return {
    tableState,
    myCards,
    legalActions,
    timerState,
    chatMessages,
    result,
    error,
    connected,
    send,
    requestState,
  };
}

export default useTableConnection;
