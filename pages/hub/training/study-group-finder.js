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
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
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
      <div className={st.shell}>
        <TrainingPageHead slug="training-study-group-finder">
          <p className="sp-head-note"><strong>{groups.length}</strong> Live {groups.length === 1 ? 'Group' : 'Groups'}</p>
          <button
            type="button"
            className="sd-button sd-primary"
            aria-expanded={showCreate}
            onClick={() => {
              if (signedOut) {
                setShowCreate(false);
                createGroup();
                return;
              }
              setShowCreate(!showCreate);
            }}
          >
            + Create Group
          </button>
        </TrainingPageHead>

        <div className={st.page}>
          {!isOnline && (
            <p role="status" data-offline-banner="true" className={st.notice}>
              Offline. Study Group Directory Sync Will Resume After Reconnection.
            </p>
          )}


          <ErrorBanner message={error} onRetry={() => { setLoading(true); loadGroups(); }} />
          {signedOut && (
            <TrainingSignInPrompt
              returnPath={signInPrompt?.returnPath || '/hub/training/study-group-finder'}
              message={signInPrompt?.message || 'Browse Every Group Freely. Sign In To Create Or Join One.'}
            />
          )}
          {notice && (
            <p role="status" className={notice.type === 'error' ? st.error : st.notice}>
              {notice.text}
            </p>
          )}
          {/* Create Group Form */}
          <AnimatePresence>
            {showCreate && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <section className={`sd-panel ${st.panel}`} aria-labelledby="create-group-title">
                  <h2 id="create-group-title" className={st.title}>Create New Study Group</h2>
                  <p className={st.copy}>
                    Create A Persistent Smarter.Poker Room. Members Can Join From This Finder And
                    Participate In The Room Discussion.
                  </p>
                  <div className={st.grid2}>
                    <label className={st.field}>
                      <span className={st.label}>Group Name</span>
                      <input
                        placeholder="Group Name"
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        className={st.input}
                      />
                    </label>
                    <label className={st.field}>
                      <span className={st.label}>Format</span>
                      <select
                        value={form.format}
                        onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))}
                        className={st.input}
                      >
                        {FORMATS.filter((f) => f !== 'All').map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label className={st.field}>
                      <span className={st.label}>Stakes Range</span>
                      <input
                        placeholder="Stakes Range"
                        value={form.stakes}
                        onChange={(event) => setForm((current) => ({ ...current, stakes: event.target.value }))}
                        className={st.input}
                      />
                    </label>
                    <label className={st.field}>
                      <span className={st.label}>Timezone (For Example EST)</span>
                      <input
                        placeholder="Timezone (For Example EST)"
                        value={form.timezone}
                        onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                        className={st.input}
                      />
                    </label>
                  </div>
                  <label className={st.field}>
                    <span className={st.label}>Study Focus</span>
                    <input
                        placeholder="Study Focus"
                        value={form.focus}
                        onChange={(event) => setForm((current) => ({ ...current, focus: event.target.value }))}
                        className={st.input}
                      />
                  </label>
                  <button
                    type="button"
                    onClick={createGroup}
                    disabled={busy === 'create' || form.name.trim().length < 3}
                    className={`sd-button sd-primary ${st.block}`}
                  >
                    {busy === 'create' ? 'Creating Group...' : 'Create Study Group'}
                  </button>
                  {form.name.trim().length < 3 && <p className={st.small}>Group Names Need At Least 3 Characters.</p>}
                </section>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups by name, focus, or tool..."
            aria-label="Search Study Groups"
            className={st.input}
          />

          {/* Filters Row */}
          <section className={`sd-panel ${st.panel}`} aria-label="Study Group Filters">
            <fieldset className={st.fieldset}>
              <legend className={st.label}>Format</legend>
              <div className={st.chips}>
                {FORMATS.map((f) => (
                  <button key={f} type="button" onClick={() => setFilterFmt(f)} aria-pressed={filterFmt === f} className="sd-button">
                    {f}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Level + Sort */}
            <fieldset className={st.fieldset}>
              <legend className={st.label}>Level</legend>
              <div className={st.chips}>
                {LEVELS.map((l) => (
                  <button key={l} type="button" onClick={() => setFilterLevel(l)} aria-pressed={filterLevel === l} className="sd-button">
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={st.fieldset}>
              <legend className={st.label}>Sort By</legend>
              <div className={st.chips}>
                {[
                  { k: 'slots', l: 'Open Slots' },
                  { k: 'members', l: 'Popular' },
                  { k: 'name', l: 'A-Z' },
                ].map((s) => (
                  <button key={s.k} type="button" onClick={() => setSortBy(s.k)} aria-pressed={sortBy === s.k} className="sd-button">
                    {s.l}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          {/* Group Cards */}
          {loading && (
            <section className={`sd-panel ${st.panel}`} role="status" aria-label="Loading Study Groups">
              <div className={st.skeleton} aria-hidden><span /><span /><span /></div>
              <p className={st.small}>Loading Study Groups...</p>
            </section>
          )}
          {!loading && filtered.length === 0 && (
            <TrainerEmptyState
              variant="no-data"
              title="No Study Groups Match"
              message={groups.length === 0 ? 'Create the first live study group for this community.' : 'Try a different filter combination to find study groups.'}
              compact
            />
          )}
          <div className={st.list}>
            {filtered.map((g, i) => {
              const isFull = g.members >= g.max;
              const slotsLeft = g.max - g.members;

              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04 }}
                  className={`sd-panel ${st.panel}`}
                >
                  <div className={st.groupHead}>
                    {/* TRAIN-STUDYFINDER-A11Y-1: SVG AvatarIcon */}
                    <span className={st.groupIcon} aria-hidden>
                      <AvatarIcon kind={g.avatarKind} size={22} />
                    </span>
                    <div className={st.dayText}>
                      <h3 className={st.itemTitle}>{g.name}</h3>
                      <p className={st.small}>{g.focus}</p>
                    </div>
                    <div className={st.areaGoal}>
                      <strong className={isFull ? st.down : undefined}>{g.members}/{g.max}</strong>
                      <span>{slotsLeft} {slotsLeft === 1 ? 'Slot' : 'Slots'} Left</span>
                    </div>
                  </div>
                  <div className={st.chips}>
                    <span className={st.tag}>{g.format}</span>
                  </div>
                  <dl className={st.facts}>
                    <div><dt>Stakes</dt><dd>{g.stakes}</dd></div>
                    <div><dt>Time Zone</dt><dd>{g.tz}</dd></div>
                    <div><dt>Tool</dt><dd>{g.tool}</dd></div>
                    <div><dt>Schedule</dt><dd>{g.schedule}</dd></div>
                  </dl>
                  <motion.button
                    type="button"
                    onClick={() => joinGroup(g)}
                    disabled={isFull && !g.joined || busy === g.id}
                    aria-label={`${g.joined ? 'Open' : 'Join'} ${g.name}`}
                    className={`sd-button ${g.joined ? '' : 'sd-primary'} ${st.block}`}
                  >
                    {busy === g.id ? 'Joining...' : g.joined ? 'Open Room' : isFull ? 'Group Full' : signedOut ? 'Sign In To Join' : 'Join Group'}
                  </motion.button>
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
