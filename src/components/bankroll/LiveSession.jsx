// Live session clock (Start Session at the table, Rebuy / Add On as they
// happen, End Session with the cash-out). The logic and its tests live in
// src/lib/bankroll/liveSession.mjs. Ending hands the page a prefill for the
// normal Log form: this component never writes a ledger row itself.
//
// The running record is stored on this device only, per user
// (liveSessionKey). Signed out, or signed in as someone else, nothing shows.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import {
  LIVE_SESSION_CATEGORIES,
  LIVE_SESSION_EVENT,
  addTopUp,
  dueTimeAlerts,
  elapsedMs,
  endLiveSession,
  formatElapsed,
  investedCents,
  liveSessionKey,
  markAlerts,
  readLiveSession,
  resumeLiveSession,
  startLiveSession,
  startWarnings,
  toLogPrefill,
  topUpCents,
  topUpWarnings,
  warningText,
  writeLiveSession,
} from '../../lib/bankroll/liveSession.mjs';
import { toCents } from '../../lib/bankroll/ledgerMath.mjs';
import { localDay } from '../../lib/bankroll/localDates.mjs';
import { formatCentsCurrency } from '../../lib/bankroll/currencyUtils';
import { fetchBankrollRules, fetchReportLedger, getActiveTrip } from '../../lib/bankroll/bankrollSelectors';
import { detectNearbyLocation } from '../../lib/bankroll/locationMemory';
import VenueSelector from './VenueSelector';
import toast from '../../stores/toastStore';
import styles from './BankrollDock.module.css';

function deviceStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (_) { return null; }
}

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LIVE_SESSION_EVENT));
}

function useLiveSessionRecord(userId) {
  const [session, setSession] = useState(null);
  const reread = useCallback(() => setSession(readLiveSession(deviceStorage(), userId)), [userId]);
  useEffect(() => {
    reread();
    if (!userId) return undefined;
    const key = liveSessionKey(userId);
    const onStorage = (e) => { if (e.key === key || e.key === null) reread(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(LIVE_SESSION_EVENT, reread);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LIVE_SESSION_EVENT, reread);
    };
  }, [userId, reread]);
  const save = useCallback((next) => {
    if (!userId) return false;
    const ok = writeLiveSession(deviceStorage(), userId, next);
    if (!ok && next) toast.error('This Device Could Not Save The Session. Keep This Tab Open.');
    setSession(next);
    announce();
    return true;
  }, [userId]);
  return [session, save];
}

function dollarsText(value) {
  return /^\d*(?:\.\d{0,2})?$/.test(value);
}

function notifyHidden(title, body) {
  try {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    // A local notification from this page only: no service worker, no push.
    new Notification(title, { body, tag: 'bankroll-live-session' });
  } catch (_) {
    // Some phones only allow notifications from a service worker; the toast
    // and the banner are still shown when the player comes back.
  }
}

