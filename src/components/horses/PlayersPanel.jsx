/**
 * PLAYERS - Phase 4. A player, as an operator can see them and act on them.
 *
 * Six sections: Search, Player (the 360), Restrictions, Observations, Tickets,
 * Reports. Every read goes to /api/horses/player-admin and to nowhere else.
 *
 * PHASE4-CONTRACTS SECTION 0 IS WHAT THIS FILE IS SHAPED BY.
 *
 *   NOTHING IN THIS PHASE TAKES A PLAYER'S ACCESS AWAY UNTIL DAN TURNS
 *   ENFORCEMENT ON, AND WHAT AN OPERATOR IS TOLD MUST MATCH WHAT THE
 *   PLATFORM WILL ACTUALLY DO.
 *
 * So the enforcement banner is not decoration and is not a constant. It is
 * rendered from the `enforced` tristate the route puts on every restriction
 * answer, it appears above every control that can create a restriction, and
 * it appears again inside the confirm dialog, because the sentence an
 * operator reads in the half-second before they press the button is the only
 * one that counts. `null` renders as UNKNOWN and never as off: told "this
 * will not bite" when nobody knows, an operator stops watching.
 *
 * HORSES ARE PLAYERS (CLAUDE.md 10.5). The Include Horses control is a
 * NARROWING filter that starts ON, and unticking it is the only thing that
 * ever sends `includeHorses=false`. A horse is opened, noted, tagged and
 * restricted through the same controls as anybody else; `is_horse` renders a
 * badge and does nothing else.
 *
 * FOUR OF THESE SURFACES HAVE NO DATA YET, and they say so rather than
 * rendering an empty table that reads like a failed load. Measured
 * 2026-09-04: kyc_events 0 rows, responsible_gaming_limits 0,
 * responsible_gaming_sessions 0, user_reports 0, live_help_tickets 5. "No KYC
 * Event Has Ever Been Recorded" is a fact about the platform; a blank list is
 * a bug report waiting to be filed. This is the Phase 3 heartbeat discipline,
 * applied to four more panels.
 */
import React, { useCallback, useState } from 'react';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import DataTable from './DataTable';
import KpiTile from './KpiTile';
import Pager from './Pager';
import StatusPill from './StatusPill';
import usePagedList from './usePagedList';
import styles from './shared.module.css';
import { num, when } from '../../lib/horsesAdminTokens';
import { hasPermission } from './operatorPermissions';
import {
  PLAYER_ADMIN,
  REPORT_STATUSES,
  toInstant,
  observationsUrl,
  playerUrl,
  reportsUrl,
  restrictBody,
  restrictionsUrl,
  searchUrl,
  ticketsUrl,
  enforcedOf,
  liftBody,
  newRestrictionOpId,
  noteAddBody,
  noteDeleteBody,
  noteIsValid,
  reportReviewBody,
  rgSetBody,
  tagBody,
  ticketAssignBody,
  listMeta,
} from './playerAdmin';
import {
  GATE_TEXT,
  REASON_LABELS,
  REASON_NEEDS_NOTE,
  RESTRICTION_REASON_CODES,
  RESTRICTION_SCOPES,
  RG_FIELDS,
  SCOPE_META,
  displayStatus,
  enforcementNotice,
  isHeld,
  loosensOf,
  needsApproval,
} from '../../lib/horses/playerRestrictions';

const SECTIONS = [
  ['search', 'Search'],
  ['player', 'Player'],
  ['restrictions', 'Restrictions'],
  ['observations', 'Observations'],
  ['tickets', 'Tickets'],
  ['reports', 'Reports'],
];

/**
 * The enforcement banner. One component, used in three places, so the three
 * cannot drift apart and start telling an operator different things about the
 * same switch.
 */
function EnforcementBanner({ enforced }) {
  const notice = enforcementNotice(enforced);
  // ENFORCEMENT ON is the loudest thing on the screen, because an operator
  // about to lock somebody out should be told they are about to lock
  // somebody out. UNKNOWN is second, and also announced: it is the state
  // the header comment cares most about. OBSERVING is the quiet one - it
  // is the safe state.
  const cls =
    notice.tone === 'live'
      ? styles.errorNote
      : notice.tone === 'unknown'
        ? styles.warnNote
        : styles.infoNote;
  return (
    <div className={cls} role={notice.tone === 'observing' ? undefined : 'alert'}>
      <strong>{notice.title}. </strong>
      {notice.body}
    </div>
  );
}

/** A badge for a horse, and nothing else. Identification, per section 10.5. */
function HorseBadge({ isHorse }) {
  if (!isHorse) return null;
  return <StatusPill status="horse" label="Horse" tone="info" />;
}

/**
 * A panel with no rows, where empty means something specific.
 *
 * `reason` says WHY it is empty. The difference between "this queue is clear"
 * and "nothing has ever been written here" is the difference between a
 * healthy platform and an unbuilt pipeline, and a blank table says neither.
 */
function EmptyBecause({ title, reason }) {
  return (
    <div className={styles.notBuilt}>
      <p className={styles.notBuiltTitle}>{title}</p>
      <p className={styles.notBuiltBody}>{reason}</p>
    </div>
  );
}

/**
 * A responsible-gaming draft seeded from the row the player actually has.
 *
 * Timestamps are rendered by <input type="datetime-local">, which needs a
 * LOCAL wall-clock string with no zone, so they are converted on the way in
 * and back to an instant on the way out.
 */
