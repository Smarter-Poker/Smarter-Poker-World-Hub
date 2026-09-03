/**
 * FLEET COMMAND - the horse fleet, in one tab.
 *
 * Six sections, and the split is the contract's (PHASE3-CONTRACTS section 3):
 *
 *   HEALTH    Is the engine alive, what is the fleet doing, how much room is
 *             left, and why was nothing seated last cycle.
 *   ROSTER    Every horse the engine has published a state for, server-paged,
 *             filtered by state, club and stake band, exportable in full.
 *   POLICY    The global row and every club and union row, what the engine
 *             will actually read after the merge, and the edit form behind a
 *             typed confirmation that names the approval it will raise.
 *   ISOLATION Dan's DSS ruling, with an explicit "No Horse Is In Two Clubs".
 *   P AND L   Fleet chips by club, stake and day, rake in its own column, and
 *             a note naming the tables and columns every figure came from.
 *   REGISTER  The GLI-19 disclosure list and its Sync action.
 *
 * A horse's 360 opens over any of them, from the roster or the register.
 *
 * THE SAFETY RULE IS THE FIRST THING ON THE SCREEN AND IT IS NOT DECORATION.
 * PHASE3-CONTRACTS section 0: the fleet keeps running exactly as it does today
 * until a policy row says otherwise, and no control here reaches inside a hand.
 * There is no seat button, no unseat button, no eviction and no funding on this
 * tab, because none of those exist in the route or in the database. The kill
 * switch is `pause_new_seatings` and its whole meaning is "seat nobody NEW".
 *
 * HORSES ARE PLAYERS (CLAUDE.md 10.5). `is_horse` appears here as a BADGE and
 * as the subject of the disclosure register, which is identification, and never
 * as a reason to leave a horse out of a total. The capacity figures count every
 * seat on the platform rather than only the fleet's, because that is what they
 * mean.
 *
 * EVERY DECISION ON THIS SCREEN IS A PURE FUNCTION SOMEWHERE ELSE. Heartbeat
 * freshness, the headroom arithmetic, the isolation empty state and the P and L
 * shaping live in ./fleetModel.js; the policy diff and the materiality preview
 * live in ./fleetPolicyModel.js; every request lives in ./fleetAdmin.js. This
 * file renders them. That is what lets "is the engine stale" be answered once
 * and tested without a DOM.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import DataTable from './DataTable';
import KpiTile from './KpiTile';
import Pager from './Pager';
import StatusPill from './StatusPill';
import usePagedList from './usePagedList';
import exportAllCsv from './exportAllCsv';
import styles from './shared.module.css';
import { num, when } from '../../lib/horsesAdminTokens';
import { hasPermission } from './operatorPermissions';
import {
  FLEET_ADMIN,
  MIN_REASON_LENGTH,
  ROSTER_STATES,
  REGISTER_STATUSES,
  heartbeatUrl,
  horseUrl,
  isPendingApproval,
  isolationUrl,
  listMeta,
  newFleetOpId,
  overviewUrl,
  pnlUrl,
  policyUrl,
  reasonIsValid,
  registerUrl,
  rosterIsFiltered,
  rosterUrl,
  rowsOf,
  setPolicyBody,
  showingLabel,
  syncRegisterBody,
} from './fleetAdmin';
import {
  capacityModel,
  classifyHeartbeat,
  clubAllocation,
  degradedNote,
  fleetStateLabel,
  formatGap,
  isolationState,
  lastCycleReason,
  shapePnl,
  stakeBandLabel,
  summariseStates,
} from './fleetModel';
import {
  FLEET_POLICY_FIELDS,
  KILL_SWITCH_NOTE,
  SCHEDULE_NOT_EDITABLE_NOTE,
  fleetPolicyLabel,
  inheritedOptionLabel,
  setPolicyPreview,
  sourceLabel,
} from './fleetPolicyModel';

const FLEET_WRITE = 'fleet.write';

/**
 * MONEY IS READ UNDER ITS OWN PERMISSION (review M-3).
 *
 * `fleet.read` sits in the read floor the `support` role holds; `money.read`
 * does not, and it is what gates the Economy, Statistics and Mint tabs. The P
 * And L section is fleet chips won and lost by club, by stake and by day with
 * the rake column beside them, which is the Economy tab's material under
 * another heading, so the route answers ?section=pnl with 403
 * `money_read_required` for an operator without it. The tab hides the section
 * rather than offering a heading that can only ever produce that refusal, and
 * says which permission is missing - the same thing it already does for
 * fleet.write on Save Policy and Sync Register.
 */
const MONEY_READ = 'money.read';

const ALL_SECTIONS = [
  ['health', 'Health'],
  ['roster', 'Roster'],
  ['policy', 'Policy'],
  ['isolation', 'Isolation'],
  ['pnl', 'P And L'],
  ['register', 'Register'],
];

const ROSTER_PAGE_SIZE = 100;
const POLICY_PAGE_SIZE = 200;
const REGISTER_PAGE_SIZE = 200;
const ISOLATION_PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;

/** How long the console lets the heartbeat go quiet before it says so. The
 *  route's overview window is its own (15 minutes by default); this is the
 *  console's line and it is tighter, so the tab notices first. */
const STALE_AFTER_SECONDS = 300;

/** The clock the ages are measured against, refreshed so a tab left open does
 *  not report a two hour old beat as four minutes old forever. */
const CLOCK_INTERVAL_MS = 30000;

/** What a blank P and L range means: the RPC's own default is the last 30 days. */
const PNL_DEFAULT_NOTE = 'The Last 30 Days, Which Is The Default The Report Uses When No Dates Are Given.';

/** A boolean as an operator reads it, with a real answer for "not set". */
function yesNo(value, unset = 'Inherited') {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return unset;
}

