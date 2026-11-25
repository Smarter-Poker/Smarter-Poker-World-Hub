/**
 * LiveSpotQuickEntry · 15-second live poker spot logger + external hand-history import.
 *
 * One calm MTT-styled sheet with two compact tabs:
 *   - Live Quick Spot: Hero cards, position, cash/tournament, stack, facing action, optional board.
 *   - Paste External HH: auto-detects PokerStars / GGPoker / ACR / ClubGG / 888poker as the player pastes.
 *
 * Both tabs end in ONE call to /api/training/audit-hand-history. The result is shown exactly as the
 * server returns it: a decision without a verified solver spot is reported as unpriced coverage and
 * never receives invented advice. Non-NLHE variants are refused up front, honestly.
 *
 * Modal behaviour (Escape, backdrop tap, aria-modal, focus return, scroll lock) comes from the shared
 * paKit BottomSheet so there is exactly one dialog implementation across Personal Assistant.
 */
import React, { useCallback, useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { getFreshAccessToken } from '../../lib/authUtils';
import { BottomSheet, PAStyles, Segmented } from '../sandbox/paKit';
import { T, F, S, R, DISPLAY_FONT, btn, pill } from '../sandbox/paTokens';
import {
  LIVE_SPOT_ACTION_LABELS,
  LIVE_SPOT_FACING_LABELS,
  LIVE_SPOT_POSITIONS,
  buildLiveSpotHandHistory,
  detectExternalHandFormat,
  summarizeLiveSpotAudit,
} from '../../lib/personal-assistant/liveSpotHandHistory.mjs';

export { buildLiveSpotHandHistory, detectExternalHandFormat };

const AUDIT_ENDPOINT = '/api/training/audit-hand-history';
const MAX_PASTE_CHARS = 800000;
const REQUEST_TIMEOUT_MS = 60000;

const TAB_OPTIONS = [
  { value: 'spot', label: 'Live Quick Spot (15s)' },
  { value: 'paste', label: 'Paste External HH' },
];

const FORMAT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'tournament', label: 'Tournament' },
];

const DEFAULT_SPOT = Object.freeze({
  heroCards: '',
  position: 'BTN',
  format: 'cash',
  stackBb: '100',
  facing: 'open_raise',
  action: 'call',
  board: '',
});

const controlStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: R.sm,
  border: `1px solid ${T.border}`,
  borderTopColor: T.borderHi,
  background: T.surface2,
  color: T.text,
  fontSize: 16,
  fontFamily: 'inherit',
  lineHeight: 1.25,
};

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  color: T.textMuted,
  fontSize: F.label,
  fontWeight: 700,
};