function Sheet({ title, onClose, children, labelId }) {
  const dialog = useRef(null);
  useModalHistory(true, onClose);
  const scrim = useScrimDismiss(onClose);
  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement;
    if (node && !node.open && node.showModal) node.showModal();
    return () => { if (node && node.open) node.close(); opener?.focus?.({ preventScroll: true }); };
  }, []);
  return (
    <dialog ref={dialog} className={styles.sheet} aria-labelledby={labelId}
      onCancel={(e) => { e.preventDefault(); onClose(); }} {...scrim}>
      <div className={styles.form}>
        <div className={styles.heading}>
          <h2 id={labelId}>{title}</h2>
          <button type="button" className={`bankroll-modal-close ${styles.close}`} aria-label={`Close ${title}`} onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function Warnings({ list, displayEUR }) {
  if (!list || list.length === 0) return null;
  return list.map((w) => <p key={w.rule} className={styles.warn} role="alert">{warningText(w, moneyFormatter(displayEUR))}</p>);
}

// Rule warnings follow Display EUR, like the page's rule alert sheet.
const moneyFormatter = (displayEUR) => (cents) => formatCentsCurrency(cents, displayEUR);

/** Today's saved rows for the session's day, or null when they could not be read. */
async function todaysRows(userId, day) {
  try {
    return await fetchReportLedger(userId, { startDate: day, endDate: day, includeExpenses: true });
  } catch (error) {
    console.warn('[LiveSession] Could not read today\'s sessions:', error);
    return null;
  }
}

function StartSheet({ userId, balance, displayEUR, initialCategory, onClose, onStart }) {
  const [category, setCategory] = useState(
    LIVE_SESSION_CATEGORIES.some((c) => c.id === initialCategory) ? initialCategory : 'poker_cash',
  );
  const [detail, setDetail] = useState('');
  const [buyIn, setBuyIn] = useState('');
  const [venue, setVenue] = useState({ location_id: '', location_name: '', venue_type: 'casino', poker_venue_id: null, venue_lat: null, venue_lng: null });
  const [tripId, setTripId] = useState(null);
  const [warnings, setWarnings] = useState(null);
  const [checking, setChecking] = useState(false);
  const meta = LIVE_SESSION_CATEGORIES.find((c) => c.id === category);

  // The same venue memory as the Log form: the player's saved venue nearby,
  // else the active trip's venue.
  useEffect(() => {
    let cancelled = false;
    getActiveTrip(userId).then((trip) => {
      if (cancelled || !trip) return;
      setTripId(trip.id);
      if (trip.location_id) setVenue((v) => (v.location_name ? v : { ...v, location_id: trip.location_id, location_name: trip.location_name || '' }));
    }).catch((e) => console.warn('[LiveSession] Active trip not read:', e?.message || e));
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const found = await detectNearbyLocation(userId, pos.coords.latitude, pos.coords.longitude).catch(() => null);
        if (!cancelled && found) setVenue((v) => ({ ...v, location_id: found.id, location_name: found.name }));
      }, () => {});
    }
    return () => { cancelled = true; };
  }, [userId]);

  const cents = toCents(buyIn);
  const valid = buyIn !== '' && (cents > 0 || category === 'poker_mtt');

  async function submit(e) {
    e.preventDefault();
    if (!valid || checking) return;
    if (warnings === null) {
      setChecking(true);
      const now = Date.now();
      const [rules, today] = await Promise.all([
        fetchBankrollRules(userId).catch(() => null),
        todaysRows(userId, localDay(new Date(now))),
      ]);
      setChecking(false);
      const found = rules && today
        ? startWarnings({ rules, userId, category, buyInCents: cents, now, todayEntries: today, balanceCents: Number.isFinite(balance) ? toCents(balance) : null })
        : [];
      if (!rules || !today) toast.error('Your Bankroll Rules Could Not Be Checked. Check Your Connection.');
      if (found.length > 0) { setWarnings(found); return; }
    }
    onStart({ category, detail, venue, tripId, buyInCents: cents });
  }

  return (
    <Sheet title="Start Session" onClose={onClose} labelId="bankroll-live-start-title">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <fieldset className={styles.chips}>
          <legend>Category</legend>
          {LIVE_SESSION_CATEGORIES.map((c) => (
            <button key={c.id} type="button" className="sd-button" aria-pressed={category === c.id}
              onClick={() => { setCategory(c.id); setWarnings(null); }}>{c.label}</button>
          ))}
        </fieldset>
        <div className={styles.field}>
          <label htmlFor="bankroll-live-venue">Venue</label>
          <VenueSelector inputId="bankroll-live-venue" value={venue.location_name} venueType={venue.venue_type} userId={userId}
            onChange={(name, venueType, pokerVenueId, lat, lng) => setVenue({
              location_id: '', location_name: name, venue_type: venueType, poker_venue_id: pokerVenueId, venue_lat: lat, venue_lng: lng,
            })} />
        </div>
        <label className={styles.field}>{meta.detailLabel}
          <input type="text" value={detail} maxLength={120} placeholder={meta.placeholder} onChange={(e) => setDetail(e.target.value)} />
        </label>
        <label className={styles.field}>Buy-In (USD)
          <input type="text" inputMode="decimal" autoComplete="off" value={buyIn} placeholder="0.00"
            onChange={(e) => { if (dollarsText(e.target.value)) { setBuyIn(e.target.value); setWarnings(null); } }} />
        </label>
        <Warnings list={warnings} displayEUR={displayEUR} />
        <p className={styles.note}>The Clock Runs On This Device. Nothing Is Saved Until You End The Session And Save The Log.</p>
        <div className={styles.sheetActions}>
          <button type="button" className="sd-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="sd-button sd-primary" disabled={!valid || checking}>
            {checking ? 'Checking Rules…' : warnings && warnings.length ? 'Start Anyway' : 'Start Session'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function TopUpSheet({ userId, session, kind, balance, displayEUR, onClose, onAdd }) {
  const fixed = session.category === 'poker_mtt' && kind === 'rebuy';
  const [amount, setAmount] = useState('');
  const [warnings, setWarnings] = useState(null);
  const [checking, setChecking] = useState(false);
  const cents = topUpCents(session, kind, toCents(amount));
  const valid = cents > 0;
  const label = kind === 'rebuy' ? 'Rebuy' : 'Add On';

  async function submit(e) {
    e.preventDefault();
    if (!valid || checking) return;
    if (warnings === null) {
      setChecking(true);
      const now = Date.now();
      const [rules, today] = await Promise.all([
        fetchBankrollRules(userId).catch(() => null),
        todaysRows(userId, localDay(new Date(session.startedAt))),
      ]);
      setChecking(false);
      if (!rules || !today) toast.error('Your Bankroll Rules Could Not Be Checked. Check Your Connection.');
      const found = rules && today
        ? topUpWarnings({ rules, session, addCents: cents, now, todayEntries: today, balanceCents: Number.isFinite(balance) ? toCents(balance) : null })
        : [];
      if (found.length > 0) { setWarnings(found); return; }
    }
    onAdd(kind, cents, warnings || []);
  }

  return (
    <Sheet title={label} onClose={onClose} labelId="bankroll-live-topup-title">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        {fixed ? (
          <p className={styles.note}>A Tournament Rebuy Is One More Buy-In: <strong>{formatCentsCurrency(cents, false)}</strong> (USD).</p>
        ) : (
          <label className={styles.field}>{label} Amount (USD)
            <input type="text" inputMode="decimal" autoComplete="off" value={amount} placeholder="0.00" autoFocus
              onChange={(e) => { if (dollarsText(e.target.value)) { setAmount(e.target.value); setWarnings(null); } }} />
          </label>
        )}
        <Warnings list={warnings} displayEUR={displayEUR} />
        <div className={styles.sheetActions}>
          <button type="button" className="sd-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="sd-button sd-primary" disabled={!valid || checking}>
            {checking ? 'Checking Rules…' : warnings && warnings.length ? `${label} Anyway` : `Add ${label}`}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function EndSheet({ session, displayEUR, discardOnly = false, onClose, onEnd, onDiscard }) {
  const [cashOut, setCashOut] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(discardOnly);
  const valid = cashOut !== '' && dollarsText(cashOut);
  // One sheet for both steps, so the phone back gesture has one history entry.
  return (
    <Sheet title={confirmDiscard ? 'Discard Session?' : 'End Session'} onClose={confirmDiscard && !discardOnly ? () => setConfirmDiscard(false) : onClose} labelId="bankroll-live-end-title">
      {confirmDiscard ? (
        <>
          <p className={styles.note}>The Clock And Its {session.buyIns.length} {session.buyIns.length === 1 ? 'Buy-In Are' : 'Buy-Ins Are'} Removed From This Device. Nothing Is Saved To Your Bankroll.</p>
          <div className={styles.sheetActions}>
            <button type="button" className="sd-button" onClick={discardOnly ? onClose : () => setConfirmDiscard(false)}>Keep Session</button>
            <button type="button" className="sd-button sd-primary" onClick={onDiscard}>Discard</button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (valid) onEnd(toCents(cashOut)); }} style={{ display: 'grid', gap: 14 }}>
          <p className={styles.note}>Total In: <strong>{formatCentsCurrency(investedCents(session), displayEUR)}</strong></p>
          <label className={styles.field}>Cash-Out (USD)
            <input type="text" inputMode="decimal" autoComplete="off" value={cashOut} placeholder="0.00" autoFocus
              onChange={(e) => { if (dollarsText(e.target.value)) setCashOut(e.target.value); }} />
          </label>
          <p className={styles.note}>Next You Review It In The Log Form And Save It There.</p>
          <div className={styles.sheetActions}>
            <button type="button" className="sd-button" onClick={() => setConfirmDiscard(true)}>Discard</button>
            <button type="submit" className="sd-button sd-primary" disabled={!valid}>End And Log</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

/**
 * @param {object} props
 * @param {string|null} props.userId
 * @param {boolean} props.displayEUR
 * @param {number|null} props.balance   Bankroll Balance (USD dollars) before this session
 * @param {boolean|string} props.startOpen  the page asked for the Start sheet (a category id preselects it)
 * @param {() => void} props.onStartClose
 * @param {(prefill) => void} props.onLog  open the normal Log form with this prefill
 */
export default function LiveSession({ userId, displayEUR = false, balance = null, startOpen = false, onStartClose, onLog }) {
  const [session, save] = useLiveSessionRecord(userId);
  const [sheet, setSheet] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [banner, setBanner] = useState([]);
  const [rules, setRules] = useState(null);
  const running = Boolean(session && !session.ended);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // A different user, or signed out: nothing from before is shown.
  useEffect(() => { setSheet(null); setBanner([]); setRules(null); }, [userId]);

  useEffect(() => {
    if (!startOpen) return;
    if (!userId) { onStartClose?.(); return; }
    if (sessionRef.current) {
      toast.info('A Session Is Already Running. End It Before Starting Another.');
      onStartClose?.();
      return;
    }
    setSheet('start');
  }, [startOpen, userId, onStartClose]);

  // The clock. One interval, only while a session runs, cleared with the page.
  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // The rules this session is judged by, read once per session.
  useEffect(() => {
    if (!userId || !session || session.ended) return undefined;
    let cancelled = false;
    fetchBankrollRules(userId)
      .then((r) => { if (!cancelled) setRules(r || []); })
      .catch((error) => {
        console.warn('[LiveSession] Rules not read:', error);
        if (!cancelled) {
          setRules(null);
          setBanner((b) => (b.some((x) => x.key === 'rules-unread') ? b : [...b, { key: 'rules-unread', text: 'Your Bankroll Rules Could Not Be Read, So This Session Is Not Being Checked.' }]));
        }
      });
    return () => { cancelled = true; };
  }, [userId, session?.id, session?.ended]);

  // Session Time Limit: once 15 minutes before, once at the limit.
  useEffect(() => {
    if (!running || !rules || rules.length === 0) return;
    const { alerts, keys } = dueTimeAlerts({ rules, session, now });
    if (keys.length === 0) return;
    save(markAlerts(session, keys));
    for (const alert of alerts) {
      toast.error(`${alert.title}. ${alert.message}`, 8000);
      setBanner((b) => [...b.filter((x) => x.key !== alert.key && !(alert.key === 'time-limit' && x.key === 'time-soon')), { key: alert.key, text: `${alert.title}. ${alert.message}` }]);
      notifyHidden(alert.title, alert.message);
    }
  }, [running, rules, session, now, save]);

  const closeSheet = useCallback(() => {
    if (sheet === 'start') onStartClose?.();
    setSheet(null);
  }, [sheet, onStartClose]);

  if (!userId) return null;

  const start = (values) => {
    if (readLiveSession(deviceStorage(), userId)) {
      toast.info('A Session Is Already Running. End It Before Starting Another.');
      closeSheet();
      return;
    }
    try {
      const at = Date.now();
      save(startLiveSession({ userId, id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, now: at, ...values }));
      setBanner([]);
      toast.success('Session Started');
    } catch (error) {
      toast.error(error.message);
      return;
    }
    closeSheet();
  };

  const addMoney = (kind, cents, warned) => {
    try {
      save(addTopUp(session, { kind, cents, now: Date.now() }));
    } catch (error) {
      toast.error(error.message);
      return;
    }
    if (warned.length > 0) {
      const text = warned.map((w) => warningText(w, moneyFormatter(displayEUR))).join(' ');
      toast.error(text, 8000);
      setBanner((b) => [...b.filter((x) => x.key !== 'money'), { key: 'money', text }]);
      notifyHidden('Bankroll Rule Warning', text);
    } else {
      toast.success(kind === 'rebuy' ? 'Rebuy Added' : 'Add On Added');
    }
    setSheet(null);
  };

  const end = (cashOutCents) => {
    let ended;
    try {
      ended = endLiveSession(session, { cashOutCents, now: Date.now() });
    } catch (error) {
      toast.error(error.message);
      return;
    }
    save(ended);
    setSheet(null);
    onLog?.(toLogPrefill(ended));
  };

  const discard = () => {
    save(null);
    setBanner([]);
    setSheet(null);
    toast.info('Session Discarded');
  };

  const meta = session ? LIVE_SESSION_CATEGORIES.find((c) => c.id === session.category) : null;
  const where = session ? [meta?.label, session.detail, session.venue?.location_name].filter(Boolean).join(' · ') : '';

  return (
    <>
      {session && (
        <section className={styles.bar} aria-label="Live Session" data-testid="bankroll-live-bar">
          {banner.map((b) => (
            <div key={b.key} className={styles.banner} role="alert">
              <p>{b.text}</p>
              <button type="button" aria-label="Dismiss Warning" onClick={() => setBanner((list) => list.filter((x) => x.key !== b.key))}>OK</button>
            </div>
          ))}
          <div className={styles.barTop}>
            <span className={styles.live}><span className={styles.dot} aria-hidden="true" />{session.ended ? 'Ended' : 'Live'}</span>
            <span className={styles.clock} role="timer" aria-label="Session Time">{formatElapsed(elapsedMs(session, now))}</span>
            <span className={styles.invested}>Total In<strong>{formatCentsCurrency(investedCents(session), displayEUR)}</strong></span>
          </div>
          {where && <div className={styles.where}>{where}</div>}
          {session.ended ? (
            <div className={styles.actions}>
              <button type="button" className="sd-button" onClick={() => save(resumeLiveSession(session))}>Resume</button>
              <button type="button" className="sd-button" onClick={() => setSheet('discard')}>Discard</button>
              <button type="button" className="sd-button sd-primary" onClick={() => onLog?.(toLogPrefill(session))}>Finish Log</button>
            </div>
          ) : (
            <div className={styles.actions}>
              <button type="button" className="sd-button" onClick={() => setSheet('rebuy')}>Rebuy</button>
              <button type="button" className="sd-button" onClick={() => setSheet('add_on')}>Add On</button>
              <button type="button" className="sd-button sd-primary" onClick={() => setSheet('end')}>End Session</button>
            </div>
          )}
        </section>
      )}
      {sheet === 'start' && <StartSheet userId={userId} balance={balance} displayEUR={displayEUR} initialCategory={typeof startOpen === 'string' ? startOpen : null} onClose={closeSheet} onStart={start} />}
      {(sheet === 'rebuy' || sheet === 'add_on') && session && !session.ended && (
        <TopUpSheet userId={userId} session={session} kind={sheet} balance={balance} displayEUR={displayEUR} onClose={closeSheet} onAdd={addMoney} />
      )}
      {(sheet === 'end' || sheet === 'discard') && session && (
        <EndSheet key={sheet} session={session} displayEUR={displayEUR} discardOnly={sheet === 'discard'} onClose={closeSheet} onEnd={end} onDiscard={discard} />
      )}
    </>
  );
}
