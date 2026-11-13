/**
 * The signed-in person's presence heartbeat on the World Hub, mounted ONCE
 * from pages/_app.js (<PresenceHeartbeat />). The rules live in
 * src/lib/presenceHeartbeat.mjs; this only wires them to the browser and to
 * fn_update_presence, the same door Club Arena's heartbeat uses (it stamps
 * is_online and last_seen together, for the caller's own row).
 */
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { startPresenceHeartbeat } from '../lib/presenceHeartbeat.mjs';

export function sendPresence(userId, online) {
  // Promise.resolve sends the request exactly once.
  return Promise.resolve(
    supabase.rpc('fn_update_presence', { p_user_id: userId, p_is_online: online })
  );
}

export function usePresenceHeartbeat(userId) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    return startPresenceHeartbeat(userId, {
      send: sendPresence,
      doc: document,
      win: window,
      storage: window.localStorage,
      onError: (err) => console.warn('[Presence] Heartbeat failed:', err?.message || err),
    });
  }, [userId]);
}

export default usePresenceHeartbeat;
