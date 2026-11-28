/**
 * CLUB ARENA SESSIONS
 *
 * The player's finished Club Arena cash sittings and tournaments, read from
 * Club Arena's own chip journal under the player's signed-in session, with a
 * one-tap (or all-at-once) log into the bankroll ledger.
 *
 * Amounts are shown as chips: Club Arena plays for club chips, not dollars.
 * Logging one is an explicit offer at the rate the owner recorded for the
 * platform (1 chip = $1.00); see src/lib/bankroll/clubArenaSessions.mjs for
 * the evidence and the dedupe marker.
 *
 * ClubArenaSessionsPanel  the full list (mounted in the Log sheet)
 * ClubArenaSessionsPrompt the dashboard card, shown only when something is
 *                         waiting to be logged (or the read failed)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';
import { createLedgerEntry } from '../../lib/bankroll/bankrollSelectors';
import { getOrCreateLocation } from '../../lib/bankroll/locationMemory';
import { localDayOffset, parseLedgerDay } from '../../lib/bankroll/localDates.mjs';
import {
  CHIP_RATE_NOTE,
  fetchClubArenaSessions,
  externalRefOf,
  fetchLoggedMarkers,
  formatChipCents,
  isAlreadyLoggedError,
  isLogged,
  ledgerEntryFor,
  unloggedSessions,
  venueName,
} from '../../lib/bankroll/clubArenaSessions.mjs';

const DEFAULT_DAYS = 30;

function minutesText(minutes) {
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function dayText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Load, refresh and log. One instance per mounted surface. */
export function useClubArenaSessions(userId, initialSinceDay) {
  const [sinceDay, setSinceDay] = useState(initialSinceDay || localDayOffset(DEFAULT_DAYS));
  const [state, setState] = useState({ loading: true, error: null, sessions: [], notes: null });
  const [logging, setLogging] = useState(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!userId) { setState({ loading: false, error: null, sessions: [], notes: null }); return; }
    const mine = ++generation.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { sessions, notes } = await fetchClubArenaSessions(supabase, userId, sinceDay);
      if (mine === generation.current) setState({ loading: false, error: null, sessions, notes });
    } catch (error) {
      if (mine === generation.current) setState({ loading: false, error: error?.message || String(error), sessions: [], notes: null });
    }
  }, [userId, sinceDay]);

  useEffect(() => { void load(); }, [load]);

  const log = useCallback(async (targets) => {
    if (!userId || logging) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.error('You Are Offline. Connect To Log Club Arena Sessions.');
      return;
    }
    setLogging(targets.length === 1 ? targets[0].marker : 'all');
    let done = 0;
    try {
      // Read the ledger again right before writing: another tab or device may
      // have logged some of these since the list was drawn. The unique
      // (user_id, external_ref) index is what finally keeps it single: an
      // insert it refuses (23505) was logged elsewhere a moment ago.
      const fresh = await fetchLoggedMarkers(supabase, userId);
      const venueIds = new Map();
      for (const session of targets) {
        const ref = externalRefOf(session);
        if (isLogged(fresh, session)) continue;
        const venue = venueName(session.clubName);
        if (!venueIds.has(venue)) venueIds.set(venue, await getOrCreateLocation(userId, venue, 'online'));
        try {
          await createLedgerEntry(userId, ledgerEntryFor(session, { locationId: venueIds.get(venue) }));
          done += 1;
        } catch (error) {
          if (!isAlreadyLoggedError(error)) throw error;
        }
        fresh.add(ref);
        setState((prev) => ({ ...prev, sessions: prev.sessions.map((s) => (s.marker === session.marker ? { ...s, logged: true } : s)) }));
      }
      setState((prev) => ({ ...prev, sessions: prev.sessions.map((s) => (isLogged(fresh, s) ? { ...s, logged: true } : s)) }));
      if (done > 0) toast.success(done === 1 ? 'Club Arena Session Logged' : `${done} Club Arena Sessions Logged`);
      else toast.info(targets.length === 1 ? 'That Session Was Already Logged' : 'Those Sessions Were Already Logged');
    } catch (error) {
      console.warn('[ClubArenaSessions] Log failed:', error);
      toast.error(done > 0 ? `${done} Logged, Then One Failed. Try Again.` : 'Could Not Log That Session. Try Again.');
    } finally {
      setLogging(null);
      if (done > 0 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
    }
  }, [userId, logging]);

  return { ...state, sinceDay, setSinceDay, reload: load, log, logging };
}

