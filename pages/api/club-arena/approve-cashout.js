/** Existing HTTP approval gate; the authenticated CA RPC owns every chip leg. */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { refuseWhileFrozen } from '../../../src/lib/club-arena/platformFreeze';
import { requireRecentMfa } from '../../../src/lib/mfaGate';
import { authenticateCashout, cashoutUserClient, readCashout, requireCashoutSettlementOpen, sendCashoutError } from '../../../src/lib/club-arena/cashoutBridge';
import { CashoutBridgeError, cashoutUUID, cashoutNote, dispatchCashout, lookupCashoutReceipt, cashoutReplayResponse } from '../../../src/lib/club-arena/cashoutReceipt.mjs';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { requestIdOf } from '../../../src/lib/horses/apiEnvelope.js';
import { normalizeOperatorPolicy } from '../../../src/lib/horses/operatorAuth.js';
import { operatorHoldsPermission } from '../../../src/lib/horses/operatorGate.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { requireApproval, markApprovalExecuted, approvalPendingResponse, cashoutAuthPath } from '../../../src/lib/horses/approvals.js';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { runStandardGuards } = require('../../../src/lib/club-arena/redteam-validation');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');

let admin;
function getAdmin() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new CashoutBridgeError('Cashout service is unavailable.');
    admin = createClient(url, key);
  }
  return admin;
}
function checked(result, label) {
  if (!result || result.error || !Object.hasOwn(result, 'data')) throw new CashoutBridgeError(`${label} could not be confirmed.`);
  return result.data;
}
function policyNumber(value) {
  return (typeof value === 'number' || (typeof value === 'string' && /^(0|[1-9]\d*)(?:\.\d+)?$/.test(value))) &&
    Number.isFinite(Number(value)) && Number(value) >= 0;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    const guard = runStandardGuards(req.body, { maxBodySize: 512,
      allowedFields: new Set(['cashoutId','action','note','clubId','expectedActorId']),
      uuids: { cashoutId: req.body?.cashoutId } });
    if (guard) return res.status(guard.status).json({ success: false, error: guard.error });
    const db = getAdmin(), auth = await authenticateCashout(req, db);
    const { action, note: rawNote } = req.body;
    if (req.body.clubId !== undefined && !cashoutUUID(req.body.clubId)) throw new CashoutBridgeError('Invalid clubId format.', 400);
    const cashoutId = req.body.cashoutId.toLowerCase(), clubId = req.body.clubId?.toLowerCase();
    if (!['approve','cancel'].includes(action) || (rawNote !== undefined && typeof rawNote !== 'string')) {
      throw new CashoutBridgeError('A cashout action and text note are required.', 400);
    }
    const note = cashoutNote(rawNote) || (action === 'approve' ? 'Approved' : 'Cancelled by agent');
    if (!applyRateLimit(req, res, 'club-arena/approve-cashout')) return;
    const cashout = await readCashout(db, cashoutId);
    const policyAmount = Number(cashout.amount);
    if (!Number.isFinite(policyAmount) || policyAmount.toFixed(2) !== cashout.amount) throw new CashoutBridgeError('Cashout amount could not be verified.');
    if (clubId !== undefined && clubId !== cashout.club_id) throw new CashoutBridgeError('Cashout club changed.', 409);
    if (cashout.player_id === auth.actorId) throw new CashoutBridgeError('Use the player cancellation action for your own cashout.', 403, 'cashout_staff_self_action');
    const client = cashoutUserClient(auth.token);
    const context = { actorId: auth.actorId, operationId: auth.operationId, clubId: cashout.club_id, cashoutId,
      playerId: cashout.player_id, amount: cashout.amount, kind: action === 'approve' ? 'approval' : 'decline', note };
    const previous = await lookupCashoutReceipt(client, context);
    if (previous) return res.status(200).json(cashoutReplayResponse(previous, context.kind));
    if (action === 'approve') {
      const factor = checked(await db.from('user_mfa_factors').select('enabled').eq('user_id', auth.actorId).maybeSingle(), 'MFA enrollment');
      if (factor && typeof factor.enabled !== 'boolean') throw new CashoutBridgeError('MFA enrollment could not be confirmed.');
      if (factor?.enabled === true) {
        const gate = await requireRecentMfa(req, db, auth.user);
        if (!gate.ok) return res.status(gate.status || 403).json({ success: false,
          error: gate.reason || 'Step-up confirmation required', requiresMfa: true,
          requiresStepUp: gate.requiresStepUp === true, maxAgeSec: gate.maxAgeSec });
      }
    }
    await requireCashoutSettlementOpen(db, cashout.club_id);
    const profile = checked(await db.from('profiles').select('role').eq('id', auth.actorId).maybeSingle(), 'Operator profile');
    if (!profile || (profile.role !== null && typeof profile.role !== 'string')) throw new CashoutBridgeError('Operator profile is unavailable.');
    const member = checked(await db.from('club_members').select('role').eq('club_id', cashout.club_id).eq('user_id', auth.actorId).maybeSingle(), 'Club membership');
    const club = checked(await db.from('clubs').select('owner_id,union_id').eq('id', cashout.club_id).maybeSingle(), 'Club owner');
    if (!club || !cashoutUUID(club.owner_id) || (club.union_id !== null && !cashoutUUID(club.union_id)) ||
        (member && typeof member.role !== 'string')) throw new CashoutBridgeError('Club owner or membership is unavailable.');
    const isAgent = cashout.agent_id === auth.actorId;
    const isAdmin = club.owner_id === auth.actorId || ['owner','co_owner','admin'].includes(member?.role);
    const platformGate = await operatorHoldsPermission(db, { userId: auth.actorId, profileRole: profile.role || null }, PERMISSIONS.CASHIER_WRITE);
    if (typeof platformGate?.ok !== 'boolean' || platformGate.degraded === true) throw new CashoutBridgeError('Operator permissions could not be confirmed.');
    const isPlatformAdmin = platformGate.ok;
    let unionAuth = false;
    if (!isAgent && !isAdmin && !isPlatformAdmin && club.union_id) {
      const unionMember = checked(await db.from('union_admins').select('role').eq('union_id', club.union_id).eq('user_id', auth.actorId).maybeSingle(), 'Union permission');
      unionAuth = !!unionMember;
      if (!unionAuth) unionAuth = !!checked(await db.from('unions').select('id').eq('id', club.union_id).eq('owner_id', auth.actorId).maybeSingle(), 'Union ownership');
    }
    if (!isAgent && !isAdmin && !isPlatformAdmin && !unionAuth) throw new CashoutBridgeError('Not authorized to act on this cashout.', 403);
    const { path: authPath, viaPlatformOverride } = cashoutAuthPath({ isPlatformAdmin, isAgent, isClubAdmin: isAdmin, isUnionAdmin: unionAuth });
    // Read actual policy without default-on-error conversion. Maker-checker
    // remains the existing horse approval authority.
    const policyRow = checked(await db.from('ca_operator_policy').select('*').eq('id', true).maybeSingle(), 'Approval policy');
    if (!policyRow || ['approvals_enabled','allow_self_approve_when_alone','enforce_named_roles'].some(k => typeof policyRow[k] !== 'boolean') ||
        !policyNumber(policyRow.cashout_threshold) || !policyNumber(policyRow.approval_ttl_minutes) ||
        !Number.isSafeInteger(Number(policyRow.approval_ttl_minutes)) || Number(policyRow.approval_ttl_minutes) <= 0) {
      throw new CashoutBridgeError('Approval policy could not be confirmed.');
    }
    const auditOp = { user: { id: auth.actorId }, role: profile.role || null, db,
      policy: normalizeOperatorPolicy(policyRow), requestId: requestIdOf(req) };
    let approval = { required: false, approvalId: null, status: 'not_gated' };
    if (action === 'approve' && viaPlatformOverride) {
      approval = await requireApproval(auditOp, req, { kind: 'cashout', amount: policyAmount, asset: 'chips',
        targetType: 'cashout_request', targetId: cashoutId, reason: note, opId: `cashout:${cashoutId}`,
        payload: { cashoutId, clubId: cashout.club_id, playerId: cashout.player_id, agentId: cashout.agent_id,
          amount: policyAmount, note: rawNote || null } });
    }
    if (approval.required) {
      await auditOperatorAction(auditOp, req, { action: 'cashout.request_approval', targetType: 'cashout_request', targetId: cashoutId,
        before: { status: cashout.status }, after: { status: approval.status, approval_id: approval.approvalId },
        details: { amount: cashout.amount, club_id: cashout.club_id, threshold: approval.threshold, auth_path: authPath } });
      return approvalPendingResponse(res, approval, { requestId: auditOp.requestId,
        message: 'Sent for approval. No chips have moved.' });
    }
    if (await refuseWhileFrozen(db, res, { route: 'approve-cashout' })) return;
    // Route/platform/union permissions do not grant SQL cashier eligibility.
    const receipt = await dispatchCashout(client, context);
    let mark = { ok: action !== 'approve' };
    try { if (action === 'approve') mark = await markApprovalExecuted(auditOp, approval.approvalId, {
      ok: true, cashout_id: cashoutId, amount: receipt.request.amount, club_id: receipt.request.clubId,
      operation_id: receipt.operationId, invoice_id: receipt.cashier.invoice_id,
    }); } catch { mark = { ok: false, reason: 'approval_close_unconfirmed' }; }
    let trailClosed = mark?.ok === true;
    const approvalStatus = approval.approvalId && trailClosed ? 'executed' : approval.status;
    try { const audit = await auditOperatorAction(auditOp, req, { action: action === 'approve' ? 'cashout.approve' : 'cashout.cancel',
      targetType: 'cashout_request', targetId: cashoutId, before: { status: cashout.status }, after: { status: receipt.request.status },
      details: { amount: receipt.request.amount, club_id: receipt.request.clubId, player_id: receipt.request.playerId,
        auth_path: authPath, platform_admin_override: viaPlatformOverride, approval_gated: action === 'approve' && viaPlatformOverride,
        approval_id: approval.approvalId, approval_status: approvalStatus, trail_closed: trailClosed,
        mark_executed_refused: mark?.refused === true, mark_executed_reason: mark?.reason ?? null,
        operation_id: receipt.operationId, replayed: receipt.replayed, invoice_id: receipt.cashier.invoice_id } });
      if (audit?.ok !== true) trailClosed = false;
    } catch { trailClosed = false; }
    try { await logAudit(db, { actionType: action === 'approve' ? 'cashout_approved' : 'cashout_cancelled', userId: auth.actorId,
      targetUserId: receipt.request.playerId, clubId: receipt.request.clubId, amount: policyAmount,
      ip: extractIP(req), details: { cashoutId, operationId: receipt.operationId, replayed: receipt.replayed,
        actor_role: receipt.cashier.actor_role } });
    } catch { trailClosed = false; }
    return res.status(200).json({ success: true, action: action === 'approve' ? 'approved' : 'cancelled',
      status: receipt.request.status, amount: receipt.request.amount, playerId: receipt.request.playerId,
      ...(action === 'cancel' ? { chipsReturned: receipt.request.amount } : {}),
      approvalId: approval.approvalId, approvalStatus, trailClosed, followUpRequired: !trailClosed,
      legacyAuditStatus: 'unconfirmed', receipt });
  } catch (error) { return sendCashoutError(res, error); }
}