function seedRgDraft(rg) {
  const out = {};
  for (const f of RG_FIELDS) {
    const value = rg ? rg[f.key] : null;
    if (value == null) { out[f.key] = ''; continue; }
    if (f.kind === 'time') {
      const ms = new Date(value).getTime();
      if (!Number.isFinite(ms)) { out[f.key] = ''; continue; }
      // Local wall clock, which is what the input renders and what the
      // operator reads on their own screen.
      out[f.key] = new Date(ms - new Date(ms).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    } else {
      out[f.key] = String(value);
    }
  }
  return out;
}

/**
 * The patch, as only the fields that actually MOVED.
 *
 * The route refuses a patch that changes nothing now, and it should: an
 * unchanged patch used to push the PLAYER'S own protection hold forward
 * another twenty four hours. So the panel sends the difference, not the
 * form.
 *
 * A cleared box is an explicit null - "remove this limit" - which is a real
 * instruction and a loosening. An earlier draft set it to `undefined`, which
 * JSON.stringify drops, so the panel warned "this will be refused" and then
 * sent an empty object and reported success.
 */
function rgPatchOf(rg, draft) {
  if (!draft) return null;
  const out = {};
  for (const f of RG_FIELDS) {
    if (!(f.key in draft)) continue;
    const raw = draft[f.key];
    const next = raw === '' || raw == null
      ? null
      : (f.kind === 'time' ? toInstant(raw) : Number(raw));
    const prev = rg ? rg[f.key] ?? null : null;

    if (next === null && prev === null) continue;
    if (next !== null && prev !== null) {
      // TO THE MINUTE for a timestamp, because a minute is all the input
      // can express: seedRgDraft slices to "YYYY-MM-DDTHH:mm", so a value
      // the player's own path wrote as now() + interval carries seconds
      // this form cannot show and cannot preserve. Comparing exactly meant
      // that OPENING the editor and pressing Save classified an untouched
      // self-exclusion as :shortened - a loosening the operator never
      // made, held or applied depending on the clock.
      const same = f.kind === 'time'
        ? Math.floor(new Date(next).getTime() / 60000)
          === Math.floor(new Date(prev).getTime() / 60000)
        : Number(next) === Number(prev);
      if (same) continue;
    }
    out[f.key] = next;
  }
  return out;
}

export default function PlayersPanel({
  authFetch,
  showNotification,
  permissions,
  operatorId,
  permissionsDegraded,
}) {
  const [section, setSection] = useState('search');
  const [enforced, setEnforced] = useState(null);

  const canModerate = hasPermission(permissions, 'moderation.write');
  const canWritePlayers = hasPermission(permissions, 'players.write');
  const canSupport = hasPermission(permissions, 'support.write');

  // ── SEARCH ───────────────────────────────────────────────────────────────
  const [q, setQ] = useState('');
  const [includeHorses, setIncludeHorses] = useState(true);
  const [onlyRestricted, setOnlyRestricted] = useState(false);

  // `auto` is the SECTION, not a constant. usePagedList only loads while
  // `auto` is true, so a list whose section is closed makes no request, and
  // the first time an operator opens one it loads itself. This is the
  // FleetPanel pattern; an earlier draft passed `auto: false` everywhere and
  // called setFilters by hand, which set the filters and never fetched.
  const searchList = usePagedList({
    limit: 25,
    auto: section === 'search',
    initialFilters: { q: '', includeHorses: true, onlyRestricted: false },
    fetchPage: useCallback(
      ({ offset, limit, filters, signal }) =>
        authFetch(
          searchUrl({
            q: filters.q,
            includeHorses: filters.includeHorses,
            restricted: filters.onlyRestricted ? true : undefined,
            limit,
            offset,
          }),
          { signal }
        ),
      [authFetch]
    ),
  });

  const runSearch = useCallback(() => {
    const next = { q, includeHorses, onlyRestricted };
    const same = JSON.stringify(next) === JSON.stringify(searchList.filters || {});
    // usePagedList keys its effect on the filter object, so pressing Search
    // twice with the same terms did nothing at all - and there is no other
    // way to re-read a result. An unchanged search is a REFRESH.
    if (same) searchList.refresh();
    else searchList.setFilters(next);
  }, [searchList, q, includeHorses, onlyRestricted]);

  // ── THE 360 ──────────────────────────────────────────────────────────────
  const [openId, setOpenId] = useState(null);
  const [player, setPlayer] = useState(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState(null);

  const loadPlayer = useCallback(
    async (userId) => {
      if (!userId) return;
      setPlayerLoading(true);
      setPlayerError(null);
      try {
        const data = await authFetch(playerUrl(userId));
        setPlayer(data);
        const e = enforcedOf(data);
        setEnforced(e);
      } catch (err) {
        setPlayerError(err?.message || 'That Player Could Not Be Loaded');
        setPlayer(null);
      } finally {
        setPlayerLoading(false);
      }
    },
    [authFetch]
  );

  const openPlayer = useCallback(
    (userId) => {
      setOpenId(userId);
      setSection('player');
      loadPlayer(userId);
    },
    [loadPlayer]
  );

  // ── RESTRICTIONS LIST ────────────────────────────────────────────────────
  const [restrictionStatus, setRestrictionStatus] = useState('active');
  const [restrictionScope, setRestrictionScope] = useState('');

  const restrictionList = usePagedList({
    limit: 50,
    auto: section === 'restrictions',
    initialFilters: { status: 'active', scope: '' },
    // The envelope carries `enforced` and usePagedList keeps only rows,
    // total and hasMore - so an operator whose first stop was Restrictions
    // saw "Enforcement State Unknown" over the platform restriction list
    // while the route had read it perfectly well. The banner was
    // order-dependent on which section you happened to open first.
    fetchPage: useCallback(
      async ({ offset, limit, filters, signal }) => {
        const data = await authFetch(
          restrictionsUrl({
            scope: filters.scope,
            status: filters.status,
            limit,
            offset,
          }),
          { signal }
        );
        setEnforced(enforcedOf(data));
        return data;
      },
      [authFetch]
    ),
  });

  // ── OBSERVATIONS ─────────────────────────────────────────────────────────
  const [obsHours, setObsHours] = useState(24);
  const [obsMeta, setObsMeta] = useState(null);
  const observationList = usePagedList({
    limit: 50,
    auto: section === 'observations',
    initialFilters: { hours: 24 },
    fetchPage: useCallback(
      async ({ offset, limit, filters, signal }) => {
        const data = await authFetch(
          observationsUrl({ hours: filters.hours, limit, offset }),
          { signal }
        );
        setObsMeta(data);
        setEnforced(enforcedOf(data));
        return data;
      },
      [authFetch]
    ),
  });

  // ── TICKETS AND REPORTS ──────────────────────────────────────────────────
  const [ticketStatus, setTicketStatus] = useState('');
  const ticketList = usePagedList({
    limit: 50,
    auto: section === 'tickets',
    initialFilters: { status: '' },
    fetchPage: useCallback(
      ({ offset, limit, filters, signal }) =>
        authFetch(ticketsUrl({ status: filters.status, limit, offset }), { signal }),
      [authFetch]
    ),
  });

  const [reportStatus, setReportStatus] = useState('');
  const reportList = usePagedList({
    limit: 50,
    auto: section === 'reports',
    initialFilters: { status: '' },
    fetchPage: useCallback(
      ({ offset, limit, filters, signal }) =>
        authFetch(reportsUrl({ status: filters.status, limit, offset }), { signal }),
      [authFetch]
    ),
  });

  // ── RESTRICT DIALOG ──────────────────────────────────────────────────────
  const [restrictDraft, setRestrictDraft] = useState(null);
  const [pendingSanctions, setPendingSanctions] = useState({});
  const [busy, setBusy] = useState(false);

  const gate = restrictDraft
    ? needsApproval({ scope: restrictDraft.scope, expiresAt: restrictDraft.expiresAt })
    : { required: false, reason: null };

  // The constant, not the literal. Both halves used to hardcode 'other'
  // while the constant naming it sat exported and unimported - which is
  // exactly how the panel and the route drift apart about which reason
  // needs an explanation.
  const noteRequired = restrictDraft?.reasonCode === REASON_NEEDS_NOTE;
  const restrictReady =
    restrictDraft
    && restrictDraft.scope
    && restrictDraft.reasonCode
    && noteIsValid(restrictDraft.note, noteRequired);

  const submitRestrict = useCallback(async () => {
    if (!restrictDraft || !restrictReady) return;
    setBusy(true);
    try {
      const data = await authFetch(PLAYER_ADMIN, {
        method: 'POST',
        body: JSON.stringify(restrictBody(restrictDraft)),
      });
      if (data?.pending) {
        // KEPT, not discarded. `sanction` is deliberately not executable
        // from the approvals queue, so the ONLY way this restriction ever
        // gets applied is an operator coming back here - and coming back
        // has to re-post the SAME idempotency key, or it raises a second
        // request under a new one and the approved row is orphaned. That
        // is review B-1's control with no exit, moved one screen over.
        // KEYED, not single. A raised sanction's opId lives only here -
        // `sanction` is not executable from the approvals queue - so a
        // second raise, or an ordinary restriction on any other player,
        // used to overwrite or clear the only handle on it, orphaning an
        // approved row and making the next press mint a fresh key.
        setPendingSanctions((prev) => ({
          ...prev,
          [data.approvalId || restrictDraft.opId]: {
            approvalId: data.approvalId ?? null,
            status: data.status ?? 'pending',
            gateReason: data.gateReason ?? null,
            draft: { ...restrictDraft, opId: data.opId || restrictDraft.opId },
          },
        }));
        showNotification(
          data.message
            || 'That Restriction Needs A Second Operator. It Has Been Raised And Nothing Has Been Applied',
          'info'
        );
      } else {
        showNotification(data?.message || 'Restriction Applied', 'success');
        setEnforced(enforcedOf(data));
      }
      setRestrictDraft(null);
      if (openId) loadPlayer(openId);
      if (restrictionList.loaded) restrictionList.refresh();
    } catch (err) {
      showNotification(err?.message || 'That Restriction Could Not Be Applied', 'error');
    } finally {
      setBusy(false);
    }
  }, [
    authFetch, restrictDraft, restrictReady, showNotification, openId, loadPlayer, restrictionList,
  ]);

  /**
   * Re-post a raised sanction under ITS OWN key.
   *
   * The same opId is what makes an approved request execute exactly once:
   * the key the approval was raised under is the key this carries. Minting
   * a fresh one here would raise a SECOND request and leave the approved
   * one to expire.
   */
  const applyPendingSanction = useCallback(async (key) => {
    const entry = pendingSanctions[key];
    if (!entry) return;
    setBusy(true);
    try {
      const data = await authFetch(PLAYER_ADMIN, {
        method: 'POST',
        body: JSON.stringify(restrictBody(entry.draft)),
      });
      if (data?.pending) {
        showNotification(
          'That Sanction Has Not Been Approved Yet. It Is Still Waiting',
          'info'
        );
        return;
      }
      showNotification(data?.message || 'Restriction Applied', 'success');
      setEnforced(enforcedOf(data));
      setPendingSanctions((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (openId) loadPlayer(openId);
      if (restrictionList.loaded) restrictionList.refresh();
    } catch (err) {
      showNotification(err?.message || 'That Restriction Could Not Be Applied', 'error');
    } finally {
      setBusy(false);
    }
  }, [
    authFetch, pendingSanctions, showNotification, openId, loadPlayer, restrictionList,
  ]);

  const post = useCallback(
    async (body, okMessage) => {
      setBusy(true);
      try {
        const data = await authFetch(PLAYER_ADMIN, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        showNotification(data?.message || okMessage, 'success');
        if (openId) loadPlayer(openId);
        return data;
      } catch (err) {
        showNotification(err?.message || 'That Did Not Work', 'error');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [authFetch, showNotification, openId, loadPlayer]
  );

  // ── RENDER ───────────────────────────────────────────────────────────────
  const searchMeta = listMeta({
    rows: searchList.rows,
    total: searchList.total,
    hasMore: searchList.hasMore,
  });

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Players</h2>
        <p className={styles.panelIntro}>
          Every Account On The Platform, Horses Included. Search, Open A Player, Record A
          Restriction, Answer A Ticket.
        </p>
      </div>

      {/* A REAL TABLIST, and the same two classes FleetPanel uses.
          The first draft set aria-current and composed .sectionNavItem with
          .toneAccent, and BOTH were inert: the only rule for
          .sectionNavItem is scoped `[aria-selected='true']`, and .toneAccent
          is a descendant selector for a KpiTile's value. So the six controls
          that are this panel's entire navigation rendered as default grey
          buttons with no indication of which section was open. */}
      <div className={styles.sectionNav} role="tablist" aria-label="Players Sections">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            className={`${styles.btn} ${styles.sectionNavItem}`}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* hasPermission FAILS OPEN by design - it answers true for a null or
          empty list - which is right for deciding whether a tab opens and
          wrong for deciding whether somebody may sanction. When the
          permission read is degraded the moderation controls are therefore
          rendered, and the operator is told the server has the last word. */}
      {permissionsDegraded && canModerate && (
        <div className={styles.warnNote} role="alert">
          <strong>Your Permissions Could Not Be Read. </strong>
          The Controls Below Are Shown Because This Panel Assumes The Wider Set When It
          Does Not Know. The Server Decides, So A Sanction May Still Be Refused.
        </div>
      )}

      {/* THE PENDING SANCTION, and its way out. Rendered above every
          section rather than inside one, because an operator who raises a
          sanction and then goes to look at the player must not lose the
          only handle on it. */}
      {Object.entries(pendingSanctions).map(([key, entry]) => (
        <div key={key} className={styles.warnNote} role="status">
          <strong>A Sanction Is Waiting For A Second Operator. </strong>
          {SCOPE_META[entry.draft.scope]?.label} For
          {' '}
          {entry.draft.displayName || entry.draft.userId}
          {entry.approvalId ? ` (Request ${entry.approvalId})` : ''}
          . The Approvals Queue Records The Decision And Does Not Carry It Out, So Apply It
          Here Once It Is Approved.
          <div className={styles.rowActions}>
            <button
              type="button"
              className={styles.btn}
              disabled={busy || !canModerate}
              onClick={() => applyPendingSanction(key)}
            >
              Apply It Now
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setPendingSanctions((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              })}
            >
              Dismiss This Reminder
            </button>
          </div>
        </div>
      ))}

      {/* ── SEARCH ──────────────────────────────────────────────────────── */}
      {section === 'search' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Find A Player</h3>
          <p className={styles.cardNote}>
            Matches Display Name, Username, Email, Player Number Or ID. Horses Are Included
            Unless You Untick Them.
          </p>
          <div className={styles.filterRow}>
            <input
              className={styles.input}
              style={{ width: 'auto', flex: '1 1 220px' }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Name, Username, Email Or Player Number"
              aria-label="Search Players"
            />
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={includeHorses}
                onChange={(e) => setIncludeHorses(e.target.checked)}
              />
              Include Horses
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={onlyRestricted}
                onChange={(e) => setOnlyRestricted(e.target.checked)}
              />
              Restricted Only
            </label>
            <button type="button" className={styles.btnGo} onClick={runSearch}>
              Search
            </button>
          </div>

          {/* From the APPLIED filter, not the checkbox. Unticking the box
              does not narrow anything until Search is pressed, and a note
              claiming horses are excluded while the table still lists them
              is the wrong direction to be wrong in. */}
          {searchList.filters?.includeHorses === false && (
            <div className={styles.infoNote}>
              Horses Are Hidden By Your Filter. They Are Players And Are Counted Everywhere
              Else; This Narrows The List Only.
            </div>
          )}

          {searchList.error && <div className={styles.errorNote}>{searchList.error}</div>}

          <DataTable
            loading={searchList.loading}
            loadingLabel="Loading Players"
            empty={searchList.loaded ? 'No Player Matches That.' : 'Enter A Search Above.'}
            columns={[
              {
                key: 'display_name',
                header: 'Player',
                render: (r) => (
                  <button type="button" className={styles.btn} onClick={() => openPlayer(r.id)}>
                    {r.display_name || r.username || r.id}
                  </button>
                ),
              },
              { key: 'username', header: 'Username' },
              { key: 'player_number', header: 'Number' },
              {
                key: 'is_horse',
                header: 'Kind',
                render: (r) => (r.is_horse ? <HorseBadge isHorse /> : 'Human'),
              },
              {
                key: 'restricted',
                header: 'Restricted',
                render: (r) =>
                  r.restricted ? <StatusPill status="restricted" tone="danger" /> : 'No',
              },
              { key: 'last_seen', header: 'Last Seen', render: (r) => when(r.last_seen, true) },
            ]}
            rows={searchList.rows}
          />
          <Pager
            offset={searchList.offset}
            limit={25}
            count={searchMeta.rows.length}
            total={searchList.total}
            hasMore={searchList.hasMore}
            loading={searchList.loading}
            noun="Players"
            onPrevious={searchList.previous}
            onNext={searchList.next}
          />
        </div>
      )}

      {/* ── THE 360 ─────────────────────────────────────────────────────── */}
      {section === 'player' && (
        <>
          {!openId && (
            <EmptyBecause
              title="No Player Is Open"
              reason="Search For Somebody And Choose Them To See Their Full Record."
            />
          )}
          {playerLoading && <div className={styles.stateNote}>Loading That Player</div>}
          {playerError && <div className={styles.errorNote}>{playerError}</div>}
          {player?.profile && (
            <Player360
              player={player}
              enforced={enforced}
              canModerate={canModerate}
              canWritePlayers={canWritePlayers}
              busy={busy}
              onRestrict={() =>
                setRestrictDraft({
                  userId: player.profile.id,
                  displayName: player.profile.displayName,
                  isHorse: player.profile.isHorse,
                  scope: 'cash',
                  reasonCode: '',
                  note: '',
                  expiresAt: '',
                  opId: newRestrictionOpId(),
                })}
              onLift={(id) => post(liftBody({ restrictionId: id }), 'Restriction Lifted')
                .then((ok) => { if (ok && restrictionList.loaded) restrictionList.refresh(); })}
              onNoteAdd={(text) => post(noteAddBody({ userId: player.profile.id, body: text }), 'Note Saved')}
              onNoteDelete={(id) => post(noteDeleteBody({ noteId: id }), 'Note Removed')}
              onTagAdd={(tag) => post(tagBody({ userId: player.profile.id, tag }), 'Tag Added')}
              onTagRemove={(tag) =>
                post(tagBody({ userId: player.profile.id, tag, remove: true }), 'Tag Removed')}
              onRgSet={(patch) => post(rgSetBody({ userId: player.profile.id, patch }), 'Limits Saved')}
            />
          )}
        </>
      )}

      {/* ── RESTRICTIONS ────────────────────────────────────────────────── */}
      {section === 'restrictions' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Platform Restriction List</h3>
          <EnforcementBanner enforced={enforced} />
          <div className={styles.filterRow}>
            <select
              className={styles.select}
              style={{ width: 'auto' }}
              value={restrictionStatus}
              onChange={(e) => {
                setRestrictionStatus(e.target.value);
                // setFilter, not setFilters: only setFilter returns to page
                // one. Changing a filter on page three of a result set that
                // now has one page shows an empty table and reads as "no
                // match", which on a moderation search is a false negative.
                restrictionList.setFilter('status', e.target.value);
              }}
              aria-label="Restriction Status"
            >
              <option value="active">Active</option>
              <option value="lifted">Lifted</option>
              <option value="expired">Expired</option>
            </select>
            <select
              className={styles.select}
              style={{ width: 'auto' }}
              value={restrictionScope}
              onChange={(e) => {
                setRestrictionScope(e.target.value);
                restrictionList.setFilter('scope', e.target.value);
              }}
              aria-label="Restriction Scope"
            >
              <option value="">Every Scope</option>
              {RESTRICTION_SCOPES.map((s) => (
                <option key={s} value={s}>{SCOPE_META[s].label}</option>
              ))}
            </select>
          </div>

          {restrictionList.error && <div className={styles.errorNote}>{restrictionList.error}</div>}

          <DataTable
            loading={restrictionList.loading}
            loadingLabel="Loading Restrictions"
            empty="No Restriction Matches That. Nobody On This Platform Is Restricted Right Now."
            columns={[
              {
                key: 'display_name',
                header: 'Player',
                render: (r) => (
                  <button type="button" className={styles.btn} onClick={() => openPlayer(r.user_id)}>
                    {r.display_name || r.username || r.user_id}
                  </button>
                ),
              },
              { key: 'is_horse', header: 'Kind', render: (r) => (r.is_horse ? <HorseBadge isHorse /> : 'Human') },
              { key: 'scope', header: 'Scope', render: (r) => SCOPE_META[r.scope]?.label || r.scope },
              {
                key: 'reason_code',
                header: 'Reason',
                render: (r) => REASON_LABELS[r.reason_code] || r.reason_code,
              },
              {
                key: 'status',
                header: 'State',
                render: (r) => <StatusPill status={displayStatus(r)} />,
              },
              { key: 'applied_at', header: 'Applied', render: (r) => when(r.applied_at, true) },
              {
                key: 'expires_at',
                header: 'Expires',
                render: (r) => (r.expires_at ? when(r.expires_at, true) : 'Never'),
              },
            ]}
            rows={restrictionList.rows}
          />
          <Pager
            offset={restrictionList.offset}
            limit={50}
            count={restrictionList.rows.length}
            total={restrictionList.total}
            hasMore={restrictionList.hasMore}
            loading={restrictionList.loading}
            noun="Restrictions"
            onPrevious={restrictionList.previous}
            onNext={restrictionList.next}
          />
        </div>
      )}

      {/* ── OBSERVATIONS ────────────────────────────────────────────────── */}
      {section === 'observations' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>What Enforcement Would Have Refused</h3>
          <p className={styles.cardNote}>
            While Enforcement Is Off, Every Entry A Restriction Would Have Stopped Is Recorded
            Here And Allowed Through. This Is The Evidence For Turning It On.
          </p>
          <EnforcementBanner enforced={enforced} />

          <div className={styles.filterRow}>
            <select
              className={styles.select}
              style={{ width: 'auto' }}
              value={obsHours}
              onChange={(e) => {
                setObsHours(Number(e.target.value));
                observationList.setFilter('hours', Number(e.target.value));
              }}
              aria-label="Observation Window"
            >
              <option value={24}>Last 24 Hours</option>
              <option value={168}>Last 7 Days</option>
              <option value={720}>Last 30 Days</option>
            </select>
          </div>

          {observationList.loaded && !observationList.loading
            && observationList.rows.length === 0 && (
            <EmptyBecause
              title="Nothing Has Been Observed"
              reason={
                obsMeta?.activeRestrictions === 0
                  ? 'No Player Is Restricted Right Now, So There Is Nothing For A Guard To Notice.'
                  : obsMeta?.activeRestrictions == null
                    ? 'How Many Players Are Restricted Could Not Be Read, So This Emptiness Means Nothing Either Way.'
                    : `${num(obsMeta.activeRestrictions)} Player(s) Are Restricted, And None Of Them Has Tried To Sit Down Or Register In This Window.`
              }
            />
          )}

          {(observationList.loading || observationList.rows.length > 0) && (
            <DataTable
              loading={observationList.loading}
              loadingLabel="Loading Observations"
              empty="Nothing Observed."
              columns={[
                {
                  key: 'display_name',
                  header: 'Player',
                  render: (r) => (
                    <button type="button" className={styles.btn} onClick={() => openPlayer(r.user_id)}>
                      {r.display_name || r.user_id}
                    </button>
                  ),
                },
                { key: 'is_horse', header: 'Kind', render: (r) => (r.is_horse ? <HorseBadge isHorse /> : 'Human') },
                { key: 'scope', header: 'Scope', render: (r) => SCOPE_META[r.scope]?.label || r.scope },
                { key: 'table_name', header: 'Table' },
                { key: 'observed_at', header: 'When', render: (r) => when(r.observed_at, true) },
              ]}
              rows={observationList.rows}
            />
          )}
          <Pager
            offset={observationList.offset}
            limit={50}
            count={observationList.rows.length}
            total={observationList.total}
            hasMore={observationList.hasMore}
            loading={observationList.loading}
            noun="Observations"
            onPrevious={observationList.previous}
            onNext={observationList.next}
          />
        </div>
      )}

      {/* ── TICKETS ─────────────────────────────────────────────────────── */}
      {section === 'tickets' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Support Tickets</h3>
          <div className={styles.filterRow}>
            <select
              className={styles.select}
              style={{ width: 'auto' }}
              value={ticketStatus}
              onChange={(e) => {
                setTicketStatus(e.target.value);
                ticketList.setFilter('status', e.target.value);
              }}
              aria-label="Ticket Status"
            >
              <option value="">Every Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          {ticketList.error && <div className={styles.errorNote}>{ticketList.error}</div>}
          <DataTable
            loading={ticketList.loading}
            loadingLabel="Loading Tickets"
            empty="No Ticket Matches That."
            columns={[
              { key: 'subject', header: 'Subject' },
              {
                key: 'user_id',
                header: 'Player',
                // The NAME, not a button labelled "Open". Rendering the same
                // word on every row put a column of "Open" under a header
                // reading PLAYER, beside a STATUS column that also says OPEN.
                // Seen the first time this panel was rendered in a browser.
                render: (r) =>
                  r.user_id ? (
                    <button type="button" className={styles.btn} onClick={() => openPlayer(r.user_id)}>
                      {r.display_name || r.username || `${String(r.user_id).slice(0, 8)}...`}
                    </button>
                  ) : 'No Player',
              },
              { key: 'priority', header: 'Priority', render: (r) => <StatusPill status={r.priority} /> },
              { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
              {
                key: 'ageHours',
                header: 'Age',
                render: (r) =>
                  r.ageHours == null ? '-' : `${num(r.ageHours)}h`,
              },
              { key: 'created_at', header: 'Opened', render: (r) => when(r.created_at, true) },
              {
                key: 'assign',
                header: 'Actions',
                render: (r) =>
                  canSupport ? (
                    <button
                      type="button"
                      className={styles.btn}
                      // Without an operator id this posts assignedTo: null,
                      // and a button labelled "Assign To Me" would clear the
                      // assignee and report success.
                      disabled={busy || !operatorId}
                      title={operatorId ? undefined : 'Your Operator Id Could Not Be Read'}
                      onClick={() =>
                        post(
                          ticketAssignBody({ ticketId: r.id, assignedTo: operatorId }),
                          'Ticket Assigned'
                        ).then(() => ticketList.refresh())}
                    >
                      Assign To Me
                    </button>
                  ) : null,
              },
            ]}
            rows={ticketList.rows}
          />
          <Pager
            offset={ticketList.offset}
            limit={50}
            count={ticketList.rows.length}
            total={ticketList.total}
            hasMore={ticketList.hasMore}
            loading={ticketList.loading}
            noun="Tickets"
            onPrevious={ticketList.previous}
            onNext={ticketList.next}
          />
        </div>
      )}

      {/* ── REPORTS ─────────────────────────────────────────────────────── */}
      {section === 'reports' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Player Reports</h3>
          <div className={styles.filterRow}>
            <select
              className={styles.select}
              style={{ width: 'auto' }}
              value={reportStatus}
              onChange={(e) => {
                setReportStatus(e.target.value);
                reportList.setFilter('status', e.target.value);
              }}
              aria-label="Report Status"
            >
              <option value="">Every Status</option>
              {REPORT_STATUSES.map((s2) => (
                <option key={s2} value={s2}>{s2.replace(/^./, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          {reportList.loaded && !reportList.loading
            && reportList.rows.length === 0 && !reportStatus && (
            <EmptyBecause
              title="No Player Has Ever Reported Another"
              reason="The user_reports Table Is Empty. This Is The Platform's State, Not A Failed Load."
            />
          )}
          {reportList.error && <div className={styles.errorNote}>{reportList.error}</div>}
          {(reportList.loading || reportList.rows.length > 0) && (
            <DataTable
              loading={reportList.loading}
              loadingLabel="Loading Reports"
              empty="No Report Matches That."
              columns={[
                {
                  key: 'reported_user_id',
                  header: 'Reported',
                  render: (r) => (
                    <button type="button" className={styles.btn} onClick={() => openPlayer(r.reported_user_id)}>
                      {r.reported_name || `${String(r.reported_user_id).slice(0, 8)}...`}
                    </button>
                  ),
                },
                { key: 'reason', header: 'Reason' },
                { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
                { key: 'created_at', header: 'Filed', render: (r) => when(r.created_at, true) },
                {
                  key: 'review',
                  header: 'Actions',
                  render: (r) =>
                    canModerate ? (
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={busy}
                        onClick={() =>
                          post(
                            reportReviewBody({ reportId: r.id, status: 'reviewed' }),
                            'Report Reviewed'
                          ).then(() => reportList.refresh())}
                      >
                        Mark Reviewed
                      </button>
                    ) : null,
                },
              ]}
              rows={reportList.rows}
            />
          )}
          <Pager
            offset={reportList.offset}
            limit={50}
            count={reportList.rows.length}
            total={reportList.total}
            hasMore={reportList.hasMore}
            loading={reportList.loading}
            noun="Reports"
            onPrevious={reportList.previous}
            onNext={reportList.next}
          />
        </div>
      )}

      {/* ── THE RESTRICT DIALOG ─────────────────────────────────────────── */}
      {restrictDraft && (
        <Modal title="Restrict A Player" onClose={() => setRestrictDraft(null)} wide>
          <div className={styles.dialogBody}>
            {/* The person. Not a footnote: this is the one dialog in the
                phase that can take a real player's access away, and the
                first draft rendered the subject in 12px muted while the
                machine-generated banner was the prominent element. */}
            <p className={styles.cardTitle}>
              {restrictDraft.displayName || restrictDraft.userId}
              {' '}
              <HorseBadge isHorse={restrictDraft.isHorse} />
            </p>

            {/* Rule 2. The operator reads this before they press anything. */}
            <EnforcementBanner enforced={enforced} />

            <label className={styles.fieldLabel} htmlFor="restrict-scope">What To Stop</label>
            <select
              id="restrict-scope"
              className={styles.select}
              value={restrictDraft.scope}
              onChange={(e) => setRestrictDraft({ ...restrictDraft, scope: e.target.value })}
            >
              {RESTRICTION_SCOPES.map((s) => (
                <option key={s} value={s}>{SCOPE_META[s].label}</option>
              ))}
            </select>
            <p className={styles.fieldHint}>{SCOPE_META[restrictDraft.scope]?.blurb}</p>
            {SCOPE_META[restrictDraft.scope]?.enforced === false && (
              <div className={styles.warnNote}>
                No Guard Watches This Scope Yet. Choosing It Records The Decision And Stops
                Nothing, Even When Enforcement Is On.
              </div>
            )}

            <label className={styles.fieldLabel} htmlFor="restrict-reason">Why</label>
            <select
              id="restrict-reason"
              className={styles.select}
              value={restrictDraft.reasonCode}
              onChange={(e) => setRestrictDraft({ ...restrictDraft, reasonCode: e.target.value })}
            >
              <option value="">Choose A Reason</option>
              {RESTRICTION_REASON_CODES.map((c) => (
                <option key={c} value={c}>{REASON_LABELS[c]}</option>
              ))}
            </select>

            <label className={styles.fieldLabel} htmlFor="restrict-note">
              Note {noteRequired ? `(Required For ${REASON_LABELS[REASON_NEEDS_NOTE]})` : '(Optional)'}
            </label>
            <textarea
              id="restrict-note"
              className={styles.textarea}
              value={restrictDraft.note}
              onChange={(e) => setRestrictDraft({ ...restrictDraft, note: e.target.value })}
            />

            <label className={styles.fieldLabel} htmlFor="restrict-expiry">Expires</label>
            <input
              id="restrict-expiry"
              type="datetime-local"
              className={styles.input}
              value={restrictDraft.expiresAt}
              onChange={(e) => setRestrictDraft({ ...restrictDraft, expiresAt: e.target.value })}
            />
            <p className={styles.fieldHint}>
              In Your Own Time Zone. Leave Empty For No Expiry. An Indefinite Restriction
              Needs A Second Operator, Because Nobody Is Ever Forced To Revisit It.
            </p>

            {gate.required && (
              <div className={styles.infoNote}>
                <strong>{GATE_TEXT[gate.reason]}</strong>
                {' '}
                Once It Is Approved, Come Back To This Tab To Apply It. The Approvals Queue Does
                Not Carry Out A Sanction On Its Own.
              </div>
            )}

            <div className={styles.confirmActions}>
              {/* .confirmBtn carries min-height 44px, the padding, and
                  :disabled { opacity .5 }. Without it the destructive
                  button looked identical enabled and disabled, on the one
                  screen in this phase that takes a player's access away. */}
              <button
                type="button"
                className={`${styles.confirmBtn} ${styles.confirmCancel}`}
                onClick={() => setRestrictDraft(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.confirmBtn} ${styles.confirmDanger}`}
                disabled={!restrictReady || busy || !canModerate}
                onClick={submitRestrict}
              >
                {busy ? 'Working' : gate.required ? 'Raise For Approval' : 'Apply Restriction'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * THE 360 ITSELF.
 *
 * Split out so the panel above stays about navigation and this stays about
 * one player. Every block states what an empty version of it MEANS.
 */
function Player360({
  player,
  enforced,
  canModerate,
  canWritePlayers,
  busy,
  onRestrict,
  onLift,
  onNoteAdd,
  onNoteDelete,
  onTagAdd,
  onTagRemove,
  onRgSet,
}) {
  const p = player.profile;
  const [noteDraft, setNoteDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [liftTarget, setLiftTarget] = useState(null);
  const [rgDraft, setRgDraft] = useState(null);

  const restrictions = Array.isArray(player.restrictions) ? player.restrictions : [];
  const active = restrictions.filter((r) => displayStatus(r) === 'active');
  const rg = player.responsibleGaming || null;

  const rgPatch = rgPatchOf(rg, rgDraft);
  const rgLoosens = rgPatch ? loosensOf(rg, rgPatch) : [];
  const rgHeld = rgPatch ? isHeld(rg, rgPatch) : false;

  const clubs = Array.isArray(player.clubs) ? player.clubs : [];

  return (
    <>
      <div className={styles.card}>
        <div className={styles.panelHead}>
          <h3 className={styles.cardTitle}>
            {p.displayName || p.username || p.id} <HorseBadge isHorse={p.isHorse} />
          </h3>
          {canModerate && (
            <button type="button" className={styles.btnDanger} onClick={onRestrict} disabled={busy}>
              Restrict
            </button>
          )}
        </div>

        <div className={styles.kpiGrid}>
          <KpiTile label="Clubs" value={num(clubs.length)} />
          <KpiTile label="Hands Played" value={num(p.totalHandsPlayed)} />
          <KpiTile
            label="Active Restrictions"
            value={num(active.length)}
            tone={active.length ? 'danger' : undefined}
          />
          <KpiTile label="Open Seats" value={num((player.seats || []).length)} />
          <KpiTile label="Audit Rows" value={num(player.auditRowCount)} />
          {/* The per-player half of the evidence the Observations section
              gathers: how often a guard would have stopped THIS player. */}
          <KpiTile
            label="Observed Refusals"
            value={num(player.observationCount)}
            tone={player.observationCount ? 'warn' : undefined}
          />
          <KpiTile
            label="Anti-Cheat Flags"
            value={num((player.flags || []).length)}
            tone={(player.flags || []).length ? 'danger' : undefined}
          />
        </div>

        <dl className={styles.factGrid}>
          <div><dt className={styles.factLabel}>Username</dt><dd className={styles.factValue}>{p.username || '-'}</dd></div>
          <div><dt className={styles.factLabel}>Player Number</dt><dd className={styles.factValue}>{p.playerNumber || '-'}</dd></div>
          <div><dt className={styles.factLabel}>Joined</dt><dd className={styles.factValue}>{when(p.createdAt)}</dd></div>
          <div><dt className={styles.factLabel}>Last Seen</dt><dd className={styles.factValue}>{when(p.lastSeen, true)}</dd></div>
          <div><dt className={styles.factLabel}>Email Verified</dt><dd className={styles.factValue}>{p.emailVerified ? 'Yes' : 'No'}</dd></div>
          {p.email && <div><dt className={styles.factLabel}>Email</dt><dd className={styles.factValue}>{p.email}</dd></div>}
        </dl>
        {!player.moneyVisible && (
          <p className={styles.cardNote}>
            Balances And Totals Are Hidden Because You Do Not Hold Money Read.
          </p>
        )}
      </div>

      {/* RESTRICTIONS */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Restrictions</h3>
        <EnforcementBanner enforced={enforced} />
        {restrictions.length === 0 ? (
          <EmptyBecause
            title="This Player Has Never Been Restricted"
            reason="No Restriction Has Ever Been Applied To This Account, Lifted Or Otherwise."
          />
        ) : (
          <DataTable
            columns={[
              { key: 'scope', header: 'Scope', render: (r) => SCOPE_META[r.scope]?.label || r.scope },
              { key: 'reason_code', header: 'Reason', render: (r) => REASON_LABELS[r.reason_code] || r.reason_code },
              { key: 'status', header: 'State', render: (r) => <StatusPill status={displayStatus(r)} /> },
              { key: 'applied_at', header: 'Applied', render: (r) => when(r.applied_at, true) },
              { key: 'expires_at', header: 'Expires', render: (r) => (r.expires_at ? when(r.expires_at, true) : 'Never') },
              {
                key: 'lift',
                header: 'Actions',
                render: (r) =>
                  canModerate && displayStatus(r) === 'active' ? (
                    <button type="button" className={styles.btn} onClick={() => setLiftTarget(r)}>
                      Lift
                    </button>
                  ) : null,
              },
            ]}
            rows={restrictions}
          />
        )}
      </div>

      {/* NOTES AND TAGS */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Operator Notes</h3>
        <p className={styles.cardNote}>
          These Are The Operator's Notes. They Are Not The Player's Own Notes About Opponents,
          Which Live Somewhere Else And Are Never Written From Here.
        </p>
        {canWritePlayers && (
          <div className={styles.filterRow}>
            <input
              className={styles.input}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add A Note"
              aria-label="Add A Note"
            />
            <button
              type="button"
              className={styles.btnGo}
              disabled={busy || noteDraft.trim().length < 2}
              onClick={() => { onNoteAdd(noteDraft).then((ok) => { if (ok) setNoteDraft(''); }); }}
            >
              Save Note
            </button>
          </div>
        )}
        {(player.notes || []).length === 0 ? (
          <p className={styles.cardNote}>No Note Has Been Written About This Player.</p>
        ) : (
          <ul className={styles.notBuiltList}>
            {player.notes.map((n) => (
              <li key={n.id}>
                {n.body}
                {' '}
                <span className={styles.mono}>{when(n.created_at, true)}</span>
                {canWritePlayers && (
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={busy}
                    onClick={() => onNoteDelete(n.id)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <h3 className={styles.cardTitle}>Tags</h3>
        <div className={styles.pillRow}>
          {(player.tags || []).map((t) => (
            <span key={t} className={`${styles.pill} ${styles.pillNeutral}`}>
              {t}
              {canWritePlayers && (
                <button type="button" className={styles.btn} onClick={() => onTagRemove(t)}>
                  Remove
                </button>
              )}
            </span>
          ))}
          {(player.tags || []).length === 0 && <span className={styles.cardNote}>No Tags.</span>}
        </div>
        {canWritePlayers && (
          <div className={styles.filterRow}>
            <input
              className={styles.input}
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="watch-list"
              aria-label="Add A Tag"
            />
            <button
              type="button"
              className={styles.btnGo}
              disabled={busy || tagDraft.trim().length < 2}
              onClick={() => { onTagAdd(tagDraft).then((ok) => { if (ok) setTagDraft(''); }); }}
            >
              Add Tag
            </button>
          </div>
        )}
      </div>

      {/* RESPONSIBLE GAMING */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Responsible Gaming</h3>
        <p className={styles.cardNote}>
          An Operator May Tighten A Limit Immediately. Loosening One Waits The Same Twenty Four
          Hours The Player Waits. An Operator Is Not A Bypass Of A Player's Protection.
        </p>
        {!rg ? (
          <EmptyBecause
            title="This Player Has Set No Limits"
            reason="No Responsible Gaming Row Exists For This Account, Which Means No Limit, No Exclusion And No Cooling Off Period."
          />
        ) : (
          <dl className={styles.factGrid}>
            {RG_FIELDS.map((f) => (
              <div key={f.key}>
                <dt className={styles.factLabel}>{f.label}</dt>
                <dd className={styles.factValue}>
                  {rg[f.key] == null
                    ? 'Not Set'
                    : f.kind === 'time'
                      ? when(rg[f.key], true)
                      : num(rg[f.key])}
                </dd>
              </div>
            ))}
            <div>
              <dt className={styles.factLabel}>Loosening Available</dt>
              <dd className={styles.factValue}>{when(rg.limit_increase_available_at, true)}</dd>
            </div>
          </dl>
        )}
        {canModerate && (
          <button
            type="button"
            className={styles.btn}
            // Seeded FROM the row, not empty. An empty draft rendered blank
            // boxes over a player who has limits set, so the first save
            // would have looked like an edit and been a clear.
            onClick={() => setRgDraft(rgDraft ? null : seedRgDraft(rg))}
          >
            {rgDraft ? 'Cancel' : 'Change Limits'}
          </button>
        )}
        {rgDraft && (
          <>
            <div className={styles.policyGrid}>
              {/* ALL EIGHT FIELDS. The first draft hid the two exclusion
                  timestamps, and those two are the RULE'S OWN EXAMPLE:
                  section 0 rule 7 says the console explains the refusal
                  rather than hiding the control, "because an operator who
                  cannot see the control assumes the platform cannot do it
                  and reaches for SQL". */}
              {RG_FIELDS.map((f) => (
                <div key={f.key} className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={`rg-${f.key}`}>{f.label}</label>
                  <input
                    id={`rg-${f.key}`}
                    type={f.kind === 'time' ? 'datetime-local' : 'number'}
                    className={styles.input}
                    value={rgDraft[f.key] ?? ''}
                    onChange={(e) => setRgDraft({ ...rgDraft, [f.key]: e.target.value })}
                  />
                  <p className={styles.fieldHint}>
                    {f.tighter === 'lower'
                      ? 'A Smaller Number Is Tighter'
                      : 'A Later Time Is Tighter'}
                  </p>
                </div>
              ))}
            </div>

            {rgLoosens.length > 0 && (
              <div className={rgHeld ? styles.held : styles.notHeld}>
                {rgHeld
                  ? 'This Loosens A Protection And Is Held Until The Twenty Four Hours Have Passed. It Will Be Refused.'
                  : 'This Loosens A Protection. The Hold Has Passed, So It Will Be Applied.'}
              </div>
            )}
            {rgPatch && Object.keys(rgPatch).length === 0 && (
              <div className={styles.infoNote}>
                Nothing Has Changed Yet. Edit A Value To Enable Save.
              </div>
            )}

            <div className={styles.rowActions}>
              <button
                type="button"
                className={styles.btnGo}
                disabled={busy || !rgPatch || Object.keys(rgPatch).length === 0}
                onClick={() => { onRgSet(rgPatch).then((ok) => { if (ok) setRgDraft(null); }); }}
              >
                Save Limits
              </button>
            </div>
          </>
        )}
      </div>

      {/* KYC */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>KYC Events</h3>
        {(player.kycEvents || []).length === 0 ? (
          <EmptyBecause
            title="No KYC Event Has Ever Been Recorded"
            reason="The kyc_events Table Is Empty For This Account. The Verification Pipeline Has Not Written Anything Here."
          />
        ) : (
          <DataTable
            columns={[
              { key: 'eventType', header: 'Event' },
              { key: 'provider', header: 'Provider' },
              { key: 'previousStatus', header: 'From' },
              { key: 'newStatus', header: 'To' },
              { key: 'createdAt', header: 'When', render: (r) => when(r.createdAt, true) },
            ]}
            rows={player.kycEvents}
          />
        )}
      </div>

      {/* ANTI-CHEAT FLAGS. In front of the operator BEFORE they choose a
          reason code: somebody picking collusion_suspected or
          bot_or_rta_suspected should not have to leave the tab to see
          whether the platform has already flagged this account. */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Anti-Cheat Flags</h3>
        {(player.flags || []).length === 0 ? (
          <EmptyBecause
            title="This Player Has No Anti-Cheat Flags"
            reason="Nothing In anti_cheat_flags Names This Account. That Is A Clean Record, Not A Missing One."
          />
        ) : (
          <DataTable
            columns={[
              { key: 'flagType', header: 'Flag' },
              { key: 'severity', header: 'Severity', render: (r) => <StatusPill status={r.severity} /> },
              { key: 'status', header: 'State', render: (r) => <StatusPill status={r.status} /> },
              { key: 'flaggedAt', header: 'Flagged', render: (r) => when(r.flaggedAt, true) },
            ]}
            rows={player.flags}
          />
        )}
      </div>

      {/* PLAY RECORD */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Play Record</h3>
        {(player.playRecord || []).length === 0 ? (
          <p className={styles.cardNote}>
            No Play Record Exists For This Account Yet. Nothing Has Been Written For Them.
          </p>
        ) : (
          <DataTable
            columns={[
              { key: 'clubId', header: 'Club' },
              { key: 'handsPlayed', header: 'Hands', render: (r) => num(r.handsPlayed) },
              { key: 'vpip', header: 'VPIP', render: (r) => num(r.vpip) },
              { key: 'pfr', header: 'PFR', render: (r) => num(r.pfr) },
              {
                key: 'tournamentsPlayed',
                header: 'Tournaments',
                render: (r) => num(r.tournamentsPlayed),
              },
              {
                key: 'totalWinnings',
                header: 'Winnings',
                render: (r) => (!player.moneyVisible ? 'Hidden' : num(r.totalWinnings)),
              },
            ]}
            rows={player.playRecord}
            getRowKey={(r, i) => r.clubId || i}
          />
        )}
      </div>

      {/* CLUBS */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Clubs</h3>
        {clubs.length === 0 ? (
          <p className={styles.cardNote}>This Player Belongs To No Club.</p>
        ) : (
          <DataTable
            columns={[
              { key: 'clubName', header: 'Club' },
              { key: 'role', header: 'Role' },
              { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
              { key: 'handsPlayed', header: 'Hands', render: (r) => num(r.handsPlayed) },
              {
                key: 'chipBalance',
                header: 'Chips',
                // A WITHHELD figure and a figure of zero are different
                // answers, and so are a withheld figure and a genuinely
                // null one. Key off the permission, not off the value.
                render: (r) => (!player.moneyVisible
                  ? 'Hidden: Needs Money Read'
                  : num(r.chipBalance)),
              },
              { key: 'joinedAt', header: 'Joined', render: (r) => when(r.joinedAt) },
            ]}
            rows={clubs}
            getRowKey={(r) => r.clubId}
          />
        )}
      </div>

      {liftTarget && (
        <ConfirmDialog
          title="Lift This Restriction"
          confirmLabel="Lift It"
          onCancel={() => setLiftTarget(null)}
          onConfirm={() => { onLift(liftTarget.id); setLiftTarget(null); }}
          busy={busy}
        >
          <p>
            {SCOPE_META[liftTarget.scope]?.label} Will Stop Being Restricted For This Player.
            The Record Of The Restriction Is Kept.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