const noteStyle = {
  margin: 0,
  color: T.textMuted,
  fontSize: F.caption,
  lineHeight: 1.45,
};

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/[A-Za-z][A-Za-z0-9']*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function Field({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function AuditResult({ result, onDismiss }) {
  if (!result) return null;
  if (result.kind === 'signin') {
    return (
      <div role="status" style={{ ...noteStyle, padding: 12, border: `1px solid ${T.border}`, borderRadius: R.sm, background: T.surface }}>
        <strong style={{ display: 'block', color: T.text, marginBottom: 6 }}>Sign In To Analyze</strong>
        Your Live Spots And Imported Hands Are Saved To Your Own Account.
        <a
          href="/auth/login"
          style={{ ...btn('primary', { block: true }), marginTop: 10, textDecoration: 'none' }}
        >
          Sign In
        </a>
      </div>
    );
  }
  if (result.kind === 'error') {
    return (
      <div role="alert" style={{ ...noteStyle, padding: 12, border: '1px solid rgba(255,107,122,0.5)', borderRadius: R.sm, background: T.dangerSoft, color: T.text }}>
        <strong style={{ display: 'block', color: T.danger, marginBottom: 4 }}>{result.title || 'Could Not Analyze'}</strong>
        {result.message}
      </div>
    );
  }
  const { summary } = result;
  return (
    <section
      aria-label="Live Spot Audit Result"
      aria-live="polite"
      style={{ padding: 12, border: `1px solid ${T.border}`, borderTopColor: T.borderHi, borderRadius: R.sm, background: T.surface, display: 'grid', gap: 10 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={pill(summary.hasVerifiedAdvice ? 'success' : 'warn')}>
          {summary.verifiedCount} Solver Verified
        </span>
        <span style={pill('neutral')}>{summary.unpricedCount} Unpriced</span>
        <span style={pill('neutral')}>{summary.handsParsed} Hand{summary.handsParsed === 1 ? '' : 's'} Read</span>
        <button type="button" onClick={onDismiss} style={{ ...btn('ghost'), marginLeft: 'auto', minHeight: 44 }} aria-label="Dismiss Audit Result">
          Dismiss
        </button>
      </div>
      {!summary.hasVerifiedAdvice && (
        <p style={noteStyle}>
          No Verified Solver Spot Matched, So No Advice Is Shown. This Spot Is Saved As An Unpriced Coverage Gap Instead Of A Guess.
        </p>
      )}
      {summary.decisions.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {summary.decisions.map((decision, index) => (
            <li
              key={`${decision.street}-${index}`}
              style={{ padding: '8px 10px', borderRadius: R.sm, background: T.surface2, border: `1px solid ${T.border}`, color: T.text, fontSize: F.bodySm, lineHeight: 1.4 }}
            >
              <strong>{titleCase(decision.street)}</strong>
              {decision.position ? ` · ${decision.position}` : ''}
              {decision.playerAction ? ` · You: ${titleCase(decision.playerAction)}` : ''}
              {decision.verified
                ? ` · Solver: ${titleCase(decision.solverAction)} · ${titleCase(decision.classification)}${decision.evLoss !== null ? ` · ${Math.abs(decision.evLoss).toFixed(2)} BB Lost` : ''}`
                : ' · Unpriced'}
            </li>
          ))}
        </ul>
      )}
      {!summary.complete && (
        <p style={noteStyle}>This Audit Stopped Early. Run It Again To Finish Checking Every Decision.</p>
      )}
      {summary.drillHref && (
        <a href={summary.drillHref} style={{ ...btn('secondary', { block: true }), textDecoration: 'none' }}>
          Drill This Spot
        </a>
      )}
    </section>
  );
}

export default function LiveSpotQuickEntry({
  open = true,
  onClose,
  initialTab = 'spot',
  onAnalyzed,
}) {
  const baseId = useId();
  const [tab, setTab] = useState(initialTab === 'paste' ? 'paste' : 'spot');
  const [spot, setSpot] = useState(DEFAULT_SPOT);
  const [showErrors, setShowErrors] = useState(false);
  const [pasted, setPasted] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const requestIdRef = useRef(0);

  const deferredPaste = useDeferredValue(pasted);
  const detected = useMemo(() => detectExternalHandFormat(deferredPaste), [deferredPaste]);
  const built = useMemo(() => buildLiveSpotHandHistory(spot), [spot]);

  const update = useCallback((patch) => {
    setSpot((current) => ({ ...current, ...patch }));
    setResult(null);
  }, []);

  const runAudit = useCallback(async (text) => {
    const requestId = ++requestIdRef.current;
    setRunning(true);
    setResult(null);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        if (requestId === requestIdRef.current) setResult({ kind: 'signin' });
        return;
      }
      const response = await fetch(AUDIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ handHistoryText: text }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (requestId !== requestIdRef.current) return;
      if (!response.ok || payload?.success === false) {
        const message = response.status === 422
          ? 'No Supported No-Limit Hold\u2019em Hands Could Be Read From This Text. Nothing Was Saved.'
          : response.status === 429
            ? 'Too Many Requests. Wait A Moment And Try Again.'
            : response.status === 413
              ? 'This Hand History Is Too Large. Paste Fewer Hands.'
              : (typeof payload?.error === 'string' && payload.error) || `The Audit Could Not Finish (HTTP ${response.status}).`;
        setResult({ kind: 'error', title: response.status === 422 ? 'Not Supported Yet' : 'Could Not Analyze', message });
        return;
      }
      const summary = summarizeLiveSpotAudit(payload);
      setResult({ kind: 'ok', summary });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pa-data-updated'));
        window.dispatchEvent(new Event('pa-sandbox-updated'));
      }
      onAnalyzed?.(payload, summary);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setResult({
        kind: 'error',
        title: 'Could Not Analyze',
        message: error?.name === 'AbortError'
          ? 'The Audit Took Too Long. Your Connection May Be Slow, So Try Again.'
          : 'The Audit Request Failed. Check Your Connection And Try Again.',
      });
    } finally {
      if (timer) clearTimeout(timer);
      if (requestId === requestIdRef.current) setRunning(false);
    }
  }, [onAnalyzed]);

  const submitSpot = (event) => {
    event?.preventDefault?.();
    setShowErrors(true);
    if (!built.ok || running) return;
    runAudit(built.text);
  };

  const submitPaste = (event) => {
    event?.preventDefault?.();
    if (running || !pasted.trim() || detected.supported === false) return;
    if (pasted.length > MAX_PASTE_CHARS) {
      setResult({ kind: 'error', title: 'Too Large', message: 'This Hand History Is Too Large. Paste Fewer Hands.' });
      return;
    }
    runAudit(pasted);
  };

  const pasteBlocked = !pasted.trim() || detected.supported === false;
  const id = (suffix) => `${baseId}-${suffix}`;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Log A Live Spot"
      subtitle="Quick Spot Or Pasted Hand History"
      closeLabel="Close Live Spot Logger"
      ariaLabel="Live Poker Spot Quick Logger"
      maxWidth={640}
    >
      <PAStyles />
      <div style={{ display: 'grid', gap: 14 }} data-live-spot-quick-entry="true">
        <Segmented
          idPrefix="live-spot-tab"
          label="Entry Method"
          columns={2}
          value={tab}
          onChange={(next) => { setTab(next); setResult(null); }}
          options={TAB_OPTIONS}
        />

        {tab === 'spot' ? (
          <form onSubmit={submitSpot} noValidate style={{ display: 'grid', gap: 12 }} aria-label="Live Quick Spot">
            <Field id={id('hero')} label="Hero Cards">
              <input
                id={id('hero')}
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={spot.heroCards}
                onChange={(event) => update({ heroCards: event.target.value })}
                placeholder="As Kd"
                style={controlStyle}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <Field id={id('position')} label="Position">
                <select id={id('position')} value={spot.position} onChange={(event) => update({ position: event.target.value })} style={controlStyle}>
                  {LIVE_SPOT_POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </Field>
              <Field id={id('stack')} label="Stack (BB)">
                <input
                  id={id('stack')}
                  type="text"
                  inputMode="decimal"
                  value={spot.stackBb}
                  onChange={(event) => update({ stackBb: event.target.value.replace(/[^\d.]/g, '') })}
                  style={controlStyle}
                />
              </Field>
            </div>

            <Segmented
              idPrefix="live-spot-format"
              label="Game Format"
              columns={2}
              value={spot.format}
              onChange={(next) => update({ format: next })}
              options={FORMAT_OPTIONS}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Field id={id('facing')} label="Facing Action">
                <select id={id('facing')} value={spot.facing} onChange={(event) => update({ facing: event.target.value })} style={controlStyle}>
                  {Object.entries(LIVE_SPOT_FACING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field id={id('action')} label="Your Action">
                <select id={id('action')} value={spot.action} onChange={(event) => update({ action: event.target.value })} style={controlStyle}>
                  {Object.entries(LIVE_SPOT_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>

            <details className="pa-disclosure">
              <summary>
                <span>Add Board (Optional)</span>
                <small>Flop, Turn, River</small>
              </summary>
              <div className="pa-disclosure-body">
                <Field id={id('board')} label="Board Cards">
                  <input
                    id={id('board')}
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={spot.board}
                    onChange={(event) => update({ board: event.target.value })}
                    placeholder="Ts 9h 2c"
                    style={controlStyle}
                  />
                </Field>
                <p style={{ ...noteStyle, marginTop: 8 }}>Use Facing A Postflop Bet When You Add A Board.</p>
              </div>
            </details>

            {showErrors && !built.ok && (
              <ul role="alert" style={{ margin: 0, paddingLeft: 18, color: T.danger, fontSize: F.bodySm, lineHeight: 1.45 }}>
                {built.errors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}

            <button type="submit" disabled={running} style={{ ...btn('primary', { block: true, disabled: running }), fontFamily: DISPLAY_FONT }}>
              {running ? 'Analyzing…' : 'Analyze Live Spot'}
            </button>
            <p style={noteStyle}>
              Only No-Limit Hold{'\u2019'}em Spots Are Checked. Anything Without A Verified Solver Match Is Saved As Unpriced, Never Guessed.
            </p>
          </form>
        ) : (
          <form onSubmit={submitPaste} noValidate style={{ display: 'grid', gap: 12 }} aria-label="Paste External Hand History">
            <Field id={id('paste')} label="Hand History Text">
              <textarea
                id={id('paste')}
                value={pasted}
                onChange={(event) => { setPasted(event.target.value); setResult(null); }}
                placeholder="Paste PokerStars, GGPoker, ACR Or ClubGG Hands Here"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                style={{ ...controlStyle, minHeight: 168, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </Field>

            {pasted.trim() && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }} role="status" aria-live="polite" data-detected-site={detected.site}>
                <span style={pill(detected.site === 'unknown' ? 'neutral' : 'accent')}>{detected.label}</span>
                <span style={pill(detected.supported === false ? 'warn' : detected.supported ? 'success' : 'neutral')}>
                  {detected.variantLabel}
                </span>
                {detected.handCount > 0 && (
                  <span style={pill('neutral')}>{detected.handCount} Hand{detected.handCount === 1 ? '' : 's'} Found</span>
                )}
              </div>
            )}
            {pasted.trim() && detected.reason && (
              <p role="note" style={{ ...noteStyle, color: detected.supported === false ? T.warn : T.textMuted }}>{detected.reason}</p>
            )}
            {pasted.trim() && (detected.site === 'acr' || detected.site === 'clubgg') && detected.supported !== false && (
              <p style={noteStyle}>
                {detected.label} Text Is Read Through The Closest Supported Layout. Hands That Cannot Be Read Are Reported, Never Guessed.
              </p>
            )}

            <button type="submit" disabled={pasteBlocked || running} style={{ ...btn('primary', { block: true, disabled: pasteBlocked || running }), fontFamily: DISPLAY_FONT }}>
              {running ? 'Analyzing…' : 'Analyze Hand History'}
            </button>
          </form>
        )}

        <AuditResult result={result} onDismiss={() => setResult(null)} />
        {/* Spacing keeps the last control clear of the iOS home indicator. */}
        <div style={{ height: S.sm }} aria-hidden="true" />
      </div>
    </BottomSheet>
  );
}
