/**
 * PERSONAL ASSISTANT · Review My Play
 * /hub/personal-assistant/review
 *
 * Owner-scoped private review workspace for saved Club Arena and scanned hands.
 * - Opens `?hand=<saved-row UUID>` directly and persists selection across reloads.
 * - Displays recorded actions, authorized cards only, and multi-board results.
 * - Persists private notes and review status with optimistic-concurrency conflict
 *   resolution (409) and interrupted-save durable readback recovery.
 * - Passes the canonical Club Arena source hand into `/api/assistant/leaks/hand-audit`
 *   and keeps "Saved" and "Analyzed" states strictly distinct.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Save,
  ScanSearch,
} from 'lucide-react';

import SEOHead from '../../../src/components/seo/SEOHead';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import { useModalHistory } from '../../../src/hooks/useModalHistory';
import styles from '../../../src/styles/worlds/PersonalAssistantReview.module.css';

const REQUEST_TIMEOUT_MS = 12000;
const SUITS = ['c', 'd', 'h', 's'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };

const REVIEW_STATUS_LABELS = {
  saved: 'Saved',
  in_review: 'In Review',
  reviewed: 'Reviewed',
};

const STREET_LABELS = {
  preflop: 'Preflop',
  pineapple_discard: 'Discard',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

function formatCardToken(card) {
  let code = '';
  if (typeof card === 'number' && Number.isInteger(card) && card >= 0 && card <= 51) {
    code = `${RANKS[card % 13]}${SUITS[Math.floor(card / 13)]}`;
  } else if (typeof card === 'string') {
    code = card.trim();
  }
  const match = code.match(/^(10|[2-9TJQKA])([shdc♠♥♦♣])$/i);
  if (!match) return { text: code || '?', red: false };
  const rawRank = match[1].toUpperCase();
  const rank = rawRank === 'T' ? '10' : rawRank;
  const rawSuit = match[2].toLowerCase();
  const glyph = SUIT_GLYPH[rawSuit] || match[2];
  const red = glyph === '♥' || glyph === '♦';
  return { text: `${rank}${glyph}`, red };
}

function formatChips(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n * 100) / 100 === Math.trunc(n)
    ? Math.trunc(n).toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedChips(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (n > 0) return `+${formatChips(n)}`;
  if (n < 0) return `-${formatChips(Math.abs(n))}`;
  return '0';
}

function formatDateStamp(value) {
  if (!value) return 'Recently Saved';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatActionVerb(verb) {
  const clean = String(verb || '').trim().toLowerCase();
  const map = {
    sb: 'Small Blind',
    bb: 'Big Blind',
    ante: 'Ante',
    straddle: 'Straddle',
    post: 'Post',
    fold: 'Fold',
    check: 'Check',
    call: 'Call',
    bet: 'Bet',
    raise: 'Raise',
    allin: 'All-In',
    all_in: 'All-In',
    discard: 'Discard',
    return: 'Uncalled Return',
  };
  return map[clean] || (clean ? clean.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Action');
}

function getReviewMeta(hand) {
  const raw = hand?.review || hand?.hand_data?.review || {};
  const status = REVIEW_STATUS_LABELS[raw.status] ? raw.status : 'saved';
  const analysisState = raw.analysisState === 'analyzed' ? 'analyzed' : 'not_analyzed';
  const revision = Number.isInteger(Number(raw.revision)) && Number(raw.revision) >= 1 ? Number(raw.revision) : 1;
  return {
    status,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    revision,
    updatedAt: raw.updatedAt || hand?.created_at || null,
    analysisState,
    analyzedAt: analysisState === 'analyzed' ? (raw.analyzedAt || null) : null,
    lastAuditSummary: analysisState === 'analyzed' ? (raw.lastAuditSummary || null) : null,
  };
}

function getBoards(hand) {
  const hd = hand?.hand_data || {};
  if (Array.isArray(hd.boards) && hd.boards.length > 0) {
    return hd.boards;
  }
  if (Array.isArray(hd.communityCards) && hd.communityCards.length > 0) {
    return [{ index: 1, label: 'Board 1', cards: hd.communityCards }];
  }
  return [];
}

function getStreets(hand) {
  const hd = hand?.hand_data || {};
  if (Array.isArray(hd.streets)) return hd.streets;
  if (hd.streets && typeof hd.streets === 'object') {
    return Object.entries(hd.streets)
      .filter(([, st]) => Array.isArray(st?.actions) && st.actions.length > 0)
      .map(([name, st]) => ({
        name,
        cards: Array.isArray(st?.cards) ? st.cards : [],
        actions: st.actions,
      }));
  }
  return [];
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

export default function PersonalAssistantReviewPage() {
  const router = useRouter();
  const { user, initializing: authInitializing } = useAvatar();
  const [showMenu, setShowMenu] = useState(false);
  const closeMenu = useCallback(() => setShowMenu(false), []);
  useModalHistory(showMenu, closeMenu);
  const menuConfig = getMenuConfig('personal-assistant', user, {}, {});

  const [hands, setHands] = useState([]);
  const [selectedHandId, setSelectedHandId] = useState('');
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready | error | signed_out
  const [loadError, setLoadError] = useState('');
  const [missingRequestedId, setMissingRequestedId] = useState('');

  // Editor state for the selected hand
  const [draftNotes, setDraftNotes] = useState('');
  const [draftStatus, setDraftStatus] = useState('saved');
  const [draftRevision, setDraftRevision] = useState(1);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error | interrupted | conflict
  const [saveError, setSaveError] = useState('');
  const [conflictServerHand, setConflictServerHand] = useState(null);

  // Analysis flow state (strictly distinct from Saved status)
  const [analysisStatus, setAnalysisStatus] = useState('idle'); // idle | loading | ready | error
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState('');

  const activeUserIdRef = useRef(user?.id || null);
  activeUserIdRef.current = user?.id || null;
  const loadGenRef = useRef(0);
  const saveAbortRef = useRef(null);
  const analysisAbortRef = useRef(null);

  const requestedQueryHandId = useMemo(() => {
    const raw = router?.query?.hand;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return typeof val === 'string' ? val.trim() : '';
  }, [router?.query?.hand]);

  const selectedHand = useMemo(
    () => hands.find((h) => String(h.id) === String(selectedHandId)) || null,
    [hands, selectedHandId],
  );

  const syncEditorFromHand = useCallback((hand) => {
    const meta = getReviewMeta(hand);
    setDraftNotes(meta.notes);
    setDraftStatus(meta.status);
    setDraftRevision(meta.revision);
    setSaveState('idle');
    setSaveError('');
    setConflictServerHand(null);
    setAnalysisStatus('idle');
    setAnalysisResult(null);
    setAnalysisError('');
  }, []);

  const loadSavedHands = useCallback(async ({ preferHandId = '' } = {}) => {
    const gen = ++loadGenRef.current;
    if (authInitializing) return;
    if (!user?.id) {
      setHands([]);
      setSelectedHandId('');
      setLoadStatus('signed_out');
      setLoadError('');
      return;
    }

    const expectedUserId = user.id;
    setLoadStatus('loading');
    setLoadError('');
    setMissingRequestedId('');

    try {
      const token = await getFreshAccessToken();
      if (gen !== loadGenRef.current || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        setLoadStatus('signed_out');
        return;
      }

      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      const targetId = preferHandId || requestedQueryHandId;

      const listPromise = fetchJsonWithTimeout('/api/poker/saved-hands?limit=200', {
        method: 'GET',
        cache: 'no-store',
        headers,
      });

      const directPromise = targetId
        ? fetchJsonWithTimeout(`/api/poker/saved-hands?id=${encodeURIComponent(targetId)}`, {
            method: 'GET',
            cache: 'no-store',
            headers,
          })
        : Promise.resolve(null);

      const [listRes, directRes] = await Promise.all([listPromise, directPromise]);
      if (gen !== loadGenRef.current || activeUserIdRef.current !== expectedUserId) return;

      if (!listRes.ok || !listRes.body?.success || !Array.isArray(listRes.body.hands)) {
        setLoadStatus('error');
        setLoadError(listRes.body?.error || 'Could Not Load Your Saved Hands. Please Retry.');
        return;
      }

      let loadedHands = listRes.body.hands;
      if (directRes && directRes.ok && directRes.body?.success && directRes.body?.hand) {
        const directRow = directRes.body.hand;
        if (!loadedHands.some((row) => String(row.id) === String(directRow.id))) {
          loadedHands = [directRow, ...loadedHands];
        }
      }

      setHands(loadedHands);
      setLoadStatus('ready');

      if (targetId) {
        const matched = loadedHands.find((row) => String(row.id) === String(targetId));
        if (matched) {
          setSelectedHandId(matched.id);
          syncEditorFromHand(matched);
          return;
        }
        setMissingRequestedId(targetId);
      }

      if (loadedHands.length > 0) {
        const first = loadedHands[0];
        setSelectedHandId(first.id);
        syncEditorFromHand(first);
      } else {
        setSelectedHandId('');
      }
    } catch (err) {
      if (gen !== loadGenRef.current || activeUserIdRef.current !== expectedUserId) return;
      setLoadStatus('error');
      setLoadError(err?.name === 'AbortError'
        ? 'Loading Timed Out. Check Your Connection And Retry.'
        : 'Could Not Load Your Saved Hands. Please Retry.');
    }
  }, [authInitializing, user?.id, requestedQueryHandId, syncEditorFromHand]);

  useEffect(() => {
    if (router?.isReady === false) return;
    loadSavedHands();
  }, [router?.isReady, loadSavedHands]);

  useEffect(() => () => {
    saveAbortRef.current?.abort?.();
    analysisAbortRef.current?.abort?.();
  }, []);

  const handleSelectHand = useCallback((hand) => {
    if (!hand?.id) return;
    saveAbortRef.current?.abort?.();
    analysisAbortRef.current?.abort?.();
    setSelectedHandId(hand.id);
    setMissingRequestedId('');
    syncEditorFromHand(hand);
    if (typeof router?.replace === 'function') {
      router.replace(
        { pathname: '/hub/personal-assistant/review', query: { hand: hand.id } },
        undefined,
        { shallow: true },
      );
    }
  }, [router, syncEditorFromHand]);

  const applyServerHand = useCallback((serverHand) => {
    if (!serverHand?.id) return;
    setHands((prev) => prev.map((row) => (String(row.id) === String(serverHand.id) ? serverHand : row)));
    const meta = getReviewMeta(serverHand);
    setDraftNotes(meta.notes);
    setDraftStatus(meta.status);
    setDraftRevision(meta.revision);
    setConflictServerHand(null);
  }, []);

  const submitReviewUpdate = useCallback(async ({ overrideRevision = null, reconcileBeforeWrite = false } = {}) => {
    if (!selectedHand?.id || !user?.id) return;
    if (saveState === 'saving') return;

    const targetHandId = selectedHand.id;
    const expectedUserId = user.id;
    const desiredNotes = draftNotes;
    const desiredStatus = draftStatus;
    let expectedRevision = overrideRevision ?? draftRevision;

    saveAbortRef.current?.abort?.();
    const controller = new AbortController();
    saveAbortRef.current = controller;

    setSaveState('saving');
    setSaveError('');

    try {
      const token = await getFreshAccessToken();
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        setSaveState('error');
        setSaveError('Your Session Expired. Sign In Again To Save Changes.');
        return;
      }
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Durable readback before retrying an interrupted save.
      if (reconcileBeforeWrite) {
        const readback = await fetchJsonWithTimeout(
          `/api/poker/saved-hands?id=${encodeURIComponent(targetHandId)}`,
          { method: 'GET', cache: 'no-store', headers, signal: controller.signal },
        );
        if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
        if (!readback.ok || !readback.body?.success || !readback.body?.hand) {
          setSaveState('interrupted');
          setSaveError('Could Not Confirm Whether Your Last Save Committed. Retry When Connected.');
          return;
        }
        const serverHand = readback.body.hand;
        const serverMeta = getReviewMeta(serverHand);
        if (serverMeta.notes === desiredNotes && serverMeta.status === desiredStatus) {
          applyServerHand(serverHand);
          setSaveState('saved');
          return;
        }
        if (serverMeta.revision !== expectedRevision) {
          setHands((prev) => prev.map((row) => (String(row.id) === String(serverHand.id) ? serverHand : row)));
          setConflictServerHand(serverHand);
          setSaveState('conflict');
          setSaveError('This Hand Changed Elsewhere Before Retry. Choose Whether To Reload Or Overwrite.');
          return;
        }
      }

      const patchRes = await fetchJsonWithTimeout('/api/poker/saved-hands', {
        method: 'PATCH',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          id: targetHandId,
          expectedRevision,
          notes: desiredNotes,
          reviewStatus: desiredStatus,
        }),
      });
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;

      if (patchRes.status === 409 && patchRes.body?.hand) {
        setHands((prev) => prev.map((row) => (String(row.id) === String(patchRes.body.hand.id) ? patchRes.body.hand : row)));
        setConflictServerHand(patchRes.body.hand);
        setSaveState('conflict');
        setSaveError(patchRes.body.error || 'This Hand Was Updated Elsewhere. Reload Or Overwrite.');
        return;
      }

      if (!patchRes.ok || !patchRes.body?.success || !patchRes.body?.hand) {
        const possiblyCommitted = patchRes.status >= 500 || patchRes.status === 408 || patchRes.status === 429;
        setSaveState(possiblyCommitted ? 'interrupted' : 'error');
        setSaveError(patchRes.body?.error || 'Could Not Save Your Review Changes. Your Draft Is Preserved.');
        return;
      }

      applyServerHand(patchRes.body.hand);
      setSaveState('saved');
    } catch (err) {
      if (controller.signal.aborted && activeUserIdRef.current !== expectedUserId) return;
      setSaveState('interrupted');
      setSaveError(
        err?.name === 'AbortError'
          ? 'Save Was Interrupted Before Confirmation. Retry Will Verify Server State First.'
          : 'Network Interrupted During Save. Your Draft Is Safe. Retry Will Reconcile First.',
      );
    }
  }, [selectedHand, user?.id, saveState, draftNotes, draftStatus, draftRevision, applyServerHand]);

  const handleAnalyzeHand = useCallback(async () => {
    const sourceHandId = selectedHand?.sourceHandId || selectedHand?.hand_data?.sourceHandId;
    if (!sourceHandId || !selectedHand?.id || !user?.id) return;
    if (analysisStatus === 'loading') return;

    const targetHandId = selectedHand.id;
    const expectedUserId = user.id;

    analysisAbortRef.current?.abort?.();
    const controller = new AbortController();
    analysisAbortRef.current = controller;

    setAnalysisStatus('loading');
    setAnalysisError('');

    try {
      const token = await getFreshAccessToken();
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        setAnalysisStatus('error');
        setAnalysisError('Sign In To Analyze This Hand.');
        return;
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const res = await fetchJsonWithTimeout('/api/assistant/leaks/hand-audit', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ handId: sourceHandId }),
      }, 25000);
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;

      if (!res.ok || !res.body?.success) {
        setAnalysisStatus('error');
        setAnalysisError(res.body?.error || 'Hand Analysis Could Not Complete Right Now.');
        return;
      }

      setAnalysisResult(res.body);
      setAnalysisStatus('ready');

      // Record explicit analyzed receipt separately from Saved review status.
      const currentMeta = getReviewMeta(selectedHand);
      const receiptRes = await fetchJsonWithTimeout('/api/poker/saved-hands', {
        method: 'PATCH',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          id: targetHandId,
          expectedRevision: currentMeta.revision,
          analysisState: 'analyzed',
          lastAuditSummary: {
            solverVerifiedCount: Number(res.body.solverVerifiedCount || 0),
            unpricedCount: Number(res.body.unpricedCount || 0),
            matchedLeaksCount: Array.isArray(res.body.matchedLeaks) ? res.body.matchedLeaks.length : 0,
            strategySupported: res.body.strategySupported !== false,
            declineReason: res.body.declineReason || null,
          },
        }),
      });
      if (!controller.signal.aborted && receiptRes.ok && receiptRes.body?.success && receiptRes.body?.hand) {
        setHands((prev) => prev.map((row) => (String(row.id) === String(receiptRes.body.hand.id) ? receiptRes.body.hand : row)));
        const nextMeta = getReviewMeta(receiptRes.body.hand);
        setDraftRevision(nextMeta.revision);
      }
    } catch (err) {
      if (controller.signal.aborted && activeUserIdRef.current !== expectedUserId) return;
      setAnalysisStatus('error');
      setAnalysisError('Analysis Request Was Interrupted. Please Retry.');
    }
  }, [selectedHand, user?.id, analysisStatus]);

  const selectedMeta = selectedHand ? getReviewMeta(selectedHand) : null;
  const selectedBoards = selectedHand ? getBoards(selectedHand) : [];
  const selectedStreets = selectedHand ? getStreets(selectedHand) : [];
  const selectedPlayers = Array.isArray(selectedHand?.hand_data?.players) ? selectedHand.hand_data.players : [];
  const selectedWinnersByBoard = Array.isArray(selectedHand?.hand_data?.winnersByBoard)
    ? selectedHand.hand_data.winnersByBoard
    : [];
  const selectedWinners = Array.isArray(selectedHand?.hand_data?.winners)
    ? selectedHand.hand_data.winners
    : [];
  const selectedSourceHandId = selectedHand?.sourceHandId || selectedHand?.hand_data?.sourceHandId || null;

  const isDirty = selectedMeta
    ? (draftNotes !== selectedMeta.notes || draftStatus !== selectedMeta.status)
    : false;

  return (
    <PageTransition disableInitialAnimation>
      <SEOHead
        title="Review My Play - Personal Assistant"
        description="Review Your Saved Club Arena Hands, Record Private Notes, And Launch Verified Hand Analysis Inside Personal Assistant."
        canonical="/hub/personal-assistant/review"
      />
      <PersonalAssistantCopyPolicy />
      <HubPageShell
        className="pa"
        maxWidth={1120}
        header={<UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(!showMenu)} />}
      >
        <div className={styles.page}>
          <HamburgerMenu
            isOpen={showMenu}
            onClose={closeMenu}
            direction="left"
            theme="pa"
            user={user}
            menuItems={menuConfig.menuItems}
            bottomLinks={menuConfig.bottomLinks}
          />

          <div className={styles.main}>
            <header className={styles.headerRow}>
              <div className={styles.headerCopy}>
                <span className={styles.eyebrow}>Personal Assistant · Saved Hand Review</span>
                <h1 className={styles.title}>Review My Play</h1>
                <p className={styles.subtitle}>
                  Inspect Saved Hands, Keep Private Notes, And Send Completed Hands Into Verified Analysis.
                </p>
              </div>
              <div className={styles.headerActions}>
                <Link href="/hub/personal-assistant" className={styles.secondaryBtn}>
                  <ArrowLeft size={15} aria-hidden="true" />
                  Personal Assistant
                </Link>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => loadSavedHands({ preferHandId: selectedHandId || requestedQueryHandId })}
                  disabled={loadStatus === 'loading'}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Refresh
                </button>
              </div>
            </header>

            {loadStatus === 'loading' && (
              <section className={styles.panel} role="status" aria-live="polite" aria-busy="true">
                <div className={styles.emptyState}>
                  <h2>Loading Saved Hands</h2>
                  <p>Fetching Your Private Saved Hands And Review Notes.</p>
                </div>
              </section>
            )}

            {loadStatus === 'signed_out' && (
              <section className={styles.panel}>
                <div className={styles.emptyState}>
                  <h2>Sign In To Review Your Saved Hands</h2>
                  <p>Your Saved Hands And Private Notes Are Owner-Scoped And Require An Active Account.</p>
                  <Link href="/auth/login?next=/hub/personal-assistant/review" className={styles.primaryBtn}>
                    Sign In
                  </Link>
                </div>
              </section>
            )}

            {loadStatus === 'error' && (
              <section className={styles.panel}>
                <div className={styles.alertBox} role="alert">
                  <strong>Could Not Load Saved Hands</strong>
                  <span>{loadError}</span>
                  <div className={styles.actionBar}>
                    <button type="button" className={styles.primaryBtn} onClick={() => loadSavedHands()}>
                      Retry
                    </button>
                  </div>
                </div>
              </section>
            )}

            {loadStatus === 'ready' && hands.length === 0 && (
              <section className={styles.panel}>
                <div className={styles.emptyState}>
                  <h2>No Saved Hands Yet</h2>
                  <p>
                    Tap Log This Hand Inside Club Arena Previous Hands, Or Log A Hand From Personal Assistant Home To Start Building Your Review Queue.
                  </p>
                  <div className={styles.actionBar}>
                    <Link href="/hub/personal-assistant" className={styles.primaryBtn}>
                      Back To Personal Assistant
                    </Link>
                    <Link href="/hub/personal-assistant/leaks" className={styles.secondaryBtn}>
                      Open My Leaks
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {loadStatus === 'ready' && hands.length > 0 && (
              <>
                {missingRequestedId && (
                  <div className={styles.alertBox} role="status">
                    <span>
                      Requested Hand <code>{missingRequestedId}</code> Was Not Found In Your Saved Hands. Showing Your Latest Saved Hand Instead.
                    </span>
                  </div>
                )}

                <div className={styles.workspace}>
                  {/* Saved Hands Queue */}
                  <aside className={styles.panel} aria-label="Saved Hands List">
                    <div className={styles.panelHead}>
                      <h2>Saved Hands</h2>
                      <span className={styles.panelCount}>{hands.length}</span>
                    </div>
                    <div className={styles.handList}>
                      {hands.map((hand) => {
                        const meta = getReviewMeta(hand);
                        const isSelected = String(hand.id) === String(selectedHand?.id);
                        const heroNet = Number(hand.hand_data?.heroNet ?? hand.hand_data?.players?.find((p) => p.isHero)?.netResult ?? 0);
                        return (
                          <button
                            key={hand.id}
                            type="button"
                            className={`${styles.handRow} ${isSelected ? styles.handRowActive : ''}`}
                            aria-current={isSelected ? 'true' : undefined}
                            onClick={() => handleSelectHand(hand)}
                          >
                            <div className={styles.handRowTop}>
                              <span>
                                {hand.hand_number ? `Hand #${hand.hand_number}` : 'Saved Hand'} · {hand.variant || 'NLH'}
                              </span>
                              <span className={heroNet > 0 ? styles.netPos : heroNet < 0 ? styles.netNeg : ''}>
                                {formatSignedChips(heroNet)}
                              </span>
                            </div>
                            <div className={styles.handRowMeta}>
                              <span>{hand.small_blind}/{hand.big_blind}</span>
                              <span>·</span>
                              <span>Pot {formatChips(hand.pot_total)}</span>
                              <span>·</span>
                              <span>{formatDateStamp(hand.completed_at || hand.created_at)}</span>
                            </div>
                            <div className={styles.badgeRow}>
                              <span className={`${styles.badge} ${meta.status === 'reviewed' ? styles.badgeReviewed : styles.badgeSaved}`}>
                                {REVIEW_STATUS_LABELS[meta.status]}
                              </span>
                              <span className={`${styles.badge} ${meta.analysisState === 'analyzed' ? styles.badgeAnalyzed : styles.badgeNotAnalyzed}`}>
                                {meta.analysisState === 'analyzed' ? 'Analyzed' : 'Not Analyzed'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </aside>

                  {/* Active Saved Hand Detail & Review Editor */}
                  {selectedHand && selectedMeta && (
                    <div className={styles.detailStack}>
                      {/* Overview & Distinct State Badges */}
                      <section className={styles.panel} aria-label="Selected Saved Hand">
                        <div className={styles.panelHead}>
                          <h2>
                            {selectedHand.hand_number ? `Hand #${selectedHand.hand_number}` : 'Saved Hand'}
                            {selectedHand.hand_data?.tableName ? ` · ${selectedHand.hand_data.tableName}` : ''}
                          </h2>
                          <div className={styles.badgeRow}>
                            <span
                              data-testid="review-status-badge"
                              className={`${styles.badge} ${selectedMeta.status === 'reviewed' ? styles.badgeReviewed : styles.badgeSaved}`}
                            >
                              {REVIEW_STATUS_LABELS[selectedMeta.status]}
                            </span>
                            <span
                              data-testid="analysis-status-badge"
                              className={`${styles.badge} ${selectedMeta.analysisState === 'analyzed' ? styles.badgeAnalyzed : styles.badgeNotAnalyzed}`}
                            >
                              {selectedMeta.analysisState === 'analyzed' ? 'Analyzed' : 'Not Analyzed'}
                            </span>
                          </div>
                        </div>

                        <div className={styles.summaryGrid}>
                          <div className={styles.statBox}>
                            <span className={styles.statLabel}>Variant</span>
                            <span className={styles.statValue}>{selectedHand.variant || 'NLH'}</span>
                          </div>
                          <div className={styles.statBox}>
                            <span className={styles.statLabel}>Stakes</span>
                            <span className={styles.statValue}>
                              {selectedHand.small_blind}/{selectedHand.big_blind}
                            </span>
                          </div>
                          <div className={styles.statBox}>
                            <span className={styles.statLabel}>Total Pot</span>
                            <span className={styles.statValue}>{formatChips(selectedHand.pot_total)}</span>
                          </div>
                          <div className={styles.statBox}>
                            <span className={styles.statLabel}>Your Result</span>
                            <span
                              className={`${styles.statValue} ${
                                Number(selectedHand.hand_data?.heroNet ?? 0) > 0
                                  ? styles.netPos
                                  : Number(selectedHand.hand_data?.heroNet ?? 0) < 0
                                    ? styles.netNeg
                                    : ''
                              }`}
                            >
                              {formatSignedChips(selectedHand.hand_data?.heroNet ?? 0)}
                            </span>
                          </div>
                        </div>

                        {/* Boards & Multi-Board Results */}
                        {selectedBoards.length > 0 && (
                          <div className={styles.boardList} aria-label="Boards">
                            {selectedBoards.map((board, bIdx) => {
                              const boardNumber = Number(board.index || bIdx + 1);
                              const boardWins = selectedWinnersByBoard.filter((w) => Number(w.board) === boardNumber);
                              return (
                                <div key={`board-${boardNumber}`} className={styles.boardRow}>
                                  <div className={styles.cardsGroup}>
                                    <span className={styles.boardLabel}>{board.label || `Board ${boardNumber}`}</span>
                                    {(board.cards || []).map((c, cIdx) => {
                                      const tok = formatCardToken(c);
                                      return (
                                        <span
                                          key={`b${boardNumber}-c${cIdx}`}
                                          data-pa-verbatim="true"
                                          className={`${styles.cardChip} ${tok.red ? styles.cardRed : ''}`}
                                        >
                                          {tok.text}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  {boardWins.length > 0 && (
                                    <div className={styles.boardWinner}>
                                      {boardWins.map((w, wIdx) => (
                                        <span key={`bw-${boardNumber}-${wIdx}`}>
                                          {wIdx > 0 ? ' · ' : ''}
                                          {w.playerName}
                                          {w.low ? ' (Low)' : ''}
                                          {w.hand ? ` (${w.hand})` : ''}
                                          {w.amount ? ` (+${formatChips(w.amount)})` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {selectedWinnersByBoard.length === 0 && selectedWinners.length > 0 && (
                          <div className={styles.boardWinner}>
                            Winners:{' '}
                            {selectedWinners.map((w, idx) => (
                              <span key={`win-${idx}`}>
                                {idx > 0 ? ' · ' : ''}
                                {w.playerName || 'Winner'}
                                {w.hand ? ` (${w.hand})` : ''}
                                {w.amount ? ` ${formatChips(w.amount)}` : ''}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Players & Authorized Cards Only */}
                        {selectedPlayers.length > 0 && (
                          <div className={styles.playerList} aria-label="Players And Cards">
                            {selectedPlayers.map((p, pIdx) => {
                              const cards = Array.isArray(p.holeCards) ? p.holeCards : [];
                              const net = Number(p.netResult ?? 0);
                              return (
                                <div key={`player-${pIdx}`} className={styles.playerRow}>
                                  <div className={styles.playerIdentity}>
                                    <span>{p.position ? `${p.position} · ` : ''}{p.name || `Seat ${p.seatIndex || pIdx + 1}`}</span>
                                    {p.isHero && <span className={`${styles.badge} ${styles.badgeSaved}`}>You</span>}
                                    {p.isHero && p.cardsVisibility === 'private_hero' && (
                                      <span className={styles.badge}>Private</span>
                                    )}
                                  </div>
                                  <div className={styles.cardsGroup}>
                                    {cards.length > 0 ? (
                                      cards.map((c, cIdx) => {
                                        const tok = formatCardToken(c);
                                        return (
                                          <span
                                            key={`p${pIdx}-c${cIdx}`}
                                            data-pa-verbatim="true"
                                            className={`${styles.cardChip} ${tok.red ? styles.cardRed : ''}`}
                                          >
                                            {tok.text}
                                          </span>
                                        );
                                      })
                                    ) : (
                                      <span className={`${styles.cardChip} ${styles.cardHidden}`} aria-label="Hidden Cards">
                                        Hidden
                                      </span>
                                    )}
                                  </div>
                                  <span className={net > 0 ? styles.netPos : net < 0 ? styles.netNeg : ''}>
                                    {formatSignedChips(net)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Recorded Street-By-Street Actions */}
                        {selectedStreets.length > 0 && (
                          <div className={styles.streetList} aria-label="Recorded Actions">
                            {selectedStreets.map((st, sIdx) => (
                              <div key={`street-${st.name}-${sIdx}`} className={styles.streetCard}>
                                <div className={styles.streetHeader}>
                                  <span className={styles.streetTitle}>
                                    {STREET_LABELS[st.name] || st.name}
                                  </span>
                                  {Array.isArray(st.cards) && st.cards.length > 0 && (
                                    <div className={styles.cardsGroup}>
                                      {st.cards.map((c, cIdx) => {
                                        const tok = formatCardToken(c);
                                        return (
                                          <span
                                            key={`st${sIdx}-c${cIdx}`}
                                            data-pa-verbatim="true"
                                            className={`${styles.cardChip} ${tok.red ? styles.cardRed : ''}`}
                                          >
                                            {tok.text}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                <ul className={styles.actionList}>
                                  {(st.actions || []).map((a, aIdx) => (
                                    <li
                                      key={`st${sIdx}-a${aIdx}`}
                                      className={`${styles.actionRow} ${a.isHero ? styles.actionRowHero : ''}`}
                                    >
                                      <span>
                                        {a.position ? `${a.position} · ` : ''}
                                        <strong>{a.playerName || (a.isHero ? 'You' : 'Player')}</strong>
                                      </span>
                                      <span>
                                        {formatActionVerb(a.action)}
                                        {a.amount !== null && a.amount !== undefined && Number(a.amount) > 0
                                          ? ` ${formatChips(a.amount)}`
                                          : ''}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

                      {/* Private Notes & Review Status Persistence */}
                      <section className={styles.panel} aria-label="Private Review Notes">
                        <div className={styles.panelHead}>
                          <h2>Private Notes &amp; Review Status</h2>
                          <span className={styles.panelCount}>Revision {draftRevision}</span>
                        </div>

                        <div className={styles.formGroup}>
                          <label htmlFor="review-status-select" className={styles.formLabel}>
                            Review Status
                          </label>
                          <select
                            id="review-status-select"
                            className={styles.selectInput}
                            value={draftStatus}
                            onChange={(e) => setDraftStatus(e.target.value)}
                          >
                            <option value="saved">Saved</option>
                            <option value="in_review">In Review</option>
                            <option value="reviewed">Reviewed</option>
                          </select>
                        </div>

                        <div className={styles.formGroup}>
                          <label htmlFor="review-notes-input" className={styles.formLabel}>
                            Private Notes
                          </label>
                          <textarea
                            id="review-notes-input"
                            className={styles.notesInput}
                            value={draftNotes}
                            maxLength={4000}
                            placeholder="Write Your Private Read, Sizing Thoughts, Or Follow-Up Questions For This Hand."
                            onChange={(e) => setDraftNotes(e.target.value)}
                          />
                        </div>

                        {saveState === 'conflict' && conflictServerHand && (
                          <div className={styles.conflictBox} role="alert" data-testid="revision-conflict-banner">
                            <strong>Revision Conflict Detected</strong>
                            <span>{saveError}</span>
                            <span>
                              Latest Server Status: <strong>{REVIEW_STATUS_LABELS[getReviewMeta(conflictServerHand).status]}</strong> (Revision {getReviewMeta(conflictServerHand).revision})
                            </span>
                            <span>
                              Latest Server Notes: {getReviewMeta(conflictServerHand).notes || 'Empty'}
                            </span>
                            <div className={styles.actionBar}>
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={() => {
                                  applyServerHand(conflictServerHand);
                                  setSaveState('idle');
                                  setSaveError('');
                                }}
                              >
                                Reload Latest
                              </button>
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                onClick={() => submitReviewUpdate({ overrideRevision: getReviewMeta(conflictServerHand).revision })}
                              >
                                Keep My Changes And Save
                              </button>
                            </div>
                          </div>
                        )}

                        {(saveState === 'error' || saveState === 'interrupted') && (
                          <div className={styles.alertBox} role="alert" data-testid="save-error-banner">
                            <strong>
                              <AlertTriangle size={14} aria-hidden="true" />{' '}
                              {saveState === 'interrupted' ? 'Save Interrupted' : 'Save Error'}
                            </strong>
                            <span>{saveError}</span>
                            <div className={styles.actionBar}>
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                onClick={() => submitReviewUpdate({ reconcileBeforeWrite: saveState === 'interrupted' })}
                              >
                                Retry Save
                              </button>
                            </div>
                          </div>
                        )}

                        <div className={styles.formFooter}>
                          <span className={styles.statusText} role="status" aria-live="polite">
                            {saveState === 'saving'
                              ? 'Saving Review Changes…'
                              : saveState === 'saved' && !isDirty
                                ? 'Private Notes And Status Saved.'
                                : isDirty
                                  ? 'Unsaved Changes.'
                                  : `Last Updated ${formatDateStamp(selectedMeta.updatedAt)}`}
                          </span>
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            disabled={saveState === 'saving' || (!isDirty && saveState !== 'interrupted' && saveState !== 'error')}
                            onClick={() => submitReviewUpdate({ reconcileBeforeWrite: saveState === 'interrupted' })}
                          >
                            <Save size={15} aria-hidden="true" />
                            {saveState === 'saving' ? 'Saving…' : 'Save Review'}
                          </button>
                        </div>
                      </section>

                      {/* Verified Analysis Handoff (Distinct From Saved State) */}
                      <section className={styles.panel} aria-label="Hand Analysis">
                        <div className={styles.panelHead}>
                          <h2>Verified Hand Analysis</h2>
                          <span className={styles.panelCount}>
                            {selectedMeta.analysisState === 'analyzed'
                              ? `Analyzed ${formatDateStamp(selectedMeta.analyzedAt)}`
                              : 'Not Analyzed Yet'}
                          </span>
                        </div>

                        {selectedSourceHandId ? (
                          <>
                            <p className={styles.subtitle}>
                              Saving A Hand Keeps It Private In Your Queue Without Analyzing It. Run Analysis When Ready To Inspect Verified Solver References For Canonical Hand <code>{selectedSourceHandId.slice(0, 8)}</code>.
                            </p>
                            <div className={styles.actionBar}>
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                disabled={analysisStatus === 'loading'}
                                onClick={handleAnalyzeHand}
                              >
                                <ScanSearch size={15} aria-hidden="true" />
                                {analysisStatus === 'loading' ? 'Analyzing Hand…' : 'Analyze Hand'}
                              </button>
                              <Link
                                href={`/hub/personal-assistant/leaks?hand=${encodeURIComponent(selectedSourceHandId)}&source=personal-assistant-review`}
                                className={styles.secondaryBtn}
                              >
                                <ExternalLink size={15} aria-hidden="true" />
                                Open In Leak Finder
                              </Link>
                            </div>

                            {analysisStatus === 'error' && (
                              <div className={styles.alertBox} role="alert">
                                <span>{analysisError}</span>
                              </div>
                            )}

                            {(analysisResult || selectedMeta.lastAuditSummary) && (
                              <div className={styles.conflictBox} role="status">
                                <strong>
                                  <CheckCircle2 size={14} aria-hidden="true" /> Analysis Complete
                                </strong>
                                {(() => {
                                  const summary = analysisResult
                                    ? {
                                        solverVerifiedCount: Number(analysisResult.solverVerifiedCount || 0),
                                        unpricedCount: Number(analysisResult.unpricedCount || 0),
                                        matchedLeaksCount: Array.isArray(analysisResult.matchedLeaks) ? analysisResult.matchedLeaks.length : 0,
                                        strategySupported: analysisResult.strategySupported !== false,
                                        declineReason: analysisResult.declineReason || null,
                                      }
                                    : selectedMeta.lastAuditSummary;
                                  if (!summary) return null;
                                  if (!summary.strategySupported && summary.declineReason) {
                                    return <span>{summary.declineReason}</span>;
                                  }
                                  return (
                                    <span>
                                      Verified Decisions: {summary.solverVerifiedCount} · Unpriced Decisions: {summary.unpricedCount} · Matched Leaks: {summary.matchedLeaksCount}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className={styles.subtitle}>
                            This Saved Hand Does Not Carry A Canonical Club Arena Source Hand Identifier. You Can Still Keep Private Notes And Review Status Here.
                          </p>
                        )}
                      </section>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </HubPageShell>
    </PageTransition>
  );
}
