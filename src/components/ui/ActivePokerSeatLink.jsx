import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import { activePokerSeats } from './activePokerSeats.mjs';
import styles from './ActivePokerSeatLink.module.css';

/** The World Hub must restore the way back even after a full browser reload. */
export default function ActivePokerSeatLink() {
  const [state, setState] = useState({ actor: null, seats: [], failed: false, following: null, notice: null });
  const refreshRef = useRef(() => {});
  const followRef = useRef(async () => {});
  useEffect(() => {
    let alive = true;
    let actor = null;
    let revision = 0;
    let channel = null;
    let returnIntent = 0;
    let returning = false;
    const load = async () => {
      const id = actor;
      const request = ++revision;
      if (!id) return;
      try {
        const [seats, sessions] = await Promise.all([
          supabase.from('table_seats').select('id,table_id,left_at,tables(name,is_deleted,status,lifecycle,cluster_id,tournament_id)').eq('user_id', id).is('left_at', null),
          supabase.rpc('fn_lightning_my_sessions'),
        ]);
        if (seats.error) throw seats.error;
        if (sessions.error) throw sessions.error;
        if (alive && actor === id && request === revision) {
          const current = activePokerSeats(seats.data, sessions.data);
          setState(previous => ({ ...previous, actor: id, seats: current, failed: false }));
          return { status: 'ready', seats: current };
        }
      } catch (error) {
        console.error('ActivePokerSeatLink', error);
        if (alive && actor === id && request === revision) {
          setState(previous => ({ ...previous, actor: id, seats: [], failed: true }));
          return { status: 'failed' };
        }
      }
      return { status: 'superseded' };
    };
    // A sleeping page can miss seat events. The explicit return owns a fresh
    // read before navigation, rather than trusting the previously painted href.
    followRef.current = async selected => {
      if (returning || !actor) return;
      const id = actor;
      const intent = ++returnIntent;
      returning = true;
      setState(previous => ({ ...previous, following: selected.id, notice: null }));
      try {
        const result = await load();
        if (!alive || actor !== id || intent !== returnIntent) return;
        if (result?.status === 'ready') {
          const target = result.seats.find(seat => seat.id === selected.id || (selected.gameId && seat.gameId === selected.gameId));
          if (target) window.location.assign(target.href);
          else setState(previous => ({ ...previous, notice: 'Your Previous Seat Is No Longer Active' }));
        } else if (result?.status === 'superseded') {
          setState(previous => ({ ...previous, notice: 'Your Seats Changed. Select Your Game.' }));
        }
      } finally {
        if (intent === returnIntent) {
          returning = false;
          if (alive) setState(previous => ({ ...previous, following: null }));
        }
      }
    };
    const accept = id => {
      if (!alive || id === actor) return;
      actor = id;
      ++revision;
      ++returnIntent;
      returning = false;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      setState({ actor: id, seats: [], failed: false, following: null, notice: null });
      if (!id) return;
      void load();
      channel = supabase.channel(`world-return-seat:${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'table_seats', filter: `user_id=eq.${id}` }, load)
        .subscribe(status => { if (status === 'SUBSCRIBED' && actor === id) void load(); });
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => accept(session?.user?.id || null));
    const authRevision = revision;
    Promise.resolve(getAuthUser()).then(user => {
      if (alive && revision === authRevision) accept(user?.id || null);
    }).catch(error => console.error('ActivePokerSeatLink.auth', error));
    const resume = () => { if (document.visibilityState === 'visible') void load(); };
    refreshRef.current = () => {
      setState(previous => ({ ...previous, notice: null }));
      return load();
    };
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
      followRef.current = async () => {};
      ++returnIntent;
    };
  }, []);
  if (!state.actor || (!state.failed && !state.notice && !state.seats.length)) return null;
  return <aside className={styles.dock} aria-label="Return To Your Poker Seat">
    <span aria-live="polite">{state.failed ? 'Could Not Check Your Active Seats' : state.notice || 'Your Game Is Still Open'}</span>
    {state.failed
      ? <button type="button" onClick={() => refreshRef.current()}>Retry</button>
      : <>{state.seats.map(seat => <button type="button" key={seat.id} disabled={Boolean(state.following)} aria-busy={state.following === seat.id} onClick={() => followRef.current(seat)}>{state.following === seat.id ? 'Checking Seat...' : `Sit Down: ${seat.name}`}</button>)}{state.notice && <button type="button" onClick={() => refreshRef.current()}>Retry</button>}</>}
  </aside>;
}
