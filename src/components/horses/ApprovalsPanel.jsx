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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import DataTable from './DataTable';
import Pager from './Pager';
import StatusPill from './StatusPill';
import usePagedList from './usePagedList';
import exportAllCsv from './exportAllCsv';
import styles from './shared.module.css';
import { num, when } from '../../lib/horsesAdminTokens';
import {
  APPROVAL_KINDS, APPROVAL_STATUSES, approvalRowState, formatAge, formatExpiresIn,
  kindLabel, statusLabel, toneForApprovalStatus,
} from './approvalModel';
import {
  MIN_REASON_LENGTH, approvalsUrl, decideApprovalBody, reasonIsValid, rowsOf,
  OPERATOR_ADMIN,
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

  const [decideFor, setDecideFor] = useState(null); // { row, decision }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [exporting, setExporting] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const body = await authFetch(approvalsUrl({
        status: 'pending', limit: PENDING_LIMIT, offset: 0,
      }));
      setPending(rowsOf(body, 'approvals', 'pending'));
      setPendingTotal(typeof body.total === 'number' ? body.total : null);
      setPendingLoaded(true);
    } catch (err) {
      setPendingError(err.message || 'The Queue Could Not Be Read.');
    } finally {
      setPendingLoading(false);
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
      showNotification(`A Rejection Needs A Note Of At Least ${MIN_REASON_LENGTH} Characters.`, 'error');
      return;
    }
    setBusy(true);
    try {
      await authFetch(OPERATOR_ADMIN, { method: 'POST', body: JSON.stringify(body) });
      showNotification(
        decideFor.decision === 'approve'
          ? 'Approved. The Operation Will Be Carried Out And Recorded.'
          : 'Rejected. Nothing Was Moved.',
        'success',
      );
      setDecideFor(null);
      setNote('');
      await loadPending();
      history.refresh();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [authFetch, decideFor, note, loadPending, history, showNotification]);

  const exportHistory = useCallback(async () => {
    setExporting({ fetched: 0, total: history.total });
    try {
      const result = await exportAllCsv({
        filenamePrefix: 'operator-approvals',
        limit: EXPORT_PAGE_SIZE,
        onProgress: (p) => setExporting(p),
        jsonColumns: ['payload', 'result'],
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
          ['target_id', 'Target Id'],
          ['requester_label', 'Requested By'],
          ['requested_by', 'Requested By Id'],
          ['decided_at', 'Decided At'],
          ['decided_by_label', 'Decided By'],
          ['decided_by', 'Decided By Id'],
          ['expires_at', 'Expires At'],
          ['blocked_reason', 'Blocked Reason'],
          ['reason', 'Reason'],
          ['op_id', 'Operation Id'],
          ['request_id', 'Request Id'],
          ['payload', 'Payload'],
          ['result', 'Result'],
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
        if (!state.canDecide) {
          return (
            <>
              <StatusPill tone="neutral" label={state.label} />
              {state.note ? <span className={styles.blockedNote}>{state.note}</span> : null}
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
    const from = history.filters.from ? Date.parse(`${history.filters.from}T00:00:00`) : NaN;
    const to = history.filters.to ? Date.parse(`${history.filters.to}T23:59:59.999`) : NaN;
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
        ? `${when(row.decided_at, true)} by ${row.decided_by_label || 'Unknown'}`
        : '-'),
    },
    {
      key: 'blocked_reason',
      header: 'Note',
      render: (row) => row.blocked_reason || '-',
    },
  ]), []);

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

      {!policy || policy.approvals_enabled !== true ? (
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
            disabled={!!exporting || history.rows.length === 0}
            title="Exports every row matching the kind, status and date filters, across all pages, not just the page on screen."
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
            Dates, So They Were Removed Here Rather Than By The Route. The Totals And The
            Export Below Are Not Narrowed By Date. Page Through To Reach Older Requests.
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
          count={history.rows.length}
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
          title={decideFor.decision === 'approve' ? 'Approve This Request' : 'Reject This Request'}
          onClose={busy ? undefined : () => setDecideFor(null)}
          sticky={busy}
          blockEscape={busy}
        >
          <p className={styles.cardNote}>
            {kindLabel(decideFor.row.kind)}
            {decideFor.row.amount === null || decideFor.row.amount === undefined
              ? ''
              : ` of ${num(decideFor.row.amount)} ${decideFor.row.asset || ''}`}
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
            {decideFor.decision === 'approve'
              ? 'Approving Carries The Operation Out. It Is Executed Once And Only Once, Against The Operation Id This Request Already Holds.'
              : 'Rejecting Moves Nothing. The Request Is Closed And The Operator Who Raised It Has To Raise It Again.'}
          </p>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="decision-note">
              Note{decideFor.decision === 'reject'
                ? ` (Required, At Least ${MIN_REASON_LENGTH} Characters)`
                : ' (Optional)'}
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
              {busy ? 'Working' : (decideFor.decision === 'approve' ? 'Approve' : 'Reject')}
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
    </div>
  );
}
