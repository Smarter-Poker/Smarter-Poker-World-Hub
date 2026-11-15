import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import { activePokerSeats } from './activePokerSeats.mjs';
import styles from './ActivePokerSeatLink.module.css';

/** The World Hub must restore the way back even after a full browser reload. */
export default function ActivePokerSeatLink() {
  const [state, setState] = useState({ actor: null, seats: [], failed: false });
  const refreshRef = useRef(() => {});
  useEffect(() => {
    let alive = true;
    let actor = null;
    let revision = 0;
    let channel = null;
    const load = async () => {
      const id = actor;
      const request = ++revision;
      if (!id) return;
      try {
        const [seats, sessions] = await Promise.all([
          supabase.from('table_seats').select('id,table_id,left_at,tables(name,is_deleted,lifecycle,cluster_id)').eq('user_id', id).is('left_at', null),
          supabase.rpc('fn_lightning_my_sessions'),
        ]);
        if (seats.error) throw seats.error;
        if (sessions.error) throw sessions.error;
        if (alive && actor === id && request === revision)
          setState({ actor: id, seats: activePokerSeats(seats.data, sessions.data), failed: false });
      } catch (error) {
        console.error('ActivePokerSeatLink', error);
        if (alive && actor === id && request === revision)
          setState({ actor: id, seats: [], failed: true });
      }
    };
    const accept = id => {
      if (!alive || id === actor) return;
      actor = id;
      ++revision;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      setState({ actor: id, seats: [], failed: false });
      if (!id) return;
      void load();
      channel = supabase.channel(`world-return-seat:${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'table_seats', filter: `user_id=eq.${id}` }, load)
        .subscribe();
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => accept(session?.user?.id || null));
    const authRevision = revision;
    Promise.resolve(getAuthUser()).then(user => {
      if (alive && revision === authRevision) accept(user?.id || null);
    }).catch(error => console.error('ActivePokerSeatLink.auth', error));
    const resume = () => { if (document.visibilityState === 'visible') void load(); };
    refreshRef.current = load;
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      alive = false;
      ++revision;
      data?.subscription?.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      refreshRef.current = () => {};
    };
  }, []);
  if (!state.actor || (!state.failed && !state.seats.length)) return null;
  return <aside className={styles.dock} aria-label="Return To Your Poker Seat">
    <span aria-live="polite">{state.failed ? 'Could Not Check Your Active Seats' : 'Your Game Is Still Open'}</span>
    {state.failed
      ? <button type="button" onClick={() => refreshRef.current()}>Retry</button>
      : state.seats.map(seat => <a key={seat.id} href={seat.href}>Sit Down: {seat.name}</a>)}
  </aside>;
}
