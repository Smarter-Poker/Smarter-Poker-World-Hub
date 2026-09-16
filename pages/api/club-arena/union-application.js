/**
 * /api/club-arena/union-application
 *
 * Club owners apply to join a union.
 * Union leads (union_lead role) OR platform admins review/approve/reject their union's applications.
 *
 * Actions:
 *   apply    - Club owner submits an application (POST)
 *   list     - Union lead or platform admin lists applications for a union (POST)
 *   approve  - Union lead or platform admin approves + integrates club into union (POST)
 *   reject   - Union lead or platform admin rejects application (POST)
 *   status   - Club owner checks their own application status (POST)
 *
 * "Midway Union" is resolved dynamically - the union whose name ILIKE '%midway%'.
 * For list/approve/reject: if unionId is provided, scoped to that union.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { validateUnionApplication } from '../../../src/contracts/orb4_syndicate';
import { checkIdempotency } from '../../../src/lib/club-arena/idempotency';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { requestIdOf } from '../../../src/lib/horses/apiEnvelope.js';
import { operatorHoldsPermission } from '../../../src/lib/horses/operatorGate.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';

// Lazy accessor - a module-scope createClient() throws at IMPORT time when the
// service-role key is missing, which takes the whole route down before any
// request handler can report why.
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Resolve Midway Union ID dynamically
async function getMidwayUnionId() {
  const { data } = await getSupabase()
    .from('unions')
    .select('id, name, owner_id')
    .ilike('name', '%midway%')
    .limit(1)
    .maybeSingle();
  return data || null;
}

// The caller's real profiles.role, or null. Read once per request and passed
// down so the authorisation check and the audit row agree about who this is.
async function fetchProfileRole(userId) {
  const { data } = await getSupabase()
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return data?.role ?? null;
}

// Is the caller platform staff for union review? Whoever holds clubs.write,
// resolved the way the console resolves it (re-verification M-3): the three
// legacy profile roles ('god' is the one the real owner accounts carry, and
// omitting it once locked them out of every union review action) carry it
// until enforce_named_roles is on, a granted finance or operations operator
// carries it through the grant, and a narrowed legacy account does not. The
// resolver fails open to the legacy set when its RPC is unreachable. Union
// leads are authorised through union_admins below exactly as before.
async function isPlatformAdmin(userId, knownRole) {
  const role = knownRole !== undefined ? knownRole : await fetchProfileRole(userId);
  const gate = await operatorHoldsPermission(getSupabase(), { userId, profileRole: role }, PERMISSIONS.CLUBS_WRITE);
  return gate.ok === true;
}

// Check if caller is union_lead for the given unionId
async function isUnionLead(userId, unionId) {
  const { data } = await getSupabase()
    .from('union_admins')
    .select('role')
    .eq('union_id', unionId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role === 'union_lead';
}

// Check if caller can administer this union (platform admin OR union_lead)
async function canAdminUnion(userId, unionId, knownRole) {
  const [admin, lead] = await Promise.all([
    isPlatformAdmin(userId, knownRole),
    isUnionLead(userId, unionId),
  ]);
  return admin || lead;
}

export default async function handler(req, res) {
  try {

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  // CONCURRENCY LOCKDOWN: Idempotency guard for mutation actions
  const readOnlyActions = ['list', 'status', 'list_leave_requests'];
  if (!readOnlyActions.includes(req.body?.action)) {
    if (checkIdempotency(req, res)) return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

  const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
  const user = authData?.user;
  if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const { action } = req.body;
  if (!action) return res.status(400).json({ success: false, error: 'action required' });

  // The operator context the shared audit helper wants. Auth is unchanged
  // (canAdminUnion still decides every branch below); this only gives the audit
  // rows the same actor, role, ip, user agent, request id and before/after
  // stamp every other console write now carries.
  //
  // `role` is the caller's REAL profiles.role, never a literal. canAdminUnion
  // also authorises union leads and union owners who hold no platform role at
  // all, and filing every one of their decisions as `admin` made the audit row
  // assert a privilege the actor may not have. A union lead with no platform
  // role is filed with their actual role (often null) and the union authority
  // that let them act is recorded in `union_authority`.
  const actorRole = await fetchProfileRole(user.id);
  const auditOp = {
    user: { id: user.id },
    role: actorRole,
    db: getSupabase(),
    requestId: requestIdOf(req),
  };
  const platformAdmin = await isPlatformAdmin(user.id, actorRole);

  // Zod validation - reject malformed payloads before DB queries
  const validation = validateUnionApplication(req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  // Use Zod-validated data (not raw req.body) for all downstream logic
  const {
    clubId,
    applicationId,
    leaveRequestId,
    unionId: bodyUnionId,
    message,
    reason,
    commissionRate,
    statusFilter: validatedStatusFilter,
  } = validation.data;

  try {
    // ═══════════════════════════════════════════════════════════════
    // APPLY - Club owner submits application to Midway Union
    // ═══════════════════════════════════════════════════════════════
    if (action === 'apply') {
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

      // Verify caller owns this club
      const { data: club } = await getSupabase()
        .from('clubs')
        .select('id, name, club_id, union_id, owner_id, member_count')
        .eq('id', clubId)
        .maybeSingle();

      if (!club) return res.status(404).json({ success: false, error: 'Club not found' });
      if (club.owner_id !== user.id) return res.status(403).json({ success: false, error: 'Only the club owner can apply' });
      if (club.union_id) return res.status(400).json({ success: false, error: 'Club is already in a union' });

      // UNION AUDIT FIX 2026-07-21: accept an explicit target unionId (the SPA
      // apply-to-join flow targets ANY union, not just Midway). The Midway
      // ILIKE lookup remains only as the legacy fallback for old callers.
      let union = null;
      if (bodyUnionId) {
        const { data: target } = await getSupabase()
          .from('unions').select('id, name, owner_id').eq('id', bodyUnionId).maybeSingle();
        if (!target) return res.status(404).json({ success: false, error: 'Union not found' });
        union = target;
      } else {
        union = await getMidwayUnionId();
        if (!union) return res.status(500).json({ success: false, error: 'Midway Union not found on this platform' });
      }

      // Check for existing pending application
      const { data: existing } = await getSupabase()
        .from('union_applications')
        .select('id, status')
        .eq('club_id', clubId)
        .eq('union_id', union.id)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      if (existing?.status === 'pending') {
        return res.status(409).json({ success: false, error: 'You already have a pending application for this union' });
      }
      if (existing?.status === 'approved') {
        return res.status(409).json({ success: false, error: 'Application already approved - club should be in the union' });
      }

      // Insert application
      const { data: app, error: insertErr } = await getSupabase()
        .from('union_applications')
        .insert({
          union_id: union.id,
          club_id: clubId,
          applicant_user_id: user.id,
          club_name: club.name,
          club_code: club.club_id,
          member_count: club.member_count || 0,
          message: message || null,
          status: 'pending',
          applied_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (insertErr) throw insertErr;

      return res.status(200).json({
        success: true,
        application: app,
        unionName: union.name,
        message: `Application submitted to ${union.name}. You will be notified when reviewed.`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // STATUS - Club owner checks their application status
    // ═══════════════════════════════════════════════════════════════
    if (action === 'status') {
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

      // UNION AUDIT FIX 2026-07-21: honor explicit unionId; Midway fallback for legacy.
      let union = null;
      if (bodyUnionId) {
        const { data: target } = await getSupabase()
          .from('unions').select('id, name').eq('id', bodyUnionId).maybeSingle();
        union = target;
      } else {
        union = await getMidwayUnionId();
      }
      if (!union) return res.status(200).json({ success: true, application: null });

      const { data: app } = await getSupabase()
        .from('union_applications')
        .select('id, club_id, union_id, status, applied_at, reviewed_at, review_note')
        .eq('club_id', clubId)
        .eq('union_id', union.id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return res.status(200).json({ success: true, application: app || null, unionName: union.name });
    }

    // ═══════════════════════════════════════════════════════════════
    // LIST - Union lead or platform admin lists applications for a union
    // ═══════════════════════════════════════════════════════════════
    if (action === 'list') {
      // Resolve target union: caller-provided unionId (for union dashboard) or Midway Union (for horses)
      let targetUnionId = bodyUnionId;
      if (!targetUnionId) {
        const midway = await getMidwayUnionId();
        if (!midway) return res.status(404).json({ success: false, error: 'Union not found' });
        targetUnionId = midway.id;
      }

      if (!(await canAdminUnion(user.id, targetUnionId, actorRole))) {
        return res.status(403).json({ success: false, error: 'Union lead or platform admin access required' });
      }

      const statusFilter = validatedStatusFilter || 'pending';
      let query = getSupabase()
        .from('union_applications')
        .select('*, unions(name)')
        .eq('union_id', targetUnionId)
        .order('applied_at', { ascending: false });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data: apps, error: listErr } = await query;
      if (listErr) throw listErr;

      return res.status(200).json({ success: true, applications: apps || [] });
    }

    // ═══════════════════════════════════════════════════════════════
    // APPROVE - Union lead or platform admin approves + integrates club into union
    // ═══════════════════════════════════════════════════════════════
    if (action === 'approve') {
      if (!applicationId) return res.status(400).json({ success: false, error: 'applicationId required' });

      // Load application first to get union_id for auth check
      const { data: app } = await getSupabase()
        .from('union_applications')
        .select('id, club_id, union_id, club_name, status, applied_at')
        .eq('id', applicationId)
        .maybeSingle();

      if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
      if (app.status !== 'pending') return res.status(400).json({ success: false, error: `Application is already ${app.status}` });

      if (!(await canAdminUnion(user.id, app.union_id, actorRole))) {
        return res.status(403).json({ success: false, error: 'Union lead or platform admin access required' });
      }

      const rate = parseFloat(commissionRate) || 0.90;

      // ── UNION GOVERNANCE (2026-08-19, hardened after audit) ───────────
      // HARD RULE: a club closes all of its own (non-private) tables before
      // joining a union. This was an inline JS loop; it is now a single
      // SECURITY DEFINER transaction because the loop had four money bugs:
      //   - non-atomic refunds (a mid-loop failure credited some wallets
      //     while those players still held the same chips on a live table)
      //   - closed tables were resurrected by the engine boot sweep and the
      //     fleet name-match, coming back club-owned INSIDE a union
      //   - it also closed the club's PRIVATE games, which the rules keep
      //   - an unchecked seats query could close a table refunding nobody
      // fn_union_close_club_tables_for_join does refund -> vacate -> close
      // (with is_deleted so it survives the engine sweeps) in one transaction,
      // and refuses outright if the club still has live public tournaments.
      const { data: closeRes, error: closeErr } = await getSupabase().rpc(
        'fn_union_close_club_tables_for_join',
        { p_club_id: app.club_id }
      );

      if (closeErr) {
        console.error('[union-application] fn_union_close_club_tables_for_join failed:', closeErr);
        return res.status(500).json({
          success: false,
          error: `Could not close ${app.club_name}'s tables - approval aborted, nothing was changed.`,
        });
      }
      if (closeRes && closeRes.success === false) {
        if (closeRes.error === 'live_tournaments') {
          return res.status(409).json({
            success: false,
            error: `${app.club_name} still has ${closeRes.live_tournaments} live tournament(s). They must finish or be cancelled before the club can join the union.`,
          });
        }
        console.error('[union-application] close-tables RPC reported failure:', closeRes);
        return res.status(500).json({
          success: false,
          error: `Could not close ${app.club_name}'s tables - approval aborted, nothing was changed.`,
        });
      }

      const closedTables = closeRes?.tables_closed ?? 0;
      const refundedSeats = closeRes?.seats_refunded ?? 0;

      // Fully integrate club into union (same logic as manage-union add_club)
      const { error: err_union_clubs_dam40 } = await getSupabase()
        .from('union_clubs')
        .upsert(
          { union_id: app.union_id, club_id: app.club_id, club_commission_rate: rate },
          { onConflict: 'union_id,club_id' }
        );
      if (err_union_clubs_dam40) {
        // FAIL-LOUD 2026-08-19: union_clubs and clubs.union_id are a PAIR. If
        // one lands and the other does not, the club is half-joined - and that
        // exact divergence is what sent Club JAQK's rake to its own treasury
        // for months instead of the union's, because rake routing reads the
        // clubs mirror while settlement reads union_clubs. The club's tables
        // have already been closed and refunded by this point, so say so.
        console.error('[union-application] union_clubs upsert failed:', err_union_clubs_dam40);
        return res.status(500).json({
          success: false,
          error: `Could not add ${app.club_name} to the union. `
            + `Its tables were already closed and players refunded - re-run the approval `
            + `once the cause is fixed.`,
          tablesAlreadyClosed: closedTables,
        });
      }

      const { error: err_clubs_akfss } = await getSupabase()

        .from('clubs')

        .update({
          union_id: app.union_id,
          club_commission_rate: rate,
          auto_settlement_enabled: true,
        })
        .eq('id', app.club_id);

      if (err_clubs_akfss) {
        // The membership row landed but the mirror did not. Leaving this to a
        // console.warn is how the mirror drifts. trg_union_clubs_sync_mirror
        // repairs the INSERT path, but an upsert that hits onConflict takes the
        // UPDATE path where the trigger does not fire - so this must be loud.
        console.error('[union-application] clubs mirror update failed:', err_clubs_akfss);
        return res.status(500).json({
          success: false,
          error: `${app.club_name} was added to union_clubs but its club record could not `
            + `be updated. The club is half-joined - rake would `
            + `route to the wrong treasury. Re-run the approval.`,
          halfJoined: true,
        });
      }

      // Mark application approved
      const { error: err_union_applications_0zcko } = await getSupabase()
        .from('union_applications')
        .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: reason || null })
        .eq('id', applicationId);
      if (err_union_applications_0zcko) {
        // The club IS in the union at this point; only the paperwork failed.
        // Report it rather than claiming success, or the application stays
        // 'pending' and the whole approval replays - closing tables again.
        console.error('[union-application] marking application approved failed:', err_union_applications_0zcko);
        return res.status(500).json({
          success: false,
          error: `${app.club_name} was integrated into the union, but marking the `
            + `application approved failed. `
            + `Set it to 'approved' by hand - do NOT re-run the approval.`,
          integrationComplete: true,
        });
      }

      // Admin console audit trail - the club is now fully in the union and
      // its own tables have been closed and refunded.
      await auditOperatorAction(auditOp, req, {
        action: 'union.review_application',
        targetType: 'union_application',
        targetId: applicationId,
        details: {
          decision: 'approved',
          union_authority: platformAdmin ? 'platform_admin' : 'union_lead',
          club_id: app.club_id,
          club_name: app.club_name,
          union_id: app.union_id,
          commission_rate: rate,
          tables_closed: closedTables,
          seats_refunded: refundedSeats,
          review_note: reason || null,
        },
        before: { status: app.status },
        after: { status: 'approved' },
      });

      return res.status(200).json({
        success: true,
        closedTables,
        refundedSeats,
        message:
          `${app.club_name} approved and added to union with ${(rate * 100).toFixed(0)}% commission rate` +
          (closedTables > 0
            ? `. ${closedTables} club table(s) were closed with ${refundedSeats} seat(s) refunded - union tables take over from here.`
            : ''),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // REJECT - Union lead or platform admin rejects application
    // ═══════════════════════════════════════════════════════════════
    if (action === 'reject') {
      if (!applicationId) return res.status(400).json({ success: false, error: 'applicationId required' });

      const { data: app } = await getSupabase()
        .from('union_applications')
        .select('club_id, club_name, status, union_id')
        .eq('id', applicationId)
        .maybeSingle();

      if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
      if (app.status !== 'pending') return res.status(400).json({ success: false, error: `Application is already ${app.status}` });

      if (!(await canAdminUnion(user.id, app.union_id, actorRole))) {
        return res.status(403).json({ success: false, error: 'Union lead or platform admin access required' });
      }

      const { error: err_union_applications_wozws } = await getSupabase()

        .from('union_applications')

        .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: reason || null })
        .eq('id', applicationId);

      if (err_union_applications_wozws) {
        console.error('[union-application] reject update failed:', err_union_applications_wozws);
        return res.status(500).json({
          success: false,
          error: 'Could not reject the application. Please try again.',
        });
      }

      // Admin console audit trail.
      await auditOperatorAction(auditOp, req, {
        action: 'union.review_application',
        targetType: 'union_application',
        targetId: applicationId,
        details: {
          decision: 'rejected',
          union_authority: platformAdmin ? 'platform_admin' : 'union_lead',
          club_id: app.club_id,
          club_name: app.club_name,
          union_id: app.union_id,
          review_note: reason || null,
        },
        before: { status: app.status },
        after: { status: 'rejected' },
      });

      return res.status(200).json({ success: true, message: `${app.club_name} application rejected` });
    }

    // ═══════════════════════════════════════════════════════════════
    // LIST_LEAVE_REQUESTS - Union lead or platform admin lists clubs
    // asking to leave the union
    // ═══════════════════════════════════════════════════════════════
    if (action === 'list_leave_requests') {
      let targetUnionId = bodyUnionId;
      if (!targetUnionId) {
        const midway = await getMidwayUnionId();
        if (!midway) return res.status(404).json({ success: false, error: 'Union not found' });
        targetUnionId = midway.id;
      }

      if (!(await canAdminUnion(user.id, targetUnionId, actorRole))) {
        return res.status(403).json({ success: false, error: 'Union lead or platform admin access required' });
      }

      const leaveStatusFilter = validatedStatusFilter || 'pending';
      let leaveQuery = getSupabase()
        .from('union_leave_requests')
        .select('id, union_id, club_id, requester_user_id, club_name, club_code, reason, status, requested_at, reviewed_by, reviewed_at, unions(name)')
        .eq('union_id', targetUnionId)
        .order('requested_at', { ascending: false });

      if (leaveStatusFilter !== 'all') leaveQuery = leaveQuery.eq('status', leaveStatusFilter);

      const { data: rows, error: leaveErr } = await leaveQuery;
      if (leaveErr) throw leaveErr;

      // union_leave_requests.requester_user_id has NO foreign key to profiles,
      // so PostgREST cannot embed it. Fetch the requesters separately and
      // attach them under the `profiles` key the panel reads.
      const requesterIds = [...new Set((rows || []).map((r) => r.requester_user_id).filter(Boolean))];
      const profileById = new Map();
      if (requesterIds.length > 0) {
        const { data: requesters } = await getSupabase()
          .from('profiles')
          .select('id, display_name, email')
          .in('id', requesterIds);
        for (const p of requesters || []) profileById.set(p.id, p);
      }

      const leaveRequests = (rows || []).map((r) => {
        const p = profileById.get(r.requester_user_id) || null;
        return {
          ...r,
          profiles: p ? { display_name: p.display_name, email: p.email } : null,
        };
      });

      return res.status(200).json({ success: true, leaveRequests });
    }

    // ═══════════════════════════════════════════════════════════════
    // APPROVE_LEAVE - Union lead or platform admin lets a club out of
    // the union. Reverses exactly what `approve` writes: the
    // union_clubs membership row AND the clubs mirror. Both, or the
    // club is half-out and rake routes to the wrong treasury.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'approve_leave') {
      if (!leaveRequestId) return res.status(400).json({ success: false, error: 'leaveRequestId required' });

      const { data: lr } = await getSupabase()
        .from('union_leave_requests')
        .select('id, club_id, union_id, club_name, status')
        .eq('id', leaveRequestId)
        .maybeSingle();

      if (!lr) return res.status(404).json({ success: false, error: 'Leave request not found' });
      if (lr.status !== 'pending') return res.status(400).json({ success: false, error: `Leave request is already ${lr.status}` });

      if (!(await canAdminUnion(user.id, lr.union_id, actorRole))) {
        return res.status(403).json({ success: false, error: 'Union lead or platform admin access required' });
      }

      const { error: unlinkErr } = await getSupabase()
        .from('union_clubs')
        .delete()
        .eq('union_id', lr.union_id)
        .eq('club_id', lr.club_id);
      if (unlinkErr) {
        console.error('[union-application] union_clubs delete failed:', unlinkErr);
        return res.status(500).json({
          success: false,
          error: `Could not remove ${lr.club_name} from the union. Nothing was changed.`,
        });
      }

      const { error: mirrorErr } = await getSupabase()
        .from('clubs')
        .update({ union_id: null, auto_settlement_enabled: false })
        .eq('id', lr.club_id);
      if (mirrorErr) {
        // Same pairing hazard as `approve`: the membership row is gone but
        // the mirror still points at the union. Say so rather than warn.
        console.error('[union-application] clubs mirror unlink failed:', mirrorErr);
        return res.status(500).json({
          success: false,
          error: `${lr.club_name} was removed from union_clubs but its club record still `
            + `points at the union. The club is half-out - re-run the approval.`,
          halfLeft: true,
        });
      }

      const { error: markErr } = await getSupabase()
        .from('union_leave_requests')
        .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', leaveRequestId);
      if (markErr) {
        console.error('[union-application] marking leave request approved failed:', markErr);
        return res.status(500).json({
          success: false,
          error: `${lr.club_name} has left the union, but marking the leave request approved `
            + `failed. Set it to 'approved' by hand - do NOT re-run the approval.`,
          integrationComplete: true,
        });
      }

      // Admin console audit trail - the club has been removed from the union
      // and its rake routing has moved back to its own treasury.
      await auditOperatorAction(auditOp, req, {
        action: 'union.review_leave_request',
        targetType: 'union_leave_request',
        targetId: leaveRequestId,
        details: {
          decision: 'approved',
          union_authority: platformAdmin ? 'platform_admin' : 'union_lead',
          club_id: lr.club_id,
          club_name: lr.club_name,
          union_id: lr.union_id,
        },
        before: { status: lr.status },
        after: { status: 'approved' },
      });

      return res.status(200).json({
        success: true,
        message: `${lr.club_name} has been released from the union`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // REJECT_LEAVE - Union lead or platform admin denies a leave request
    // ═══════════════════════════════════════════════════════════════
    if (action === 'reject_leave') {
      if (!leaveRequestId) return res.status(400).json({ success: false, error: 'leaveRequestId required' });

      const { data: lr } = await getSupabase()
        .from('union_leave_requests')
        .select('id, club_id, club_name, status, union_id')
        .eq('id', leaveRequestId)
        .maybeSingle();

      if (!lr) return res.status(404).json({ success: false, error: 'Leave request not found' });
      if (lr.status !== 'pending') return res.status(400).json({ success: false, error: `Leave request is already ${lr.status}` });

      if (!(await canAdminUnion(user.id, lr.union_id, actorRole))) {
        return res.status(403).json({ success: false, error: 'Union lead or platform admin access required' });
      }

      const { error: denyErr } = await getSupabase()
        .from('union_leave_requests')
        .update({ status: 'denied', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', leaveRequestId);

      if (denyErr) {
        console.error('[union-application] leave request denial failed:', denyErr);
        return res.status(500).json({
          success: false,
          error: 'Could not deny the leave request. Please try again.',
        });
      }

      // NOTE: union_leave_requests has no review-note column - the club's own
      // `reason` lives there and must not be overwritten. The reviewer's
      // reason is echoed back and logged, not stored.
      if (reason) console.warn(`[union-application] leave request ${leaveRequestId} denied, reason: ${reason}`);

      // Admin console audit trail. The reviewer's reason has no column on
      // union_leave_requests, so the audit row is the only record of it.
      await auditOperatorAction(auditOp, req, {
        action: 'union.review_leave_request',
        targetType: 'union_leave_request',
        targetId: leaveRequestId,
        details: {
          decision: 'denied',
          union_authority: platformAdmin ? 'platform_admin' : 'union_lead',
          club_id: lr.club_id,
          club_name: lr.club_name,
          union_id: lr.union_id,
          review_note: reason || null,
        },
        before: { status: lr.status },
        after: { status: 'denied' },
      });

      return res.status(200).json({
        success: true,
        message: `${lr.club_name} leave request denied${reason ? `: ${reason}` : ''}`,
      });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[union-application]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }

  } catch (err) {
    console.error('[union-application] Unhandled exception in handler:', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
