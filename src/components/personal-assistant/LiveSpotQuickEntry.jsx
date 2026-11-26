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
import React, { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
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
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB safe limit
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
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/**
 * Pure helper: splits multi-hand hand history text into individual hand blocks.
 */
const HAND_START_REGEX = /(?:^|\r?\n\r?\n+)(?=(?:PokerStars\s+(?:Zoom\s+)?(?:Hand|Game)\s+#|Poker\s+Hand\s+#|(?:ClubGG\s+)?(?:Poker\s+)?Hand\s*#|(?:Game\s+)?Hand\s*#|\*{5}\s*(?:888poker|Pacific\s+Poker|Hand\s+History)|Winamax\s+Poker|GAME\s*#))/i;

export function splitHandHistoryHands(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const text = rawText.trim();
  if (!text) return [];

  const blocks = text.split(HAND_START_REGEX).map((b) => b.trim()).filter(Boolean);
  if (blocks.length > 1) {
    return blocks;
  }

  // Fallback: line-by-line boundary detection
  const lines = text.split(/\r?\n/);
  const isHeader = (line) =>
    /^\s*(?:\*{5}\s*(?:888poker|Pacific|Hand\s+History)|(?:PokerStars\s+(?:Zoom\s+)?(?:Hand|Game)\s+#|Poker\s+Hand\s+#|(?:ClubGG\s+)?(?:Poker\s+)?Hand\s*#|(?:Game\s+)?Hand\s*#|Winamax\s+Poker|GAME\s*#))/i.test(line);

  const collected = [];
  let current = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeader(line) && current.length > 0) {
      collected.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const blk = current.join('\n').trim();
    if (blk) collected.push(blk);
  }

  return collected.length > 0 ? collected : [text];
}

/**
 * Pure helper: splits multi-hand file into chunks of maxHandsPerChunk hands (default 50).
 */
export function splitHandHistoryChunks(rawText, maxHandsPerChunk = 50) {
  if (!rawText || typeof rawText !== 'string') return [];
  const hands = splitHandHistoryHands(rawText);
  if (hands.length === 0) return [];
  const chunkSize = Math.max(1, maxHandsPerChunk);
  const chunks = [];
  for (let i = 0; i < hands.length; i += chunkSize) {
    chunks.push(hands.slice(i, i + chunkSize).join('\n\n'));
  }
  return chunks;
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
        {summary.unsupportedCount > 0 && (
          <span style={pill('warn')}>{summary.unsupportedCount} Unsupported</span>
        )}
        <button type="button" onClick={onDismiss} style={{ ...btn('ghost'), marginLeft: 'auto', minHeight: 44 }} aria-label="Dismiss Audit Result">
          Dismiss
        </button>
      </div>
      {!summary.hasVerifiedAdvice && (
        <p style={noteStyle}>
          No Verified Solver Spot Matched, So No Advice Is Shown. This Spot Is Saved As An Unpriced Coverage Gap Instead Of A Guess.
        </p>
      )}
      {Array.isArray(summary.decisions) && summary.decisions.length > 0 && (
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
  const triggerRef = useRef(null);
  const [tab, setTab] = useState(initialTab === 'paste' ? 'paste' : 'spot');
  const [spot, setSpot] = useState(DEFAULT_SPOT);
  const [showErrors, setShowErrors] = useState(false);
  const [pasted, setPasted] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const [bulkProgress, setBulkProgress] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const requestIdRef = useRef(0);
  const bulkCancelRef = useRef(false);
  const bulkAbortRef = useRef(null);
  const fileInputRef = useRef(null);

  // Focus preservation: remember previously focused element when opened
  useEffect(() => {
    if (open && typeof document !== 'undefined') {
      triggerRef.current = document.activeElement;
    }
  }, [open]);

  const handleClose = useCallback(() => {
    onClose?.();
    try {
      triggerRef.current?.focus?.();
    } catch (_) {}
  }, [onClose]);

  const deferredPaste = useDeferredValue(pasted);
  const detected = useMemo(() => detectExternalHandFormat(deferredPaste), [deferredPaste]);
  const built = useMemo(() => buildLiveSpotHandHistory(spot), [spot]);

  const update = useCallback((patch) => {
    setSpot((current) => ({ ...current, ...patch }));
    setResult(null);
  }, []);

  const runAudit = useCallback(async (text, { evidenceScope = 'external_upload', externalSignal = null } = {}) => {
    const requestId = ++requestIdRef.current;
    setRunning(true);
    setResult(null);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    const signal = externalSignal || controller?.signal;
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        if (requestId === requestIdRef.current) setResult({ kind: 'signin' });
        return null;
      }
      const response = await fetch(AUDIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ handHistoryText: text, evidenceScope }),
        ...(signal ? { signal } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (requestId !== requestIdRef.current) return null;
      if (!response.ok || payload?.success === false) {
        const message = response.status === 422
          ? 'No Supported No-Limit Hold\u2019em Hands Could Be Read From This Text. Nothing Was Saved.'
          : response.status === 429
            ? 'Too Many Requests. Wait A Moment And Try Again.'
            : response.status === 413
              ? 'This Hand History Is Too Large. Paste Fewer Hands.'
              : (typeof payload?.error === 'string' && payload.error) || `The Audit Could Not Finish (HTTP ${response.status}).`;
        setResult({ kind: 'error', title: response.status === 422 ? 'Not Supported Yet' : 'Could Not Analyze', message });
        setStatusAnnouncement('Could Not Analyze Hand History.');
        return null;
      }
      const summary = summarizeLiveSpotAudit(payload);
      setResult({ kind: 'ok', summary });
      setStatusAnnouncement(`Audit Complete. ${summary.handsParsed} Hand${summary.handsParsed === 1 ? '' : 's'} Read.`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pa-data-updated'));
        window.dispatchEvent(new Event('pa-sandbox-updated'));
      }
      onAnalyzed?.(payload, summary);
      return { payload, summary };
    } catch (error) {
      if (requestId !== requestIdRef.current) return null;
      setResult({
        kind: 'error',
        title: 'Could Not Analyze',
        message: error?.name === 'AbortError'
          ? 'The Audit Took Too Long. Your Connection May Be Slow, So Try Again.'
          : 'The Audit Request Failed. Check Your Connection And Try Again.',
      });
      setStatusAnnouncement('The Audit Request Failed.');
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      if (requestId === requestIdRef.current) setRunning(false);
    }
  }, [onAnalyzed]);

  const submitSpot = (event) => {
    event?.preventDefault?.();
    setShowErrors(true);
    if (!built.ok || running) return;
    setStatusAnnouncement('Analyzing Live Spot. Logged As Self-Reported Live Study.');
    runAudit(built.text, { evidenceScope: 'self_reported_live' });
  };

  const submitPaste = (event) => {
    event?.preventDefault?.();
    if (running || !pasted.trim() || detected.supported === false) return;
    if (pasted.length > MAX_PASTE_CHARS) {
      setResult({ kind: 'error', title: 'Too Large', message: 'This Hand History Is Too Large. Paste Fewer Hands.' });
      return;
    }
    setStatusAnnouncement('Analyzing Pasted Hand History.');
    runAudit(pasted, { evidenceScope: 'external_upload' });
  };

  // Bulk .txt file upload handler
  const processBulkFile = useCallback(async (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setResult({
        kind: 'error',
        title: 'File Too Large',
        message: 'This File Exceeds The 5MB Limit. Upload A Smaller Batch.',
      });
      setStatusAnnouncement('File Exceeds The 5MB Limit.');
      return;
    }

    try {
      const text = await file.text();
      const chunks = splitHandHistoryChunks(text, 50);
      if (chunks.length === 0) {
        setResult({
          kind: 'error',
          title: 'No Hands Found',
          message: 'No Valid Hand Histories Could Be Read From This File.',
        });
        setStatusAnnouncement('No Valid Hand Histories Found In File.');
        return;
      }

      // Single chunk shortcut
      if (chunks.length === 1) {
        setPasted(text);
        setStatusAnnouncement('File Loaded. Analyzing Hands.');
        runAudit(chunks[0], { evidenceScope: 'external_upload' });
        return;
      }

      // Sequential batch execution
      bulkCancelRef.current = false;
      const totalBatches = chunks.length;
      setBulkProgress({
        active: true,
        currentBatch: 1,
        totalBatches,
      });

      const combinedSummary = {
        verifiedCount: 0,
        unpricedCount: 0,
        handsParsed: 0,
        unsupportedCount: 0,
        hasVerifiedAdvice: false,
        decisions: [],
      };

      for (let i = 0; i < chunks.length; i++) {
        if (bulkCancelRef.current) {
          setStatusAnnouncement('Audit Cancelled By Player.');
          setResult({
            kind: 'error',
            title: 'Audit Cancelled',
            message: `Bulk Audit Cancelled After ${i} Of ${totalBatches} Batches.`,
          });
          break;
        }

        const batchNum = i + 1;
        setBulkProgress({
          active: true,
          currentBatch: batchNum,
          totalBatches,
        });
        setStatusAnnouncement(`Auditing Batch ${batchNum} Of ${totalBatches}`);

        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        bulkAbortRef.current = ctrl;

        const outcome = await runAudit(chunks[i], {
          evidenceScope: 'external_upload',
          externalSignal: ctrl?.signal,
        });

        if (outcome?.summary) {
          combinedSummary.verifiedCount += outcome.summary.verifiedCount || 0;
          combinedSummary.unpricedCount += outcome.summary.unpricedCount || 0;
          combinedSummary.handsParsed += outcome.summary.handsParsed || 0;
          if (outcome.summary.hasVerifiedAdvice) combinedSummary.hasVerifiedAdvice = true;
          if (Array.isArray(outcome.summary.decisions)) {
            combinedSummary.decisions.push(...outcome.summary.decisions.slice(0, 4));
          }
        }
      }

      setBulkProgress(null);
      if (!bulkCancelRef.current) {
        setResult({ kind: 'ok', summary: combinedSummary });
        setStatusAnnouncement(`Finished Auditing ${combinedSummary.handsParsed} Hands Across ${totalBatches} Batches.`);
      }
    } catch (err) {
      setBulkProgress(null);
      setResult({
        kind: 'error',
        title: 'Upload Failed',
        message: 'Could Not Read Or Audit The Selected File.',
      });
      setStatusAnnouncement('Could Not Read File.');
    }
  }, [runAudit]);

  const handleCancelBulk = useCallback(() => {
    bulkCancelRef.current = true;
    try {
      bulkAbortRef.current?.abort();
    } catch (_) {}
    setBulkProgress(null);
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processBulkFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processBulkFile(file);
    }
  };

  const pasteBlocked = !pasted.trim() || detected.supported === false;
  const id = (suffix) => `${baseId}-${suffix}`;

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title="Log A Live Spot"
      subtitle="Quick Spot Or Pasted Hand History"
      closeLabel="Close Live Spot Logger"
      ariaLabel="Live Poker Spot Quick Logger"
      maxWidth={640}
    >
      <PAStyles />
      {/* Live announcement region for screen readers */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {statusAnnouncement}
      </div>

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
            <p style={{ ...noteStyle, color: '#9eb4c8', fontSize: 12 }}>
              Logged As Self-Reported Live Study · Kept Separate From Club Arena Live Verification
            </p>
            <p style={noteStyle}>
              Only No-Limit Hold{'\u2019'}em Spots Are Checked. Anything Without A Verified Solver Match Is Saved As Unpriced, Never Guessed.
            </p>
          </form>
        ) : (
          <form onSubmit={submitPaste} noValidate style={{ display: 'grid', gap: 12 }} aria-label="Paste External Hand History">
            {/* File Dropzone & Picker for Bulk Upload */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '16px 12px',
                borderRadius: R.sm,
                border: `2px dashed ${isDragOver ? '#56d8ff' : '#253e57'}`,
                background: isDragOver ? 'rgba(8, 124, 250, 0.12)' : T.surface2,
                textAlign: 'center',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.hh,.log"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id={id('file-input')}
                aria-label="Upload Hand History File"
              />
              <span style={{ fontSize: F.bodySm, color: T.text, fontWeight: 700 }}>
                Upload .Txt Hand History File
              </span>
              <span style={{ fontSize: F.caption, color: '#9eb4c8' }}>
                Select Or Drop PokerStars, GGPoker, ACR, Or ClubGG .Txt Files (Up To 5MB)
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={running || bulkProgress?.active}
                style={{ ...btn('secondary'), minHeight: 44, padding: '8px 16px', cursor: 'pointer' }}
              >
                Choose .Txt File
              </button>
            </div>

            {/* Live Progress Region During Multi-Batch Audit */}
            {bulkProgress?.active && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 12,
                  borderRadius: R.sm,
                  background: '#07111c',
                  border: '1px solid #56d8ff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#83deff', fontSize: F.bodySm }}>
                    Auditing Batch {bulkProgress.currentBatch} Of {bulkProgress.totalBatches}
                  </strong>
                  <button
                    type="button"
                    onClick={handleCancelBulk}
                    style={{ ...btn('ghost'), minHeight: 44, color: T.danger }}
                    aria-label="Cancel Bulk Audit"
                  >
                    Cancel Audit
                  </button>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round((bulkProgress.currentBatch / bulkProgress.totalBatches) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{ width: '100%', height: 6, background: '#06111e', borderRadius: 3, overflow: 'hidden' }}
                >
                  <div
                    style={{
                      width: `${Math.round((bulkProgress.currentBatch / bulkProgress.totalBatches) * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #087cfa, #56d8ff)',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </div>
            )}

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

            <button type="submit" disabled={pasteBlocked || running || bulkProgress?.active} style={{ ...btn('primary', { block: true, disabled: pasteBlocked || running || bulkProgress?.active }), fontFamily: DISPLAY_FONT }}>
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
