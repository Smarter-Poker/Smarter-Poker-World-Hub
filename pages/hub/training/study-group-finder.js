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
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import { authedFetch } from '../../../src/lib/authUtils';
// TRAIN-WIRE-EMPTY-9b — adoption: shared empty-state primitive

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
  const [form, setForm] = useState({
    name: '', format: 'Cash', stakes: '', timezone: '', focus: '', schedule: '', level: 'Any', maxMembers: 8,
  });

  const loadGroups = useCallback(async () => {
    setError(null);
    try {
      const response = await authedFetch('/api/training/study-groups');
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Study groups could not be loaded');
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
  }, [busy, router]);

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
      <Head>
        <title>Study Group Finder | Smarter.Poker</title>
        <meta
          name="description"
          content="Find poker study partners by stakes, format, and timezone. Join or create a study group."
        />
      </Head>
      <div
        className="sp-training-command sp-training-command--group-finder"
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
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
              <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
                {groups.length} Live {groups.length === 1 ? 'Group' : 'Groups'}
              </div>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreate(!showCreate)}
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
          <ErrorBanner message={error} onRetry={() => { setLoading(true); loadGroups(); }} />
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
                    style={{ fontSize: 11, color: 'var(--sp-fg-dim)', lineHeight: 1.5, marginBottom: 12 }}
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
                onClick={() => setFilterFmt(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 16,
                  border: `1px solid ${filterFmt === f ? 'var(--sp-accent-blue)' : 'rgba(255,255,255,0.08)'}`,
                  background: filterFmt === f ? 'rgba(59,130,246,0.08)' : 'transparent',
                  color: filterFmt === f ? 'var(--sp-accent-blue)' : 'var(--sp-fg-dim)',
                  fontSize: 11,
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
            <span style={{ fontSize: 10, color: 'var(--sp-fg-faint)', fontWeight: 600 }}>Level:</span>
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setFilterLevel(l)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${filterLevel === l ? 'var(--sp-accent-purple)' : 'transparent'}`,
                  background: filterLevel === l ? 'rgba(168,85,247,0.06)' : 'transparent',
                  color: filterLevel === l ? 'var(--sp-accent-purple)' : 'var(--sp-fg-faint)',
                  fontSize: 10,
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
                  onClick={() => setSortBy(s.k)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: sortBy === s.k ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    color: sortBy === s.k ? 'var(--sp-fg-muted)' : 'var(--sp-fg-faint)',
                    fontSize: 9,
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
                          <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>{g.focus}</div>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          fontSize: 11,
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
                        <div style={{ fontSize: 10, color: 'var(--sp-fg-faint)' }}>
                          {slotsLeft} {slotsLeft === 1 ? 'slot' : 'slots'} Left
                        </div>
                      </div>
                      <motion.button
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
                        {busy === g.id ? 'Joining...' : g.joined ? 'Open Room' : isFull ? 'Group Full' : 'Join Group'}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
