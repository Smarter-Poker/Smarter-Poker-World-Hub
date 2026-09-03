/**
 * APPROVALS - the maker-checker queue.
 *
 * Two lists and one decision.
 *
 *   THE PENDING QUEUE is the working surface: kind, amount and asset, target,
 *   who raised it, how long it has been waiting and how long is left. Approve
 *   and Reject are behind a dialog with a note, because a decision with no
 *   sentence attached is a decision nobody can audit afterwards.
 *
 *   THE HISTORY is everything else, filtered by kind, status and date, paged
 *   by the route and exportable in full - the whole result set, not the page
 *   on screen (exportAllCsv).
 *
 * WHAT IS DELIBERATELY DISABLED. A request the current operator raised shows
 * "Waiting For Another Operator" and its buttons are dead, because four-eyes
 * that one pair of eyes can close is not a control. The exception is the
 * alone-rule: with one eligible approver and `allow_self_approve_when_alone`
 * still true, the operator who raised it may decide it and the audit row says
 * so (PHASE2-CONTRACTS section 0). The route answers that question per row -
 * it is the only party that can count eligible approvers - and
 * approvalModel.js is where the whole state machine lives, unit tested,
 * because "may this person press this button" is exactly the decision that
 * must not be re-derived differently in three places.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import DataTable from './DataTable';
import Pager from './Pager';
import StatusPill from './StatusPill';
import usePagedList from './usePagedList';
import exportAllCsv from './exportAllCsv';
import styles from './shared.module.css';
import { num, when } from '../../lib/horsesAdminTokens';
import {
  APPROVAL_KINDS, APPROVAL_STATUSES, approvalRowState, blockedReasonLabel, formatAge,
  formatExpiresIn, isExecutableKind, isStaleRowRefusal, kindLabel, permissionForKind,
  statusLabel, toneForApprovalStatus,
} from './approvalModel';
import { hasPermission } from './operatorPermissions';
import {
  MIN_REASON_LENGTH, approvalsUrl, decideApprovalBody, executeApprovalBody, policyIsKnown,
  reasonIsValid, rowsOf, OPERATOR_ADMIN,
} from './operatorAdmin';

const HISTORY_PAGE_SIZE = 50;
const PENDING_LIMIT = 100;
const EXPORT_PAGE_SIZE = 500;

/** The clock the ages are measured against, refreshed so a queue left open
 *  does not quietly report a request as four minutes old for an hour. */
const CLOCK_INTERVAL_MS = 30000;

/**
 * Who raised it.
 *
 * The route resolves `requester_label` from profiles (display name, then
 * username) and falls back to the uuid, because ca_operator_approvals stores
 * an id and nothing else. The same ladder is repeated here: a raw uuid is not
 * friendly, but it IS the answer, and it is what lets an operator tell their
 * own request from somebody else's. "Unknown" over a row that names the
 * requester perfectly well would be the console withholding what it has.
 */
function requesterLabel(row) {
  if (!row) return 'Unknown';
  return row.requester_label || row.requested_by_label || row.requested_by || 'Unknown';
}

function targetLabel(row) {
  if (!row) return '-';
  const label = row.target_label || row.target_id;
  if (!label) return '-';
  return row.target_type ? `${row.target_type}: ${label}` : String(label);
}

/**
 * IS THIS THE NEWS THAT AN APPROVAL WAS RECORDED BUT NOT CARRIED OUT?
 *
 * `decide_approval` with `approve` runs the money RPC in the same request.
 * When that RPC cannot be reached the route marks the row `failed` and
 * answers 503 `execution_unavailable`; when the RPC refuses, 409
 * `execution_refused` (or the RPC's own reason). Either way the decision IS
 * recorded, the row is no longer pending, and the modal's Approve button is
 * now over a row the route will refuse with `already_decided`. So these are
 * handled exactly like a stale-row refusal: close the modal, say what the
 * route said, and re-read both lists so the row appears in History with its
 * Run Again button.
 */
function isExecutionFailure(err) {
  if (!err) return false;
  const code = String(err.code || '').toLowerCase();
  if (code === 'execution_unavailable' || code === 'execution_refused') return true;
  return Number(err.status) === 503;
}

