/**
 * STUDY GROUP FINDER — Social Matchmaking
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Find Discord/Hub study partners filtered by stakes, timezone, format,
 * and study tool preference. Features group browsing, join requests,
 * creation form, and member compatibility scoring.
 *
 * Route: /hub/training/study-group-finder
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-56 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-17 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';
import TrainingSignInPrompt from '../../../src/components/training/TrainingSignInPrompt';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
// TRAIN-WIRE-EMPTY-9b — adoption: shared empty-state primitive

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
};

const DEFAULT_BOARD_CARDS = ['8d', '5c', '2s'];

const FORMATS = ['All', 'Cash', 'Tournament', 'Live Cash', 'PLO', 'Spins'];
const LEVELS = ['Any', 'Beginner', 'Intermediate', 'Advanced'];

// BUG FIX (TRAIN-STUDYFINDER-A11Y-1): SVG icons replacing the study-group
// avatar emoji set (▲ ★ □ ⌁ ◆ ») plus ✓ applied indicator and ← back.
// Groups gain avatarKind discriminator; AvatarIcon renders by kind. Legacy
// `avatar` emoji string preserved. Same surface-specific a11y pattern as
// PR #320/#322/#324/#327-#357.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=24, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function SharkIcon({ size=24 })    { return <_Svg size={size}><path d="M2 12c4-6 9-7 13-5 3 2 5 5 7 8-3 1-7 1-10-1-3-2-7-2-10-2z"/><circle cx="9" cy="11" r="0.6" fill="currentColor"/></_Svg>; }
function TrophyIcon({ size=24 })   { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function BookIcon({ size=24 })     { return <_Svg size={size}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></_Svg>; }
function BoltIcon({ size=24 })     { return <_Svg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_Svg>; }
function TargetIcon({ size=24 })   { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function SwordsIcon({ size=24 })   { return <_Svg size={size}><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><polyline points="19 21 21 21 21 19 14 12"/></_Svg>; }
function BackArrowIcon({ size=18 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function AvatarIcon({ kind, size=24 }) {
  switch (kind) {
    case 'shark':  return <SharkIcon size={size}/>;
    case 'trophy': return <TrophyIcon size={size}/>;
    case 'book':   return <BookIcon size={size}/>;
    case 'bolt':   return <BoltIcon size={size}/>;
    case 'target': return <TargetIcon size={size}/>;
    case 'swords': return <SwordsIcon size={size}/>;
    default:       return <TargetIcon size={size}/>;
  }
}


export default function StudyGroupFinderPage() {
  const router = useRouter();
  useTrainingBus('study-group-finder');

  const [filterFmt, setFilterFmt] = useState('All');
  const [filterLevel, setFilterLevel] = useState('Any');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [sortBy, setSortBy] = useState('slots'); // 'slots' | 'members' | 'name'
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [inviteHandled, setInviteHandled] = useState(false);
  // The directory is open to everyone (Dan, 2026-10-12: "THEY SHOULD OPEN TO
  // EVERYONE"). Creating and joining belong to an account, so a signed-out
  // visitor gets a sign-in prompt that returns them to the same action.
  const [signedOut, setSignedOut] = useState(false);
  const [signInPrompt, setSignInPrompt] = useState(null);
  const [brainVariant, setBrainVariant] = useState('nlh');
  const [isOnline, setIsOnline] = useState(true);
  const [form, setForm] = useState({
    name: '', format: 'Cash', stakes: '', timezone: '', focus: '', schedule: '', level: 'Any', maxMembers: 8,
  });

  useEffect(() => {
    if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine !== false);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const brainSpotInput = useMemo(
    () => ({
      gameId: brainVariant === 'nlh' ? 'cash-002' : 'cash-005',
      variant: brainVariant,
      street: 'flop',
      position: 'BTN',
      stackDepth: 100,
    }),
    [brainVariant]
  );

  const brainDecision = useMemo(() => {
    const heroCards = HERO_CARDS_BY_VARIANT[brainVariant] || HERO_CARDS_BY_VARIANT.nlh;
    const raw = evaluateTrainingSpotWithHorseBrain({
      gameId: brainSpotInput.gameId,
      variant: brainVariant,
      street: 'flop',
      heroCards,
      boardCards: DEFAULT_BOARD_CARDS,
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 6.5,
      toCall: 2.2,
      effectiveStackBb: 100,
    });
    const engineSource = raw.engineSource || raw.engineModule || 'holdem-brain.js';
    const recommendedAction = raw.recommendedAction || raw.correctAnswerText || raw.correctAnswer || 'Call 2.2 BB';
    const recommendedSizingBb =
      raw.recommendedSizingBb ??
      raw.potLimitSizing?.twoThirdsPotBetOrRaise ??
      raw.brainEvaluation?.potLimitBounds?.twoThirdsPotBetOrRaise ??
      4.5;
    const equityPct = raw.equityPct ?? raw.handScore ?? 68;
    const madeHandCategory = raw.madeHandCategory || raw.brainEvaluation?.madeHandCategory || 'postflop_hand';
    const potLimitMaxBetBb =
      raw.potLimitMaxBetBb ??
      raw.brainEvaluation?.potLimitMaxBetBb ??
      raw.potLimitSizing?.maxPotBetOrRaise ??
      10.9;
    return {
      ...raw,
      engineSource,
      recommendedAction,
      recommendedSizingBb,
      equityPct,
      madeHandCategory,
      potLimitMaxBetBb,
    };
  }, [brainVariant, brainSpotInput]);

  const loadGroups = useCallback(async () => {
    setError(null);
    try {
      // authedFetch attaches Authorization only when a session token exists.
      let anonymous = !getAccessToken();
      let response = await authedFetch('/api/training/study-groups');
      if (response.status === 401) {
        // A stored session that could not be refreshed reads the directory
        // signed out instead of failing.
        anonymous = true;
        response = await authedFetch('/api/training/study-groups', {
          anonymous: true,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Study groups could not be loaded');
      setSignedOut(anonymous);
      if (!anonymous) setSignInPrompt(null);
      setGroups(payload.groups || []);
    } catch (loadError) {
      setError(loadError?.message || 'Study groups could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const createGroup = async () => {
    if (busy) return;
    if (signedOut) {
      setSignInPrompt({
        message: 'Sign In To Create A Study Group.',
        returnPath: '/hub/training/study-group-finder',
      });
      return;
    }
    setBusy('create');
    setNotice(null);
    try {
      const response = await authedFetch('/api/training/study-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.group) throw new Error(payload?.error || 'Study group could not be created');
      setShowCreate(false);
      setForm({ name: '', format: 'Cash', stakes: '', timezone: '', focus: '', schedule: '', level: 'Any', maxMembers: 8 });
      await loadGroups();
      router.push(`/hub/training/study-group?roomId=${payload.group.id}`);
    } catch (createError) {
      setNotice({ type: 'error', text: createError?.message || 'Study group could not be created' });
    } finally {
      setBusy(null);
    }
  };

  const joinGroup = useCallback(async (group) => {
    if (busy) return;
    if (signedOut) {
      setSignInPrompt({
        message: `Sign In To Join ${group.name}.`,
        returnPath: `/hub/training/study-group-finder?join=${encodeURIComponent(group.id)}`,
      });
      return;
    }
    if (group.joined) {
      router.push(`/hub/training/study-group?roomId=${group.id}`);
      return;
    }
    setBusy(group.id);
    setNotice(null);
    try {
      const response = await authedFetch(`/api/training/study-groups/${group.id}`, { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Study group could not be joined');
      router.push(`/hub/training/study-group?roomId=${group.id}`);
    } catch (joinError) {
      setNotice({ type: 'error', text: joinError?.message || 'Study group could not be joined' });
    } finally {
      setBusy(null);
    }
  }, [busy, router, signedOut]);

  useEffect(() => {
    if (!router.isReady || inviteHandled || groups.length === 0 || !router.query.join) return;
    const invited = groups.find((group) => group.id === router.query.join);
    setInviteHandled(true);
    if (invited) joinGroup(invited);
    else setNotice({ type: 'error', text: 'That study group invite is no longer available.' });
  }, [router.isReady, router.query.join, inviteHandled, groups, joinGroup]);

  const filtered = useMemo(() => {
    let list = groups;
    if (filterFmt !== 'All')
      list = list.filter((g) => g.format === filterFmt || g.format.includes(filterFmt));
    if (filterLevel !== 'Any')
      list = list.filter((g) => g.level === filterLevel || g.level === 'Any');
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(s) ||
          g.focus.toLowerCase().includes(s) ||
          String(g.tool || '').toLowerCase().includes(s)
      );
    }
    // Sort
    if (sortBy === 'slots')
      list = [...list].sort((a, b) => a.max - a.members - (b.max - b.members));
    if (sortBy === 'members') list = [...list].sort((a, b) => b.members - a.members);
    if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [groups, filterFmt, filterLevel, search, sortBy]);

  return (
    <>
      <SEOHead
        title="Poker Study Group Finder Directory"
        description="Find Poker Study Partners And Accountability Cohorts By Stakes, Game Format, Skill Level, And Time Zone In The Study Group Directory On Smarter.Poker."
        canonical="/hub/training/study-group-finder"
      />
      <div
        className="sp-training-command sp-training-command--group-finder"
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          className="sp-command-header"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              aria-label="Back to training"
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: 'var(--sp-fg-muted)',
                fontSize: 18,
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: 6,
              }}
            >
              {/* TRAIN-STUDYFINDER-A11Y-1: SVG back arrow */}
              <BackArrowIcon size={18} />
            </button>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Study Group Finder</div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
                {groups.length} Live {groups.length === 1 ? 'Group' : 'Groups'}
              </div>
            </div>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (signedOut) {
                setShowCreate(false);
                createGroup();
                return;
              }
              setShowCreate(!showCreate);
            }}
            style={{
              background: 'var(--sp-accent-blue)',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
            }}
          >
            + Create Group
          </motion.button>
        </div>

        <div className="sp-command-main" style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
          {!isOnline && (
            <div
              role="status"
              data-offline-banner="true"
              style={{
                marginBottom: 14,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid rgba(251, 191, 36, 0.4)',
                background: 'rgba(251, 191, 36, 0.08)',
                color: '#fde68a',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Offline Mode Detected: Local Horse Brain Spot Evaluation Remains Active While Study Group Directory Sync Waits For Reconnection.
            </div>
          )}

          {brainDecision && (
            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainDecision.engineSource}
              data-recommended-action={brainDecision.recommendedAction}
              data-active-variant={brainVariant}
              style={{
                marginBottom: 18,
                padding: 18,
                borderRadius: 12,
                border: '1px solid rgba(59, 130, 246, 0.35)',
                background: 'rgba(2, 6, 23, 0.78)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--sp-accent-blue)', textTransform: 'uppercase' }}>
                  Horse Brain Spot Preview &amp; 1:1 Club Arena Drill Launcher
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-green)' }}>
                  Engine: {brainDecision.engineSource} | Action: {brainDecision.recommendedAction}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {['nlh', 'plo4', 'plo5', 'plo6'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-variant-option={v}
                    aria-pressed={brainVariant === v}
                    onClick={() => setBrainVariant(v)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: brainVariant === v ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.16)',
                      background: brainVariant === v ? 'rgba(59, 130, 246, 0.22)' : 'rgba(255,255,255,0.04)',
                      color: brainVariant === v ? '#e8fbff' : '#cbd5e1',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
                  gap: 8,
                  marginBottom: 12,
                  fontSize: 12,
                }}
              >
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ color: 'var(--sp-fg-dim)', fontWeight: 700 }}>Engine Source</div>
                  <div style={{ color: 'var(--sp-fg)', fontWeight: 800 }}>{brainDecision.engineSource}</div>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ color: 'var(--sp-fg-dim)', fontWeight: 700 }}>Recommended Action</div>
                  <div style={{ color: 'var(--sp-accent-green)', fontWeight: 800 }}>{brainDecision.recommendedAction}</div>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ color: 'var(--sp-fg-dim)', fontWeight: 700 }}>Sizing</div>
                  <div style={{ color: 'var(--sp-accent-blue)', fontWeight: 800 }}>{brainDecision.recommendedSizingBb} BB</div>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ color: 'var(--sp-fg-dim)', fontWeight: 700 }}>Equity</div>
                  <div style={{ color: 'var(--sp-accent-amber)', fontWeight: 800 }}>{brainDecision.equityPct}%</div>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ color: 'var(--sp-fg-dim)', fontWeight: 700 }}>Made Hand</div>
                  <div style={{ color: 'var(--sp-fg)', fontWeight: 800 }}>{brainDecision.madeHandCategory}</div>
                </div>
                {brainVariant.startsWith('plo') && (
                  <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                    <div style={{ color: 'var(--sp-fg-dim)', fontWeight: 700 }}>Pot-Limit Max Bet</div>
                    <div style={{ color: 'var(--sp-accent-blue)', fontWeight: 800 }}>{brainDecision.potLimitMaxBetBb} BB</div>
                  </div>
                )}
              </div>

              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#cbd5e1', lineHeight: 1.55 }}>
                {brainDecision.explanation}
              </p>

              <button
                type="button"
                data-launch-club-arena-cta="true"
                onClick={() => router.push(buildCustomTrainingArenaHref(brainSpotInput, 'study-group-finder'))}
                style={{
                  padding: '9px 14px',
                  borderRadius: 8,
                  border: '1px solid #3b82f6',
                  background: 'rgba(59, 130, 246, 0.22)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Launch Study Cohort Drill In Club Arena →
              </button>
            </div>
          )}

          <ErrorBanner message={error} onRetry={() => { setLoading(true); loadGroups(); }} />
          {signedOut && (
            <TrainingSignInPrompt
              returnPath={signInPrompt?.returnPath || '/hub/training/study-group-finder'}
              message={signInPrompt?.message || 'Browse Every Group Freely. Sign In To Create Or Join One.'}
            />
          )}
          {notice && (
            <div role="status" style={{ marginBottom: 12, color: notice.type === 'error' ? 'var(--sp-accent-red)' : 'var(--sp-accent-green)', fontSize: 12 }}>
              {notice.text}
            </div>
          )}
          {/* Create Group Form */}
          <AnimatePresence>
            {showCreate && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden', marginBottom: 16 }}
              >
                <div
                  style={{
                    padding: 20,
                    borderRadius: 12,
                    background: 'rgba(59,130,246,0.05)',
                    border: '1px solid rgba(59,130,246,0.15)',
                  }}
                >
                  <div
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-accent-blue)', marginBottom: 12 }}
                  >
                    Create New Study Group
                  </div>
                  <div
                    style={{ fontSize: 12, color: 'var(--sp-fg-dim)', lineHeight: 1.5, marginBottom: 12 }}
                  >
                    Create A Persistent Smarter.Poker Room. Members Can Join From This Finder And
                    Participate In The Room Discussion.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      placeholder="Group Name"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--sp-fg)',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                    <select
                      value={form.format}
                      onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))}
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--sp-fg)',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    >
                      {FORMATS.filter((f) => f !== 'All').map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Stakes Range"
                      value={form.stakes}
                      onChange={(event) => setForm((current) => ({ ...current, stakes: event.target.value }))}
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--sp-fg)',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                    <input
                      placeholder="Timezone (e.g., EST)"
                      value={form.timezone}
                      onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--sp-fg)',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                  </div>
                  <input
                    placeholder="Study Focus"
                    value={form.focus}
                    onChange={(event) => setForm((current) => ({ ...current, focus: event.target.value }))}
                    style={{
                      marginTop: 8,
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px',
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--sp-fg)',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={createGroup}
                    disabled={busy === 'create' || form.name.trim().length < 3}
                    style={{
                      marginTop: 12,
                      padding: '10px 20px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'var(--sp-fg-dim)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: busy === 'create' || form.name.trim().length < 3 ? 'not-allowed' : 'pointer',
                      width: '100%',
                    }}
                  >
                    {busy === 'create' ? 'Creating Group...' : 'Create Study Group'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups by name, focus, or tool..."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--sp-fg)',
              fontSize: 13,
              outline: 'none',
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />

          {/* Filters Row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterFmt(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 16,
                  border: `1px solid ${filterFmt === f ? 'var(--sp-accent-blue)' : 'rgba(255,255,255,0.08)'}`,
                  background: filterFmt === f ? 'rgba(59,130,246,0.08)' : 'transparent',
                  color: filterFmt === f ? 'var(--sp-accent-blue)' : 'var(--sp-fg-dim)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Level + Sort */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--sp-fg-faint)', fontWeight: 600 }}>Level:</span>
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setFilterLevel(l)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${filterLevel === l ? 'var(--sp-accent-purple)' : 'transparent'}`,
                  background: filterLevel === l ? 'rgba(168,85,247,0.06)' : 'transparent',
                  color: filterLevel === l ? 'var(--sp-accent-purple)' : 'var(--sp-fg-faint)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {l}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {[
                { k: 'slots', l: 'Open' },
                { k: 'members', l: 'Popular' },
                { k: 'name', l: 'A-Z' },
              ].map((s) => (
                <button
                  key={s.k}
                  type="button"
                  onClick={() => setSortBy(s.k)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: sortBy === s.k ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    color: sortBy === s.k ? 'var(--sp-fg-muted)' : 'var(--sp-fg-faint)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          {/* Group Cards */}
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--sp-fg-dim)' }}>Loading Study Groups...</div>
          )}
          {!loading && filtered.length === 0 && (
            <TrainerEmptyState
              variant="no-data"
              title="No Study Groups Match"
              message={groups.length === 0 ? 'Create the first live study group for this community.' : 'Try a different filter combination to find study groups.'}
              compact
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((g, i) => {
              const isFull = g.members >= g.max;
              const slotsLeft = g.max - g.members;

              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 14,
                    padding: 20,
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                    {/* Group Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}
                      >
                        {/* TRAIN-STUDYFINDER-A11Y-1: SVG AvatarIcon */}
                        <span style={{ fontSize: 24, display: 'inline-flex' }} aria-hidden>
                          <AvatarIcon kind={g.avatarKind} size={24} />
                        </span>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                            {g.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>{g.focus}</div>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          fontSize: 12,
                          color: 'var(--sp-fg-muted)',
                          flexWrap: 'wrap',
                          marginTop: 8,
                        }}
                      >
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'rgba(59,130,246,0.08)',
                            color: 'var(--sp-accent-blue)',
                            fontWeight: 600,
                          }}
                        >
                          {g.format}
                        </span>
                        <span>Stakes: {g.stakes}</span>
                        <span>TZ: {g.tz}</span>
                        <span>Tool: {g.tool}</span>
                        <span>Schedule: {g.schedule}</span>
                      </div>
                    </div>

                    {/* Slots + Apply */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 900,
                            color: isFull ? 'var(--sp-accent-red)' : slotsLeft <= 2 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-green)',
                          }}
                        >
                          {g.members}/{g.max}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)' }}>
                          {slotsLeft} {slotsLeft === 1 ? 'slot' : 'slots'} Left
                        </div>
                      </div>
                      <motion.button
                        type="button"
                        onClick={() => joinGroup(g)}
                        disabled={isFull && !g.joined || busy === g.id}
                        aria-label={`${g.joined ? 'Open' : 'Join'} ${g.name}`}
                        style={{
                          padding: '10px 20px',
                          borderRadius: 8,
                          background: g.joined ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                          border: `1px solid ${g.joined ? 'rgba(34,197,94,0.35)' : 'rgba(59,130,246,0.35)'}`,
                          color: g.joined ? 'var(--sp-accent-green)' : 'var(--sp-accent-blue)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: isFull && !g.joined || busy === g.id ? 'not-allowed' : 'pointer',
                          minWidth: 120,
                        }}
                      >
                        {busy === g.id ? 'Joining...' : g.joined ? 'Open Room' : isFull ? 'Group Full' : signedOut ? 'Sign In To Join' : 'Join Group'}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
      <HubPageSummary page="training-study-group-finder" />
    </>
  );
}