function LeftOutNotes({ notes }) {
  if (!notes) return null;
  const lines = [];
  const n = (count, one, many) => (count === 1 ? one : many);
  if (notes.diamonds) lines.push(`${notes.diamonds} Diamond Arena ${n(notes.diamonds, 'Result Is', 'Results Are')} Left Out: Diamonds Are An In-App Currency, Not Bankroll Money.`);
  if (notes.openSittings) lines.push(`${notes.openSittings} Cash ${n(notes.openSittings, 'Seat Is', 'Seats Are')} Still Open And Will Show Once You Cash Out.`);
  if (notes.unfinishedTournaments) lines.push(`${notes.unfinishedTournaments} ${n(notes.unfinishedTournaments, 'Tournament Has', 'Tournaments Have')} Not Finished Yet.`);
  if (notes.cancelledTournaments) lines.push(`${notes.cancelledTournaments} Cancelled ${n(notes.cancelledTournaments, 'Tournament Was', 'Tournaments Were')} Refunded And Left Out.`);
  if (notes.unreadableTournaments) lines.push(`${notes.unreadableTournaments} ${n(notes.unreadableTournaments, 'Tournament Could', 'Tournaments Could')} Not Be Read And ${n(notes.unreadableTournaments, 'Is', 'Are')} Left Out.`);
  if (lines.length === 0) return null;
  return (
    <ul data-testid="club-arena-left-out" style={styles.notes}>
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

function SessionRow({ session, onLog, busy }) {
  const net = session.netCents;
  const detail = session.kind === 'cash'
    ? [session.stakes, minutesText(session.minutes)].filter(Boolean).join(' · ')
    : [session.gameName, session.position ? `Finished ${session.position}` : null, minutesText(session.minutes)].filter(Boolean).join(' · ');
  return (
    <li style={styles.row} data-testid="club-arena-session">
      <div style={styles.rowMain}>
        <div style={styles.rowTitle}>
          <span style={styles.kind}>{session.kind === 'cash' ? 'Cash' : 'MTT'}</span>
          <span style={styles.ellipsis}>{session.title}</span>
        </div>
        <div style={styles.rowSub}>
          <span>{dayText(session.startAt)}</span>
          {session.clubName ? <span style={styles.ellipsis}>{session.clubName}</span> : null}
        </div>
        {detail ? <div style={styles.rowSub}>{detail}</div> : null}
        <div style={styles.amounts}>
          <span>In {formatChipCents(session.inCents)}</span>
          <span>Out {formatChipCents(session.outCents)}</span>
          <strong style={{ color: net > 0 ? '#4ade80' : net < 0 ? '#f87171' : '#cbd5e1' }}>{formatChipCents(net, { signed: true })}</strong>
        </div>
      </div>
      <div style={styles.rowAction}>
        {session.logged ? (
          <span style={styles.logged} data-testid="club-arena-logged">Logged</span>
        ) : (
          <button type="button" className="sd-button" style={styles.logButton} disabled={busy} onClick={() => onLog([session])}>
            {busy ? 'Logging...' : 'Log'}
          </button>
        )}
      </div>
    </li>
  );
}

/** The full list. Pass `data` to share a hook instance with the prompt. */
export function ClubArenaSessionsPanel({ userId, data: shared }) {
  const own = useClubArenaSessions(shared ? null : userId);
  const data = shared || own;
  const { loading, error, sessions, notes, sinceDay, setSinceDay, reload, log, logging } = data;
  const waiting = unloggedSessions(sessions);

  if (!userId) return null;
  return (
    <section className="sd-panel" aria-label="Club Arena Sessions" data-testid="club-arena-sessions" style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>Club Arena Sessions</h3>
        <label style={styles.since}>
          <span>Since</span>
          <input type="date" value={sinceDay} max={localDayOffset(0)} onChange={(e) => e.target.value && setSinceDay(e.target.value)} style={styles.dateInput} />
        </label>
      </div>
      <p style={styles.rate} data-testid="club-arena-rate-note">{CHIP_RATE_NOTE}</p>

      {loading ? (
        <p style={styles.muted}>Reading Your Club Arena History...</p>
      ) : error ? (
        <div role="alert" style={styles.error} data-testid="club-arena-error">
          <span>Could Not Read Your Club Arena Sessions. {error}</span>
          <button type="button" className="sd-button" onClick={reload}>Retry</button>
        </div>
      ) : sessions.length === 0 ? (
        <p style={styles.muted}>No Finished Club Arena Sessions Since {dayText(parseLedgerDay(sinceDay))}.</p>
      ) : (
        <>
          {waiting.length > 1 && (
            <button type="button" className="sd-button" style={styles.logAll} disabled={Boolean(logging)} onClick={() => log(waiting)} data-testid="club-arena-log-all">
              {logging === 'all' ? 'Logging...' : `Log All ${waiting.length} At 1 Chip = $1.00`}
            </button>
          )}
          <ul style={styles.list}>
            {sessions.map((session) => (
              <SessionRow key={session.marker} session={session} onLog={log} busy={logging === session.marker || logging === 'all'} />
            ))}
          </ul>
        </>
      )}
      {!loading && !error && <LeftOutNotes notes={notes} />}
    </section>
  );
}

/** Dashboard card: says how many sessions wait, and opens the list in place. */
export function ClubArenaSessionsPrompt({ userId }) {
  const data = useClubArenaSessions(userId);
  const [open, setOpen] = useState(false);
  const waiting = unloggedSessions(data.sessions).length;

  if (!userId || data.loading) return open ? <ClubArenaSessionsPanel userId={userId} data={data} /> : null;
  if (data.error) {
    return (
      <div role="alert" className="sd-panel" style={styles.promptError} data-testid="club-arena-prompt-error">
        <span>Could Not Check Your Club Arena Sessions.</span>
        <button type="button" className="sd-button" onClick={data.reload}>Retry</button>
      </div>
    );
  }
  if (waiting === 0 && !open) return null;
  if (open) {
    return (
      <div>
        <ClubArenaSessionsPanel userId={userId} data={data} />
        <button type="button" className="sd-button" style={styles.hide} onClick={() => setOpen(false)}>Hide Club Arena Sessions</button>
      </div>
    );
  }
  return (
    <div className="sd-panel" style={styles.prompt} data-testid="club-arena-prompt">
      <span style={styles.promptText}>
        {waiting === 1 ? '1 Club Arena Session Is Not In Your Bankroll Yet.' : `${waiting} Club Arena Sessions Are Not In Your Bankroll Yet.`}
      </span>
      <button type="button" className="sd-button" onClick={() => setOpen(true)}>Review</button>
    </div>
  );
}

const styles = {
  panel: { padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' },
  since: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1' },
  dateInput: { background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '4px 6px', fontSize: 13, maxWidth: 150 },
  rate: { margin: 0, fontSize: 12, lineHeight: 1.4, color: '#94a3b8' },
  muted: { margin: 0, fontSize: 13, color: '#94a3b8' },
  error: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13, color: '#fca5a5', fontWeight: 600 },
  logAll: { alignSelf: 'stretch', minHeight: 44 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #1e293b', minWidth: 0 },
  rowMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 },
  rowTitle: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' },
  kind: { flex: 'none', fontSize: 12, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#1e3a8a', color: '#bfdbfe' },
  ellipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  rowSub: { display: 'flex', gap: 8, fontSize: 12, color: '#94a3b8', minWidth: 0, flexWrap: 'wrap' },
  amounts: { display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#cbd5e1' },
  rowAction: { flex: 'none' },
  logButton: { minWidth: 64, minHeight: 44 },
  logged: { fontSize: 12, fontWeight: 700, color: '#4ade80' },
  notes: { margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.5, color: '#94a3b8' },
  prompt: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, flexWrap: 'wrap' },
  promptText: { fontSize: 14, fontWeight: 600, color: '#f1f5f9', flex: '1 1 200px' },
  promptError: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, flexWrap: 'wrap', fontSize: 13, color: '#fca5a5', fontWeight: 600 },
  hide: { marginTop: 8 },
};

export default ClubArenaSessionsPanel;