/**
 * Which History rows may be run again.
 *
 * A `failed` row of any kind the route can execute, and an `approved` row of
 * an executable kind that never got an `executed_at` - the case where the
 * decision landed and the request died before the execution was recorded.
 * The route refuses anything else (409), and it refuses an expired row too,
 * so this is a hint about which button to draw and never the authority.
 */
function canRunAgain(row, permissions) {
  if (!row || !isExecutableKind(row.kind)) return false;
  if (!hasPermission(permissions, permissionForKind(row.kind))) return false;
  const status = String(row.status || '').toLowerCase();
  if (status === 'failed') return true;
  return status === 'approved' && !row.executed_at;
}

/**
 * The sentence the Approve dialog owes the operator, by kind.
 *
 * It used to say "Approving Carries The Operation Out" for every kind, and a
 * cashout is NOT carried out here: the route records the decision and the
 * chips move from the Cashout screen. An operator who read "carried out" did
 * not go back to that screen, and the player was not paid.
 */
function approveSentence(kind) {
  if (isExecutableKind(kind)) {
    return 'Approving Carries The Operation Out. It Is Executed Once And Only Once, Against The Operation ID This Request Already Holds.';
  }
  if (String(kind || '').toLowerCase() === 'cashout') {
    return 'Approving Records Your Decision. The Cashout Itself Is Still Completed From The Cashout Screen, So No Chips Move Here.';
  }
  return 'Approving Records Your Decision. Nothing Moves Until Its Own Screen Runs It.';
}

const WITHDRAW_SENTENCE = 'Withdrawing Cancels Your Own Request. Say Why In At Least Ten Characters.';
const REJECT_SENTENCE = 'Rejecting Moves Nothing. The Request Is Closed And The Operator Who Raised It Has To Raise It Again.';

