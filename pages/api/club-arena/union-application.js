/**
 * /api/club-arena/union-application
 *
 * Club owners apply to join the Midway Union.
 * Platform admins review, approve, or reject applications.
 *
 * Actions:
 *   apply    — Club owner submits an application (POST)
 *   list     — Platform admin lists all applications (POST)
 *   approve  — Platform admin approves + fully integrates club into union (POST)
 *   reject   — Platform admin rejects application with optional reason (POST)
 *   status   — Club owner checks their own application status (POST)
 *
 * "Midway Union" is resolved dynamically — the union whose name ILIKE '%midway%'.
 * This means no hard-coded UUID is needed.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Resolve Midway Union ID dynamically
async function getMidwayUnionId() {
  const { data } = await supabaseAdmin
    .from('unions')
    .select('id, name, owner_id')
    .ilike('name', '%midway%')
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Check if caller is platform admin (has admin/superadmin in profiles.role)
async function isPlatformAdmin(userId) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return ['admin', 'superadmin'].includes(data?.role);
}

export default async function handler(req, res) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const { action, clubId, applicationId, message, reason, commissionRate } = req.body;
  if (!action) return res.status(400).json({ success: false, error: 'action required' });

  try {
    // ═══════════════════════════════════════════════════════════════
    // APPLY — Club owner submits application to Midway Union
    // ═══════════════════════════════════════════════════════════════
    if (action === 'apply') {
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

      // Verify caller owns this club
      const { data: club } = await supabaseAdmin
        .from('clubs')
        .select('id, name, club_id, union_id, owner_id, member_count')
        .eq('id', clubId)
        .maybeSingle();

      if (!club) return res.status(404).json({ success: false, error: 'Club not found' });
      if (club.owner_id !== user.id) return res.status(403).json({ success: false, error: 'Only the club owner can apply' });
      if (club.union_id) return res.status(400).json({ success: false, error: 'Club is already in a union' });

      const union = await getMidwayUnionId();
      if (!union) return res.status(500).json({ success: false, error: 'Midway Union not found on this platform' });

      // Check for existing pending application
      const { data: existing } = await supabaseAdmin
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
        return res.status(409).json({ success: false, error: 'Application already approved — club should be in the union' });
      }

      // Insert application
      const { data: app, error: insertErr } = await supabaseAdmin
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
    // STATUS — Club owner checks their application status
    // ═══════════════════════════════════════════════════════════════
    if (action === 'status') {
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

      const union = await getMidwayUnionId();
      if (!union) return res.status(200).json({ success: true, application: null });

      const { data: app } = await supabaseAdmin
        .from('union_applications')
        .select('*')
        .eq('club_id', clubId)
        .eq('union_id', union.id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return res.status(200).json({ success: true, application: app || null, unionName: union.name });
    }

    // ═══════════════════════════════════════════════════════════════
    // LIST — Platform admin sees all applications
    // ═══════════════════════════════════════════════════════════════
    if (action === 'list') {
      if (!(await isPlatformAdmin(user.id))) {
        return res.status(403).json({ success: false, error: 'Platform admin access required' });
      }

      const statusFilter = req.body.statusFilter || 'pending';
      let query = supabaseAdmin
        .from('union_applications')
        .select('*, unions(name), profiles!applicant_user_id(display_name, username, email)')
        .order('applied_at', { ascending: false });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data: apps, error: listErr } = await query;
      if (listErr) throw listErr;

      return res.status(200).json({ success: true, applications: apps || [] });
    }

    // ═══════════════════════════════════════════════════════════════
    // APPROVE — Platform admin approves + integrates club into union
    // ═══════════════════════════════════════════════════════════════
    if (action === 'approve') {
      if (!(await isPlatformAdmin(user.id))) {
        return res.status(403).json({ success: false, error: 'Platform admin access required' });
      }
      if (!applicationId) return res.status(400).json({ success: false, error: 'applicationId required' });

      // Load application
      const { data: app } = await supabaseAdmin
        .from('union_applications')
        .select('*')
        .eq('id', applicationId)
        .maybeSingle();

      if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
      if (app.status !== 'pending') return res.status(400).json({ success: false, error: `Application is already ${app.status}` });

      const rate = parseFloat(commissionRate) || 0.90;

      // Fully integrate club into union (same logic as manage-union add_club)
      await supabaseAdmin
        .from('union_clubs')
        .upsert(
          { union_id: app.union_id, club_id: app.club_id, club_commission_rate: rate },
          { onConflict: 'union_id,club_id' }
        );

      await supabaseAdmin
        .from('clubs')
        .update({
          union_id: app.union_id,
          club_commission_rate: rate,
          auto_settlement_enabled: true,
        })
        .eq('id', app.club_id);

      // Mark application approved
      await supabaseAdmin
        .from('union_applications')
        .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: reason || null })
        .eq('id', applicationId);

      return res.status(200).json({
        success: true,
        message: `${app.club_name} approved and added to union with ${(rate * 100).toFixed(0)}% commission rate`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // REJECT — Platform admin rejects application
    // ═══════════════════════════════════════════════════════════════
    if (action === 'reject') {
      if (!(await isPlatformAdmin(user.id))) {
        return res.status(403).json({ success: false, error: 'Platform admin access required' });
      }
      if (!applicationId) return res.status(400).json({ success: false, error: 'applicationId required' });

      const { data: app } = await supabaseAdmin
        .from('union_applications')
        .select('club_name, status')
        .eq('id', applicationId)
        .maybeSingle();

      if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
      if (app.status !== 'pending') return res.status(400).json({ success: false, error: `Application is already ${app.status}` });

      await supabaseAdmin
        .from('union_applications')
        .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: reason || null })
        .eq('id', applicationId);

      return res.status(200).json({ success: true, message: `${app.club_name} application rejected` });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[union-application]', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
}
