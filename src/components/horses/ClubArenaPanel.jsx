import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import useCashoutTerminalScope from './useCashoutTerminalScope';
import { retainCashoutTerminalIntent } from '../../lib/club-arena/cashoutTerminalIntent.mjs';
import { thresholdDecision, isPendingApproval } from './approvalModel';
import { hasPermission } from '../../lib/horses/permissions';
import { CA_SECTIONS, DEFAULT_CA_SECTION } from './tabRegistry';
import ConfirmDialog from './ConfirmDialog';
import DataTable from './DataTable';
import StatusPill from './StatusPill';
import ClubsUnionsPanel from './ClubsUnionsPanel';
import AnnouncementsPanel from './AnnouncementsPanel';
import pageStyles from '../../../pages/horses/horses.module.css';
import panelStyles from './legacyPanels.module.css';
import {
  T, downloadCsv, num, signed, stampedName, toCsv, when,
} from '../../lib/horsesAdminTokens';

const styles = { ...pageStyles, ...panelStyles };
const CA_OVERVIEW_LIMIT = 200;
const CA_CLUB_LIMIT = 300;
const CA_LEDGER_LIMIT = 200;

function formatAmount(value, asset) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return asset === 'chips'
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString();
}

function ShowingOf({ truncated, count, total, noun = 'Rows' }) {
  if (!truncated) return null;
  return (
    <div className={styles.warnBanner}>
      Showing {num(count, '0')}
      {total === null || total === undefined ? '' : ` Of ${num(total)}`} {noun}.
      {' '}This List Is Capped By The Route, So It Is A Page And Not A Total.
    </div>
  );
}

const SECTION_PANELS = Object.freeze({
  operations: ClubsUnionsPanel,
  announcements: AnnouncementsPanel,
});