/** A policy value for the table. Arrays join, null says what null MEANS. */
function policyValue(field, value) {
  if (value === null || value === undefined) return 'Inherited';
  if (field === 'enabled' || field === 'pause_new_seatings') return yesNo(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function FleetPanel({
  authFetch,
  showNotification,
  permissions = null,
  policy = null,
}) {
  const [section, setSection] = useState('health');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const mayWrite = hasPermission(permissions, FLEET_WRITE);
  const mayReadMoney = hasPermission(permissions, MONEY_READ);

  /** The nav an operator actually gets. A section it can never open is not
   *  offered, and the reason is stated on the tab rather than left as a 403. */
  const sections = useMemo(
    () => ALL_SECTIONS.filter(([id]) => id !== 'pnl' || mayReadMoney),
    [mayReadMoney],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // ── HEALTH ────────────────────────────────────────────────────────────────
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [overviewError, setOverviewError] = useState(null);
  const [beats, setBeats] = useState(null);
  /** When this browser received the overview, so the SERVER's clock can be
   *  carried forward between refreshes without trusting the local one. */
  const [loadedAt, setLoadedAt] = useState(null);

  /**
   * ONE SEQUENCE NUMBER, SO THE SLOWER ANSWER LOSES. Refresh twice and the
   * first response could land after the second and put an older fleet on the
   * screen; the same pair of setState calls after an unmount is a leak.
   * usePagedList has carried this guard since Phase 1 and a hand-rolled fetch
   * does not get it for free.
   */
  const healthSeqRef = useRef(0);
  useEffect(() => () => { healthSeqRef.current += 1; }, []);

  const loadHealth = useCallback(async () => {
    healthSeqRef.current += 1;
    const seq = healthSeqRef.current;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const [overviewBody, beatBody] = await Promise.all([
        authFetch(overviewUrl()),
        authFetch(heartbeatUrl({ windowHours: 24, limit: 100, offset: 0 })),
      ]);
      if (seq !== healthSeqRef.current) return;
      setOverview(overviewBody);
      setBeats(beatBody);
      setLoadedAt(Date.now());
      setOverviewLoaded(true);
    } catch (err) {
      if (seq !== healthSeqRef.current) return;
      setOverviewError(err.message || 'The Fleet Overview Could Not Be Read.');
    } finally {
      if (seq === healthSeqRef.current) setOverviewLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { if (section === 'health' && !overviewLoaded) loadHealth(); },
    [section, overviewLoaded, loadHealth]);

  // ── ROSTER ────────────────────────────────────────────────────────────────
  const fetchRosterPage = useCallback(async ({ limit, offset, filters, signal }) => {
    const body = await authFetch(rosterUrl({ filters, limit, offset }), { signal });
    return {
      rows: rowsOf(body),
      total: typeof body.total === 'number' ? body.total : null,
      hasMore: typeof body.hasMore === 'boolean' ? body.hasMore : undefined,
    };
  }, [authFetch]);

  const roster = usePagedList({
    fetchPage: fetchRosterPage,
    limit: ROSTER_PAGE_SIZE,
    initialFilters: { state: '', clubId: '', band: '', lane: '' },
    auto: section === 'roster',
  });

  const [exporting, setExporting] = useState(null);

  const exportRoster = useCallback(async () => {
    setExporting({ fetched: 0, total: roster.total });
    try {
      const result = await exportAllCsv({
        filenamePrefix: 'fleet-roster',
        limit: EXPORT_PAGE_SIZE,
        onProgress: (p) => setExporting(p),
        // THE WHOLE FILTERED SET, not the page on screen. The filters are the
        // ones in state, so the file and the table describe the same fleet.
        fetchPage: async (offset, limit) => {
          const body = await authFetch(rosterUrl({ filters: roster.filters, limit, offset }));
          return {
            rows: rowsOf(body),
            total: typeof body.total === 'number' ? body.total : null,
          };
        },
        columns: [
          ['horse_id', 'Horse ID'],
          ['label', 'Horse'],
          ['username', 'Username'],
          ['player_number', 'Player Number'],
          ['is_horse', 'Flagged As Horse'],
          ['state', 'State'],
          ['club_id', 'Club ID'],
          ['club_label', 'Club'],
          ['table_id', 'Table ID'],
          ['seat_index', 'Seat'],
          ['stack', 'Stack'],
          ['bankroll', 'Bankroll'],
          ['lane', 'Lane'],
          ['stake_band', 'Stake Band'],
          ['hands_this_session', 'Hands This Session'],
          ['session_started_at', 'Session Started'],
          ['last_action_at', 'Last Action'],
          ['last_seen_at', 'Last Seen'],
          ['note', 'Note'],
        ],
      });
      showNotification(
        result.complete
          ? `Exported ${num(result.exported)} Roster Rows`
          : `Exported ${num(result.exported)} Roster Rows. The Export Stopped At Its Page Cap And Is Incomplete.`,
        result.complete ? 'success' : 'info',
      );
    } catch (err) {
      showNotification(`Export Failed: ${err.message}`, 'error');
    } finally {
      setExporting(null);
    }
  }, [authFetch, roster.filters, roster.total, showNotification]);

  // ── HORSE 360 ─────────────────────────────────────────────────────────────
  const [horseId, setHorseId] = useState(null);
  const [horse, setHorse] = useState(null);
  const [horseLoading, setHorseLoading] = useState(false);
  const [horseError, setHorseError] = useState(null);
  const [trailType, setTrailType] = useState('profile');

  const horseSeqRef = useRef(0);
  useEffect(() => () => { horseSeqRef.current += 1; }, []);

  useEffect(() => {
    if (!horseId) return;
    const url = horseUrl({ horseId, trailTargetType: trailType });
    if (!url) return;
    horseSeqRef.current += 1;
    const seq = horseSeqRef.current;
    setHorseLoading(true);
    setHorseError(null);
    setHorse(null);
    authFetch(url)
      .then((body) => {
        if (seq !== horseSeqRef.current) return;
        setHorse(body);
      })
      .catch((err) => {
        if (seq !== horseSeqRef.current) return;
        setHorseError(err.message || 'That Horse Could Not Be Read.');
      })
      .finally(() => {
        if (seq === horseSeqRef.current) setHorseLoading(false);
      });
  }, [authFetch, horseId, trailType]);

  // ── POLICY ────────────────────────────────────────────────────────────────
  const [policyBody, setPolicyBodyState] = useState(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [policyError, setPolicyError] = useState(null);
  const [policyClubId, setPolicyClubId] = useState('');
  /** The policy list is server-paged like every other list on this tab
   *  (review L-4). Two hundred rows was a cap with a note and no way past it. */
  const [policyOffset, setPolicyOffset] = useState(0);
  const [editRow, setEditRow] = useState(null); // { scope, scopeId, label, row }
  const [draft, setDraft] = useState({});
  const [policyReason, setPolicyReason] = useState('');
  const [policyConfirm, setPolicyConfirm] = useState(false);
  const [policyOpId, setPolicyOpId] = useState(() => newFleetOpId());
  const [pendingApproval, setPendingApproval] = useState(null);

  const policySeqRef = useRef(0);
  useEffect(() => () => { policySeqRef.current += 1; }, []);

  const loadPolicy = useCallback(async () => {
    policySeqRef.current += 1;
    const seq = policySeqRef.current;
    setPolicyLoading(true);
    setPolicyError(null);
    try {
      const body = await authFetch(policyUrl({
        clubId: policyClubId,
        limit: POLICY_PAGE_SIZE,
        offset: policyOffset,
      }));
      if (seq !== policySeqRef.current) return;
      setPolicyBodyState(body);
      setPolicyLoaded(true);
    } catch (err) {
      if (seq !== policySeqRef.current) return;
      setPolicyError(err.message || 'The Fleet Policy Could Not Be Read.');
    } finally {
      if (seq === policySeqRef.current) setPolicyLoading(false);
    }
  }, [authFetch, policyClubId, policyOffset]);

  useEffect(() => { if (section === 'policy' && !policyLoaded) loadPolicy(); },
    [section, policyLoaded, loadPolicy]);

  /** Move the policy list a page. Clearing `loaded` is what re-runs the load
   *  effect, so paging goes through exactly the same read as the first one. */
  const goPolicyPage = useCallback((nextOffset) => {
    setPolicyOffset(Math.max(0, nextOffset));
    setPolicyLoaded(false);
  }, []);

  const policyRows = useMemo(() => rowsOf(policyBody), [policyBody]);
  const policyMeta = useMemo(() => listMeta(policyBody, policyRows.length), [policyBody, policyRows]);

  /**
   * THE KEY ROTATES WITH THE INTENT.
   *
   * The idempotency key is minted once per composed change and travels
   * unchanged on every retry. It must change the moment the change does, or an
   * approval raised for one patch could be executed as another. The Mint learnt
   * this the hard way (Phase 1 review) and the rule is the same here.
   */
  const draftKey = useMemo(
    () => JSON.stringify({
      scope: editRow?.scope || null,
      scopeId: editRow?.scopeId || null,
      draft,
      reason: policyReason,
    }),
    [editRow, draft, policyReason],
  );
  useEffect(() => { setPolicyOpId(newFleetOpId()); }, [draftKey]);

  const preview = useMemo(
    () => setPolicyPreview({
      draft,
      saved: editRow ? editRow.row : null,
      policy,
      scope: editRow?.scope || 'global',
    }),
    [draft, editRow, policy],
  );

  /**
   * THE MERGE THE EDITOR IS ALLOWED TO QUOTE.
   *
   * `effective` is the answer for ONE scope: the club id typed into the box
   * above the table, or the global answer when that box is blank. Quoting it
   * under a different club's row would put a confident sentence about the wrong
   * club in front of an operator, which is the same class of defect as the
   * unticked box it replaces. So it travels only when it IS this row's merge,
   * and the label says "Not Known Here" otherwise.
   */
  const editorInherits = useMemo(() => {
    const scope = editRow?.scope || 'global';
    const forClub = policyBody?.clubId || null;
    const eff = policyBody?.effective || null;
    if (scope === 'global') return { scope };
    const applies = scope === 'club' && !!forClub && forClub === editRow?.scopeId;
    return { scope, effective: applies ? eff : null };
  }, [editRow, policyBody]);

  const openEditor = useCallback((row) => {
    const scope = row?.scope || 'global';
    const seeded = {};
    for (const field of FLEET_POLICY_FIELDS) {
      seeded[field] = row && row[field] !== undefined ? row[field] : null;
    }
    setEditRow({
      scope,
      scopeId: scope === 'global' ? null : row?.scope_id || null,
      label: row?.scope_label || (scope === 'global' ? 'Global' : row?.scope_id || 'This Scope'),
      row: row || null,
    });
    setDraft(seeded);
    setPolicyReason('');
    setPendingApproval(null);
  }, []);

  const submitPolicy = useCallback(async () => {
    if (!editRow) return;
    const body = setPolicyBody({
      scope: editRow.scope,
      scopeId: editRow.scopeId,
      patch: preview.patch,
      reason: policyReason,
      opId: policyOpId,
    });
    if (!body) {
      showNotification(
        `Change A Value And Write A Reason Of At Least ${MIN_REASON_LENGTH} Characters.`,
        'error',
      );
      setPolicyConfirm(false);
      return;
    }
    setBusy(true);
    try {
      const result = await authFetch(FLEET_ADMIN, { method: 'POST', body: JSON.stringify(body) });
      // THE 202. Nothing changed, and the panel must not re-read the policy as
      // though something had: an unchanged row rendered after a "saved" toast
      // is how an operator concludes the save silently failed.
      if (isPendingApproval(result)) {
        setPendingApproval({
          approvalId: result.approvalId || null,
          status: result.status || 'pending',
          reasons: Array.isArray(result.materialReasons) ? result.materialReasons : preview.reasons,
        });
        setPolicyConfirm(false);
        setEditRow(null);
        showNotification(
          'Sent For Approval. Nothing Has Changed Yet. Another Operator Must Approve It.',
          'info',
        );
        return;
      }
      setPolicyConfirm(false);
      setEditRow(null);
      showNotification(result.message || 'Policy Saved.', 'success');
      await loadPolicy();
      // The Health tab reads the same policy through the per-club allocation,
      // so it is stale the moment this lands.
      setOverviewLoaded(false);
    } catch (err) {
      // THE REPLAY THE ROUTE REFUSES IS NOT AN ERROR TO STARE AT. A 409
      // `already_executed` means this idempotency key has already applied a
      // change: a second tab, a retry after a slow answer, or a Run Again on an
      // approval that already ran. The change IS in place, so the honest move is
      // to say so, close the editor and re-read the rows rather than leaving an
      // operator looking at a refusal over a form they will now submit twice.
      if (err.code === 'already_executed') {
        setPolicyConfirm(false);
        setEditRow(null);
        setPendingApproval(null);
        showNotification(
          'That Change Was Already Applied Under This Key, So Nothing Was Written A Second Time. The Rows Below Are Being Re-Read.',
          'info',
        );
        await loadPolicy();
        setOverviewLoaded(false);
        return;
      }
      showNotification(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [authFetch, editRow, loadPolicy, policyOpId, policyReason, preview, showNotification]);

  // ── ISOLATION ─────────────────────────────────────────────────────────────
  // The envelope is kept as well as the rows: `complete`, `sources` and
  // `ruling` decide whether an empty result is a clean fleet or a report that
  // could not look, and usePagedList only carries rows, total and hasMore.
  const [isolationBody, setIsolationBody] = useState(null);

  const fetchIsolationPage = useCallback(async ({ limit, offset, signal }) => {
    const body = await authFetch(isolationUrl({ limit, offset }), { signal });
    setIsolationBody(body);
    return {
      rows: rowsOf(body),
      total: typeof body.total === 'number' ? body.total : null,
      hasMore: typeof body.hasMore === 'boolean' ? body.hasMore : undefined,
    };
  }, [authFetch]);

  const isolation = usePagedList({
    fetchPage: fetchIsolationPage,
    limit: ISOLATION_PAGE_SIZE,
    auto: section === 'isolation',
  });
  const isolationVerdict = useMemo(
    () => (isolation.loaded ? isolationState(isolationBody) : isolationState(null)),
    [isolation.loaded, isolationBody],
  );

  // ── P AND L ───────────────────────────────────────────────────────────────
  const [pnlBody, setPnlBody] = useState(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlLoaded, setPnlLoaded] = useState(false);
  const [pnlError, setPnlError] = useState(null);
  const [pnlFrom, setPnlFrom] = useState('');
  const [pnlTo, setPnlTo] = useState('');
  const [pnlClubId, setPnlClubId] = useState('');

  const pnlSeqRef = useRef(0);
  useEffect(() => () => { pnlSeqRef.current += 1; }, []);

  const loadPnl = useCallback(async () => {
    pnlSeqRef.current += 1;
    const seq = pnlSeqRef.current;
    setPnlLoading(true);
    setPnlError(null);
    try {
      const body = await authFetch(pnlUrl({ from: pnlFrom, to: pnlTo, clubId: pnlClubId }));
      if (seq !== pnlSeqRef.current) return;
      setPnlBody(body);
      setPnlLoaded(true);
    } catch (err) {
      if (seq !== pnlSeqRef.current) return;
      // The route's own refusal code, handled as the answer it is rather than
      // as a failure. The section is hidden from an account without money.read,
      // so this is the deploy-skew case: a permission changed under an open tab.
      setPnlError(
        err.code === 'money_read_required'
          ? `These Are Money Figures, So Reading Them Needs The ${MONEY_READ} Permission As Well As Fleet Read. This Account Does Not Hold It, So There Is Nothing To Retry.`
          : err.message || 'The Fleet P And L Could Not Be Read.',
      );
    } finally {
      if (seq === pnlSeqRef.current) setPnlLoading(false);
    }
  }, [authFetch, pnlFrom, pnlTo, pnlClubId]);

  useEffect(() => { if (section === 'pnl' && mayReadMoney && !pnlLoaded) loadPnl(); },
    [section, mayReadMoney, pnlLoaded, loadPnl]);

  const pnl = useMemo(() => shapePnl(pnlBody?.pnl), [pnlBody]);

  // ── REGISTER ──────────────────────────────────────────────────────────────
  // Same reason as the isolation report: the disclosure sentence travels on
  // the envelope, not on the rows.
  const [registerBody, setRegisterBody] = useState(null);
  const [syncConfirm, setSyncConfirm] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const fetchRegisterPage = useCallback(async ({ limit, offset, filters, signal }) => {
    const body = await authFetch(
      registerUrl({ status: filters.status, limit, offset }),
      { signal },
    );
    setRegisterBody(body);
    return {
      rows: rowsOf(body),
      total: typeof body.total === 'number' ? body.total : null,
      hasMore: typeof body.hasMore === 'boolean' ? body.hasMore : undefined,
    };
  }, [authFetch]);

  const register = usePagedList({
    fetchPage: fetchRegisterPage,
    limit: REGISTER_PAGE_SIZE,
    initialFilters: { status: 'active' },
    auto: section === 'register',
  });

  const submitSync = useCallback(async () => {
    setBusy(true);
    try {
      const result = await authFetch(FLEET_ADMIN, {
        method: 'POST',
        body: JSON.stringify(syncRegisterBody({})),
      });
      setSyncResult(result.result || null);
      setSyncConfirm(false);
      showNotification(result.message || 'Register Synced.', 'success');
      register.refresh();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [authFetch, register, showNotification]);

  // ── DERIVED: HEALTH ───────────────────────────────────────────────────────
  const overviewData = overview?.overview || null;
  const beat = overviewData?.heartbeat || beats?.latest || null;
  const serverNow = overview?.serverNow || beats?.serverNow || null;

  /**
   * The clock is the SERVER's where the route sent one. A laptop three minutes
   * fast would otherwise invent an outage, and `now` (the local ticking clock)
   * is only used to keep the reading moving between refreshes.
   */
  const heartbeat = useMemo(() => {
    const base = serverNow ? Date.parse(serverNow) : NaN;
    // The server's instant, carried forward by however long this tab has been
    // open since. The local clock supplies only the ELAPSED time, which two
    // clocks agree about even when they disagree about the hour.
    const at = Number.isFinite(base) && loadedAt ? base + Math.max(0, now - loadedAt) : now;
    return classifyHeartbeat({
      beatAt: beat?.beat_at || null,
      now: at,
      staleAfterSeconds: STALE_AFTER_SECONDS,
    });
  }, [beat, serverNow, loadedAt, now]);

  /**
   * A WITHHELD FIGURE AND A FIGURE OF ZERO ARE DIFFERENT ANSWERS (review M-3).
   *
   * ?section=horse still answers 200 without money.read; it simply leaves the
   * diamond balance out and sends `totalProfit: null` with
   * `totalProfitVisible: false`. Rendering either as a blank or as a zero would
   * tell an operator this horse holds no diamonds and has won nothing, which is
   * a statement about the money rather than about their permissions.
   */
  const horseMoneyHidden = horse?.moneyVisible === false;
  const MONEY_HIDDEN_TEXT = 'Hidden: Needs The Money Read Permission';

  const stateSummary = useMemo(() => summariseStates(overviewData), [overviewData]);
  const states = stateSummary.rows;

  const capacity = useMemo(() => capacityModel(overviewData?.capacity), [overviewData]);
  const allocation = useMemo(() => clubAllocation(overviewData?.clubs), [overviewData]);
  const cycle = useMemo(() => lastCycleReason(beat), [beat]);
  const degraded = useMemo(() => degradedNote(beat), [beat]);

  // ── COLUMNS ───────────────────────────────────────────────────────────────
  const rosterColumns = useMemo(() => ([
    {
      key: 'horse',
      header: 'Horse',
      render: (row) => (
        <>
          <div>{row.label || 'Not Named'}</div>
          <div className={styles.mono}>{row.horse_id}</div>
          {/* Identification, never exclusion. A state row whose profile is no
              longer flagged as a horse is a real condition and hiding it would
              make the register and the roster disagree in silence. */}
          {row.is_horse === false && (
            <StatusPill tone="warn" label="Not Flagged As Horse" />
          )}
        </>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => <StatusPill status={row.state} label={fleetStateLabel(row.state)} />,
    },
    { key: 'club', header: 'Club', render: (row) => row.club_label || row.club_id || '-' },
    {
      key: 'table',
      header: 'Table',
      render: (row) => (row.table_id
        ? <span className={styles.mono}>{row.table_id}{row.seat_index === null || row.seat_index === undefined ? '' : ` seat ${row.seat_index}`}</span>
        : '-'),
    },
    { key: 'stack', header: 'Stack', align: 'right', render: (row) => num(row.stack) },
    { key: 'bankroll', header: 'Bankroll', align: 'right', render: (row) => num(row.bankroll) },
    { key: 'lane', header: 'Lane', render: (row) => row.lane || '-' },
    { key: 'stake_band', header: 'Stake Band', render: (row) => stakeBandLabel(row.stake_band) },
    {
      key: 'last_action_at',
      header: 'Last Action',
      render: (row) => when(row.last_action_at, true),
    },
    {
      key: 'open',
      header: 'Detail',
      render: (row) => (
        <button
          type="button"
          className={styles.btn}
          onClick={() => { setTrailType('profile'); setHorseId(row.horse_id); }}
        >
          Open
        </button>
      ),
    },
  ]), []);

  const policyColumns = useMemo(() => {
    const columns = [
      {
        key: 'scope',
        header: 'Scope',
        render: (row) => (
          <>
            <div>{row.scope === 'global' ? 'Global' : `${row.scope === 'club' ? 'Club' : 'Union'}: ${row.scope_label || 'Unnamed'}`}</div>
            {row.scope_id ? <div className={styles.mono}>{row.scope_id}</div> : null}
          </>
        ),
      },
      { key: 'enabled', header: 'Enabled', render: (row) => policyValue('enabled', row.enabled) },
      {
        key: 'pause_new_seatings',
        header: 'New Seatings',
        render: (row) => (row.pause_new_seatings === true
          ? <StatusPill tone="danger" label="Paused" />
          : row.pause_new_seatings === false
            ? <StatusPill tone="good" label="Running" />
            : 'Inherited'),
      },
      { key: 'max_horses', header: 'Max Horses', align: 'right', render: (row) => policyValue('max_horses', row.max_horses) },
      { key: 'max_per_table', header: 'Max Per Table', align: 'right', render: (row) => policyValue('max_per_table', row.max_per_table) },
      { key: 'occupancy_bias', header: 'Bias', align: 'right', render: (row) => policyValue('occupancy_bias', row.occupancy_bias) },
      { key: 'min_humans_to_seat', header: 'Min Humans', align: 'right', render: (row) => policyValue('min_humans_to_seat', row.min_humans_to_seat) },
      { key: 'updated_at', header: 'Updated', render: (row) => when(row.updated_at, true) },
    ];
    if (mayWrite) {
      columns.push({
        key: 'actions',
        header: 'Actions',
        render: (row) => (
          <button type="button" className={`${styles.btn} ${styles.btnGo}`} onClick={() => openEditor(row)}>
            Edit
          </button>
        ),
      });
    }
    return columns;
  }, [mayWrite, openEditor]);

  const isolationColumns = useMemo(() => ([
    {
      key: 'horse_id',
      header: 'Horse',
      render: (row) => <span className={styles.mono}>{row.horse_id}</span>,
    },
    { key: 'scope_count', header: 'Scopes', align: 'right', render: (row) => num(row.scope_count) },
    {
      key: 'scopes',
      header: 'Where',
      render: (row) => (
        <ul className={styles.notBuiltList}>
          {(Array.isArray(row.scopes) ? row.scopes : []).map((scope, i) => (
            <li key={`${row.horse_id}-${scope.scope_id || i}`}>
              {scope.scope_kind === 'union' ? 'Union' : 'Club'} {scope.scope_id || 'Unknown'}
              {' '}holding {num(scope.seats)} {Number(scope.seats) === 1 ? 'seat' : 'seats'}
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: 'open',
      header: 'Detail',
      render: (row) => (
        <button
          type="button"
          className={styles.btn}
          onClick={() => { setTrailType('profile'); setHorseId(row.horse_id); }}
        >
          Open
        </button>
      ),
    },
  ]), []);

  const registerColumns = useMemo(() => ([
    {
      key: 'horse',
      header: 'Account',
      render: (row) => (
        <>
          <div>{row.label || 'Profile No Longer Exists'}</div>
          <div className={styles.mono}>{row.horse_id}</div>
        </>
      ),
    },
    {
      key: 'disclosed',
      header: 'Disclosed',
      render: (row) => (row.disclosed === true
        ? <StatusPill tone="good" label="Disclosed" />
        : <StatusPill tone="danger" label="Not Disclosed" />),
    },
    { key: 'owner_entity', header: 'Owner Entity', render: (row) => row.owner_entity || '-' },
    { key: 'funding_source', header: 'Funding Source', render: (row) => row.funding_source || '-' },
    { key: 'created_at', header: 'Account Created', render: (row) => when(row.created_at) },
    { key: 'registered_at', header: 'Registered', render: (row) => when(row.registered_at) },
    {
      key: 'retired_at',
      header: 'Retired',
      render: (row) => (row.retired_at
        ? when(row.retired_at)
        : row.profile_present === false
          ? <StatusPill tone="warn" label="Profile Missing" />
          : 'Live'),
    },
    {
      key: 'still_flagged',
      header: 'Still Flagged',
      render: (row) => yesNo(row.still_flagged, 'Not Known'),
    },
    {
      key: 'open',
      header: 'Detail',
      render: (row) => (
        <button
          type="button"
          className={styles.btn}
          onClick={() => { setTrailType('profile'); setHorseId(row.horse_id); }}
        >
          Open
        </button>
      ),
    },
  ]), []);

  const rosterMetaLabel = showingLabel(
    { total: roster.total, truncated: roster.total !== null && roster.total > roster.rows.length, shown: roster.rows.length },
    'Horses',
  );

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Fleet Command</h2>
          <p className={styles.panelIntro}>
            The Horse Fleet: What It Is Doing, What Steers It, And What It Has Won Or Lost.
            Every Control Here Shapes How Many Horses Take Seats. Nothing Here Reaches Inside
            A Hand, Removes A Seated Horse Or Moves A Chip, Because No Such Control Exists.
          </p>
        </div>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            if (section === 'health') { setOverviewLoaded(false); loadHealth(); }
            else if (section === 'roster') roster.refresh();
            else if (section === 'policy') loadPolicy();
            else if (section === 'isolation') isolation.refresh();
            else if (section === 'pnl') loadPnl();
            else register.refresh();
          }}
          disabled={overviewLoading || busy}
        >
          Refresh
        </button>
      </div>

      {/* Horses are players. Said once, at the top, where it governs every
          number below it rather than as a footnote under one of them. */}
      <div className={styles.infoNote}>
        A Horse Is A Player. It Buys In From The Same Club Wallet, Sits In The Same Seat, Gets The
        Same Timers And Pauses, And Is Paid The Same Way. The Quotas On This Tab Shape How Many
        Horses Take Seats, Never How A Seated Horse Is Treated.
      </div>

      <div className={styles.sectionNav} role="tablist" aria-label="Fleet Command Sections">
        {sections.map(([id, label]) => (
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

      {/* ── HEALTH ────────────────────────────────────────────────────────── */}
      {section === 'health' && (
        <>
          {overviewError && (
            <div className={styles.errorNote} role="alert">
              The Fleet Overview Could Not Be Read: {overviewError}
            </div>
          )}

          {/* A STALE HEARTBEAT IS STATED LOUDLY, and a known blackout is not.
              classifyHeartbeat is the one place that decides which of the two
              this is, so the alarm and the all-clear can never disagree. */}
          <div
            className={heartbeat.loud ? styles.errorNote : heartbeat.tone === 'good' ? styles.goodNote : styles.infoNote}
            role={heartbeat.loud ? 'alert' : 'status'}
          >
            <strong>{heartbeat.headline}.</strong> {heartbeat.detail}
            {heartbeat.ageSeconds !== null && (
              <> Last Beat {when(beat?.beat_at, true)}, {formatGap(heartbeat.ageSeconds)} Ago.</>
            )}
          </div>

          {degraded && <div className={styles.warnNote}>{degraded}</div>}

          {cycle.reason && (
            <div className={styles.warnNote}>
              Why Nothing Was Seated Last Cycle: {cycle.reason}
              {!cycle.stated && ' The Engine Records A Reason When It Withholds Seating On Purpose, So An Absent One Is Itself Worth Chasing.'}
            </div>
          )}

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Fleet State</h3>
            <p className={styles.cardNote}>
              Every State Is Listed Even At Zero. These Counts Are As Old As The Heartbeat Above,
              Because The Engine Publishes Them Together.
            </p>
            <div className={styles.kpiGrid}>
              {states.map((row) => (
                <KpiTile
                  key={row.state}
                  label={row.label}
                  value={num(row.count)}
                  tone={row.state === 'playing' ? 'accent' : row.state === 'busted' ? 'warn' : undefined}
                />
              ))}
            </div>
            {stateSummary.totalDisagrees && (
              <div className={styles.warnNote}>
                The Reported Total And The Sum Of The State Counts Do Not Agree, So One Of Them Is
                Describing A Different Set. Neither Is Shown As The Other.
              </div>
            )}
            <div className={styles.kpiGrid}>
              <KpiTile
                label="Horses With A Published State"
                value={num(stateSummary.total)}
                hint="Rows In The Engine's State Mirror, Not The Whole Register."
              />
              <KpiTile
                label="Stuck Seats"
                value={num(overviewData?.stuck)}
                tone="danger"
                hint={`Holding A Seat With No Action Inside ${num(overviewData?.window_minutes)} Minutes.`}
              />
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Capacity</h3>
            <p className={styles.cardNote}>
              Seats On Live Tables Against Seats Occupied By Anybody, Horse Or Human. A Horse
              Counts Everywhere A Human Counts, So These Are Platform Totals And Not Fleet Totals.
            </p>
            <div className={styles.kpiGrid}>
              <KpiTile label="Live Tables" value={num(capacity.tablesLive)} />
              <KpiTile label="Seats Total" value={num(capacity.seatsTotal)} />
              <KpiTile label="Seats Filled" value={num(capacity.seatsFilled)} />
              <KpiTile label="Seats Free" value={num(capacity.seatsFree)} tone="accent" />
              <KpiTile
                label="Occupancy"
                value={capacity.occupancy === null ? '-' : `${Math.round(capacity.occupancy * 100)}%`}
                hint="Left Blank Rather Than Guessed When A Source Is Missing."
              />
            </div>
            {capacity.note && <div className={styles.warnNote}>{capacity.note}</div>}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Per Club Allocation</h3>
            <DataTable
              columns={[
                {
                  key: 'club',
                  header: 'Club',
                  // The name, then the short code, then the raw id. An operator
                  // opens this table to decide which club to cap and cannot do
                  // that from a uuid (review M-5).
                  render: (row) => (
                    <>
                      <div>{row.clubLabel || row.clubCode || 'Unnamed Club'}</div>
                      {row.clubId ? <div className={styles.mono}>{row.clubId}</div> : null}
                    </>
                  ),
                },
                { key: 'actual', header: 'Horses', align: 'right', render: (row) => num(row.actual) },
                { key: 'seated', header: 'Holding A Seat', align: 'right', render: (row) => num(row.seated) },
                { key: 'quota', header: 'Cap', align: 'right', render: (row) => num(row.quota) },
                { key: 'headroom', header: 'Headroom', align: 'right', render: (row) => num(row.headroom) },
                {
                  key: 'status',
                  header: 'Against The Cap',
                  render: (row) => (
                    <>
                      <StatusPill
                        tone={row.status === 'over_cap' ? 'danger' : row.status === 'at_cap' ? 'warn' : 'neutral'}
                        label={row.statusLabel}
                      />
                      {row.note ? <span className={styles.blockedNote}>{row.note}</span> : null}
                    </>
                  ),
                },
                {
                  key: 'switches',
                  header: 'Switches',
                  render: (row) => (
                    <span className={styles.pillRow}>
                      <StatusPill tone={row.enabled === false ? 'danger' : 'neutral'} label={row.enabled === false ? 'Disabled' : 'Enabled'} />
                      {row.paused === true ? <StatusPill tone="warn" label="New Seatings Paused" /> : null}
                    </span>
                  ),
                },
              ]}
              rows={allocation}
              caption="Horses Per Club Against The Cap Its Effective Policy Sets"
              loading={overviewLoading && !overviewLoaded}
              loadingLabel="Loading The Fleet"
              empty="No Club Is Carrying A Published Horse State Yet."
              getRowKey={(row, i) => row.clubId || i}
            />
          </div>

          {Array.isArray(overviewData?.notes) && overviewData.notes.length > 0 && (
            <div className={styles.warnNote}>
              This Reading Is Incomplete: {overviewData.notes.join('; ')}
            </div>
          )}
        </>
      )}

      {/* ── ROSTER ────────────────────────────────────────────────────────── */}
      {section === 'roster' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Roster</h3>
          <p className={styles.cardNote}>
            Every Horse The Engine Has Published A State For. This Table Is Paged By The Route,
            And The Filters Below Narrow The Whole Set Rather Than The Page On Screen, So The
            Count, The Pager And The Export All Describe The Same Fleet.
          </p>

          <div className={styles.filterRow}>
            <label className={styles.fieldLabel} htmlFor="roster-state">State</label>
            <select
              id="roster-state"
              className={styles.select}
              style={{ width: 'auto' }}
              value={roster.filters.state}
              onChange={(e) => roster.setFilter('state', e.target.value)}
            >
              <option value="">All States</option>
              {ROSTER_STATES.map((state) => (
                <option key={state} value={state}>{fleetStateLabel(state)}</option>
              ))}
            </select>

            <label className={styles.fieldLabel} htmlFor="roster-club">Club ID</label>
            <input
              id="roster-club"
              className={styles.input}
              style={{ width: 'auto', minWidth: 260 }}
              value={roster.filters.clubId}
              onChange={(e) => roster.setFilter('clubId', e.target.value.trim())}
              placeholder="Club ID"
            />

            <label className={styles.fieldLabel} htmlFor="roster-band">Stake Band</label>
            <input
              id="roster-band"
              className={styles.input}
              style={{ width: 'auto' }}
              value={roster.filters.band}
              onChange={(e) => roster.setFilter('band', e.target.value)}
            />

            <button
              type="button"
              className={styles.btn}
              onClick={exportRoster}
              disabled={!!exporting || (roster.loaded && roster.total === 0)}
              title="Exports Every Row Matching These Filters, Across All Pages, Not Just The Page On Screen."
            >
              {exporting ? 'Exporting' : 'Export CSV'}
            </button>
          </div>

          {exporting && (
            <div className={styles.exportProgress} role="status">
              Exporting Roster Rows: {num(exporting.fetched, '0')}
              {exporting.total === null || exporting.total === undefined
                ? ' So Far'
                : ` Of ${num(exporting.total)}`}
              . Leave This Tab Open.
            </div>
          )}

          {/* There is no name search here and the panel says why rather than
              offering a box that only searches the page in front of you. */}
          <p className={styles.cardNote}>
            There Is No Name Search: The Engine's State Table Carries No Name Column, So A Name
            Filter Would Only Ever Narrow The Page On Screen. Filter By State, Club Or Band, Which
            The Route Applies To The Whole Set.
          </p>

          {roster.error && (
            <div className={styles.errorNote} role="alert">
              The Roster Could Not Be Read: {roster.error}
            </div>
          )}

          <DataTable
            columns={rosterColumns}
            rows={roster.rows}
            caption="Fleet Roster"
            loading={roster.loading && !roster.loaded}
            loadingLabel="Loading The Roster"
            empty={
              rosterIsFiltered(roster.filters)
                ? 'No Horse Matches These Filters.'
                : 'The Engine Has Not Published A State For Any Horse Yet.'
            }
            getRowKey={(row, i) => row.horse_id || i}
          />

          {rosterMetaLabel && <div className={styles.warnNote}>{rosterMetaLabel}</div>}

          <Pager
            offset={roster.offset}
            limit={roster.limit}
            count={roster.rows.length}
            total={roster.total}
            hasMore={roster.hasMore}
            loading={roster.loading}
            noun="Horses"
            onPrevious={roster.previous}
            onNext={roster.next}
          />
        </div>
      )}

      {/* ── POLICY ────────────────────────────────────────────────────────── */}
      {section === 'policy' && (
        <>
          <div className={styles.infoNote}>{KILL_SWITCH_NOTE}</div>

          {policyError && (
            <div className={styles.errorNote} role="alert">
              The Fleet Policy Could Not Be Read: {policyError}
            </div>
          )}

          {pendingApproval && (
            <div className={styles.warnNote} role="status">
              Sent For Approval. Nothing Has Changed Yet. Approval{' '}
              <span className={styles.mono}>{pendingApproval.approvalId || 'Not Returned'}</span> Is
              Waiting On The Approvals Tab.
            </div>
          )}

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>What The Engine Will Read</h3>
            <p className={styles.cardNote}>
              The Merge, Field By Field: A Club Row Overrides A Union Row, Which Overrides The
              Global Row, And Anything Nobody Set Falls Through To The Built-In Default, Which Is
              Today Behaviour. Enter A Club ID To See That Club's Answer.
            </p>
            <div className={styles.filterRow}>
              <label className={styles.fieldLabel} htmlFor="policy-club">Club ID</label>
              <input
                id="policy-club"
                className={styles.input}
                style={{ width: 'auto', minWidth: 280 }}
                value={policyClubId}
                onChange={(e) => setPolicyClubId(e.target.value.trim())}
                placeholder="Leave Blank For The Global Answer"
              />
              <button type="button" className={styles.btn} onClick={loadPolicy} disabled={policyLoading}>
                {policyLoading ? 'Reading' : 'Read The Effective Policy'}
              </button>
            </div>

            {policyBody?.effective ? (
              <DataTable
                columns={[
                  { key: 'field', header: 'Field', render: (row) => row.label },
                  { key: 'value', header: 'Effective Value', render: (row) => row.value },
                  {
                    key: 'source',
                    header: 'Set By',
                    render: (row) => <StatusPill tone={row.source === 'default' ? 'neutral' : 'info'} label={sourceLabel(row.source)} />,
                  },
                ]}
                rows={FLEET_POLICY_FIELDS.filter((f) => f !== 'notes').map((field) => ({
                  id: field,
                  label: fleetPolicyLabel(field),
                  value: policyValue(field, policyBody.effective[field]),
                  source: policyBody.effective.source ? policyBody.effective.source[field] : null,
                }))}
                caption="The Effective Fleet Policy"
                empty="Nothing Was Returned."
              />
            ) : (
              <p className={styles.stateNote}>
                {policyLoading ? 'Reading The Effective Policy' : 'The Effective Policy Has Not Been Read Yet.'}
              </p>
            )}

            {policyBody?.effective?.defaults_used === true && (
              <div className={styles.infoNote}>
                No Policy Row Exists At All, So Every Value Above Is The Built-In Default, Which Is
                Exactly Today Behaviour. An Empty Policy Table And Today Behaviour Are The Same Thing.
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Policy Rows</h3>
            <DataTable
              columns={policyColumns}
              rows={policyRows}
              caption="Every Fleet Policy Row"
              loading={policyLoading && !policyLoaded}
              loadingLabel="Loading The Policy"
              empty="No Policy Row Exists. The Fleet Is Running On The Built-In Defaults."
              getRowKey={(row, i) => `${row.scope}:${row.scope_id || 'global'}:${i}`}
            />
            {policyMeta.truncated && policyMeta.total !== null && (
              <div className={styles.warnNote}>
                {showingLabel(policyMeta, 'Policy Rows')}. This Is A Page, Not Every Row. Use
                Previous And Next Below To Reach The Rest.
              </div>
            )}

            <Pager
              offset={policyOffset}
              limit={POLICY_PAGE_SIZE}
              count={policyRows.length}
              total={policyMeta.total}
              hasMore={policyMeta.hasMore}
              loading={policyLoading}
              noun="Policy Rows"
              onPrevious={() => goPolicyPage(policyOffset - POLICY_PAGE_SIZE)}
              onNext={() => goPolicyPage(policyOffset + POLICY_PAGE_SIZE)}
            />
            {!mayWrite && (
              <p className={styles.cardNote}>
                Changing A Policy Row Needs {FLEET_WRITE}, Which This Account Does Not Hold.
              </p>
            )}
          </div>
        </>
      )}

      {/* ── ISOLATION ─────────────────────────────────────────────────────── */}
      {section === 'isolation' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Isolation</h3>

          {/* The TONE decides, not the kind: a clean report whose fleet was
              identified from the register rather than from the profiles flag is
              still clean, and is still not a green light (review L-12). */}
          <div
            className={
              isolationVerdict.tone === 'good'
                ? styles.goodNote
                : isolationVerdict.tone === 'danger'
                  ? styles.errorNote
                  : styles.warnNote
            }
            role={isolationVerdict.kind === 'findings' ? 'alert' : 'status'}
          >
            <strong>{isolationVerdict.headline}.</strong> {isolationVerdict.detail}
          </div>

          {isolation.error && (
            <div className={styles.errorNote} role="alert">
              The Isolation Report Could Not Be Read: {isolation.error}
            </div>
          )}

          <DataTable
            columns={isolationColumns}
            rows={isolation.rows}
            caption="Horses Holding Seats Across More Than One Scope"
            loading={isolation.loading && !isolation.loaded}
            loadingLabel="Running The Isolation Report"
            empty={isolationVerdict.kind === 'incomplete'
              ? 'Nothing Was Returned, And A Source Was Missing, So This Is Not A Clean Result.'
              : 'No Horse Is In Two Clubs.'}
            getRowKey={(row, i) => row.horse_id || i}
          />

          <Pager
            offset={isolation.offset}
            limit={isolation.limit}
            count={isolation.rows.length}
            total={isolation.total}
            hasMore={isolation.hasMore}
            loading={isolation.loading}
            noun="Findings"
            onPrevious={isolation.previous}
            onNext={isolation.next}
          />
        </div>
      )}

      {/* The section is missing from the nav rather than silently absent: an
          operator who expects a P And L and cannot find one is owed the reason,
          and the reason is a permission somebody can grant. */}
      {!mayReadMoney && section === 'health' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>P And L Is Not Shown</h3>
          <p className={styles.cardNote}>
            Fleet Chips And Rake Are Money Figures, So Reading Them Needs {MONEY_READ} As Well As
            Fleet Read, And This Account Does Not Hold It. Nothing Else On This Tab Is Narrowed.
          </p>
        </div>
      )}

      {/* ── P AND L ───────────────────────────────────────────────────────── */}
      {section === 'pnl' && mayReadMoney && (
        <>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Fleet P And L</h3>
            <p className={styles.cardNote}>
              Read Only. Every Figure Is A Sum Of Rows The Platform Already Keeps. Nothing Here
              Recomputes Money And Nothing Here Moves A Chip. Rake Is The Platform's Revenue And
              Chips Are The Fleet's Swing, So Rake Has Its Own Column And Is Never Added To The Net.
            </p>

            <div className={styles.filterRow}>
              <label className={styles.fieldLabel} htmlFor="pnl-from">From</label>
              <input
                id="pnl-from" type="date" className={styles.input} style={{ width: 'auto' }}
                value={pnlFrom} onChange={(e) => { setPnlFrom(e.target.value); setPnlLoaded(false); }}
              />
              <label className={styles.fieldLabel} htmlFor="pnl-to">To</label>
              <input
                id="pnl-to" type="date" className={styles.input} style={{ width: 'auto' }}
                value={pnlTo} onChange={(e) => { setPnlTo(e.target.value); setPnlLoaded(false); }}
              />
              <label className={styles.fieldLabel} htmlFor="pnl-club">Club ID</label>
              <input
                id="pnl-club" className={styles.input} style={{ width: 'auto', minWidth: 260 }}
                value={pnlClubId} onChange={(e) => { setPnlClubId(e.target.value.trim()); setPnlLoaded(false); }}
                placeholder="All Clubs"
              />
              <button type="button" className={styles.btn} onClick={loadPnl} disabled={pnlLoading}>
                {pnlLoading ? 'Reading' : 'Run'}
              </button>
            </div>

            {!pnlFrom && !pnlTo && <p className={styles.cardNote}>{PNL_DEFAULT_NOTE}</p>}

            {pnlError && (
              <div className={styles.errorNote} role="alert">
                The Fleet P And L Could Not Be Read: {pnlError}
              </div>
            )}

            {/* THE SOURCES NOTE. A zero from an absent source and a zero that
                was measured are different answers, and only one of them means
                the fleet broke even. */}
            <div className={pnl.measured ? styles.infoNote : styles.warnNote} role="status">
              {pnl.note}
            </div>

            <div className={styles.kpiGrid}>
              <KpiTile
                label="Fleet Net Chips"
                value={num(pnl.totals.net)}
                tone={pnl.totals.net !== null && Number(pnl.totals.net) < 0 ? 'danger' : 'accent'}
                hint={pnl.measured ? 'Won Minus Lost, From The Fleet Daily Rows.' : 'Not Measured. No Chip Source Could Be Read.'}
              />
              <KpiTile label="Hands" value={num(pnl.totals.hands)} />
              <KpiTile
                label="Rake"
                value={num(pnl.totals.rake)}
                hint={pnl.rakeMeasured ? 'Platform Revenue. Reported Beside The Chips, Never Added To Them.' : 'Not Measured. No Rake Source Could Be Read.'}
              />
            </div>

            {pnl.notes.length > 0 && (
              <div className={styles.warnNote}>{pnl.notes.join('; ')}</div>
            )}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>By Club</h3>
            <DataTable
              columns={[
                { key: 'club_id', header: 'Club', render: (row) => <span className={styles.mono}>{row.club_id || 'Not Recorded'}</span> },
                { key: 'net', header: 'Net Chips', align: 'right', render: (row) => num(row.net) },
                { key: 'hands', header: 'Hands', align: 'right', render: (row) => num(row.hands) },
              ]}
              rows={pnl.byClub}
              caption="Fleet Chips By Club"
              loading={pnlLoading && !pnlLoaded}
              loadingLabel="Reading"
              empty="No Club Rows In This Range."
              getRowKey={(row, i) => row.club_id || i}
            />
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>By Stake</h3>
            <DataTable
              columns={[
                { key: 'stake_band', header: 'Stake Band', render: (row) => stakeBandLabel(row.stake_band) },
                { key: 'net', header: 'Net Chips', align: 'right', render: (row) => num(row.net) },
                { key: 'hands', header: 'Hands', align: 'right', render: (row) => num(row.hands) },
              ]}
              rows={pnl.byStake}
              caption="Fleet Chips By Stake Band"
              loading={pnlLoading && !pnlLoaded}
              loadingLabel="Reading"
              empty="No Stake Rows In This Range."
              getRowKey={(row, i) => row.stake_band || i}
            />
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>By Day</h3>
            <DataTable
              columns={[
                { key: 'day', header: 'Day', render: (row) => when(row.day) },
                { key: 'net', header: 'Net Chips', align: 'right', render: (row) => num(row.net) },
                { key: 'hands', header: 'Hands', align: 'right', render: (row) => num(row.hands) },
              ]}
              rows={pnl.byDay}
              caption="Fleet Chips By Day"
              loading={pnlLoading && !pnlLoaded}
              loadingLabel="Reading"
              empty="No Daily Rows In This Range."
              getRowKey={(row, i) => row.day || i}
            />
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Where These Numbers Came From</h3>
            <DataTable
              columns={[
                { key: 'table', header: 'Table', render: (row) => <code className={styles.mono}>{row.table}</code> },
                { key: 'role', header: 'Supplies', render: (row) => row.role },
                {
                  key: 'used',
                  header: 'Used',
                  render: (row) => (row.used
                    ? <StatusPill tone="good" label="Used" />
                    : row.present
                      ? <StatusPill tone="neutral" label="Present, Not Used" />
                      : <StatusPill tone="warn" label="Absent" />),
                },
                { key: 'columns', header: 'Columns', render: (row) => (row.columns.length ? row.columns.join(', ') : '-') },
              ]}
              rows={pnl.sources}
              caption="The Tables And Columns This Report Read"
              empty="The Report Named No Sources."
              getRowKey={(row) => row.table}
            />
          </div>
        </>
      )}

      {/* ── REGISTER ──────────────────────────────────────────────────────── */}
      {section === 'register' && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>GLI-19 Disclosure Register</h3>
          <p className={styles.cardNote}>
            {registerBody?.disclosure
              || 'Every Account Listed Here Is A Simulated Player Operated By The Platform And Disclosed Under GLI-19.'}
          </p>
          <p className={styles.cardNote}>
            A Row Is Never Deleted. An Account That Stops Existing Is Stamped Retired, So The
            Question "Which Simulated Accounts Were Live In March" Still Has An Answer.
          </p>

          <div className={styles.filterRow}>
            <label className={styles.fieldLabel} htmlFor="register-status">Show</label>
            <select
              id="register-status"
              className={styles.select}
              style={{ width: 'auto' }}
              value={register.filters.status}
              onChange={(e) => register.setFilter('status', e.target.value)}
            >
              {REGISTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status === 'active' ? 'Live Accounts' : status === 'retired' ? 'Retired Accounts' : 'Every Row'}
                </option>
              ))}
            </select>
            {mayWrite && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGo}`}
                onClick={() => setSyncConfirm(true)}
                disabled={busy}
              >
                Sync Register
              </button>
            )}
          </div>

          {!mayWrite && (
            <p className={styles.cardNote}>
              Syncing The Register Needs {FLEET_WRITE}, Which This Account Does Not Hold.
            </p>
          )}

          {syncResult && (
            <div className={styles.infoNote} role="status">
              Last Sync: {num(syncResult.inserted)} Added, {num(syncResult.retired)} Retired,{' '}
              {num(syncResult.unretired)} Restored, {num(syncResult.unflagged)} Live Rows Whose
              Profile Is No Longer Flagged As A Horse. The Register Now Holds {num(syncResult.total)}{' '}
              Rows, {num(syncResult.active)} Of Them Live.
              {syncResult.audited === false && ' The Database Could Not File Its Own Audit Row For This Sync.'}
            </div>
          )}

          {register.error && (
            <div className={styles.errorNote} role="alert">
              The Register Could Not Be Read: {register.error}
            </div>
          )}

          <DataTable
            columns={registerColumns}
            rows={register.rows}
            caption="Every Disclosed Simulated Account"
            loading={register.loading && !register.loaded}
            loadingLabel="Loading The Register"
            empty="No Register Rows. Run A Sync To Build The Disclosure List From The Profiles Flagged As Horses."
            getRowKey={(row, i) => row.horse_id || i}
          />

          {register.total !== null && register.total > register.rows.length && (
            <div className={styles.warnNote}>
              {showingLabel(
                { total: register.total, truncated: true, shown: register.rows.length },
                'Register Rows',
              )}
            </div>
          )}

          <Pager
            offset={register.offset}
            limit={register.limit}
            count={register.rows.length}
            total={register.total}
            hasMore={register.hasMore}
            loading={register.loading}
            noun="Accounts"
            onPrevious={register.previous}
            onNext={register.next}
          />
        </div>
      )}

      {/* ── THE HORSE 360 ─────────────────────────────────────────────────── */}
      {horseId && (
        <Modal
          title="Horse Detail"
          wide
          onClose={() => { setHorseId(null); setHorse(null); setHorseError(null); }}
        >
          {horseError && <div className={styles.errorNote} role="alert">{horseError}</div>}
          {horseLoading && <p className={styles.stateNote}>Loading This Horse</p>}

          {horse && (
            <>
              <h3 className={styles.cardTitle}>
                {horse.profile?.display_name || horse.profile?.username || 'Profile No Longer Exists'}
                {' '}
                {horse.profile?.is_horse === true
                  ? <StatusPill tone="info" label="Horse" />
                  : horse.profile
                    ? <StatusPill tone="warn" label="Not Flagged As Horse" />
                    : null}
              </h3>

              <div className={styles.factGrid}>
                <div>
                  <span className={styles.factLabel}>Horse ID</span>
                  <span className={`${styles.factValue} ${styles.mono}`}>{horse.horseId}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>Player Number</span>
                  <span className={styles.factValue}>{num(horse.profile?.player_number)}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>Account Created</span>
                  <span className={styles.factValue}>{when(horse.profile?.created_at)}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>State</span>
                  <span className={styles.factValue}>
                    {horse.state ? fleetStateLabel(horse.state.state) : 'No Published State'}
                  </span>
                </div>
                <div>
                  <span className={styles.factLabel}>Club</span>
                  <span className={styles.factValue}>{horse.clubLabel || horse.state?.club_id || '-'}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>Session Started</span>
                  <span className={styles.factValue}>{when(horse.state?.session_started_at, true)}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>Hands This Session</span>
                  <span className={styles.factValue}>{num(horse.state?.hands_this_session)}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>Bankroll</span>
                  <span className={styles.factValue}>{num(horse.state?.bankroll)}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>Stack</span>
                  <span className={styles.factValue}>{num(horse.state?.stack)}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>Lifetime Hands</span>
                  <span className={styles.factValue}>{num(horse.playRecord?.handsPlayed)}</span>
                </div>
                <div>
                  <span className={styles.factLabel}>Lifetime Profit</span>
                  <span className={styles.factValue}>
                    {horseMoneyHidden || horse.playRecord?.totalProfitVisible === false
                      ? MONEY_HIDDEN_TEXT
                      : num(horse.playRecord?.totalProfit)}
                  </span>
                </div>
                <div>
                  <span className={styles.factLabel}>Diamonds</span>
                  <span className={styles.factValue}>
                    {horseMoneyHidden ? MONEY_HIDDEN_TEXT : num(horse.profile?.diamonds)}
                  </span>
                </div>
              </div>

              {horseMoneyHidden && (
                <p className={styles.cardNote}>
                  The Two Money Figures Above Are Withheld, Not Zero. Reading Them Needs{' '}
                  {horse.moneyPermission || MONEY_READ} As Well As Fleet Read. Everything Else On
                  This Screen Is The Whole Answer.
                </p>
              )}

              <p className={styles.cardNote}>
                The Lifetime Figures Come From Player Stats, Which Is A Running Total And Not A
                Session Reading. Per-Hand History Is Not Shown Here: Horse-Only Hands Are Pruned
                By An Existing Retention Policy, So A Recent Hands List Would Report Anything Older
                Than A Week As Though It Never Happened.
              </p>

              <div className={styles.card}>
                <h4 className={styles.cardTitle}>Disclosure Record</h4>
                {horse.register ? (
                  <div className={styles.factGrid}>
                    <div>
                      <span className={styles.factLabel}>Owner Entity</span>
                      <span className={styles.factValue}>{horse.register.owner_entity || '-'}</span>
                    </div>
                    <div>
                      <span className={styles.factLabel}>Funding Source</span>
                      <span className={styles.factValue}>{horse.register.funding_source || '-'}</span>
                    </div>
                    <div>
                      <span className={styles.factLabel}>Registered</span>
                      <span className={styles.factValue}>{when(horse.register.registered_at)}</span>
                    </div>
                    <div>
                      <span className={styles.factLabel}>Retired</span>
                      <span className={styles.factValue}>{horse.register.retired_at ? when(horse.register.retired_at) : 'Live'}</span>
                    </div>
                  </div>
                ) : (
                  <p className={styles.stateNote}>
                    This Account Has No Register Row. Run A Sync From The Register Section To Add
                    Every Flagged Horse That Is Missing One.
                  </p>
                )}
              </div>

              <div className={styles.card}>
                <h4 className={styles.cardTitle}>Club Memberships</h4>
                <DataTable
                  columns={[
                    { key: 'club', header: 'Club', render: (row) => row.club_label || row.club_id || '-' },
                    { key: 'role', header: 'Role', render: (row) => row.role || '-' },
                    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
                    { key: 'chip_balance', header: 'Chips', align: 'right', render: (row) => num(row.chip_balance) },
                    { key: 'joined_at', header: 'Joined', render: (row) => when(row.joined_at) },
                  ]}
                  rows={rowsOf(horse.memberships)}
                  caption="Clubs This Horse Belongs To"
                  empty="This Account Belongs To No Club."
                  getRowKey={(row, i) => row.club_id || i}
                />
              </div>

              <div className={styles.card}>
                <h4 className={styles.cardTitle}>Seats Held Right Now</h4>
                <DataTable
                  columns={[
                    { key: 'table_id', header: 'Table', render: (row) => <span className={styles.mono}>{row.table_id}</span> },
                    { key: 'seat_index', header: 'Seat', align: 'right', render: (row) => num(row.seat_index) },
                    { key: 'joined_at', header: 'Sat Down', render: (row) => when(row.joined_at, true) },
                  ]}
                  rows={Array.isArray(horse.openSeats) ? horse.openSeats : []}
                  caption="Open Seats"
                  empty="This Horse Is Holding No Seat."
                  getRowKey={(row, i) => `${row.table_id}-${row.seat_index}-${i}`}
                />
              </div>

              <div className={styles.card}>
                <h4 className={styles.cardTitle}>Audit Trail</h4>
                <div className={styles.filterRow}>
                  <label className={styles.fieldLabel} htmlFor="trail-type">Filed Under</label>
                  <select
                    id="trail-type"
                    className={styles.select}
                    style={{ width: 'auto' }}
                    value={trailType}
                    onChange={(e) => setTrailType(e.target.value)}
                  >
                    <option value="profile">Profile</option>
                    <option value="user">User</option>
                    <option value="content_author">Content Author</option>
                    <option value="horse">Horse</option>
                  </select>
                </div>
                <p className={styles.cardNote}>
                  This Platform Files Audit Rows About One Account Under Several Target Types. The
                  Trail Below Is The One Type Selected Above, Not Every Row About This Account.
                </p>
                <DataTable
                  columns={[
                    { key: 'created_at', header: 'When', render: (row) => when(row.created_at, true) },
                    { key: 'action', header: 'Action', render: (row) => row.action || '-' },
                    { key: 'admin', header: 'By', render: (row) => <span className={styles.mono}>{row.admin_user_id || 'System / Cron'}</span> },
                  ]}
                  rows={rowsOf(horse.trail)}
                  caption="What This Console Has Recorded About This Account"
                  empty="No Audit Rows Are Filed Under That Target Type."
                  getRowKey={(row, i) => row.id || i}
                />
              </div>

              {Array.isArray(horse.failedSources) && horse.failedSources.length > 0 && (
                <div className={styles.warnNote}>
                  This Reading Is Incomplete. These Sources Could Not Be Read:{' '}
                  {horse.failedSources.join('; ')}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ── THE POLICY EDITOR ─────────────────────────────────────────────── */}
      {editRow && (
        <Modal
          title={`Edit The Fleet Policy For ${editRow.label}`}
          wide
          onClose={busy ? undefined : () => setEditRow(null)}
          hideClose={busy}
          sticky={busy}
          blockEscape={busy}
        >
          <p className={styles.cardNote}>{KILL_SWITCH_NOTE}</p>
          <p className={styles.cardNote}>
            An Empty Box Or An Inherited Answer Means The Field Is Cleared And The Wider Scope
            Answers For It. Only The Fields You Change Are Sent.
          </p>

          <div className={styles.policyGrid}>
            {/* THE TWO BOOLEANS ARE TRI-STATE, NOT CHECKBOXES (review H-2).
                Every steering column is nullable and null means inherit, so a
                club row written through this console carries enabled = null,
                which the merge resolves to TRUE. An unticked box said the fleet
                was off for a club whose fleet was on, and no control on the form
                could ever hand the field back to the wider scope again. The
                Inherited option states what it resolves to and which row
                supplied that, from the merged answer the route already sends. */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-enabled">Fleet Enabled</label>
              <select
                id="fleet-enabled"
                className={styles.select}
                value={draft.enabled === null || draft.enabled === undefined ? '' : String(draft.enabled)}
                onChange={(e) => setDraft((d) => ({
                  ...d, enabled: e.target.value === '' ? null : e.target.value === 'true',
                }))}
              >
                <option value="">{inheritedOptionLabel('enabled', editorInherits)}</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
              <span className={styles.fieldHint}>
                No Means Seat Nobody New In This Scope. It Removes Nobody. Inherited Clears This
                Row's Opinion And Lets The Wider Scope Answer.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-pause">Pause New Seatings</label>
              <select
                id="fleet-pause"
                className={styles.select}
                value={draft.pause_new_seatings === null || draft.pause_new_seatings === undefined
                  ? ''
                  : String(draft.pause_new_seatings)}
                onChange={(e) => setDraft((d) => ({
                  ...d, pause_new_seatings: e.target.value === '' ? null : e.target.value === 'true',
                }))}
              >
                <option value="">{inheritedOptionLabel('pause_new_seatings', editorInherits)}</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
              <span className={styles.fieldHint}>
                The Kill Switch. Yes Stops New Seatings; Seated Horses Play On.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-max-horses">Maximum Horses</label>
              <input
                id="fleet-max-horses" className={styles.input} type="number" min="0"
                value={draft.max_horses === null || draft.max_horses === undefined ? '' : draft.max_horses}
                onChange={(e) => setDraft((d) => ({
                  ...d, max_horses: e.target.value === '' ? null : Number(e.target.value),
                }))}
              />
              <span className={styles.fieldHint}>Blank Means No Cap, Which Is Today Behaviour.</span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-max-per-table">Maximum Per Table</label>
              <input
                id="fleet-max-per-table" className={styles.input} type="number" min="0"
                value={draft.max_per_table === null || draft.max_per_table === undefined ? '' : draft.max_per_table}
                onChange={(e) => setDraft((d) => ({
                  ...d, max_per_table: e.target.value === '' ? null : Number(e.target.value),
                }))}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-bias">Occupancy Bias</label>
              <input
                id="fleet-bias" className={styles.input} type="number" min="0.1" max="10" step="0.1"
                value={draft.occupancy_bias === null || draft.occupancy_bias === undefined ? '' : draft.occupancy_bias}
                onChange={(e) => setDraft((d) => ({
                  ...d, occupancy_bias: e.target.value === '' ? null : Number(e.target.value),
                }))}
              />
              <span className={styles.fieldHint}>
                Scales The Engine's Seat Target. The Engine Clamps It So A Bias Can Never Take A
                Table Below One Seat. Greater Than 0 And At Most 10.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-min-humans">Minimum Humans To Seat</label>
              <input
                id="fleet-min-humans" className={styles.input} type="number" min="0" max="10"
                value={draft.min_humans_to_seat === null || draft.min_humans_to_seat === undefined ? '' : draft.min_humans_to_seat}
                onChange={(e) => setDraft((d) => ({
                  ...d, min_humans_to_seat: e.target.value === '' ? null : Number(e.target.value),
                }))}
              />
              <span className={styles.fieldHint}>Zero Keeps Today Behaviour. No Table Seats More Than Ten.</span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-bands">Stake Bands</label>
              <input
                id="fleet-bands" className={styles.input}
                value={Array.isArray(draft.stake_bands) ? draft.stake_bands.join(', ') : (draft.stake_bands || '')}
                onChange={(e) => setDraft((d) => ({ ...d, stake_bands: e.target.value }))}
              />
              <span className={styles.fieldHint}>Comma Separated. Blank Means No Restriction.</span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-variants">Variants</label>
              <input
                id="fleet-variants" className={styles.input}
                value={Array.isArray(draft.variants) ? draft.variants.join(', ') : (draft.variants || '')}
                onChange={(e) => setDraft((d) => ({ ...d, variants: e.target.value }))}
              />
            </div>

            {/* A FIELD THE ROUTE ACCEPTS AND THIS FORM DOES NOT OFFER, SAID
                OUT LOUD (review L-3). An absent control is otherwise read as an
                absent field, and this one narrows the hours the fleet may seat
                in. */}
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Schedule</span>
              <span className={styles.fieldHint}>{SCHEDULE_NOT_EDITABLE_NOTE}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-notes">Note On This Row</label>
              <textarea
                id="fleet-notes" className={styles.textarea}
                value={draft.notes === null || draft.notes === undefined ? '' : draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="fleet-reason">
                Reason (At Least {MIN_REASON_LENGTH} Characters)
              </label>
              <textarea
                id="fleet-reason" className={styles.textarea}
                value={policyReason}
                onChange={(e) => setPolicyReason(e.target.value)}
              />
              <span className={styles.fieldHint}>
                This Is The Only Part Of The Record A Database Cannot Reconstruct Later.
              </span>
            </div>
          </div>

          <div className={preview.willRequest ? styles.warnNote : styles.infoNote} role="status">
            <strong>{preview.headline}.</strong> {preview.detail}
            {preview.reasonTexts.length > 0 && (
              <ul className={styles.notBuiltList}>
                {preview.reasonTexts.map((textLine) => <li key={textLine}>{textLine}</li>)}
              </ul>
            )}
          </div>

          {preview.changes.length > 0 && (
            <DataTable
              columns={[
                { key: 'label', header: 'Field', render: (row) => row.label },
                { key: 'from', header: 'From', render: (row) => policyValue(row.field, row.from) },
                { key: 'to', header: 'To', render: (row) => policyValue(row.field, row.to) },
              ]}
              rows={preview.changes.map((c) => ({ ...c, id: c.field }))}
              caption="What Will Change"
              empty="Nothing."
              getRowKey={(row) => row.field}
            />
          )}

          <div className={styles.rowActions} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGo}`}
              onClick={() => setPolicyConfirm(true)}
              disabled={busy || preview.empty || !reasonIsValid(policyReason) || !mayWrite}
            >
              Save Policy
            </button>
            <button type="button" className={styles.btn} onClick={() => setEditRow(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── THE TYPED CONFIRMATION ────────────────────────────────────────── */}
      {policyConfirm && editRow && (
        <ConfirmDialog
          title="Confirm This Fleet Policy Change"
          confirmLabel={preview.willRequest ? 'Send For Approval' : 'Save Policy'}
          tone={preview.material ? 'danger' : 'go'}
          busy={busy}
          sticky={busy}
          blockEscape={busy}
          requireTyped="FLEET"
          onConfirm={submitPolicy}
          onCancel={() => setPolicyConfirm(false)}
          note="Every Change To This Policy Is Recorded In The Admin Audit Log With Your Account Against It."
        >
          <p style={{ marginTop: 0 }}>
            <strong>{preview.headline}.</strong> {preview.detail}
          </p>
          <p>{KILL_SWITCH_NOTE}</p>
          {preview.reasonTexts.length > 0 && (
            <ul className={styles.notBuiltList}>
              {preview.reasonTexts.map((textLine) => <li key={textLine}>{textLine}</li>)}
            </ul>
          )}
        </ConfirmDialog>
      )}

      {/* ── THE REGISTER SYNC CONFIRMATION ────────────────────────────────── */}
      {syncConfirm && (
        <ConfirmDialog
          title="Sync The Disclosure Register"
          confirmLabel="Sync Register"
          tone="go"
          busy={busy}
          sticky={busy}
          blockEscape={busy}
          onConfirm={submitSync}
          onCancel={() => setSyncConfirm(false)}
          note="This Is Recorded In The Admin Audit Log With Your Account Against It."
        >
          <p style={{ marginTop: 0 }}>
            This Adds A Disclosure Row For Every Account Flagged As A Horse That Does Not Have One,
            Stamps Retired On Rows Whose Account No Longer Exists, And Restores Any Account That Is
            Flagged Again.
          </p>
          <p>
            It Never Deletes A Row And It Moves No Money. An Account That Merely Lost Its Horse Flag
            Is Counted And Reported, Not Retired, Because That Flag Is Data An Operator Can Change
            By Hand And This Register Is A Legal Record.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
