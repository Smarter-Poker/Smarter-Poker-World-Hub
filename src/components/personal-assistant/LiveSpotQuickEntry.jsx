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
import { ChevronRight } from 'lucide-react';
import { getFreshAccessToken } from '../../lib/authUtils';
import { useAvatar } from '../../contexts/AvatarContext';
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
          className="pa-btn"
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
        {result.summary?.reviewHref && (
          <a href={result.summary.reviewHref} className="pa-btn" style={{ ...btn('primary', { block: true }), marginTop: 10, textDecoration: 'none' }}>
            Review {result.summary.savedHandCount} Saved Hand{result.summary.savedHandCount === 1 ? '' : 's'}
          </a>
        )}
      </div>
    );
  }
  const { summary } = result;
  return (
    <section
      aria-label="Live Spot Audit Result"
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
        <button type="button" className="pa-btn" onClick={onDismiss} style={{ ...btn('ghost'), marginLeft: 'auto', minHeight: 44 }} aria-label="Dismiss Audit Result">
          Dismiss
        </button>
      </div>
      {summary.savedForReview && (
        <p role="status" style={noteStyle}>
          {summary.savedHandCount} Hand{summary.savedHandCount === 1 ? '' : 's'} Saved To Review My Play.
        </p>
      )}
      {summary.reviewHref && (
        <a href={summary.reviewHref} className="pa-btn" style={{ ...btn('primary', { block: true }), textDecoration: 'none' }}>
          Review Saved Hand{summary.savedHandCount === 1 ? '' : 's'}
        </a>
      )}
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
        <a href={summary.drillHref} className="pa-btn" style={{ ...btn('secondary', { block: true }), textDecoration: 'none' }}>
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
  const { user } = useAvatar();
  const userId = user?.id || null;
  const baseId = useId();
  const triggerRef = useRef(null);
  const [tab, setTab] = useState(initialTab === 'paste' ? 'paste' : 'spot');
  const [wizardStep, setWizardStep] = useState(1);
  const [spot, setSpot] = useState(DEFAULT_SPOT);
  const [showErrors, setShowErrors] = useState(false);
  const [pasted, setPasted] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const [bulkProgress, setBulkProgress] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const requestIdRef = useRef(0);
  const auditAbortRef = useRef(null);
  const lifecycleVersionRef = useRef(0);
  const ownerRef = useRef(userId);
  ownerRef.current = userId;
  const bulkCancelRef = useRef(false);
  const bulkAbortRef = useRef(null);
  const fileInputRef = useRef(null);

  const invalidatePendingAudit = useCallback(() => {
    requestIdRef.current += 1;
    lifecycleVersionRef.current += 1;
    bulkCancelRef.current = true;
    try {
      auditAbortRef.current?.abort();
      bulkAbortRef.current?.abort();
    } catch (_) {}
    auditAbortRef.current = null;
    bulkAbortRef.current = null;
  }, []);

  const deferredPaste = useDeferredValue(pasted);
  const detected = useMemo(() => detectExternalHandFormat(deferredPaste), [deferredPaste]);
  const built = useMemo(() => buildLiveSpotHandHistory(spot), [spot]);

  // Keep all asynchronous work bound to the visible logger and its account.
  useEffect(() => {
    if (open && typeof document !== 'undefined') {
      triggerRef.current = document.activeElement;
    } else if (!open) {
      invalidatePendingAudit();
      setRunning(false);
      setBulkProgress(null);
    }
  }, [invalidatePendingAudit, open]);

  useEffect(() => invalidatePendingAudit, [invalidatePendingAudit]);

  useEffect(() => {
    invalidatePendingAudit();
    setRunning(false);
    setBulkProgress(null);
    setResult(null);
    setStatusAnnouncement('');
    setPasted('');
    setSpot(DEFAULT_SPOT);
    setWizardStep(1);
    setShowErrors(false);
  }, [invalidatePendingAudit, userId]);

  const handleClose = useCallback(() => {
    invalidatePendingAudit();
    setRunning(false);
    setBulkProgress(null);
    onClose?.();
    try {
      triggerRef.current?.focus?.();
    } catch (_) {}
  }, [invalidatePendingAudit, onClose]);

  const update = useCallback((patch) => {
    setSpot((current) => {
      const next = { ...current, ...patch };
      // Keep Facing Action consistent when Board or Position changes in Step 1
      if (Object.prototype.hasOwnProperty.call(patch, 'board')) {
        const hasBoard = String(next.board || '').trim().length > 0;
        if (hasBoard && next.facing !== 'facing_bet') {
          next.facing = 'facing_bet';
        } else if (!hasBoard && next.facing === 'facing_bet') {
          next.facing = next.position === 'UTG' ? 'unopened' : 'open_raise';
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'position')) {
        if (next.position === 'UTG' && next.facing === 'open_raise') {
          next.facing = 'unopened';
        } else if (next.position === 'BB' && (next.facing === 'unopened' || next.facing === 'three_bet')) {
          next.facing = 'open_raise';
        }
      }
      return next;
    });
    setResult(null);
  }, []);

  const handleAdvanceToStep2 = useCallback(() => {
    setShowErrors(true);
    if (!built.ok) return;
    setWizardStep(2);
    setStatusAnnouncement('Step 2 Of 2. Choose Your Action And Review Spot.');
  }, [built.ok]);

  const runAudit = useCallback(async (text, { evidenceScope = 'external_upload', externalSignal = null, suppressEvents = false } = {}) => {
    const requestId = ++requestIdRef.current;
    const ownerId = userId;
    const isCurrent = () => requestId === requestIdRef.current && ownerRef.current === ownerId;
    auditAbortRef.current?.abort();
    setRunning(true);
    if (!suppressEvents) {
      bulkCancelRef.current = false;
      setResult(null);
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    auditAbortRef.current = controller;
    let timedOut = false;
    const timer = controller
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;
    const onExternalAbort = () => {
      try {
        controller?.abort();
      } catch (_) {}
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        onExternalAbort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    const signal = controller ? controller.signal : externalSignal;
    const throwIfAborted = () => {
      if (!signal?.aborted) return;
      const error = new Error('Audit Request Was Aborted');
      error.name = 'AbortError';
      throw error;
    };
    try {
      const token = ownerId ? await getFreshAccessToken() : null;
      if (!isCurrent()) return null;
      throwIfAborted();
      if (!token) {
        if (!suppressEvents) setResult({ kind: 'signin' });
        return { ok: false, signin: true, error: 'Sign In To Analyze.' };
      }
      const response = await fetch(AUDIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          handHistoryText: text,
          evidenceScope,
          source: 'personal-assistant-live-spot',
          returnTo: '/hub/personal-assistant/leaks',
        }),
        ...(signal ? { signal } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!isCurrent()) return null;
      throwIfAborted();
      if (!response.ok || payload?.success === false) {
        const message = response.status === 422
          ? 'No Supported No-Limit Hold\u2019em Hands Could Be Read From This Text. Nothing Was Saved.'
          : response.status === 429
            ? 'Too Many Requests. Wait A Moment And Try Again.'
            : response.status === 413
              ? 'This Hand History Is Too Large. Paste Fewer Hands.'
              : (typeof payload?.error === 'string' && payload.error) || `The Audit Could Not Finish (HTTP ${response.status}).`;
        const title = response.status === 422 ? 'Not Supported Yet' : 'Could Not Analyze';
        if (!suppressEvents) {
          setResult({ kind: 'error', title, message });
          setStatusAnnouncement('Could Not Analyze Hand History.');
        }
        return { ok: false, status: response.status, title, error: message };
      }
      const summary = summarizeLiveSpotAudit(payload);
      if (payload?.reviewQueue?.saved !== true || !summary.savedForReview) {
        const message = 'Saving To Review My Play Could Not Be Confirmed. Retry This Import Safely.';
        if (!suppressEvents) setResult({ kind: 'error', title: 'Save Not Confirmed', message });
        return { ok: false, title: 'Save Not Confirmed', error: message };
      }
      if (!suppressEvents) {
        setResult({ kind: 'ok', summary });
        setStatusAnnouncement(`Audit Complete. ${summary.handsParsed} Hand${summary.handsParsed === 1 ? '' : 's'} Read.`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('pa-data-updated'));
          window.dispatchEvent(new Event('pa-sandbox-updated'));
        }
        onAnalyzed?.(payload, summary);
      }
      return { ok: true, payload, summary };
    } catch (error) {
      if (!isCurrent()) return null;
      const isCancelled = error?.name === 'AbortError' && !timedOut && Boolean(externalSignal?.aborted || bulkCancelRef.current);
      const isTimeout = error?.name === 'AbortError' && (timedOut || !isCancelled);
      const title = isCancelled
        ? 'Audit Cancelled'
        : isTimeout
          ? 'Audit Took Too Long'
          : 'Could Not Analyze';
      const message = isCancelled
        ? 'The Audit Was Cancelled By Player.'
        : isTimeout
          ? 'The Audit Took Too Long. Your Connection May Be Slow, So Try Again.'
          : 'The Audit Request Failed. Check Your Connection And Try Again.';
      if (!suppressEvents) {
        setResult({
          kind: 'error',
          title,
          message,
        });
        setStatusAnnouncement(
          isCancelled
            ? 'Audit Cancelled By Player.'
            : isTimeout
              ? 'The Audit Took Too Long.'
              : 'The Audit Request Failed.',
        );
      }
      return { ok: false, cancelled: isCancelled, timedOut: isTimeout, title, error: message };
    } finally {
      if (timer) clearTimeout(timer);
      if (externalSignal) {
        try {
          externalSignal.removeEventListener('abort', onExternalAbort);
        } catch (_) {}
      }
      if (auditAbortRef.current === controller) auditAbortRef.current = null;
      if (isCurrent()) setRunning(false);
    }
  }, [onAnalyzed, userId]);

  const submitSpot = (event) => {
    event?.preventDefault?.();
    setShowErrors(true);
    if (!built.ok || running || bulkProgress?.active) return;
    setStatusAnnouncement('Analyzing Live Spot. Logged As Self-Reported Live Study.');
    runAudit(built.text, { evidenceScope: 'self_reported_live' });
  };

  const submitPaste = (event) => {
    event?.preventDefault?.();
    if (running || bulkProgress?.active || !pasted.trim() || detected.supported === false) return;
    if (pasted.length > MAX_PASTE_CHARS) {
      setResult({ kind: 'error', title: 'Too Large', message: 'This Hand History Is Too Large. Paste Fewer Hands.' });
      return;
    }
    setStatusAnnouncement('Analyzing Pasted Hand History.');
    runAudit(pasted, { evidenceScope: 'external_upload' });
  };

  // Bulk .txt file upload handler
  const processBulkFile = useCallback(async (file) => {
    if (!file || running || bulkProgress?.active) return;
    if (file.size > MAX_FILE_BYTES) {
      setResult({
        kind: 'error',
        title: 'File Too Large',
        message: 'This File Exceeds The 5MB Limit. Upload A Smaller Batch.',
      });
      setStatusAnnouncement('File Exceeds The 5MB Limit.');
      return;
    }

    const lifecycleVersion = lifecycleVersionRef.current;
    const ownerId = userId;
    const isCurrent = () => lifecycleVersion === lifecycleVersionRef.current && ownerRef.current === ownerId;
    try {
      const text = await file.text();
      if (!isCurrent()) return;
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

      // Switch to Paste tab so the uploaded file text and audit outcome are visible
      setTab('paste');

      // Single chunk shortcut
      if (chunks.length === 1) {
        if (text.length > MAX_PASTE_CHARS) {
          setResult({
            kind: 'error',
            title: 'Too Large',
            message: 'This Hand History Is Too Large. Paste Fewer Hands.',
          });
          setStatusAnnouncement('Hand History Is Too Large.');
          return;
        }
        setPasted(text);
        setStatusAnnouncement('File Loaded. Analyzing Hands.');
        runAudit(chunks[0], { evidenceScope: 'external_upload' });
        return;
      }

      // Sequential batch execution
      bulkCancelRef.current = false;
      const totalBatches = chunks.length;
      setResult(null);
      setBulkProgress({
        active: true,
        currentBatch: 1,
        completedBatches: 0,
        totalBatches,
      });

      const combinedSummary = {
        verifiedCount: 0,
        unpricedCount: 0,
        handsParsed: 0,
        decisionsAnalyzed: 0,
        unsupportedCount: 0,
        hasVerifiedAdvice: false,
        decisions: [],
        complete: true,
        truncated: false,
        drillHref: null,
        savedForReview: false,
        savedHandCount: 0,
        savedHandIds: [],
        reviewHref: null,
      };
      const savedHandIds = new Set();
      let completedBatches = 0;
      let failedBatches = 0;
      let firstError = null;
      let needsSignIn = false;
      let lastPayload = null;

      for (let i = 0; i < chunks.length; i++) {
        if (bulkCancelRef.current) {
          break;
        }

        const batchNum = i + 1;
        setBulkProgress({
          active: true,
          currentBatch: batchNum,
          completedBatches,
          totalBatches,
        });
        setStatusAnnouncement(`Auditing Batch ${batchNum} Of ${totalBatches}`);

        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        bulkAbortRef.current = ctrl;

        const outcome = await runAudit(chunks[i], {
          evidenceScope: 'external_upload',
          externalSignal: ctrl?.signal,
          suppressEvents: true,
        });
        if (!isCurrent()) return;

        if (bulkCancelRef.current || outcome?.cancelled) {
          bulkCancelRef.current = true;
          break;
        }

        if (outcome?.signin) {
          needsSignIn = true;
          break;
        }

        if (outcome?.ok && outcome?.summary) {
          completedBatches += 1;
          lastPayload = outcome.payload || lastPayload;
          combinedSummary.verifiedCount += outcome.summary.verifiedCount || 0;
          combinedSummary.unpricedCount += outcome.summary.unpricedCount || 0;
          combinedSummary.handsParsed += outcome.summary.handsParsed || 0;
          combinedSummary.decisionsAnalyzed += outcome.summary.decisionsAnalyzed || 0;
          combinedSummary.unsupportedCount += outcome.summary.unsupportedCount || outcome.payload?.unsupportedCount || 0;
          for (const handId of outcome.summary.savedHandIds || []) savedHandIds.add(handId);
          combinedSummary.savedHandIds = [...savedHandIds];
          combinedSummary.savedHandCount = savedHandIds.size;
          combinedSummary.savedForReview = savedHandIds.size > 0;
          if (!combinedSummary.reviewHref && outcome.summary.reviewHref) {
            combinedSummary.reviewHref = outcome.summary.reviewHref;
          }
          if (outcome.summary.hasVerifiedAdvice) combinedSummary.hasVerifiedAdvice = true;
          if (outcome.summary.complete === false || outcome.payload?.complete === false) {
            combinedSummary.complete = false;
          }
          if (outcome.summary.truncated === true || outcome.payload?.truncated === true) {
            combinedSummary.truncated = true;
            combinedSummary.complete = false;
          }
          if (!combinedSummary.drillHref && outcome.summary.drillHref) {
            combinedSummary.drillHref = outcome.summary.drillHref;
          }
          if (Array.isArray(outcome.summary.decisions) && combinedSummary.decisions.length < 12) {
            combinedSummary.decisions.push(
              ...outcome.summary.decisions.slice(0, Math.max(0, 12 - combinedSummary.decisions.length)),
            );
          }
          setBulkProgress({
            active: true,
            currentBatch: batchNum,
            completedBatches,
            totalBatches,
          });
        } else {
          failedBatches += 1;
          combinedSummary.complete = false;
          if (!firstError) {
            firstError = outcome?.error || 'One Or More Batches Could Not Be Audited.';
          }
          if (outcome?.status === 429 || outcome?.timedOut) {
            break;
          }
        }
      }

      bulkAbortRef.current = null;
      setBulkProgress(null);

      if (completedBatches > 0) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('pa-data-updated'));
          window.dispatchEvent(new Event('pa-sandbox-updated'));
        }
        onAnalyzed?.(lastPayload, combinedSummary);
      }

      if (needsSignIn) {
        setResult({ kind: 'signin' });
        setStatusAnnouncement('Sign In To Analyze.');
        return;
      }

      if (bulkCancelRef.current) {
        setStatusAnnouncement('Audit Cancelled By Player.');
        setResult({
          kind: 'error',
          title: 'Audit Cancelled',
          message: `Bulk Audit Cancelled After ${completedBatches} Of ${totalBatches} Batches.`,
          summary: combinedSummary,
        });
        return;
      }

      if (failedBatches > 0) {
        const partialTitle = completedBatches > 0 ? 'Partial Bulk Audit' : 'Could Not Analyze';
        const partialMessage = completedBatches > 0
          ? `Audited ${combinedSummary.handsParsed} Hand${combinedSummary.handsParsed === 1 ? '' : 's'} Across ${completedBatches} Of ${totalBatches} Batches Before An Error Occurred. ${firstError}`
          : (firstError || 'Could Not Analyze Hand History Batches.');
        setResult({
          kind: 'error',
          title: partialTitle,
          message: partialMessage,
          summary: combinedSummary,
        });
        setStatusAnnouncement(partialMessage);
        return;
      }

      setResult({ kind: 'ok', summary: combinedSummary });
      setStatusAnnouncement(`Finished Auditing ${combinedSummary.handsParsed} Hands Across ${totalBatches} Batches.`);
    } catch (err) {
      if (!isCurrent()) return;
      setBulkProgress(null);
      setResult({
        kind: 'error',
        title: 'Upload Failed',
        message: 'Could Not Read Or Audit The Selected File.',
      });
      setStatusAnnouncement('Could Not Read File.');
    }
  }, [bulkProgress?.active, onAnalyzed, runAudit, running, userId]);

  const handleCancelBulk = useCallback(() => {
    bulkCancelRef.current = true;
    try {
      bulkAbortRef.current?.abort();
    } catch (_) {}
    setBulkProgress(null);
  }, []);

  const handleFileChange = (e) => {
    if (running || bulkProgress?.active) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      processBulkFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (running || bulkProgress?.active) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processBulkFile(file);
    }
  };

  const pasteBlocked = !pasted.trim() || detected.supported === false;
  const id = (suffix) => `${baseId}-${suffix}`;
  const spotOneLineSummary = `${spot.heroCards.trim() || 'Cards Unset'} · ${spot.position} · ${spot.stackBb || '100'} BB · ${titleCase(spot.format)} · ${spot.board.trim() ? `Board ${spot.board.trim()}` : 'Preflop'}`;

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

      {/* Shared hidden file input for 1-tap .txt/.hh/.log upload from either Step 1 or Paste tab */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.hh,.log"
        onChange={handleFileChange}
        className="pa-vh"
        tabIndex={-1}
        id={id('file-input')}
        aria-label="Upload Hand History File"
      />

      <div style={{ display: 'grid', gap: 14 }} data-live-spot-quick-entry="true">
        <Segmented
          idPrefix="live-spot-tab"
          label="Entry Method"
          columns={2}
          value={tab}
          onChange={(next) => { setTab(next); setResult(null); }}
          options={TAB_OPTIONS}
        />

        {/* Live Progress Region During Multi-Batch Audit */}
        {bulkProgress?.active && (
          <div
            role="group"
            aria-label="Bulk Audit Status"
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
                className="pa-btn"
                onClick={handleCancelBulk}
                style={{ ...btn('ghost'), minHeight: 44, color: T.danger }}
                aria-label="Cancel Bulk Audit"
              >
                Cancel Audit
              </button>
            </div>
            <div
              role="progressbar"
              aria-label="Bulk Hand Audit Progress"
              aria-valuenow={Math.round(((bulkProgress.completedBatches ?? 0) / bulkProgress.totalBatches) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ width: '100%', height: 6, background: '#06111e', borderRadius: 3, overflow: 'hidden' }}
            >
              <div
                className="pa-progress-fill"
                data-testid="live-spot-bulk-progress-fill"
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #087cfa, #56d8ff)',
                  transform: `scaleX(${Math.max(0, Math.min(1, (bulkProgress.completedBatches ?? 0) / Math.max(1, bulkProgress.totalBatches)))})`,
                  transformOrigin: 'left center',
                }}
              />
            </div>
          </div>
        )}

        {tab === 'spot' ? (
          <form onSubmit={submitSpot} noValidate style={{ display: 'grid', gap: 12 }} aria-label="Live Quick Spot">
            {/* 2-Step Mobile Wizard Stepper */}
            <div
              role="group"
              aria-label="Spot Wizard Steps"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 6,
                padding: 4,
                borderRadius: R.sm,
                background: '#05080c',
                border: '1px solid rgba(140, 161, 180, 0.24)',
              }}
            >
              <button
                type="button"
                className="pa-btn"
                aria-current={wizardStep === 1 ? 'step' : undefined}
                onClick={() => setWizardStep(1)}
                style={{
                  ...btn(wizardStep === 1 ? 'primary' : 'ghost', { block: true }),
                  minHeight: 44,
                  fontSize: F.caption,
                }}
              >
                <span>1. Spot Setup</span>
              </button>
              <button
                type="button"
                className="pa-btn"
                aria-current={wizardStep === 2 ? 'step' : undefined}
                onClick={handleAdvanceToStep2}
                style={{
                  ...btn(wizardStep === 2 ? 'primary' : 'ghost', { block: true }),
                  minHeight: 44,
                  fontSize: F.caption,
                }}
              >
                <span>2. Your Action &amp; Review</span>
              </button>
            </div>

            {wizardStep === 1 ? (
              <div data-testid="live-spot-step-1" style={{ display: 'grid', gap: 12 }}>
                <Field id={id('hero')} label="Hero Cards">
                  <input
                    id={id('hero')}
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-pa-verbatim="true"
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
                      placeholder="100"
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

                <details className="pa-disclosure" open={Boolean(spot.board)}>
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
                        data-pa-verbatim="true"
                        value={spot.board}
                        onChange={(event) => update({ board: event.target.value })}
                        placeholder="Ts 9h 2c"
                        style={controlStyle}
                      />
                    </Field>
                    <p style={{ ...noteStyle, marginTop: 8 }}>Use Facing A Postflop Bet When You Add A Board.</p>
                  </div>
                </details>

                {/* 1-Tap Quick File Drop/Pick in Step 1 */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: R.sm,
                    border: `1px dashed ${isDragOver ? '#56d8ff' : 'rgba(140, 161, 180, 0.24)'}`,
                    background: isDragOver ? 'rgba(8, 124, 250, 0.12)' : '#091017',
                  }}
                >
                  <span style={{ fontSize: F.caption, color: '#9eb4c8' }}>
                    Have A Hand History File? Drop Or Pick .Txt / .Hh / .Log
                  </span>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={running || bulkProgress?.active}
                    style={{ ...btn('secondary'), minHeight: 44, padding: '6px 12px' }}
                  >
                    <span>Upload .Txt File</span>
                  </button>
                </div>

                {showErrors && !built.ok && (
                  <ul role="alert" style={{ margin: 0, paddingLeft: 18, color: T.danger, fontSize: F.bodySm, lineHeight: 1.45 }}>
                    {built.errors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                )}

                {/* Thumb-Zone Sticky Bottom Bar for Step 1 */}
                <div
                  data-testid="live-spot-step1-sticky-bar"
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 5,
                    paddingTop: 10,
                    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                    background: 'linear-gradient(180deg, rgba(5, 8, 12, 0.92) 0%, #05080c 24%, #091017 100%)',
                    borderTop: '1px solid rgba(140, 161, 180, 0.24)',
                  }}
                >
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={handleAdvanceToStep2}
                    disabled={running || bulkProgress?.active}
                    style={{ ...btn('primary', { block: true, disabled: running || bulkProgress?.active }), minHeight: 48, fontFamily: DISPLAY_FONT }}
                  >
                    <span>Review &amp; Action</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <div data-testid="live-spot-step-2" style={{ display: 'grid', gap: 12 }}>
                {/* Compact 1-Line Summary of the Spot */}
                <div
                  data-testid="live-spot-summary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: R.sm,
                    background: '#091017',
                    border: '1px solid rgba(140, 161, 180, 0.24)',
                    color: T.text,
                    fontSize: F.bodySm,
                    fontWeight: 700,
                  }}
                >
                  <span>{spotOneLineSummary}</span>
                </div>

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

                {/* Fast Thumb-Zone Action Buttons */}
                <div
                  role="group"
                  aria-label="Quick Action Picker"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 8,
                  }}
                >
                  {Object.entries(LIVE_SPOT_ACTION_LABELS).map(([value, label]) => {
                    const active = spot.action === value;
                    return (
                      <button
                        key={`action-pill-${value}`}
                        type="button"
                        className="pa-btn"
                        aria-pressed={active}
                        onClick={() => update({ action: value })}
                        style={{
                          ...btn(active ? 'primary' : 'secondary', { block: true }),
                          minHeight: 48,
                        }}
                      >
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {showErrors && !built.ok && (
                  <ul role="alert" style={{ margin: 0, paddingLeft: 18, color: T.danger, fontSize: F.bodySm, lineHeight: 1.45 }}>
                    {built.errors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                )}

                <p style={{ ...noteStyle, color: '#9eb4c8', fontSize: 12 }}>
                  Logged As Self-Reported Live Study · Kept Separate From Club Arena Live Verification
                </p>
                <p style={noteStyle}>
                  Only No-Limit Hold{'\u2019'}em Spots Are Checked. Anything Without A Verified Solver Match Is Saved As Unpriced, Never Guessed.
                </p>

                {/* Thumb-Zone Sticky Bottom Bar for Step 2 (Back + Analyze Spot) */}
                <div
                  data-testid="live-spot-step2-sticky-bar"
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 5,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(96px, 1fr) 2fr',
                    gap: 8,
                    paddingTop: 10,
                    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                    background: 'linear-gradient(180deg, rgba(5, 8, 12, 0.92) 0%, #05080c 24%, #091017 100%)',
                    borderTop: '1px solid rgba(140, 161, 180, 0.24)',
                  }}
                >
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => setWizardStep(1)}
                    disabled={running}
                    style={{ ...btn('secondary', { block: true, disabled: running }), minHeight: 48 }}
                  >
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    className="pa-btn"
                    aria-label="Analyze Live Spot"
                    disabled={running}
                    style={{ ...btn('primary', { block: true, disabled: running }), minHeight: 48, fontFamily: DISPLAY_FONT }}
                  >
                    <span>{running ? 'Analyzing…' : 'Analyze Spot'}</span>
                  </button>
                </div>
              </div>
            )}
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
                border: `2px dashed ${isDragOver ? '#56d8ff' : 'rgba(140, 161, 180, 0.24)'}`,
                background: isDragOver ? 'rgba(8, 124, 250, 0.12)' : '#091017',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: F.bodySm, color: T.text, fontWeight: 700 }}>
                Upload .Txt Hand History File
              </span>
              <span style={{ fontSize: F.caption, color: '#9eb4c8' }}>
                Select Or Drop PokerStars, GGPoker, ACR, Or ClubGG .Txt Files (Up To 5MB)
              </span>
              <button
                type="button"
                className="pa-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={running || bulkProgress?.active}
                style={{ ...btn('secondary'), minHeight: 44, padding: '8px 16px', cursor: 'pointer' }}
              >
                Choose .Txt File
              </button>
            </div>

            <Field id={id('paste')} label="Hand History Text">
              <textarea
                id={id('paste')}
                value={pasted}
                onChange={(event) => { setPasted(event.target.value); setResult(null); }}
                placeholder="Paste PokerStars, GGPoker, ACR Or ClubGG Hands Here"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                data-pa-verbatim="true"
                style={{ ...controlStyle, minHeight: 168, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </Field>

            {pasted.trim() && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }} data-detected-site={detected.site}>
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

            <div
              style={{
                position: 'sticky',
                bottom: 0,
                zIndex: 5,
                paddingTop: 10,
                paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                background: 'linear-gradient(180deg, rgba(5, 8, 12, 0.92) 0%, #05080c 24%, #091017 100%)',
                borderTop: '1px solid rgba(140, 161, 180, 0.24)',
              }}
            >
              <button type="submit" className="pa-btn" disabled={pasteBlocked || running || bulkProgress?.active} style={{ ...btn('primary', { block: true, disabled: pasteBlocked || running || bulkProgress?.active }), minHeight: 48, fontFamily: DISPLAY_FONT }}>
                {running ? 'Analyzing…' : 'Analyze Hand History'}
              </button>
            </div>
          </form>
        )}

        <AuditResult result={result} onDismiss={() => setResult(null)} />
        {/* Spacing keeps the last control clear of the iOS home indicator. */}
        <div style={{ height: S.sm }} aria-hidden="true" />
      </div>
    </BottomSheet>
  );
}