export default function ClubArenaPanel({
  authFetch,
  showNotification,
  permissions = null,
  operatorId = null,
  policy = null,
  aloneRule = null,
  approvalsAvailable = false,
  onNavigate = () => {},
  permissionsDegraded = false,
  section = DEFAULT_CA_SECTION,
  onSectionChange = () => {},
}) {
  const router = useRouter();
  const caSection = CA_SECTIONS.some(([id]) => id === section) ? section : DEFAULT_CA_SECTION;
  const setCaSection = useCallback((nextSection) => {
    if (CA_SECTIONS.some(([id]) => id === nextSection)) onSectionChange(nextSection);
  }, [onSectionChange]);
  const canCashierWrite = !permissionsDegraded
    && (permissions === null || hasPermission(permissions, 'cashier.write'));
  const canClubsWrite = !permissionsDegraded
    && (permissions === null || hasPermission(permissions, 'clubs.write'));
  const canModerate = !permissionsDegraded
    && (permissions === null || hasPermission(permissions, 'moderation.write'));

  const [caLoaded, setCaLoaded] = useState(false);
  const [caLoading, setCaLoading] = useState(false);
  const [caError, setCaError] = useState(null);
  const [caWarnings, setCaWarnings] = useState(null);
  const [caStats, setCaStats] = useState(null);
  const [caClubs, setCaClubs] = useState([]);
  const [caUnions, setCaUnions] = useState([]);
  const [caFinance, setCaFinance] = useState(null);
  const [caPendingCashouts, setCaPendingCashouts] = useState([]);
  const [caSelectedClub, setCaSelectedClub] = useState(null);
  const [caClubDetail, setCaClubDetail] = useState(null);
  const [caClubTab, setCaClubTab] = useState('overview');
  const [caUserSearch, setCaUserSearch] = useState('');
  const [caUserResults, setCaUserResults] = useState([]);
  const [caUserSearching, setCaUserSearching] = useState(false);
  const [caSelectedUser, setCaSelectedUser] = useState(null);
  const [caProcessing, setCaProcessing] = useState(false);
  const [cashoutConfirm, setCashoutConfirm] = useState(null);
  const [cashoutBusy, setCashoutBusy] = useState(false);
  const cashoutAttemptRef = useRef(null);
  const cashoutDialogEpoch = useRef(0);
  const cashoutReadEpoch = useRef(0);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [caApplications, setCaApplications] = useState([]);
  const [caAppLoading, setCaAppLoading] = useState(false);
  const [caAppTab, setCaAppTab] = useState('pending');
  const [caAppCommission, setCaAppCommission] = useState({});
  const [caAppReason, setCaAppReason] = useState({});
  const [caLeaveRequests, setCaLeaveRequests] = useState([]);
  const [caLeaveLoading, setCaLeaveLoading] = useState(false);
  const [caLeaveTab, setCaLeaveTab] = useState('pending');
  const [caPages, setCaPages] = useState(null);
  const [caLedger, setCaLedger] = useState(null);
  const [caLedgerLoading, setCaLedgerLoading] = useState(false);
  const [caLedgerError, setCaLedgerError] = useState(null);
  const [caRevenue, setCaRevenue] = useState(null);
  const [caRevenueLoading, setCaRevenueLoading] = useState(false);
  const [caRevenueError, setCaRevenueError] = useState(null);
  const [badges, setBadges] = useState(null);
  const caReqRef = useRef(0);
  const overviewReqRef = useRef(0);
  const applicationsReqRef = useRef(0);
  const leaveReqRef = useRef(0);
  const ledgerReqRef = useRef(0);
  const revenueReqRef = useRef(0);
  const badgesReqRef = useRef(0);
  const mutationReqRef = useRef(0);
  const mountedRef = useRef(false);

  const cashoutViewKey = JSON.stringify([operatorId, router.asPath, caSection, caSelectedClub?.id]);
  const cashoutScopeKey = JSON.stringify([
    cashoutViewKey,
    cashoutDialogEpoch.current,
    cashoutConfirm?.cashout.id,
    cashoutConfirm?.action,
  ]);
  const captureCashoutScope = useCashoutTerminalScope(operatorId, cashoutScopeKey, router);

  const loadBadges = useCallback(async () => {
    const request = ++badgesReqRef.current;
    try {
      const data = await authFetch('/api/horses/club-arena-admin?section=badges');
      if (mountedRef.current && request === badgesReqRef.current) setBadges(data.badges || null);
    } catch {
      // Badges are an affordance; the section data still reports its own errors.
    }
  }, [authFetch]);

  useEffect(() => {
    cashoutAttemptRef.current = null;
    setCashoutBusy(false);
    setCashoutConfirm(null);
  }, [cashoutViewKey]);


  // ═══════════════════════════════════════════════════════════════════════════
  // CLUB ARENA - all of this now goes through the service-role admin route.
  // ═══════════════════════════════════════════════════════════════════════════
  const loadClubArenaData = useCallback(async () => {
    const request = ++overviewReqRef.current;
    const cashoutCurrent = captureCashoutScope(), cashoutRead = ++cashoutReadEpoch.current;
    setCaLoading(true);
    setCaError(null);
    setCaWarnings(null);
    try {
      // The cap is sent explicitly (addendum item 10) so the number this panel
      // can show is written down in the code that shows it, and `pages` is
      // kept so every count below is the route's total rather than the length
      // of the array that fitted under the cap.
      const d = await authFetch(`/api/horses/club-arena-admin?section=overview&limit=${CA_OVERVIEW_LIMIT}`);
      if (!mountedRef.current || request !== overviewReqRef.current) return;
      setCaStats(d.stats || null);
      setCaClubs(d.pages?.clubs?.rows || []);
      setCaUnions(d.pages?.unions?.rows || []);
      if (cashoutCurrent() && cashoutReadEpoch.current === cashoutRead) {
        setCaPendingCashouts(d.pages?.cashouts?.rows || []);
      }
      setCaFinance(d.finance ? {
        ...d.finance,
        recentTxns: d.pages?.transactions?.rows || [],
      } : null);
      setCaPages(d.pages || null);
      setCaWarnings(d.failedSources || null);
      setCaLoaded(true);
    } catch (err) {
      if (mountedRef.current && request === overviewReqRef.current) setCaError(err.message);
    } finally {
      if (mountedRef.current && request === overviewReqRef.current) setCaLoading(false);
    }
  }, [authFetch, captureCashoutScope]);

  // Click club A then club B fast enough and A's late response used to render
  // under B's header. Same shape on the user loaders, where the stale response
  // replaced the whole card including the identity.
  const loadCaClubDetail = useCallback(async (club) => {
    const reqId = ++caReqRef.current;
    setCaSelectedClub(club);
    setCaClubTab('overview');
    setCaClubDetail(null);
    setCaLoading(true);
    try {
      // Flags and sessions come from the anti-cheat route, which owns the
      // review and kick actions too. reviewFlag and kickSession have existed
      // in this file with no caller since the tab was written.
      const [d, flagsRes, sessionsRes] = await Promise.all([
        authFetch(`/api/horses/club-arena-admin?section=club&clubId=${encodeURIComponent(club.id)}&limit=${CA_CLUB_LIMIT}`),
        authFetch('/api/club-arena/anti-cheat', {
          method: 'POST', body: JSON.stringify({ action: 'get_flags', clubId: club.id }),
        }).catch((e) => ({ flags: [], error: e.message })),
        authFetch('/api/club-arena/anti-cheat', {
          method: 'POST', body: JSON.stringify({ action: 'get_sessions', clubId: club.id }),
        }).catch((e) => ({ sessions: [], error: e.message })),
      ]);
      if (reqId !== caReqRef.current) return;
      setCaClubDetail({
        ...d,
        members: d.pages?.members?.rows || [],
        agents: d.pages?.agents?.rows || [],
        tables: d.pages?.tables?.rows || [],
        pendingCashouts: d.pages?.cashouts?.rows || [],
        recentTxns: d.pages?.transactions?.rows || [],
        flags: flagsRes.flags || [],
        sessions: sessionsRes.sessions || [],
        securityError: flagsRes.error || sessionsRes.error || null,
      });
      if (d.failedSources) setCaWarnings(d.failedSources);
    } catch (err) {
      if (reqId === caReqRef.current) showNotification(err.message, 'error');
    } finally {
      if (reqId === caReqRef.current) setCaLoading(false);
    }
  }, [authFetch, showNotification]);

  const searchCaUsers = useCallback(async (query) => {
    const q = (query || '').trim();
    if (q.length < 2) { setCaUserResults([]); return; }
    const reqId = ++caReqRef.current;
    setCaUserSearching(true);
    try {
      // The query is sanitized server-side. It used to be interpolated straight
      // into a PostgREST .or() filter string in the browser, where a comma or a
      // parenthesis rewrote the whole filter tree.
      const d = await authFetch(`/api/horses/club-arena-admin?section=user_search&q=${encodeURIComponent(q)}`);
      if (reqId !== caReqRef.current) return;
      setCaUserResults(d.rows || []);
    } catch (err) {
      if (reqId !== caReqRef.current) return;
      showNotification(err.message, 'error');
      setCaUserResults([]);
    } finally {
      if (reqId === caReqRef.current) setCaUserSearching(false);
    }
  }, [authFetch, showNotification]);

  const loadCaUserDetail = useCallback(async (profile) => {
    const reqId = ++caReqRef.current;
    setCaSelectedUser({ ...profile, loading: true });
    try {
      const d = await authFetch(`/api/horses/club-arena-admin?section=user&userId=${encodeURIComponent(profile.id)}`);
      if (reqId !== caReqRef.current) return;
      setCaSelectedUser({
        ...profile,
        ...d,
        memberships: d.pages?.memberships?.rows || [],
        cashouts: d.pages?.cashouts?.rows || [],
        txns: d.pages?.txns?.rows || [],
        loading: false,
      });
    } catch (err) {
      if (reqId !== caReqRef.current) return;
      showNotification(err.message, 'error');
      setCaSelectedUser((prev) => (prev ? { ...prev, loading: false } : null));
    }
  }, [authFetch, showNotification]);

  /**
   * The route accepts action 'approve' | 'cancel' and the console only ever
   * sent 'approve'. An admin looking at a fraudulent or mistaken request had
   * no way to release it -- their only options were to pay it or leave it
   * pending forever. 'cancel' is the reversible branch: the chips go back to
   * the player's balance.
   *
   * Opening the dialog is separate from sending, so the confirmation can say
   * what will actually happen. A /horses operator takes the platform-override
   * path of /api/club-arena/approve-cashout, which is the path Phase 2 gates
   * with requireApproval: with approvals on and the amount at or over
   * cashout_threshold the route answers 202 and moves nothing. The
   * thresholdDecision here is the same one the Mint shows, so "Force Approve"
   * reads "This Will Be Sent For Approval" before the click when that is the
   * truth.
   */
  const resolveCashout = useCallback((cashout, action) => {
    if (!canCashierWrite || permissionsDegraded) {
      showNotification('Cashier Write Permission Is Required.', 'error');
      return;
    }
    cashoutDialogEpoch.current += 1;
    setCashoutConfirm({
      cashout,
      action,
      decision: action === 'approve'
        ? thresholdDecision({
          policy: policy,
          kind: 'cashout',
          amount: cashout.amount,
          asset: 'chips',
          aloneRule: aloneRule,
        })
        : null,
    });
  }, [aloneRule, canCashierWrite, permissionsDegraded, policy, showNotification]);

  /** Tag a pending cashout row, wherever it is rendered, with the approval
   *  it is now waiting on. The row STAYS: it has not been paid. */
  const markCashoutPendingApproval = useCallback((cashoutId, approvalId) => {
    const tag = (c) => (c.id === cashoutId ? { ...c, pendingApprovalId: approvalId } : c);
    setCaPendingCashouts((prev) => prev.map(tag));
    setCaClubDetail((prev) => (prev
      ? { ...prev, pendingCashouts: (prev.pendingCashouts || []).map(tag) }
      : prev));
  }, []);

  const submitCashout = useCallback(async () => {
    if (!cashoutConfirm || cashoutAttemptRef.current) return;
    const { cashout, action } = cashoutConfirm;
    const scopeCurrent = captureCashoutScope(), dialogEpoch = cashoutDialogEpoch.current;
    const readEpoch = caReqRef.current, overviewEpoch = cashoutReadEpoch.current;
    const isCurrent = () => scopeCurrent() && cashoutDialogEpoch.current === dialogEpoch &&
      caReqRef.current === readEpoch && cashoutReadEpoch.current === overviewEpoch;
    if (!isCurrent()) { showNotification('Refresh This Cashout In The Original Account.', 'error'); return; }
    const attempt = {};
    cashoutAttemptRef.current = attempt;
    setCashoutBusy(true);
    try {
      const note = action === 'approve' ? 'Approved' : 'Cancelled by agent';
      const operationId = await retainCashoutTerminalIntent({ actorId: operatorId, clubId: cashout.club_id,
        cashoutId: cashout.id, action, note }, { storage: window.localStorage, locks: navigator.locks,
        randomUUID: () => globalThis.crypto.randomUUID(), isCurrent });
      if (!isCurrent()) return;
      const body = await authFetch('/api/club-arena/approve-cashout', {
        method: 'POST',
        isCurrent,
        headers: { 'X-Idempotency-Key': operationId },
        body: JSON.stringify({ cashoutId: cashout.id, clubId: cashout.club_id, action, expectedActorId: operatorId }),
      });
      if (!isCurrent()) return;

      // ── 202: SENT FOR APPROVAL, NO CHIPS HAVE MOVED ────────────────────
      //
      // 202 is `res.ok` and `success` is true, so this used to fall straight
      // through: the row vanished from the only list the operator was
      // looking at, the toast said "Cashout Approved", and the request sat
      // pending in the Approvals queue with nobody told to go there. The
      // player was not paid until somebody noticed. The row is kept and
      // tagged instead, so it renders "Waiting For Approval" in place of its
      // buttons, and the toast says exactly what the route said.
      if (isPendingApproval(body)) {
        markCashoutPendingApproval(cashout.id, body.approvalId);
        setCashoutConfirm(null);
        showNotification(body.message || 'Sent For Approval. No Chips Have Moved.', 'info');
        return;
      }

      if (body?.receipt?.operationId !== operationId || body.receipt.request?.id !== cashout.id ||
          body.receipt.cashier?.actor_user_id !== operatorId ||
          body.receipt.cashier?.event_kind !== (action === 'approve' ? 'approval' : 'decline')) {
        throw new Error('Cashout receipt is unconfirmed. Retain this operation and refresh its status.');
      }
      caReqRef.current += 1;
      cashoutReadEpoch.current += 1;
      setCaPendingCashouts((prev) => prev.filter((c) => c.id !== cashout.id));
      setCaClubDetail((prev) => (prev
        ? { ...prev, pendingCashouts: (prev.pendingCashouts || []).filter((c) => c.id !== cashout.id) }
        : prev));
      setCashoutConfirm(null);
      if (body.trailClosed === false) {
        // The RPC paid the request; markApprovalExecuted could not close the
        // approval row that authorised it. The money is right and the trail
        // is not, and the operator has to hear the second half.
        showNotification(
          'The Chip Transfer Is Confirmed. The Approval Or Audit Follow-Up Still Needs Attention.',
          'info',
        );
      } else if (body.trailStatus === 'not_checked') {
        showNotification('The Original Chip Transfer Is Confirmed. Its Audit Follow-Up Has Not Been Rechecked.', 'info');
      } else {
        showNotification(action === 'approve' ? 'Cashout Approved' : 'Cashout Cancelled, Chips Returned');
      }
      loadBadges();
    } catch (err) {
      if (isCurrent()) showNotification(err.message, 'error');
    } finally {
      if (cashoutAttemptRef.current === attempt) {
        cashoutAttemptRef.current = null;
        if (isCurrent()) setCashoutBusy(false);
      }
    }
  }, [authFetch, cashoutConfirm, captureCashoutScope, operatorId, markCashoutPendingApproval, showNotification, loadBadges]);


  const loadApplications = useCallback(async (statusFilter = 'pending') => {
    const request = ++applicationsReqRef.current;
    setCaAppLoading(true);
    try {
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify({ action: 'list', statusFilter }),
      });
      if (mountedRef.current && request === applicationsReqRef.current) {
        setCaApplications(d.applications || []);
      }
    } catch (err) {
      if (mountedRef.current && request === applicationsReqRef.current) {
        showNotification(err.message, 'error');
      }
    } finally {
      if (mountedRef.current && request === applicationsReqRef.current) setCaAppLoading(false);
    }
  }, [authFetch, showNotification]);

  const loadLeaveRequests = useCallback(async (statusFilter = 'pending') => {
    const request = ++leaveReqRef.current;
    setCaLeaveLoading(true);
    try {
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify({ action: 'list_leave_requests', statusFilter }),
      });
      if (mountedRef.current && request === leaveReqRef.current) {
        setCaLeaveRequests(d.leaveRequests || []);
      }
    } catch (err) {
      if (mountedRef.current && request === leaveReqRef.current) {
        showNotification(err.message, 'error');
      }
    } finally {
      if (mountedRef.current && request === leaveReqRef.current) setCaLeaveLoading(false);
    }
  }, [authFetch, showNotification]);

  const reviewApplication = useCallback(async (app, decision) => {
    if (!canClubsWrite || permissionsDegraded) {
      showNotification('Club Write Permission Is Required.', 'error');
      return;
    }
    const request = ++mutationReqRef.current;
    setCaProcessing(true);
    try {
      const rate = parseFloat(caAppCommission[app.id] ?? 90);
      const body = decision === 'approve'
        ? { action: 'approve', applicationId: app.id, commissionRate: Number.isFinite(rate) ? rate / 100 : 0.9 }
        : { action: 'reject', applicationId: app.id, reason: caAppReason[app.id] || '' };
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify(body),
      });
      if (!mountedRef.current || request !== mutationReqRef.current) return;
      showNotification(d.message || (decision === 'approve' ? 'Application Approved' : 'Application Rejected'));
      setCaAppReason((prev) => {
        const next = { ...prev };
        delete next[app.id];
        return next;
      });
      loadApplications(caAppTab);
    } catch (err) {
      if (mountedRef.current && request === mutationReqRef.current) {
        showNotification(err.message, 'error');
      }
    } finally {
      if (mountedRef.current && request === mutationReqRef.current) setCaProcessing(false);
    }
  }, [authFetch, caAppCommission, caAppReason, caAppTab, canClubsWrite, loadApplications, permissionsDegraded, showNotification]);

  const sendLeaveDecision = useCallback(async (req, decision) => {
    if (!canClubsWrite || permissionsDegraded) {
      showNotification('Club Write Permission Is Required.', 'error');
      return;
    }
    const request = ++mutationReqRef.current;
    setCaProcessing(true);
    try {
      // The deny button used to send { action: 'reject', applicationId } with a
      // union_leave_requests id, which the route looked up in union_applications
      // and always 404'd. There is a reject_leave action now.
      const body = decision === 'approve'
        ? { action: 'approve_leave', leaveRequestId: req.id }
        : { action: 'reject_leave', leaveRequestId: req.id };
      await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify(body),
      });
      if (!mountedRef.current || request !== mutationReqRef.current) return;
      showNotification(decision === 'approve' ? 'Club Removed From Union' : 'Leave Request Denied');
      loadLeaveRequests(caLeaveTab);
    } catch (err) {
      if (mountedRef.current && request === mutationReqRef.current) {
        showNotification(err.message, 'error');
      }
    } finally {
      if (mountedRef.current && request === mutationReqRef.current) setCaProcessing(false);
    }
  }, [authFetch, caLeaveTab, canClubsWrite, loadLeaveRequests, permissionsDegraded, showNotification]);

  /** Approving a leave request removes the club from its union, which is the
   *  irreversible direction, so only that one asks first. */
  const reviewLeaveRequest = useCallback((req, decision) => {
    if (decision !== 'approve') {
      sendLeaveDecision(req, decision);
      return;
    }
    setPendingConfirm({
      title: 'Remove Club From Union',
      body: `Remove ${req.club_name} From ${req.unions?.name || 'The Union'}? This Cannot Be Undone.`,
      confirmLabel: 'Yes, Remove The Club',
      tone: 'danger',
      onConfirm: () => sendLeaveDecision(req, decision),
    });
  }, [sendLeaveDecision]);

  const reviewFlag = useCallback(async (flag, verdict) => {
    if (!canModerate || permissionsDegraded) {
      showNotification('Moderation Write Permission Is Required.', 'error');
      return;
    }
    const request = ++mutationReqRef.current;
    setCaProcessing(true);
    try {
      const body = verdict === 'kick'
        ? { action: 'kick_player', clubId: caSelectedClub.id, playerId: flag.user_id, targetUserId: flag.user_id, reason: flag.flag_type }
        : { action: 'review_flag', clubId: caSelectedClub.id, flagId: flag.id, newStatus: verdict === 'dismiss' ? 'dismissed' : 'reviewed', verdict };
      await authFetch('/api/club-arena/anti-cheat', { method: 'POST', body: JSON.stringify(body) });
      if (!mountedRef.current || request !== mutationReqRef.current) return;
      showNotification(verdict === 'kick' ? 'Player Kicked' : `Flag Marked ${verdict === 'dismiss' ? 'Dismissed' : 'Reviewed'}`);
      loadCaClubDetail(caSelectedClub);
    } catch (err) {
      if (mountedRef.current && request === mutationReqRef.current) {
        showNotification(err.message, 'error');
      }
    } finally {
      if (mountedRef.current && request === mutationReqRef.current) setCaProcessing(false);
    }
  }, [authFetch, caSelectedClub, canModerate, loadCaClubDetail, permissionsDegraded, showNotification]);

  const kickSession = useCallback(async (session) => {
    if (!canModerate || permissionsDegraded) {
      showNotification('Moderation Write Permission Is Required.', 'error');
      return;
    }
    const request = ++mutationReqRef.current;
    setCaProcessing(true);
    try {
      await authFetch('/api/club-arena/anti-cheat', {
        method: 'POST',
        body: JSON.stringify({
          action: 'kick_player', clubId: caSelectedClub.id,
          playerId: session.user_id, targetUserId: session.user_id, reason: 'admin_kick',
        }),
      });
      if (!mountedRef.current || request !== mutationReqRef.current) return;
      showNotification('Player Kicked');
      loadCaClubDetail(caSelectedClub);
    } catch (err) {
      if (mountedRef.current && request === mutationReqRef.current) {
        showNotification(err.message, 'error');
      }
    } finally {
      if (mountedRef.current && request === mutationReqRef.current) setCaProcessing(false);
    }
  }, [authFetch, caSelectedClub, canModerate, loadCaClubDetail, permissionsDegraded, showNotification]);

  const loadCaLedger = useCallback(async () => {
    const request = ++ledgerReqRef.current;
    setCaLedgerLoading(true);
    setCaLedgerError(null);
    try {
      const body = await authFetch(`/api/horses/club-arena-admin?section=ledger&limit=${CA_LEDGER_LIMIT}`);
      if (mountedRef.current && request === ledgerReqRef.current) setCaLedger(body);
    } catch (err) {
      if (mountedRef.current && request === ledgerReqRef.current) setCaLedgerError(err.message);
    } finally {
      if (mountedRef.current && request === ledgerReqRef.current) setCaLedgerLoading(false);
    }
  }, [authFetch]);

  const loadCaRevenue = useCallback(async () => {
    const request = ++revenueReqRef.current;
    setCaRevenueLoading(true);
    setCaRevenueError(null);
    try {
      const body = await authFetch('/api/horses/club-arena-admin?section=revenue');
      if (mountedRef.current && request === revenueReqRef.current) setCaRevenue(body);
    } catch (err) {
      if (mountedRef.current && request === revenueReqRef.current) setCaRevenueError(err.message);
    } finally {
      if (mountedRef.current && request === revenueReqRef.current) setCaRevenueLoading(false);
    }
  }, [authFetch]);

  const caLoadedRef = useRef(caLoaded);
  const loadCaRef = useRef(loadClubArenaData);
  const initialLoadRef = useRef(null);
  useEffect(() => { caLoadedRef.current = caLoaded; }, [caLoaded]);
  useEffect(() => { loadCaRef.current = loadClubArenaData; }, [loadClubArenaData]);
  initialLoadRef.current = () => {
    loadClubArenaData();
    loadApplications('pending');
    loadLeaveRequests('pending');
    loadBadges();
  };

  useEffect(() => {
    mountedRef.current = true;
    initialLoadRef.current?.();
    return () => {
      mountedRef.current = false;
      caReqRef.current += 1;
      overviewReqRef.current += 1;
      applicationsReqRef.current += 1;
      leaveReqRef.current += 1;
      ledgerReqRef.current += 1;
      revenueReqRef.current += 1;
      badgesReqRef.current += 1;
      mutationReqRef.current += 1;
      cashoutReadEpoch.current += 1;
      cashoutDialogEpoch.current += 1;
      cashoutAttemptRef.current = null;
    };
  }, [operatorId]);

  useEffect(() => {
    let timer = null;
    const refresh = () => {
      if (!caLoadedRef.current || timer) return;
      timer = setTimeout(() => {
        timer = null;
        loadCaRef.current();
      }, 5000);
    };
    const channel = supabase
      .channel('horses-club-arena-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (caSection === 'ledger' && !caLedger && !caLedgerLoading && !caLedgerError) loadCaLedger();
    if (caSection === 'revenue' && !caRevenue && !caRevenueLoading && !caRevenueError) loadCaRevenue();
  }, [
    caSection, caLedger, caLedgerError, caLedgerLoading, caRevenue, caRevenueError,
    caRevenueLoading, loadCaLedger, loadCaRevenue,
  ]);

  const pendingAppCount = useMemo(
    () => caApplications.filter((application) => application.status === 'pending').length,
    [caApplications],
  );
  const pendingLeaveCount = useMemo(
    () => caLeaveRequests.filter((request) => request.status === 'pending').length,
    [caLeaveRequests],
  );
  const ledgerCritical = badges?.ledgerCritical || 0;
  const NestedPanel = SECTION_PANELS[caSection] || null;

  return (
    <>
      {permissionsDegraded ? (
        <div className={styles.warnBanner} role="alert">
          Operator Permissions Could Not Be Fully Verified. Reads Remain Available,
          But Write Controls May Be Unavailable Until Permissions Recover.
        </div>
      ) : null}
      {pendingConfirm ? (
        <ConfirmDialog
          title={pendingConfirm.title}
          tone={pendingConfirm.tone || 'danger'}
          confirmLabel={pendingConfirm.confirmLabel || 'Confirm'}
          requireTyped={pendingConfirm.requireTyped || null}
          onConfirm={() => {
            const run = pendingConfirm.onConfirm;
            setPendingConfirm(null);
            if (typeof run === 'function') run();
          }}
          onCancel={() => setPendingConfirm(null)}
        >
          <p style={{ marginTop: 0 }}>{pendingConfirm.body}</p>
        </ConfirmDialog>
      ) : null}
      <div className={styles.statsView}>
              <h2>Club Arena Admin</h2>
              <p style={{ color: T.dim, fontSize: 13, marginBottom: 20 }}>
                Platform-Level Oversight Of Every Club, Union, Agent And Chip Movement.
              </p>

              {caWarnings?.length > 0 && (
                <div className={styles.warnBanner}>
                  Some Sources Could Not Be Read, So The Figures Below Are Incomplete: {caWarnings.join('; ')}
                </div>
              )}

              {/* ── CASHOUT CONFIRMATION ──────────────────────────────────
                  The shared dialog, not window.confirm, because this is the
                  one place a /horses operator moves a player's chips and the
                  sentence about whether they move on Confirm has to come from
                  thresholdDecision, the same as the Mint. Sticky while the
                  request is in flight. */}
              {cashoutConfirm && (
                <ConfirmDialog
                  title={cashoutConfirm.action === 'approve' ? 'Force Approve Cashout' : 'Return Chips To The Player'}
                  tone={cashoutConfirm.action === 'approve' ? 'danger' : 'go'}
                  busy={cashoutBusy}
                  sticky={cashoutBusy}
                  blockEscape={cashoutBusy}
                  confirmLabel={cashoutConfirm.action !== 'approve'
                    ? 'Yes, Return The Chips'
                    : cashoutConfirm.decision?.willRequest
                      ? 'Yes, Send For Approval'
                      : 'Yes, Force Approve'}
                  onConfirm={submitCashout}
                  onCancel={() => { cashoutDialogEpoch.current += 1; setCashoutConfirm(null); }}
                >
                  <p style={{ marginTop: 0 }}>
                    {cashoutConfirm.action === 'approve' ? 'Force Approve' : 'Cancel'} A Cashout Of{' '}
                    <strong>{formatAmount(cashoutConfirm.cashout.amount, 'chips')} Chips</strong>
                    {cashoutConfirm.cashout.player_name ? (
                      <> For <strong>{cashoutConfirm.cashout.player_name}</strong></>
                    ) : null}
                    {cashoutConfirm.cashout.club_name ? (
                      <> In <strong>{cashoutConfirm.cashout.club_name}</strong></>
                    ) : null}
                    .
                  </p>
                  <p style={{ color: T.dim, margin: 0 }}>
                    {cashoutConfirm.action === 'approve'
                      ? 'This Pays The Request And Moves Real Chips Into The Club Treasury For Settlement.'
                      : 'This Releases The Request And Returns The Chips To The Player.'}
                  </p>
                  {cashoutConfirm.decision && (
                    <p
                      style={{
                        margin: '12px 0 0',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: cashoutConfirm.decision.willRequest ? T.warnSoft : T.surfaceTint,
                        color: cashoutConfirm.decision.willRequest ? T.warn : T.dim,
                        border: `1px solid ${cashoutConfirm.decision.willRequest ? T.warn : T.line}`,
                      }}
                    >
                      <strong>{cashoutConfirm.decision.headline}.</strong>{' '}
                      {cashoutConfirm.decision.detail}
                    </p>
                  )}
                </ConfirmDialog>
              )}
              <div className={styles.subNav}>
                {CA_SECTIONS.map(([id, label]) => (
                  <button
                    key={id}
                    className={caSection === id ? styles.active : ''}
                    aria-current={caSection === id ? 'page' : undefined}
                    onClick={() => {
                      // Just the section. The data for it is loaded by an
                      // effect keyed on caSection, so a shared link, Back and
                      // the Needs Attention jump all reach it the same way a
                      // click does - this onClick used to be the ONLY caller,
                      // which is why ?section=ledger showed a spinner forever.
                      setCaSection(id);
                      setCaSelectedClub(null);
                      setCaSelectedUser(null);
                    }}
                  >
                    {label}
                    {id === 'approvals' && pendingAppCount + pendingLeaveCount > 0
                      ? ` (${pendingAppCount + pendingLeaveCount})` : ''}
                    {/* caStats.pendingCashouts is the exact platform count.
                        caPendingCashouts.length is a page capped at 100, so the
                        badge under-reported the work waiting. */}
                    {id === 'finance' && (caStats?.pendingCashouts || 0) > 0
                      ? ` (${num(caStats.pendingCashouts)})` : ''}
                    {id === 'ledger' && ledgerCritical > 0 ? ` (${num(ledgerCritical)})` : ''}
                  </button>
                ))}
                {/* margin-left:auto pinned this to the end of the SCROLL width
                    on mobile, where .subNav becomes a nowrap overflow strip --
                    so the primary refresh sat past seven tabs, invisible. */}
                {!NestedPanel && (
                  <button onClick={loadClubArenaData} disabled={caLoading} className={styles.subNavRefresh}>
                    {caLoading ? 'Refreshing' : 'Refresh'}
                  </button>
                )}
              </div>

              {NestedPanel ? (
                <NestedPanel
                  authFetch={authFetch}
                  showNotification={showNotification}
                  permissions={permissions}
                  operatorId={operatorId}
                  policy={policy}
                  aloneRule={aloneRule}
                  approvalsAvailable={approvalsAvailable}
                  onNavigate={onNavigate}
                  permissionsDegraded={permissionsDegraded}
                />
              ) : caError ? (
                <div className={styles.errorState}>
                  <div>Club Arena Data Unavailable: {caError}</div>
                  <button className={styles.actionBtn} onClick={loadClubArenaData}>Retry</button>
                </div>
              ) : caLoading && !caLoaded ? (
                <div className={styles.loadingSpinner}>Loading Club Arena Data</div>
              ) : (
                <>
                  {/* ── OVERVIEW ── (caStats was computed and never rendered) */}
                  {caSection === 'overview' && (
                    <>
                      <div className={styles.kpiGrid}>
                        {[
                          ['Clubs', caStats?.totalClubs],
                          ['Members', caStats?.totalMembers],
                          ['Live Tables', caStats?.totalTables],
                          ['Pending Cashouts', caStats?.pendingCashouts],
                          ['Cashout Total', caStats?.pendingCashoutTotal],
                          ['Chips Minted (24h)', caStats?.totalMinted24h],
                        ].map(([label, value]) => (
                          <div key={label} className={styles.kpi}>
                            <div className={styles.kpiValue}>{num(value)}</div>
                            <div className={styles.kpiLabel}>{label}</div>
                          </div>
                        ))}
                      </div>

                      <h3 className={styles.sectionTitle}>
                        Recent Chip Movement
                        <span className={styles.countPill}>{num(caFinance?.recentTxns?.length, '0')}</span>
                      </h3>
                      {(caFinance?.recentTxns || []).length === 0 ? (
                        <div className={styles.emptyState}>No Recent Chip Transactions.</div>
                      ) : (
                        <div className={styles.tableWrapper}>
                          <table className={styles.table}>
                            <thead><tr><th scope="col">Time</th><th scope="col">Club</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Notes</th></tr></thead>
                            <tbody>
                              {(caFinance?.recentTxns || []).slice(0, 25).map((txn, i) => (
                                <tr key={txn.id || i}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                  <td>{txn.club_name || '-'}</td>
                                  <td><span className={styles.voiceTag}>{txn.transaction_type || 'unknown'}</span></td>
                                  <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                    {signed(txn.amount)}
                                  </td>
                                  <td style={{ fontSize: 12, color: T.dim, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {txn.notes || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── CLUBS ── */}
                  {caSection === 'clubs' && !caSelectedClub && (
                    caClubs.length === 0 ? (
                      <div className={styles.emptyState}>No Clubs Found.</div>
                    ) : (
                      <>
                      <ShowingOf
                        truncated={caPages?.clubs?.truncated}
                        count={caClubs.length}
                        total={caPages?.clubs?.total}
                        noun="Clubs"
                      />
                      <div className={styles.cardGrid}>
                        {/* These cards used to be role="button" with a real
                            <button> nested inside, which ARIA forbids:
                            role="button" has presentational children, so the
                            Suspend control may not have been exposed at all.
                            The card is a plain container now and the club name
                            carries the activation, which also gets Space and
                            Enter for free. */}
                        {caClubs.map((club) => (
                          <div key={club.id} className={styles.card}>
                            <button type="button" className={styles.cardTitleBtn}
                              onClick={() => loadCaClubDetail(club)}>
                              {club.name}
                            </button>
                            <div style={{ fontSize: 12, color: T.dim, marginBottom: 10 }}>
                              Code {club.club_id || club.code || '-'} - {num(club.member_count, '0')} Members - {num(club.table_count, '0')} Tables
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
                              Owner {club.owner_name || '-'} - Created {when(club.created_at)}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{
                                background: club.status === 'active' ? T.accentSoft : T.dangerSoft,
                                color: club.status === 'active' ? T.accent : T.danger,
                                borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                              }}>{club.status || 'active'}</span>
                              <span style={{ fontSize: 11, color: T.muted }}>
                                Treasury {num(club.chip_treasury, '0')}
                              </span>
                              <button
                                className={styles.filterBtn}
                                style={{ marginLeft: 'auto' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCaSection('operations');
                                  setCaSelectedClub(null);
                                }}
                              >
                                Manage In Operations
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      </>
                    )
                  )}

                  {caSection === 'clubs' && caSelectedClub && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                        <button className={styles.filterBtn} onClick={() => { setCaSelectedClub(null); setCaClubDetail(null); }}>
                          All Clubs
                        </button>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{caSelectedClub.name}</span>
                          <span style={{ fontSize: 12, color: T.dim, marginLeft: 10 }}>
                            Code {caSelectedClub.club_id || '-'} - {num(caSelectedClub.member_count, '0')} Members
                          </span>
                        </div>
                        <button className={styles.filterBtn} style={{ marginLeft: 'auto' }}
                          onClick={() => loadCaClubDetail(caSelectedClub)} disabled={caLoading}>
                          Refresh
                        </button>
                      </div>

                      <div className={styles.subNav}>
                        {/* EVERY COUNT HERE IS THE ROUTE'S TOTAL, not the
                            length of the array that fitted under the page cap.
                            `memberCount` is a server-side count over all
                            members; pages.<list>.total covers the rest. A page
                            length rendered as "Members (50)" told the operator
                            a 1,200-member club had fifty. */}
                        {[
                          ['overview', 'Overview'],
                          ['members', `Members (${num(caClubDetail?.memberCount ?? caClubDetail?.pages?.members?.total, '0')})`],
                          ['agents', `Agents (${num(caClubDetail?.agentCount ?? caClubDetail?.pages?.agents?.total, '0')})`],
                          ['tables', `Tables (${num(caClubDetail?.tableCount ?? caClubDetail?.pages?.tables?.total, '0')})`],
                          ['cashouts', `Cashouts (${num(caClubDetail?.pages?.cashouts?.total ?? caClubDetail?.pendingCashouts?.length, '0')})`],
                          ['flags', `Flags (${num(caClubDetail?.flags?.length, '0')})`],
                          ['sessions', `Sessions (${num(caClubDetail?.sessions?.length, '0')})`],
                        ].map(([id, label]) => (
                          <button key={id} className={caClubTab === id ? styles.active : ''}
                            aria-current={caClubTab === id ? 'page' : undefined}
                            onClick={() => setCaClubTab(id)}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {caLoading || !caClubDetail ? (
                        <div className={styles.loadingSpinner}>Loading Club</div>
                      ) : caClubTab === 'overview' ? (
                        <>
                          {/* CHIPS ON BOOKS IS THE ROUTE'S FIGURE, NOT A SUM
                              OF THIS PAGE. It used to reduce over the first 50
                              members of the club and present the result as the
                              club's chips on books - a fabricated balance, on
                              the tab that exists to make chip movement
                              answerable. `memberChipTotal` is summed
                              server-side over every member (addendum item 11).
                              Where the route has not sent one, the tile says
                              the number is unknown rather than showing a page
                              sum that looks like a balance. */}
                          <div className={styles.kpiGrid}>
                            {[
                              ['Members', caClubDetail.memberCount ?? caClubDetail.pages?.members?.total],
                              ['Agents', caClubDetail.agentCount ?? caClubDetail.pages?.agents?.total],
                              ['Tables', caClubDetail.tableCount ?? caClubDetail.pages?.tables?.total],
                              ['Pending Cashouts', caClubDetail.pages?.cashouts?.total],
                              ['Chips On Books', caClubDetail.memberChipTotal ?? null],
                            ].map(([label, value]) => (
                              <div key={label} className={styles.kpi}>
                                <div className={styles.kpiValue}>{num(value)}</div>
                                <div className={styles.kpiLabel}>
                                  {label}
                                  {label === 'Chips On Books' && caClubDetail.memberChipTotalScope
                                    ? ` (${caClubDetail.memberChipTotalScope})` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                          {caClubDetail.memberChipTotalTruncated && (
                            <div className={styles.warnBanner}>
                              Chips On Books Was Summed Over The First{' '}
                              {num(caClubDetail.memberChipTotalRowsRead)} Members This Club Has, So It
                              Is A Floor Rather Than The Whole Balance.
                            </div>
                          )}
                          <h3 className={styles.sectionTitle}>Recent Transactions</h3>
                          {(caClubDetail.recentTxns || []).length === 0 ? (
                            <div className={styles.emptyState}>No Recent Transactions.</div>
                          ) : (
                            <div className={styles.tableWrapper}>
                              <table className={styles.table}>
                                <thead><tr><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Notes</th></tr></thead>
                                <tbody>
                                  {caClubDetail.recentTxns.map((txn, i) => (
                                    <tr key={txn.id || i}>
                                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                      <td>{txn.transaction_type || 'unknown'}</td>
                                      <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                        {signed(txn.amount)}
                                      </td>
                                      <td style={{ fontSize: 12, color: T.dim }}>{txn.notes || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ) : caClubTab === 'members' ? (
                        (caClubDetail.members || []).length === 0 ? (
                          <div className={styles.emptyState}>No Members In This Club.</div>
                        ) : (
                          <>
                          <ShowingOf
                            truncated={caClubDetail.pages?.members?.truncated}
                            count={caClubDetail.members.length}
                            total={caClubDetail.memberCount ?? caClubDetail.pages?.members?.total}
                            noun="Members"
                          />
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th scope="col">Player</th><th scope="col">Role</th><th scope="col">Chips</th><th scope="col">Hands</th><th scope="col">Status</th><th scope="col">Joined</th></tr></thead>
                              <tbody>
                                {caClubDetail.members.map((m) => (
                                  // club_members has a COMPOSITE key and no id column;
                                  // the API returns row_key for exactly this reason.
                                  <tr key={m.row_key}>
                                    <td>
                                      <div style={{ fontWeight: 600 }}>{m.player_name}</div>
                                      {m.email && <div style={{ fontSize: 11, color: T.muted }}>{m.email}</div>}
                                    </td>
                                    <td><span className={styles.voiceTag}>{m.role || 'member'}</span></td>
                                    <td style={{ fontWeight: 600, color: T.accent }}>{num(m.chip_balance, '0')}</td>
                                    <td>{num(m.hands_played, '0')}</td>
                                    <td style={{ color: m.status === 'active' ? T.accent : T.dim }}>{m.status || '-'}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(m.joined_at || m.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          </>
                        )
                      ) : caClubTab === 'agents' ? (
                        (caClubDetail.agents || []).length === 0 ? (
                          <div className={styles.emptyState}>No Agents In This Club.</div>
                        ) : (
                          <>
                          <ShowingOf
                            truncated={caClubDetail.pages?.agents?.truncated}
                            count={caClubDetail.agents.length}
                            total={caClubDetail.pages?.agents?.total}
                            noun="Agents"
                          />
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th scope="col">Agent</th><th scope="col">Role</th><th scope="col">Commission</th><th scope="col">Credit Used</th><th scope="col">Players</th><th scope="col">Status</th></tr></thead>
                              <tbody>
                                {caClubDetail.agents.map((a) => (
                                  <tr key={a.id}>
                                    <td style={{ fontWeight: 600 }}>{a.player_name}</td>
                                    <td><span className={styles.voiceTag}>{a.role || 'agent'}</span></td>
                                    <td>{a.commission_rate !== null && a.commission_rate !== undefined
                                      ? `${(Number(a.commission_rate) * 100).toFixed(0)}%` : '-'}</td>
                                    <td>{num(a.credit_used, '0')} / {num(a.credit_limit, '0')}</td>
                                    <td>{num(a.total_players, '0')}</td>
                                    <td style={{ color: a.status === 'active' ? T.accent : T.dim }}>{a.status || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          </>
                        )
                      ) : caClubTab === 'tables' ? (
                        (caClubDetail.tables || []).length === 0 ? (
                          <div className={styles.emptyState}>No Tables In This Club.</div>
                        ) : (
                          <>
                          <ShowingOf
                            truncated={caClubDetail.pages?.tables?.truncated}
                            count={caClubDetail.tables.length}
                            total={caClubDetail.pages?.tables?.total}
                            noun="Tables"
                          />
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th scope="col">Table</th><th scope="col">Game</th><th scope="col">Stakes</th><th scope="col">Seats</th><th scope="col">Status</th><th scope="col">Created</th></tr></thead>
                              <tbody>
                                {caClubDetail.tables.map((t) => (
                                  <tr key={t.id}>
                                    <td style={{ fontWeight: 600 }}>{t.name || `Table ${String(t.id).slice(0, 8)}`}</td>
                                    <td>{t.game_type || '-'}</td>
                                    <td>{t.stakes || '-'}</td>
                                    {/* max_players, not max_seats - the old query 42703'd on this column. */}
                                    <td>{num(t.current_players, '0')} / {num(t.max_players)}</td>
                                    <td style={{ color: ['running', 'active'].includes(t.status) ? T.accent : T.dim }}>
                                      {t.status || 'inactive'}
                                    </td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(t.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          </>
                        )
                      ) : caClubTab === 'flags' ? (
                        /* reviewFlag() has existed in this file with no caller
                           since the tab was written. The anti-cheat route
                           exposes nine actions and the console reached two. */
                        (caClubDetail.flags || []).length === 0 ? (
                          <div className={styles.emptyState}>
                            {caClubDetail.securityError
                              ? `Flags Unavailable: ${caClubDetail.securityError}`
                              : 'No Open Anti-Cheat Flags For This Club.'}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {caClubDetail.flags.map((flag) => (
                              <div key={flag.id} className={styles.card} style={{
                                borderLeft: `4px solid ${flag.severity === 'high' ? T.danger
                                  : flag.severity === 'medium' ? T.warn : T.line}`,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                                  <span style={{
                                    background: flag.severity === 'high' ? T.dangerSoft : T.warnSoft,
                                    color: flag.severity === 'high' ? T.danger : T.warn,
                                    borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                                    textTransform: 'uppercase',
                                  }}>{flag.severity || 'low'}</span>
                                  <span style={{ fontWeight: 600, color: T.text }}>{flag.flag_type || 'flag'}</span>
                                  <span style={{ fontSize: 11, color: T.muted, marginLeft: 'auto' }}>
                                    {when(flag.created_at || flag.flagged_at, true)}
                                  </span>
                                </div>
                                <div style={{ fontSize: 13, color: T.dim, marginBottom: 10 }}>
                                  Player <strong style={{ color: T.text }}>{flag.player_name || flag.user_id || 'unknown'}</strong>
                                  {flag.description && <> - {flag.description}</>}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button className={styles.filterBtn} disabled={caProcessing || !canModerate}
                                    onClick={() => reviewFlag(flag, 'dismiss')}>Dismiss</button>
                                  <button className={styles.filterBtn} disabled={caProcessing || !canModerate}
                                    onClick={() => reviewFlag(flag, 'reviewed')}>Mark Reviewed</button>
                                  <button className={styles.btnDanger} disabled={caProcessing || !canModerate}
                                    onClick={() => reviewFlag(flag, 'kick')}>Kick Player</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : caClubTab === 'sessions' ? (
                        (caClubDetail.sessions || []).length === 0 ? (
                          <div className={styles.emptyState}>
                            {caClubDetail.securityError
                              ? `Sessions Unavailable: ${caClubDetail.securityError}`
                              : 'No Active Sessions At This Club Right Now.'}
                          </div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Players Currently Seated At This Club</caption>
                              <thead><tr>
                                <th scope="col">Player</th><th scope="col">Table</th>
                                <th scope="col">Duration</th><th scope="col">Action</th>
                              </tr></thead>
                              <tbody>
                                {caClubDetail.sessions.map((session, i) => (
                                  <tr key={session.id || i}>
                                    <td style={{ fontWeight: 600 }}>{session.player_name || session.user_id || 'unknown'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                      {session.table_id ? String(session.table_id).slice(0, 8) : '-'}
                                    </td>
                                    <td>{session.duration_minutes !== undefined && session.duration_minutes !== null
                                      ? `${num(session.duration_minutes)}m` : '-'}</td>
                                    <td>
                                      <button className={styles.btnDanger} disabled={caProcessing || !canModerate}
                                        onClick={() => kickSession(session)}>Kick</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : (
                        (caClubDetail.pendingCashouts || []).length === 0 ? (
                          <div className={styles.emptyState}>No Pending Cashouts For This Club.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th scope="col">Player</th><th scope="col">Amount</th><th scope="col">Requested</th><th scope="col">Note</th><th scope="col">Action</th></tr></thead>
                              <tbody>
                                {caClubDetail.pendingCashouts.map((c) => (
                                  <tr key={c.id}>
                                    <td style={{ fontWeight: 600 }}>{c.player_name}</td>
                                    <td style={{ fontWeight: 700, color: T.warn }}>{num(c.amount)}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(c.created_at, true)}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{c.agent_note || c.player_note || '-'}</td>
                                    <td>
                                      {c.pendingApprovalId ? (
                                        <span title={`Approval ${c.pendingApprovalId}`}>
                                          <StatusPill tone="warn" label="Waiting For Approval" />
                                          {approvalsAvailable ? (
                                            <button type="button" className={styles.filterBtn}
                                              onClick={() => onNavigate('approvals')}>
                                              Open Approval
                                            </button>
                                          ) : null}
                                        </span>
                                      ) : (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                          <button className={styles.filterBtn} disabled={caProcessing || !canCashierWrite}
                                            onClick={() => resolveCashout(c, 'approve')}>Approve</button>
                                          <button className={styles.filterBtn} disabled={caProcessing || !canCashierWrite}
                                            onClick={() => resolveCashout(c, 'cancel')}>Return Chips</button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </>
                  )}

                  {/* ── FINANCE ── (caFinance and caPendingCashouts had no UI at all) */}
                  {caSection === 'finance' && (
                    <>
                      <div className={styles.kpiGrid}>
                        <div className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color: T.accent }}>{num(caFinance?.totalMinted24h)}</div>
                          <div className={styles.kpiLabel}>Chips Minted (24h)</div>
                        </div>
                        <div className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color: T.warn }}>{num(caFinance?.pendingCashoutTotal)}</div>
                          <div className={styles.kpiLabel}>
                            Pending Cashout Total
                            {/* The route caps this sum and says when it hit the
                                cap. A floor shown as a total is how a payout
                                queue looks smaller than it is. */}
                            {caStats?.pendingCashoutTotalTruncated ? ' (Floor, Sum Capped)' : ''}
                          </div>
                        </div>
                        <div className={styles.kpi}>
                          {/* The exact platform count - the same figure the
                              Overview tile shows. This used to be
                              caPendingCashouts.length, a page capped at 100, so
                              two near-identical labels carried two different
                              numbers and the smaller one was on the screen an
                              operator works from. */}
                          <div className={styles.kpiValue}>{num(caStats?.pendingCashouts)}</div>
                          <div className={styles.kpiLabel}>Cashout Requests</div>
                        </div>
                      </div>

                      {caStats?.pendingCashoutTotalTruncated && (
                        <div className={styles.warnBanner}>
                          The Pending Cashout Total Is Summed Over A Capped Read, So It Is A Floor.
                          The Real Figure Is At Least This Large.
                        </div>
                      )}

                      <h3 className={styles.sectionTitle}>
                        Pending Cashouts
                        {(caStats?.pendingCashouts || 0) > 0 && (
                          <span className={`${styles.countPill} ${styles.warnPill}`}>{num(caStats.pendingCashouts)}</span>
                        )}
                      </h3>
                      <ShowingOf
                        truncated={caPages?.cashouts?.truncated}
                        count={caPendingCashouts.length}
                        total={caPages?.cashouts?.total ?? caStats?.pendingCashouts}
                        noun="Cashout Requests"
                      />
                      {caPendingCashouts.length === 0 ? (
                        <div className={styles.emptyState}>No Pending Cashouts Anywhere On The Platform.</div>
                      ) : (
                        <div className={styles.tableWrapper}>
                          <table className={styles.table}>
                            <thead><tr><th scope="col">Club</th><th scope="col">Player</th><th scope="col">Amount</th><th scope="col">Requested</th><th scope="col">Note</th><th scope="col">Action</th></tr></thead>
                            <tbody>
                              {caPendingCashouts.map((c) => (
                                <tr key={c.id}>
                                  <td>{c.club_name || '-'}</td>
                                  <td style={{ fontWeight: 600 }}>{c.player_name}</td>
                                  <td style={{ fontWeight: 700, color: T.warn }}>{num(c.amount)}</td>
                                  <td style={{ fontSize: 12, color: T.dim }}>{when(c.created_at, true)}</td>
                                  <td style={{ fontSize: 12, color: T.dim, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.agent_note || c.player_note || '-'}
                                  </td>
                                  <td>
                                    {c.pendingApprovalId ? (
                                      <span title={`Approval ${c.pendingApprovalId}`}>
                                        <StatusPill tone="warn" label="Waiting For Approval" />
                                        {approvalsAvailable ? (
                                          <button type="button" className={styles.filterBtn}
                                            onClick={() => onNavigate('approvals')}>
                                            Open Approval
                                          </button>
                                        ) : null}
                                      </span>
                                    ) : (
                                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        <button className={styles.filterBtn} disabled={caProcessing || !canCashierWrite}
                                          onClick={() => resolveCashout(c, 'approve')}>Approve</button>
                                        <button className={styles.filterBtn} disabled={caProcessing || !canCashierWrite}
                                          onClick={() => resolveCashout(c, 'cancel')}>Return Chips</button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <h3 className={styles.sectionTitle}>Recent Chip Movement</h3>
                      {(caFinance?.recentTxns || []).length === 0 ? (
                        <div className={styles.emptyState}>No Recent Transactions.</div>
                      ) : (
                        <div className={styles.tableWrapper} style={{ maxHeight: 420, overflowY: 'auto' }}>
                          <table className={styles.table}>
                            <thead><tr><th scope="col">Time</th><th scope="col">Club</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Notes</th></tr></thead>
                            <tbody>
                              {caFinance.recentTxns.map((txn, i) => (
                                <tr key={txn.id || i}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                  <td>{txn.club_name || '-'}</td>
                                  <td>{txn.transaction_type || 'unknown'}</td>
                                  <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                    {signed(txn.amount)}
                                  </td>
                                  <td style={{ fontSize: 12, color: T.dim }}>{txn.notes || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── REVENUE ──
                      rake_records holds 1.37M rows and 4,028,434 chips of rake
                      all time, and had NO surface anywhere in this console.
                      The Cashouts section headlined "Chips Minted (24h)" -- a
                      zero -- while nearly 200,000 chips of rake moved in that
                      same window, invisible. */}
                  {caSection === 'revenue' && (
                    caRevenueError ? (
                      <div className={styles.errorState} role="alert">
                        <div>Revenue Unavailable: {caRevenueError}</div>
                        <button className={styles.actionBtn} onClick={loadCaRevenue}>Retry</button>
                      </div>
                    ) : caRevenueLoading || !caRevenue ? (
                      <div className={styles.loadingSpinner}>Loading Revenue</div>
                    ) : (
                      <>
                        <div className={styles.kpiGrid}>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: T.accent }}>{num(caRevenue.rake24h?.total)}</div>
                            <div className={styles.kpiLabel}>Rake (24h)</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue}>{num(caRevenue.rake7d?.total)}</div>
                            <div className={styles.kpiLabel}>Rake (7d)</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: T.warn }}>{num(caRevenue.rake24h?.bbj)}</div>
                            <div className={styles.kpiLabel}>Into BBJ (24h)</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue}>{num(caRevenue.rake24h?.handCount ?? caRevenue.rake24h?.hands)}</div>
                            <div className={styles.kpiLabel}>Raked Hands (24h)</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: T.warn }}>
                              {num(caRevenue.unsettledCommissions?.total)}
                            </div>
                            <div className={styles.kpiLabel}>Unsettled Commission</div>
                          </div>
                        </div>

                        {(caRevenue.rake24h?.truncated || caRevenue.rake7d?.truncated
                          || caRevenue.unsettledCommissions?.truncated) && (
                          <div className={styles.warnBanner}>
                            One Or More Of These Totals Is Summed Over The Most Recent{' '}
                            {num(caRevenue.pageSize)} Rows Only, So It Is A Floor Rather Than An Exact
                            Figure. PostgREST Aggregate Functions Are Disabled On This Project, So The
                            Sums Are Computed Row By Row.
                          </div>
                        )}

                        <h3 className={styles.sectionTitle}>
                          Rake By Club (24h)
                          <button className={styles.filterBtn} style={{ marginLeft: 'auto' }}
                            onClick={() => {
                              downloadCsv(stampedName('rake-by-club'), toCsv(caRevenue.byClub || [], [
                                ['club_name', 'Club'], ['club_id', 'Club ID'],
                                ['rake', 'Rake'], ['bbj', 'BBJ'], ['hands', 'Hands'],
                              ]));
                              showNotification('Exported Rake By Club');
                            }}>Export CSV</button>
                        </h3>
                        {(caRevenue.byClub || []).length === 0 ? (
                          <div className={styles.emptyState}>No Rake Recorded In The Last 24 Hours.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Rake Taken Per Club Over The Last 24 Hours</caption>
                              <thead><tr>
                                <th scope="col">Club</th><th scope="col">Rake</th>
                                <th scope="col">Into BBJ</th><th scope="col">Hands</th>
                              </tr></thead>
                              <tbody>
                                {caRevenue.byClub.map((c) => (
                                  <tr key={c.club_id}>
                                    <td>{c.club_name || <span style={{ color: T.muted }}>Unattributed</span>}</td>
                                    <td style={{ fontWeight: 700, color: T.accent }}>{num(c.rake)}</td>
                                    <td style={{ color: T.warn }}>{num(c.bbj)}</td>
                                    <td>{num(c.hands)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <h3 className={styles.sectionTitle}>
                          Unsettled Agent Commission
                          {caRevenue.unsettledCommissions?.rowCount > 0 && (
                            <span className={`${styles.countPill} ${styles.warnPill}`}>
                              {num(caRevenue.unsettledCommissions.rowCount)} Rows
                            </span>
                          )}
                        </h3>
                        {(caRevenue.unsettledCommissions?.byAgent || []).length === 0 ? (
                          <div className={styles.emptyState}>Nothing Outstanding.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Agent Commission That Has Not Been Settled</caption>
                              <thead><tr>
                                <th scope="col">Agent</th><th scope="col">Club</th>
                                <th scope="col">Owed</th><th scope="col">Entries</th>
                              </tr></thead>
                              <tbody>
                                {caRevenue.unsettledCommissions.byAgent.map((a) => (
                                  <tr key={a.user_id || 'unassigned'}>
                                    <td style={{ fontWeight: 600 }}>{a.agent_name}</td>
                                    <td>{a.club_name || '-'}</td>
                                    <td style={{ fontWeight: 700, color: T.warn }}>{num(a.amount)}</td>
                                    <td>{num(a.rows)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )
                  )}

                  {/* ── LEDGER ──
                      reconcile_ledger_nightly has been filing drift into
                      ledger_reconcile_log every morning and nothing had ever
                      read it. CLAUDE.md section 11.5 built this machinery
                      specifically so chip loss would be LOUD; it was silent
                      because the only surface that could have shown it did not
                      query it. */}
                  {caSection === 'ledger' && (
                    caLedgerError ? (
                      <div className={styles.errorState} role="alert">
                        <div>Ledger Unavailable: {caLedgerError}</div>
                        <button className={styles.actionBtn} onClick={loadCaLedger}>Retry</button>
                      </div>
                    ) : caLedgerLoading || !caLedger ? (
                      <div className={styles.loadingSpinner}>Loading Ledger Reconciliation</div>
                    ) : (
                      <>
                        {caLedger.counts?.critical > 0 && (
                          <div className={styles.errorState} role="alert" style={{ textAlign: 'left' }}>
                            <strong>{num(caLedger.counts.critical)} Critical Reconciliation Rows.</strong>{' '}
                            The Nightly Job Found The Chip Ledger And The Stored Balances Disagreeing.
                            Every Row Below Is A Wallet Whose Recorded History Does Not Add Up To Its Balance.
                          </div>
                        )}

                        <div className={styles.kpiGrid}>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: caLedger.counts?.critical > 0 ? T.danger : T.accent }}>
                              {num(caLedger.counts?.critical)}
                            </div>
                            <div className={styles.kpiLabel}>Critical</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: T.warn }}>{num(caLedger.counts?.warn)}</div>
                            <div className={styles.kpiLabel}>Warnings</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: caLedger.counts?.unaccountedSeatExits > 0 ? T.danger : T.accent }}>
                              {num(caLedger.counts?.unaccountedSeatExits)}
                            </div>
                            <div className={styles.kpiLabel}>Unaccounted Seat Exits</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ fontSize: 15 }}>{when(caLedger.lastRun?.run_ts, true)}</div>
                            <div className={styles.kpiLabel}>Last Reconciliation</div>
                          </div>
                        </div>

                        {/* THE TRUNCATION FLAGS ARE THE POINT OF THIS PANEL.
                            This is the one surface built to make chip loss
                            loud; a capped list reading as complete here is the
                            failure mode it exists to prevent. All three flags
                            were returned and discarded. */}
                        {caLedger.rpcRowCap && (
                          <div className={styles.warnBanner}>
                            The Reconciliation RPC Returns At Most {num(caLedger.rpcRowCap)} Rows Per
                            Call, So Every List Below Is A Sample Of The Run And Not The Run.
                          </div>
                        )}

                        {caLedger.circulation?.length > 0 && (
                          <>
                            <h3 className={styles.sectionTitle}>Chip Circulation</h3>
                            <ShowingOf
                              truncated={caLedger.circulationTruncated}
                              count={caLedger.circulation.length}
                              total={caLedger.counts?.circulation}
                              noun="Clubs"
                            />
                            <div className={styles.tableWrapper}>
                              <table className={styles.table}>
                                <caption className={styles.srOnly}>Where The Chips Are, Per Club</caption>
                                <thead><tr>
                                  <th scope="col">Club</th><th scope="col">Member Wallets</th>
                                  <th scope="col">On The Felt</th><th scope="col">Treasury</th><th scope="col">Total</th>
                                </tr></thead>
                                <tbody>
                                  {caLedger.circulation.map((c, i) => (
                                    <tr key={c.club_id || i}>
                                      <td>{c.club_name || '-'}</td>
                                      <td>{num(c.member_wallets)}</td>
                                      <td>{num(c.on_the_felt)}</td>
                                      <td>{num(c.treasury)}</td>
                                      <td style={{ fontWeight: 700, color: T.accent }}>{num(c.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}

                        <h3 className={styles.sectionTitle}>
                          Largest Drift
                          <span className={styles.countPill}>
                            Top {num(caLedger.sampleSize)} Of {num(caLedger.counts?.critical)}
                          </span>
                          {/* THE FILE SAYS WHAT IT IS. This exports
                              caLedger.critical - the SAMPLE the route sends,
                              not the set - and an auditor was getting ~200 rows
                              of a 20,000-row problem with nothing in the file
                              or the toast admitting it. A sampling row is
                              written into the CSV itself, because the toast is
                              gone four seconds later and the file is not. */}
                          <button className={styles.filterBtn} style={{ marginLeft: 'auto' }}
                            onClick={() => {
                              const rows = caLedger.critical || [];
                              const total = caLedger.counts?.critical;
                              const partial = typeof total === 'number' && total > rows.length;
                              const noteRow = partial ? [{
                                run_date: '',
                                entity_type: 'EXPORT NOTE',
                                entity_id: '',
                                entity_name: `Sample Of ${rows.length} Rows Out Of ${total} Critical Rows. This File Is NOT The Whole Set.`,
                                ledger_balance: '', stored_balance: '', drift: '',
                                severity: '', notes: '',
                              }] : [];
                              downloadCsv(stampedName('ledger-drift'), toCsv([...noteRow, ...rows], [
                                ['run_date', 'Run Date'], ['entity_type', 'Entity Type'],
                                ['entity_id', 'Entity ID'], ['entity_name', 'Name'],
                                ['ledger_balance', 'Ledger Balance'], ['stored_balance', 'Stored Balance'],
                                ['drift', 'Drift'], ['severity', 'Severity'], ['notes', 'Notes'],
                              ]));
                              showNotification(
                                partial
                                  ? `Exported ${num(rows.length)} Of ${num(total)} Critical Rows. This Is The Sample, Not The Set.`
                                  : `Exported ${num(rows.length)} Critical Rows`,
                                partial ? 'info' : 'success',
                              );
                            }}>Export CSV</button>
                        </h3>
                        {(caLedger.critical || []).length === 0 ? (
                          <div className={styles.emptyState}>No Critical Drift. The Ledger Reconciles.</div>
                        ) : (
                          <div className={styles.tableWrapper} style={{ maxHeight: 520, overflowY: 'auto' }}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Wallets With The Largest Drift Between Ledger And Stored Balance</caption>
                              <thead><tr>
                                <th scope="col">Entity</th><th scope="col">Type</th>
                                <th scope="col">Ledger</th><th scope="col">Stored</th>
                                <th scope="col">Drift</th><th scope="col">Run</th>
                              </tr></thead>
                              <tbody>
                                {caLedger.critical.map((r) => (
                                  <tr key={r.id}>
                                    <td>
                                      <div style={{ fontWeight: 600 }}>{r.entity_name || '-'}</div>
                                      <div style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>
                                        {r.entity_id ? String(r.entity_id).slice(0, 8) : ''}
                                      </div>
                                    </td>
                                    <td>{r.entity_type}</td>
                                    <td>{num(r.ledger_balance)}</td>
                                    <td>{num(r.stored_balance)}</td>
                                    <td style={{ fontWeight: 700, color: Number(r.drift) < 0 ? T.danger : T.warn }}>
                                      {signed(r.drift)}
                                    </td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(r.run_date)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <h3 className={styles.sectionTitle}>
                          Unaccounted Seat Exits
                          <span style={{ color: T.dim, fontWeight: 400, fontSize: 13 }}>Last 7 Days</span>
                        </h3>
                        <ShowingOf
                          truncated={caLedger.unaccountedSeatExitsTruncated}
                          count={(caLedger.unaccountedSeatExits || []).length}
                          total={caLedger.counts?.unaccountedSeatExits}
                          noun="Seat Exits"
                        />
                        {(caLedger.unaccountedSeatExits || []).length === 0 ? (
                          <div className={styles.emptyState}>
                            Every Non-Zero Stack That Left A Seat Has A Matching Wallet Credit.
                          </div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Stacks That Left A Seat With No Matching Wallet Credit</caption>
                              <thead><tr>
                                <th scope="col">When</th><th scope="col">Player</th>
                                <th scope="col">Stack</th><th scope="col">Exit</th>
                                <th scope="col">Role</th><th scope="col">Application</th>
                              </tr></thead>
                              <tbody>
                                {caLedger.unaccountedSeatExits.map((e) => (
                                  <tr key={e.exit_id || e.id}>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(e.occurred_at, true)}</td>
                                    <td style={{ fontWeight: 600 }}>{e.player_name}</td>
                                    <td style={{ fontWeight: 700, color: T.danger }}>{num(e.stack)}</td>
                                    <td>{e.exit_kind || '-'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.db_role || '-'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.app_name || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )
                  )}

                  {/* ── USERS ── (searchCaUsers and loadCaUserDetail were unreachable) */}
                  {caSection === 'users' && (
                    <>
                      <form
                        onSubmit={(e) => { e.preventDefault(); searchCaUsers(caUserSearch); }}
                        style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}
                      >
                        <input
                          type="search" value={caUserSearch}
                          onChange={(e) => setCaUserSearch(e.target.value)}
                          placeholder="Search By Name, Username, Email Or Player Number"
                          className={styles.searchInput}
                          style={{ flex: 1, minWidth: 240 }}
                          aria-label="Search Players"
                        />
                        <button type="submit" className={styles.actionBtn} disabled={caUserSearching}>
                          {caUserSearching ? 'Searching' : 'Search'}
                        </button>
                      </form>

                      {caSelectedUser ? (
                        <>
                          <button className={styles.filterBtn} style={{ marginBottom: 16 }}
                            onClick={() => setCaSelectedUser(null)}>Back To Results</button>
                          <div className={styles.card}>
                            <div style={{ fontWeight: 700, fontSize: 17, color: T.text }}>
                              {caSelectedUser.profile?.display_name || caSelectedUser.display_name || 'Unknown'}
                            </div>
                            <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
                              @{caSelectedUser.profile?.username || caSelectedUser.username || 'unknown'}
                              {' - '}{caSelectedUser.profile?.email || caSelectedUser.email || 'No Email'}
                              {' - '}Player #{num(caSelectedUser.profile?.player_number ?? caSelectedUser.player_number)}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
                              Role {caSelectedUser.profile?.role || caSelectedUser.role || 'user'}
                              {' - '}Diamonds {num(caSelectedUser.profile?.diamonds ?? caSelectedUser.diamonds)}
                              {' - '}Joined {when(caSelectedUser.profile?.created_at || caSelectedUser.created_at)}
                            </div>
                          </div>

                          {caSelectedUser.loading ? (
                            <div className={styles.loadingSpinner}>Loading Player</div>
                          ) : (
                            <>
                              <h3 className={styles.sectionTitle}>
                                Club Memberships
                                <span className={styles.countPill}>{num(caSelectedUser.memberships?.length, '0')}</span>
                              </h3>
                              {(caSelectedUser.memberships || []).length === 0 ? (
                                <div className={styles.emptyState}>Not A Member Of Any Club.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th scope="col">Club</th><th scope="col">Role</th><th scope="col">Chips</th><th scope="col">Hands</th><th scope="col">Status</th><th scope="col">Joined</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.memberships.map((m) => (
                                        <tr key={m.row_key}>
                                          <td>{m.club_name || '-'} <span style={{ color: T.muted, fontSize: 11 }}>{m.club_code || ''}</span></td>
                                          <td><span className={styles.voiceTag}>{m.role || 'member'}</span></td>
                                          <td style={{ color: T.accent, fontWeight: 600 }}>{num(m.chip_balance, '0')}</td>
                                          <td>{num(m.hands_played, '0')}</td>
                                          <td>{m.status || '-'}</td>
                                          <td style={{ fontSize: 12, color: T.dim }}>{when(m.joined_at || m.created_at)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <h3 className={styles.sectionTitle}>Chip Transactions</h3>
                              {(caSelectedUser.txns || []).length === 0 ? (
                                <div className={styles.emptyState}>No Chip Transactions.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th scope="col">Time</th><th scope="col">Club</th><th scope="col">Direction</th><th scope="col">Type</th><th scope="col">Amount</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.txns.map((t, i) => (
                                        <tr key={t.id || i}>
                                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(t.created_at, true)}</td>
                                          <td>{t.club_name || '-'}</td>
                                          <td style={{ color: t.direction === 'in' ? T.accent : T.danger }}>
                                            {t.direction === 'in' ? 'Received' : 'Sent'}
                                          </td>
                                          <td>{t.transaction_type || 'unknown'}</td>
                                          <td style={{ fontWeight: 700 }}>{num(t.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <h3 className={styles.sectionTitle}>Cashout History</h3>
                              {(caSelectedUser.cashouts || []).length === 0 ? (
                                <div className={styles.emptyState}>No Cashout Requests.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th scope="col">Time</th><th scope="col">Club</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.cashouts.map((c) => (
                                        <tr key={c.id}>
                                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(c.created_at, true)}</td>
                                          <td>{c.club_name || '-'}</td>
                                          <td style={{ fontWeight: 700 }}>{num(c.amount)}</td>
                                          <td style={{ color: c.status === 'pending' ? T.warn : T.dim }}>{c.status || '-'}</td>
                                          <td style={{ fontSize: 12, color: T.dim }}>{c.agent_note || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      ) : caUserResults.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caUserSearch.trim().length >= 2 && !caUserSearching
                            ? 'No Players Match That Search.'
                            : 'Search For A Player To Inspect Their Clubs, Chips And Cashouts.'}
                        </div>
                      ) : (
                        <div className={styles.cardGrid}>
                          {/* Same change as the club cards: a real button
                              carries the activation instead of a div with
                              role="button" and an Enter-only key handler. */}
                          {caUserResults.map((u) => (
                            <div key={u.id} className={styles.card}>
                              <button type="button" className={styles.cardTitleBtn}
                                onClick={() => loadCaUserDetail(u)}>
                                {u.display_name || u.username || 'Unknown'}
                              </button>
                              <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{u.email || 'No Email'}</div>
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                                Player #{num(u.player_number)} - {u.role || 'user'}
                                {u.is_vip ? ` - ${u.vip_tier || 'VIP'}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── UNIONS ── (caUnions was loaded and never rendered) */}
                  {caSection === 'unions' && (
                    caUnions.length === 0 ? (
                      <div className={styles.emptyState}>No Unions Found.</div>
                    ) : (
                      <>
                      <ShowingOf
                        truncated={caPages?.unions?.truncated}
                        count={caUnions.length}
                        total={caPages?.unions?.total}
                        noun="Unions"
                      />
                      <div className={styles.cardGrid}>
                        {caUnions.map((u) => (
                          <div key={u.id} className={styles.card}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{u.name}</div>
                            <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
                              Code {u.union_code || u.code || '-'}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>
                              {num(u.club_count, '0')} Clubs - {num(u.member_count, '0')} Members
                            </div>
                            <div style={{ fontSize: 12, color: T.accent, marginTop: 4 }}>
                              Chip Balance {num(u.chip_balance, '0')}
                            </div>
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>Created {when(u.created_at)}</div>
                          </div>
                        ))}
                      </div>
                      </>
                    )
                  )}

                  {/* ── APPROVALS ── */}
                  {caSection === 'approvals' && (
                    <>
                      <h3 className={styles.sectionTitle}>
                        Union Applications
                        {pendingAppCount > 0 && <span className={`${styles.countPill} ${styles.warnPill}`}>{pendingAppCount} Pending</span>}
                      </h3>
                      <div className={styles.filterBar}>
                        {['pending', 'all'].map((f) => (
                          <button key={f} className={`${styles.filterBtn} ${caAppTab === f ? styles.active : ''}`} aria-pressed={caAppTab === f}
                            onClick={() => { setCaAppTab(f); loadApplications(f); }}>
                            {f === 'pending' ? 'Pending' : 'All'}
                          </button>
                        ))}
                        <button className={styles.filterBtn} onClick={() => loadApplications(caAppTab)} disabled={caAppLoading}>
                          Refresh
                        </button>
                      </div>

                      {caAppLoading ? (
                        <div className={styles.loadingSpinner}>Loading Applications</div>
                      ) : caApplications.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caAppTab === 'pending' ? 'No Pending Applications.' : 'No Applications Found.'}
                        </div>
                      ) : caApplications.map((app) => (
                        <div key={app.id} className={styles.card} style={{
                          // T.warn, not a raw rgba literal. The file header
                          // rule is that colours come from horsesAdminTokens.
                          borderColor: app.status === 'pending' ? T.warn : T.line,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{app.club_name}</span>
                            <span style={{ fontSize: 12, color: T.dim }}>Club {app.club_code}</span>
                            <span style={{
                              background: app.status === 'pending' ? T.warnSoft : app.status === 'approved' ? T.accentSoft : T.dangerSoft,
                              color: app.status === 'pending' ? T.warn : app.status === 'approved' ? T.accent : T.danger,
                              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            }}>{app.status || 'unknown'}</span>
                          </div>
                          {/* The owner line is gone. union_applications rows
                              carry no `profiles` embed - the list branch of
                              union-application selects '*, unions(name)' and
                              nothing else - so these two expressions were dead
                              in every case and the card promised an identity it
                              never had. It comes back when the route attaches
                              profiles the way list_leave_requests does. */}
                          <div style={{ fontSize: 12, color: T.dim }}>
                            {num(app.member_count, '0')} Members - Applied {when(app.applied_at)}
                          </div>
                          {app.message && (
                            <div style={{
                              marginTop: 10, background: T.inset, borderRadius: 8, padding: '10px 14px',
                              fontSize: 13, color: T.dim, borderLeft: `3px solid ${T.accent}`, fontStyle: 'italic',
                            }}>{app.message}</div>
                          )}
                          {app.review_note && (
                            <div style={{ marginTop: 6, fontSize: 12, color: T.muted }}>Review Note: {app.review_note}</div>
                          )}
                          {app.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
                              <label style={{ fontSize: 12, color: T.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Commission %
                                <input
                                  type="number" min="0" max="100" step="1"
                                  value={caAppCommission[app.id] ?? '90'}
                                  onChange={(e) => setCaAppCommission((prev) => ({ ...prev, [app.id]: e.target.value }))}
                                  style={{
                                    width: 64, background: T.inset, border: `1px solid ${T.line}`,
                                    borderRadius: 6, color: T.text, fontSize: 13, padding: '5px 8px', textAlign: 'center',
                                  }}
                                />
                              </label>
                              <button className={styles.btnSuccess} disabled={caProcessing || !canClubsWrite}
                                onClick={() => reviewApplication(app, 'approve')}>
                                Approve And Add To Union
                              </button>
                              <input
                                placeholder="Rejection Reason (Optional)"
                                aria-label={`Rejection Reason For ${app.club_name || 'This Application'}`}
                                value={caAppReason[app.id] ?? ''}
                                onChange={(e) => setCaAppReason((prev) => ({ ...prev, [app.id]: e.target.value }))}
                                style={{
                                  flex: 1, minWidth: 180, background: T.inset, border: `1px solid ${T.line}`,
                                  borderRadius: 6, color: T.text, fontSize: 12, padding: '7px 10px',
                                }}
                              />
                              <button className={styles.btnDanger} disabled={caProcessing || !canClubsWrite}
                                onClick={() => reviewApplication(app, 'reject')}>
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      <h3 className={styles.sectionTitle}>
                        Union Leave Requests
                        {pendingLeaveCount > 0 && <span className={`${styles.countPill} ${styles.warnPill}`}>{pendingLeaveCount} Pending</span>}
                      </h3>
                      <div className={styles.filterBar}>
                        {['pending', 'all'].map((f) => (
                          <button key={f} className={`${styles.filterBtn} ${caLeaveTab === f ? styles.active : ''}`} aria-pressed={caLeaveTab === f}
                            onClick={() => { setCaLeaveTab(f); loadLeaveRequests(f); }}>
                            {f === 'pending' ? 'Pending' : 'All'}
                          </button>
                        ))}
                        <button className={styles.filterBtn} onClick={() => loadLeaveRequests(caLeaveTab)} disabled={caLeaveLoading}>
                          Refresh
                        </button>
                      </div>

                      {caLeaveLoading ? (
                        <div className={styles.loadingSpinner}>Loading Leave Requests</div>
                      ) : caLeaveRequests.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caLeaveTab === 'pending' ? 'No Pending Leave Requests.' : 'No Leave Requests Found.'}
                        </div>
                      ) : caLeaveRequests.map((req) => (
                        <div key={req.id} className={styles.card} style={{
                          borderColor: req.status === 'pending' ? T.warn : T.line,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{req.club_name}</span>
                            {req.club_code && <span style={{ fontSize: 12, color: T.dim }}>Club {req.club_code}</span>}
                            <span style={{
                              background: req.status === 'pending' ? T.warnSoft : req.status === 'approved' ? T.accentSoft : T.dangerSoft,
                              color: req.status === 'pending' ? T.warn : req.status === 'approved' ? T.accent : T.danger,
                              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            }}>{req.status || 'unknown'}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.dim }}>
                            Requested {when(req.requested_at)}
                            {req.profiles?.display_name && <> - Owner <strong style={{ color: T.text }}>{req.profiles.display_name}</strong></>}
                            {req.unions?.name && <> - Union <strong style={{ color: T.text }}>{req.unions.name}</strong></>}
                          </div>
                          {req.reason && (
                            <div style={{
                              marginTop: 10, background: T.inset, borderRadius: 8, padding: '10px 14px',
                              fontSize: 13, color: T.dim, borderLeft: `3px solid ${T.warn}`, fontStyle: 'italic',
                            }}>{req.reason}</div>
                          )}
                          {req.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                              <button className={styles.btnSuccess} disabled={caProcessing || !canClubsWrite}
                                onClick={() => reviewLeaveRequest(req, 'approve')}>
                                Approve And Remove From Union
                              </button>
                              <button className={styles.btnDanger} disabled={caProcessing || !canClubsWrite}
                                onClick={() => reviewLeaveRequest(req, 'deny')}>
                                Deny
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>

    </>
  );
}