export default function ApprovalsPanel({
  authFetch,
  showNotification,
  permissions = null,
  operatorId = null,
  policy = null,
}) {
  const [pending, setPending] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [pendingError, setPendingError] = useState(null);

  // { row, decision, withdraw } - `withdraw` is a rejection of the operator's
  // OWN pending row (decision stays 'reject'; the route files it as a
  // withdrawal because the requester is the caller).
  const [decideFor, setDecideFor] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [runAgainFor, setRunAgainFor] = useState(null); // a History row
  const [running, setRunning] = useState(false);

  const [exporting, setExporting] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  /**
   * ONE SEQUENCE NUMBER, SO THE SLOWER ANSWER LOSES. Refresh, then decide,
   * then refresh again and the first answer could land last and put a decided
   * row back in the queue with live buttons on it. `usePagedList` has carried
   * this guard since Phase 1; this fetch did not. The same counter is bumped
   * on unmount, which is what stops the setState-after-unmount.
   */
  const pendingSeqRef = useRef(0);
  useEffect(() => () => { pendingSeqRef.current += 1; }, []);

  const loadPending = useCallback(async () => {
    pendingSeqRef.current += 1;
    const seq = pendingSeqRef.current;
    setPendingLoading(true);
    setPendingError(null);
    try {
      const body = await authFetch(approvalsUrl({
        status: 'pending', limit: PENDING_LIMIT, offset: 0,
      }));
      if (seq !== pendingSeqRef.current) return;
      setPending(rowsOf(body, 'approvals', 'pending'));
      setPendingTotal(typeof body.total === 'number' ? body.total : null);
      setPendingLoaded(true);
    } catch (err) {
      if (seq !== pendingSeqRef.current) return;
      setPendingError(err.message || 'The Queue Could Not Be Read.');
    } finally {
      if (seq === pendingSeqRef.current) setPendingLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { loadPending(); }, [loadPending]);

  const fetchHistoryPage = useCallback(async ({ limit, offset, filters, signal }) => {
    const body = await authFetch(approvalsUrl({
      status: filters.status || '',
      kind: filters.kind || '',
      from: filters.from || '',
      to: filters.to || '',
      limit,
      offset,
    }), { signal });
    return {
      rows: rowsOf(body, 'approvals'),
      total: typeof body.total === 'number' ? body.total : null,
      hasMore: typeof body.hasMore === 'boolean' ? body.hasMore : undefined,
    };
  }, [authFetch]);

  const history = usePagedList({
    fetchPage: fetchHistoryPage,
    limit: HISTORY_PAGE_SIZE,
    initialFilters: { status: '', kind: '', from: '', to: '' },
  });

  const submitDecision = useCallback(async () => {
    if (!decideFor) return;
    const body = decideApprovalBody({
      approvalId: decideFor.row.id,
      decision: decideFor.decision,
      note,
    });
    if (!body) {
      showNotification('That Decision Could Not Be Composed.', 'error');
      return;
    }
    if (decideFor.decision === 'reject' && !reasonIsValid(note)) {
      showNotification(
        decideFor.withdraw
          ? `A Withdrawal Needs A Note Of At Least ${MIN_REASON_LENGTH} Characters.`
          : `A Rejection Needs A Note Of At Least ${MIN_REASON_LENGTH} Characters.`,
        'error',
      );
      return;
    }
    setBusy(true);
    try {
      // THE BODY IS READ. The route answers `{ execution: { ok, message },
      // withdrawn, message }`, and the message is the only true account of
      // what happened: "carried out" for a mint, "still completed from the
      // Cashout screen" for a cashout, "the approval row could not be closed,
      // check the audit trail" for a mint whose trail did not close. A
      // constant toast said "carried out" for all of them.
      const answer = await authFetch(OPERATOR_ADMIN, { method: 'POST', body: JSON.stringify(body) });
      const execution = answer && answer.execution ? answer.execution : null;
      const fallback = decideFor.decision === 'approve'
        ? 'Approved. Nothing Else Was Reported.'
        : 'Rejected. Nothing Was Moved.';
      if (answer && answer.withdrawn === true) {
        showNotification('Request Withdrawn.', 'success');
      } else {
        showNotification(
          (answer && answer.message) || (execution && execution.message) || fallback,
          execution && execution.ok === false ? 'info' : 'success',
        );
      }
      setDecideFor(null);
      setNote('');
      await loadPending();
      history.refresh();
    } catch (err) {
      showNotification(err.message, 'error');
      // A ROW SOMEBODY ELSE ALREADY DECIDED. The queue is loaded once and
      // refreshed only after this operator's own decision, so a 409 used to
      // leave the stale row, the open modal and a live Approve button exactly
      // where they were - and the next press produced the same refusal. The
      // refusal IS the news that this page is out of date, so it reloads.
      //
      // AN APPROVAL RECORDED BUT NOT RUN is the same news: the row is
      // `failed` now, Approve would answer already_decided, and the way
      // forward is the Run Again button in History, which the reload shows.
      if (isStaleRowRefusal(err) || isExecutionFailure(err)) {
        setDecideFor(null);
        setNote('');
        await loadPending();
        history.refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [authFetch, decideFor, note, loadPending, history, showNotification]);

  /**
   * RUN AN APPROVED OR FAILED ROW AGAIN (POST execute_approval).
   *
   * The route re-reads the row, re-checks the permission, validates the
   * stored payload and calls the RPC under the row's own op_id, so however
   * many times this runs the money moves once. It answers 404 for an unknown
   * id, 409 `approval_expired` past the TTL and 409 with a reason for any
   * other refusal; every one of those changes the row, so both lists are
   * re-read whether the run succeeded or not.
   */
  const runAgain = useCallback(async () => {
    if (!runAgainFor) return;
    const body = executeApprovalBody(runAgainFor.id);
    if (!body) {
      showNotification('That Request Could Not Be Composed.', 'error');
      return;
    }
    setRunning(true);
    try {
      const answer = await authFetch(OPERATOR_ADMIN, { method: 'POST', body: JSON.stringify(body) });
      const execution = answer && answer.execution ? answer.execution : null;
      showNotification(
        (answer && answer.message) || (execution && execution.message) || 'Carried Out.',
        execution && execution.ok === false ? 'info' : 'success',
      );
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setRunning(false);
      setRunAgainFor(null);
      await loadPending();
      history.refresh();
    }
  }, [authFetch, runAgainFor, loadPending, history, showNotification]);

  const exportHistory = useCallback(async () => {
    setExporting({ fetched: 0, total: history.total });
    try {
      const result = await exportAllCsv({
        filenamePrefix: 'operator-approvals',
        limit: EXPORT_PAGE_SIZE,
        onProgress: (p) => setExporting(p),
        fetchPage: async (offset, limit) => {
          const body = await authFetch(approvalsUrl({
            status: history.filters.status || '',
            kind: history.filters.kind || '',
            from: history.filters.from || '',
            to: history.filters.to || '',
            limit,
            offset,
          }));
          return {
            rows: rowsOf(body, 'approvals'),
            total: typeof body.total === 'number' ? body.total : null,
          };
        },
        columns: [
          ['requested_at', 'Requested At'],
          ['kind', 'Kind'],
          ['status', 'Status'],
          ['amount', 'Amount'],
          ['asset', 'Asset'],
          ['target_type', 'Target Type'],
          ['target_id', 'Target ID'],
          ['requester_label', 'Requested By'],
          ['requested_by', 'Requested By ID'],
          ['decided_at', 'Decided At'],
          ['decided_by_label', 'Decided By'],
          ['decided_by', 'Decided By ID'],
          ['executed_at', 'Executed At'],
          ['expires_at', 'Expires At'],
          ['blocked_reason', 'Blocked Reason'],
          ['reason', 'Reason'],
          ['op_id', 'Operation ID'],
          ['request_id', 'Request ID'],
          // NO Payload AND NO Result COLUMN. `section=approvals` selects
          // APPROVAL_FIELDS, which contains neither, so both columns exported
          // blank on every row - and a blank Payload cell reads as "this
          // request carried none", which is a statement the export cannot
          // support. A column the route cannot fill is not a column.
        ],
      });
      showNotification(
        result.complete
          ? `Exported ${num(result.exported)} Approval Records`
          : `Exported ${num(result.exported)} Approval Records. The Export Stopped At Its Page Cap And Is Incomplete.`,
        result.complete ? 'success' : 'info',
      );
    } catch (err) {
      showNotification(`Export Failed: ${err.message}`, 'error');
    } finally {
      setExporting(null);
    }
  }, [authFetch, history.filters, history.total, showNotification]);

  const pendingColumns = useMemo(() => ([
    { key: 'kind', header: 'Kind', render: (row) => kindLabel(row.kind) },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (row.amount === null || row.amount === undefined
        ? '-'
        : `${num(row.amount)} ${row.asset || ''}`.trim()),
    },
    { key: 'target', header: 'Target', render: (row) => targetLabel(row) },
    {
      key: 'requester',
      header: 'Requested By',
      render: (row) => (
        <>
          <div className={styles.mono}>{requesterLabel(row)}</div>
          {row.reason ? <div className={styles.blockedNote}>{row.reason}</div> : null}
        </>
      ),
    },
    { key: 'age', header: 'Age', render: (row) => formatAge(row.requested_at, now) },
    {
      key: 'expires',
      header: 'Expires',
      render: (row) => formatExpiresIn(row.expires_at, now),
    },
    {
      key: 'decide',
      header: 'Decision',
      render: (row) => {
        const state = approvalRowState({ row, operatorId, permissions, policy, now });
        // THE REQUESTER MAY TAKE THEIR OWN REQUEST BACK. The route says so
        // per row (`can_withdraw`): four-eyes guards approvals, not
        // cancellations, and without this a mistaken request sat in the
        // queue until its TTL. It is a rejection with a note, filed as
        // operator.withdraw_approval.
        const withdraw = row.can_withdraw === true ? (
          <button
            type="button"
            className={styles.btn}
            onClick={() => { setDecideFor({ row, decision: 'reject', withdraw: true }); setNote(''); }}
          >
            Withdraw
          </button>
        ) : null;
        if (!state.canDecide) {
          return (
            <>
              <StatusPill tone="neutral" label={state.label} />
              {state.note ? <span className={styles.blockedNote}>{state.note}</span> : null}
              {withdraw ? <span className={styles.rowActions}>{withdraw}</span> : null}
            </>
          );
        }
        return (
          <>
            <span className={styles.rowActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGo}`}
                onClick={() => { setDecideFor({ row, decision: 'approve' }); setNote(''); }}
              >
                Approve
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={() => { setDecideFor({ row, decision: 'reject' }); setNote(''); }}
              >
                Reject
              </button>
              {withdraw}
            </span>
            {state.reason === 'alone'
              ? <span className={styles.blockedNote}>{state.note}</span>
              : null}
          </>
        );
      },
    },
  ]), [now, operatorId, permissions, policy]);

  /**
   * THE DATES ARE FILTERED BY THE ROUTE.
   *
   * `section=approvals` takes `from` and `to` and applies them to the whole
   * set, so the pager, the totals and the CSV all describe the same filtered
   * result. This pass over the returned page is a BELT, not the filter: it is
   * a no-op against a route that has done the work, and against one that has
   * not - an older deployment, a rolled-back route - it stops rows outside
   * the dates from being shown as if they matched. If it ever removes a row,
   * the note below says so, because a date box that silently narrows only the
   * page in front of you is the Phase 1 audit-tab bug.
   */
  const visibleHistory = useMemo(() => {
    // UTC, BECAUSE THE ROUTE IS UTC. isoDate parses 'YYYY-MM-DD' as UTC
    // midnight and the `to` bound is a literal T23:59:59.999Z, so parsing
    // these in the browser's local zone made the belt disagree with the route
    // by the offset: west of UTC it deleted rows the route had correctly
    // returned, east of UTC it clipped the last day.
    const from = history.filters.from ? Date.parse(`${history.filters.from}T00:00:00Z`) : NaN;
    const to = history.filters.to ? Date.parse(`${history.filters.to}T23:59:59.999Z`) : NaN;
    if (Number.isNaN(from) && Number.isNaN(to)) return history.rows;
    return history.rows.filter((row) => {
      const at = row.requested_at ? Date.parse(row.requested_at) : NaN;
      if (Number.isNaN(at)) return false;
      if (!Number.isNaN(from) && at < from) return false;
      if (!Number.isNaN(to) && at > to) return false;
      return true;
    });
  }, [history.rows, history.filters.from, history.filters.to]);

  const datesSet = !!(history.filters.from || history.filters.to);

  /** Is the WHOLE filtered set empty? `history.rows.length === 0` is only
   *  ever a fact about the page on screen, and gating the export on it
   *  disabled Export CSV on page two of a set with rows on page one. */
  const historyIsEmpty = !history.loaded
    || history.total === 0
    || (history.total === null && history.rows.length === 0 && history.offset === 0);

  const historyColumns = useMemo(() => ([
    { key: 'requested_at', header: 'Requested', render: (row) => when(row.requested_at, true) },
    { key: 'kind', header: 'Kind', render: (row) => kindLabel(row.kind) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusPill
          tone={toneForApprovalStatus(row.status)}
          label={statusLabel(row.status)}
        />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (row.amount === null || row.amount === undefined
        ? '-'
        : `${num(row.amount)} ${row.asset || ''}`.trim()),
    },
    { key: 'target', header: 'Target', render: (row) => targetLabel(row) },
    {
      key: 'requester',
      header: 'Requested By',
      render: (row) => <span className={styles.mono}>{requesterLabel(row)}</span>,
    },
    {
      key: 'decided',
      header: 'Decided',
      render: (row) => (row.decided_at
        ? `${when(row.decided_at, true)} By ${row.decided_by_label || 'Unknown'}`
        : '-'),
    },
    {
      key: 'blocked_reason',
      header: 'Note',
      // The raw enum (`no_second_approver`) used to reach the operator in a
      // cell headed Note, on a screen whose every other cell is written out.
      render: (row) => blockedReasonLabel(row.blocked_reason),
    },
    {
      key: 'run_again',
      header: 'Action',
      // THE WAY FORWARD FOR A STRANDED APPROVAL. The route's own 503 copy
      // says "Try Running It Again From The Approvals Tab", and this tab
      // could not: nothing in the client sent execute_approval, so a
      // transient database blip after a legitimate approval left a row only
      // SQL could complete.
      render: (row) => (canRunAgain(row, permissions) ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGo}`}
          onClick={() => setRunAgainFor(row)}
          disabled={running}
        >
          Run Again
        </button>
      ) : '-'),
    },
  ]), [permissions, running]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Approvals</h2>
          <p className={styles.panelIntro}>
            Money Moves That Stopped To Wait For A Second Operator. While Maker-Checker
            Is Off, Nothing Arrives Here To Be Decided: Operations Still Record A Row So
            The Trail Is Complete, Marked Auto Approved, And They Execute As They
            Always Have.
          </p>
        </div>
        <button type="button" className={styles.btn} onClick={loadPending} disabled={pendingLoading}>
          {pendingLoading ? 'Loading' : 'Refresh'}
        </button>
      </div>

      {/* AN UNKNOWN IS NOT AN OFF. With the policy read failed, `policy` is
          null, and this used to print the flat statement "Maker-Checker Is
          Currently Off" over a control that may well be on. */}
      {!policyIsKnown(policy) ? (
        <div className={styles.warnNote}>
          The Approval Policy Could Not Be Read, So This Console Cannot Say Whether
          Maker-Checker Is On Or Off. Anything Below Is The Queue As The Route Returned
          It; The Route Decides Every Request Either Way.
        </div>
      ) : policy.approvals_enabled !== true ? (
        <div className={styles.infoNote}>
          Maker-Checker Is Currently Off. Turn It On From Staff And Roles When There Are
          Two Operators To Share A Decision.
        </div>
      ) : null}

      {pendingError && (
        <div className={styles.errorNote} role="alert">
          The Queue Could Not Be Read: {pendingError}
        </div>
      )}

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          Pending{pendingTotal === null ? '' : ` (${num(pendingTotal)})`}
        </h3>
        <DataTable
          columns={pendingColumns}
          rows={pending}
          caption="Requests Waiting For A Decision"
          loading={pendingLoading && !pendingLoaded}
          loadingLabel="Loading The Queue"
          empty="Nothing Is Waiting For A Decision."
          getRowKey={(row, i) => row.id || i}
        />
        {pendingTotal !== null && pending.length < pendingTotal && (
          <div className={styles.warnNote}>
            Showing {num(pending.length)} Of {num(pendingTotal)} Pending Requests. This
            List Is Capped At {PENDING_LIMIT}, So It Is A Page And Not A Total.
          </div>
        )}
      </div>

      {/* ── HISTORY ───────────────────────────────────────────────────────── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>History</h3>

        <div className={styles.filterRow}>
          <label className={styles.fieldLabel} htmlFor="approvals-kind">Kind</label>
          <select
            id="approvals-kind"
            className={styles.select}
            style={{ width: 'auto' }}
            value={history.filters.kind}
            onChange={(e) => history.setFilter('kind', e.target.value)}
          >
            <option value="">All Kinds</option>
            {APPROVAL_KINDS.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>

          <label className={styles.fieldLabel} htmlFor="approvals-status">Status</label>
          <select
            id="approvals-status"
            className={styles.select}
            style={{ width: 'auto' }}
            value={history.filters.status}
            onChange={(e) => history.setFilter('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            {APPROVAL_STATUSES.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>

          <label className={styles.fieldLabel} htmlFor="approvals-from">From</label>
          <input
            id="approvals-from"
            type="date"
            className={styles.input}
            style={{ width: 'auto' }}
            value={history.filters.from}
            onChange={(e) => history.setFilter('from', e.target.value)}
          />

          <label className={styles.fieldLabel} htmlFor="approvals-to">To</label>
          <input
            id="approvals-to"
            type="date"
            className={styles.input}
            style={{ width: 'auto' }}
            value={history.filters.to}
            onChange={(e) => history.setFilter('to', e.target.value)}
          />

          <button
            type="button"
            className={styles.btn}
            onClick={exportHistory}
            // Gated on the WHOLE filtered set, not on the page in front of
            // you: page two of an empty page one still has rows to export.
            disabled={!!exporting || historyIsEmpty}
            title="Exports Every Row Matching The Kind, Status And Date Filters, Across All Pages, Not Just The Page On Screen."
          >
            {exporting ? 'Exporting' : 'Export CSV'}
          </button>
        </div>

        {exporting && (
          <div className={styles.exportProgress} role="status">
            Exporting Approval Records: {num(exporting.fetched, '0')}
            {exporting.total === null || exporting.total === undefined
              ? ' So Far'
              : ` Of ${num(exporting.total)}`}
            . Leave This Tab Open.
          </div>
        )}

        {history.error && (
          <div className={styles.errorNote} role="alert">
            The History Could Not Be Read: {history.error}
          </div>
        )}

        {datesSet && visibleHistory.length !== history.rows.length && (
          <div className={styles.warnNote}>
            This Page Came Back With {num(history.rows.length)} Rows And{' '}
            {num(history.rows.length - visibleHistory.length)} Of Them Fall Outside The
            Dates, So They Were Hidden Here. The Route Does Narrow The Total And The
            Export By Date, So Nothing Below Is Missing Because Of This: The Rows Were
            Returned By A Route Whose Idea Of These Dates Differs From This Console's.
            Report It Rather Than Paging For Them.
          </div>
        )}

        <DataTable
          columns={historyColumns}
          rows={visibleHistory}
          caption="Every Recorded Request"
          loading={history.loading && !history.loaded}
          loadingLabel="Loading History"
          empty="No Approval Records Match These Filters."
          getRowKey={(row, i) => row.id || i}
        />

        <Pager
          offset={history.offset}
          limit={history.limit}
          count={visibleHistory.length}
          total={history.total}
          hasMore={history.hasMore}
          loading={history.loading}
          noun="Requests"
          onPrevious={history.previous}
          onNext={history.next}
        />
      </div>

      {/* ── THE DECISION ──────────────────────────────────────────────────── */}
      {decideFor && (
        <Modal
          title={decideFor.withdraw
            ? 'Withdraw This Request'
            : (decideFor.decision === 'approve' ? 'Approve This Request' : 'Reject This Request')}
          onClose={busy ? undefined : () => setDecideFor(null)}
          hideClose={busy}
          sticky={busy}
          blockEscape={busy}
        >
          <p className={styles.cardNote}>
            {kindLabel(decideFor.row.kind)}
            {decideFor.row.amount === null || decideFor.row.amount === undefined
              ? ''
              : ` Of ${num(decideFor.row.amount)} ${decideFor.row.asset || ''}`}
            {' '}For <strong>{targetLabel(decideFor.row)}</strong>, Raised By{' '}
            <strong>{requesterLabel(decideFor.row)}</strong>{' '}
            {formatAge(decideFor.row.requested_at, now)} Ago.
          </p>
          {decideFor.row.reason && (
            <p className={styles.cardNote}>
              Their Reason: {decideFor.row.reason}
            </p>
          )}
          <p className={styles.cardNote}>
            {decideFor.withdraw
              ? WITHDRAW_SENTENCE
              : (decideFor.decision === 'approve'
                ? approveSentence(decideFor.row.kind)
                : REJECT_SENTENCE)}
          </p>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="decision-note">
              {/* THIS CONSOLE'S RULE, SAID AS THIS CONSOLE'S RULE. The route
                  accepts a note of one character and treats it as optional;
                  the ten-character minimum on a rejection is a house rule, and
                  presenting a house rule as the system's is how an operator
                  ends up believing a shorter note was refused by the server. */}
              Note{decideFor.withdraw
                ? ` (A Withdrawal Needs At Least ${MIN_REASON_LENGTH} Characters)`
                : (decideFor.decision === 'reject'
                  ? ` (This Console Requires At Least ${MIN_REASON_LENGTH} Characters)`
                  : ' (Optional)')}
            </label>
            <textarea
              id="decision-note"
              className={styles.textarea}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className={styles.rowActions} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={`${styles.btn} ${decideFor.decision === 'approve' ? styles.btnGo : styles.btnDanger}`}
              onClick={submitDecision}
              disabled={busy || (decideFor.decision === 'reject' && !reasonIsValid(note))}
            >
              {busy
                ? 'Working'
                : (decideFor.withdraw
                  ? 'Withdraw'
                  : (decideFor.decision === 'approve' ? 'Approve' : 'Reject'))}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setDecideFor(null)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── RUN AGAIN ─────────────────────────────────────────────────────── */}
      {runAgainFor && (
        <ConfirmDialog
          title="Run This Approval Again"
          confirmLabel="Run It Now"
          tone="danger"
          busy={running}
          sticky={running}
          blockEscape={running}
          onConfirm={runAgain}
          onCancel={() => setRunAgainFor(null)}
          note="The Row Already Holds Its Operation ID, So However Many Times This Runs, The Money Moves Once. An Expired Window Is Refused."
        >
          <p style={{ marginTop: 0 }}>
            {kindLabel(runAgainFor.kind)}
            {runAgainFor.amount === null || runAgainFor.amount === undefined
              ? ''
              : ` Of ${num(runAgainFor.amount)} ${runAgainFor.asset || ''}`}
            {' '}For <strong>{targetLabel(runAgainFor)}</strong>, Raised By{' '}
            <strong>{requesterLabel(runAgainFor)}</strong>, Is{' '}
            <strong>{statusLabel(runAgainFor.status)}</strong> And Has Not Been Carried Out.
          </p>
          <p>
            This Runs The Approved Operation Now, Against The Live Balances. If It Cannot
            Be Reached Again The Row Stays Failed And Nothing Moves.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
