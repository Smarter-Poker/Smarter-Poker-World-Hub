/**
 * POST /api/club-arena/manage-union
 * 
 * Actions: create, update_settings, add_club, remove_club, add_admin, remove_admin
 * Auth: Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const { action, unionId, name, description, settings, clubId, adminUserId, adminRole, leaveRequestId } = req.body;
  if (!action) return res.status(400).json({ success: false, error: 'action required' });

  try {
    // ═══════════════════════════════════════════════════════════════
    // CREATE UNION
    // ═══════════════════════════════════════════════════════════════
    if (action === 'create') {
      if (!name?.trim()) return res.status(400).json({ success: false, error: 'Union name required' });

      const unionCode = generateCode(8);
      const { data: union, error: createErr } = await supabaseAdmin
        .from('unions')
        .insert({
          name: name.trim(),
          description: description?.trim() || '',
          code: unionCode,
          owner_id: user.id,
          settings: settings || { union_rake_hold: 0.10, default_agent_commission: 0.50, default_club_commission_rate: 0.90 },
        })
        .select()
        .maybeSingle();

      if (createErr) throw createErr;

      // Add creator as union admin (owner role)
      await supabaseAdmin.from('union_admins').insert({
        union_id: union.id,
        user_id: user.id,
        role: 'union_lead',
        permissions: { full_access: true },
      });

      return res.status(200).json({ success: true, union });
    }

    // All other actions require unionId
    if (!unionId) return res.status(400).json({ success: false, error: 'unionId required' });

    // Verify caller is union admin
    const { data: callerAdmin } = await supabaseAdmin
      .from('union_admins')
      .select('role, permissions')
      .eq('union_id', unionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!callerAdmin) return res.status(403).json({ success: false, error: 'Not a union admin' });

    // ═══════════════════════════════════════════════════════════════
    // UPDATE SETTINGS
    // ═══════════════════════════════════════════════════════════════
    if (action === 'update_settings') {
      if (callerAdmin.role !== 'union_lead') return res.status(403).json({ success: false, error: 'Only union owner can update settings' });

      const updates = {};
      if (name?.trim()) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      if (settings) {
        // BUG #272 FIX: Validate critical financial settings to prevent abuse
        const safeSettings = { ...settings };
        if (safeSettings.union_rake_hold !== undefined) {
          const hold = parseFloat(safeSettings.union_rake_hold);
          if (isNaN(hold) || hold < 0 || hold > 0.50) {
            return res.status(400).json({ success: false, error: 'union_rake_hold must be between 0 and 0.50 (50%)' });
          }
          safeSettings.union_rake_hold = hold;
        }
        if (safeSettings.default_agent_commission !== undefined) {
          const comm = parseFloat(safeSettings.default_agent_commission);
          if (isNaN(comm) || comm < 0 || comm > 1.0) {
            return res.status(400).json({ success: false, error: 'default_agent_commission must be between 0 and 1.0' });
          }
          safeSettings.default_agent_commission = comm;
        }
        if (safeSettings.default_club_commission_rate !== undefined) {
          const rate = parseFloat(safeSettings.default_club_commission_rate);
          if (isNaN(rate) || rate < 0.01 || rate > 1.0) {
            return res.status(400).json({ success: false, error: 'default_club_commission_rate must be between 0.01 and 1.0' });
          }
          safeSettings.default_club_commission_rate = rate;
        }
        // Validate BBJ split percentages
        if (safeSettings.bbj_main_pct !== undefined || safeSettings.bbj_backup_pct !== undefined || safeSettings.bbj_promo_pct !== undefined) {
          const main = parseInt(safeSettings.bbj_main_pct);
          const backup = parseInt(safeSettings.bbj_backup_pct);
          const promo = parseInt(safeSettings.bbj_promo_pct);
          if ([main, backup, promo].some(v => isNaN(v) || v < 0 || v > 100)) {
            return res.status(400).json({ success: false, error: 'BBJ split percentages must be between 0 and 100' });
          }
          if (main + backup + promo !== 100) {
            return res.status(400).json({ success: false, error: 'BBJ split must total exactly 100%' });
          }
          safeSettings.bbj_main_pct = main;
          safeSettings.bbj_backup_pct = backup;
          safeSettings.bbj_promo_pct = promo;
        }
        updates.settings = safeSettings;
      }

      if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'Nothing to update' });

      const { error } = await supabaseAdmin
        .from('unions')
        .update(updates)
        .eq('id', unionId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADD CLUB TO UNION
    // ═══════════════════════════════════════════════════════════════
    if (action === 'add_club') {
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

      // BUG #255 FIX: Only union lead can add clubs (consistent with remove_club)
      if (callerAdmin.role !== 'union_lead') {
        return res.status(403).json({ success: false, error: 'Only union owner can add clubs' });
      }

      // Verify club exists — support both UUID and numeric club_id
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubId);
      const { data: club } = await supabaseAdmin
        .from('clubs')
        .select('id, name, union_id, owner_id')
        .eq(isUUID ? 'id' : 'club_id', isUUID ? clubId : parseInt(clubId))
        .maybeSingle();

      if (!club) return res.status(404).json({ success: false, error: 'Club not found' });
      if (club.union_id && club.union_id !== unionId) {
        return res.status(400).json({ success: false, error: 'Club already belongs to another union' });
      }

      // Add to union_clubs with commission rate
      const clubCommissionRate = req.body.clubCommissionRate || 0.90;  // 90% default for clubs
      
      const { error: linkErr } = await supabaseAdmin
        .from('union_clubs')
        .upsert({ union_id: unionId, club_id: club.id, club_commission_rate: clubCommissionRate }, { onConflict: 'union_id,club_id' });

      if (linkErr) throw linkErr;

      // Update club's union_id and commission rate
      await supabaseAdmin
        .from('clubs')
        .update({ 
          union_id: unionId,
          club_commission_rate: clubCommissionRate,
          auto_settlement_enabled: true,
        })
        .eq('id', club.id);

      return res.status(200).json({ success: true, clubName: club.name, club_commission_rate: clubCommissionRate });
    }

    // ═══════════════════════════════════════════════════════════════
    // REMOVE CLUB FROM UNION
    // ═══════════════════════════════════════════════════════════════
    if (action === 'remove_club') {
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });
      if (callerAdmin.role !== 'union_lead') return res.status(403).json({ success: false, error: 'Only union owner can remove clubs' });

      await supabaseAdmin
        .from('union_clubs')
        .delete()
        .eq('union_id', unionId)
        .eq('club_id', clubId);

      // BUG-IDOR FIX: Only update clubs that actually belong to this union
      // Prevents a union_lead from clearing another union's club.union_id
      await supabaseAdmin
        .from('clubs')
        .update({ union_id: null, auto_settlement_enabled: false, club_commission_rate: 0 })
        .eq('id', clubId)
        .eq('union_id', unionId);

      return res.status(200).json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADD UNION ADMIN
    // ═══════════════════════════════════════════════════════════════
    if (action === 'add_admin') {
      if (!adminUserId) return res.status(400).json({ success: false, error: 'adminUserId required' });
      if (callerAdmin.role !== 'union_lead') return res.status(403).json({ success: false, error: 'Only union owner can add admins' });

      // Verify user exists
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, username, display_name')
        .eq('id', adminUserId)
        .maybeSingle();

      if (!profile) return res.status(404).json({ success: false, error: 'User not found' });

      // BUG #261 FIX: Prevent adding someone as 'owner' — only 'admin' role allowed
      const safeRole = 'union_admin';
      const { error } = await supabaseAdmin
        .from('union_admins')
        .upsert({
          union_id: unionId,
          user_id: adminUserId,
          role: safeRole,
          permissions: { manage_clubs: true, mint_chips: true, view_reports: true },
        }, { onConflict: 'union_id,user_id' });

      if (error) throw error;
      return res.status(200).json({ success: true, admin: profile });
    }

    // ═══════════════════════════════════════════════════════════════
    // REMOVE UNION ADMIN
    // ═══════════════════════════════════════════════════════════════
    if (action === 'remove_admin') {
      if (!adminUserId) return res.status(400).json({ success: false, error: 'adminUserId required' });
      if (callerAdmin.role !== 'union_lead') return res.status(403).json({ success: false, error: 'Only union owner can remove admins' });
      if (adminUserId === user.id) return res.status(400).json({ success: false, error: 'Cannot remove yourself' });

      const { error } = await supabaseAdmin
        .from('union_admins')
        .delete()
        .eq('union_id', unionId)
        .eq('user_id', adminUserId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // SEARCH USER — find user by username/display_name for admin addition
    // No union_lead requirement — any union admin can search
    // ═══════════════════════════════════════════════════════════════
    if (action === 'search_user') {
      const { query: searchQuery } = req.body;
      if (!searchQuery?.trim() || searchQuery.trim().length < 2) {
        return res.status(400).json({ success: false, error: 'query must be at least 2 characters' });
      }
      // Escape ILIKE wildcards and cap length; then use two separate .ilike() calls
      // to avoid PostgREST filter injection via comma-delimited .or() string interpolation
      const term = searchQuery.trim().replace(/%/g, '\\%').replace(/_/g, '\\_').slice(0, 50);
      const [{ data: byUsername }, { data: byDisplay }] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, username, display_name, avatar_url')
          .ilike('username', `%${term}%`).limit(10),
        supabaseAdmin.from('profiles').select('id, username, display_name, avatar_url')
          .ilike('display_name', `%${term}%`).limit(10),
      ]);
      // Deduplicate by id
      const seen = new Set();
      const profiles = [...(byUsername || []), ...(byDisplay || [])].filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      }).slice(0, 10);

      return res.status(200).json({ success: true, users: profiles });
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE CLUB COMMISSION — change a specific club's commission rate
    // union_lead only
    // ═══════════════════════════════════════════════════════════════
    if (action === 'update_club_commission') {
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });
      if (callerAdmin.role !== 'union_lead') {
        return res.status(403).json({ success: false, error: 'Only union owner can update club commission rates' });
      }

      const newRate = parseFloat(req.body.commissionRate);
      if (isNaN(newRate) || newRate < 0.01 || newRate > 1.0) {
        return res.status(400).json({ success: false, error: 'commissionRate must be between 0.01 (1%) and 1.0 (100%)' });
      }

      // Verify club is actually in this union (IDOR guard)
      const { data: uc } = await supabaseAdmin
        .from('union_clubs')
        .select('club_id')
        .eq('union_id', unionId)
        .eq('club_id', clubId)
        .maybeSingle();

      if (!uc) return res.status(404).json({ success: false, error: 'Club not found in this union' });

      // Update both union_clubs join table AND clubs table (keep in sync)
      await supabaseAdmin
        .from('union_clubs')
        .update({ club_commission_rate: newRate })
        .eq('union_id', unionId)
        .eq('club_id', clubId);

      await supabaseAdmin
        .from('clubs')
        .update({ club_commission_rate: newRate })
        .eq('id', clubId)
        .eq('union_id', unionId); // IDOR guard: only update clubs in this union

      return res.status(200).json({ success: true, commissionRate: newRate });
    }

    // ═══════════════════════════════════════════════════════════════
    // UNION ANNOUNCEMENT BROADCAST
    // Sends an in-app announcement to all members of union clubs
    // or to a specific club. Uses clubs.announcements table.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'union_announcement') {
      if (callerAdmin.role !== 'union_lead') {
        return res.status(403).json({ success: false, error: 'Only union lead can broadcast announcements' });
      }
      const { message: annMsg, clubId: targetClub } = req.body;
      if (!annMsg?.trim()) return res.status(400).json({ success: false, error: 'message required' });
      if (annMsg.length > 500) return res.status(400).json({ success: false, error: 'message max 500 chars' });

      // Determine target clubs
      const { data: unionClubs } = await supabaseAdmin
        .from('union_clubs')
        .select('club_id')
        .eq('union_id', unionId);

      const targetClubIds = targetClub
        ? [targetClub]
        : (unionClubs || []).map(uc => uc.club_id);

      if (targetClubIds.length === 0) {
        return res.status(400).json({ success: false, error: 'No clubs found in this union' });
      }

      // Insert announcement into each target club using correct club_announcements table
      const announcements = targetClubIds.map(cid => ({
        club_id: cid,
        author_id: user.id,
        title: `Union Announcement`,
        content: annMsg.trim(),
        pinned: false,
      }));

      const { error: annErr } = await supabaseAdmin
        .from('club_announcements')
        .insert(announcements);

      if (annErr) throw annErr;

      return res.status(200).json({
        success: true,
        clubsReached: targetClubIds.length,
        message: `Announcement sent to ${targetClubIds.length} club${targetClubIds.length !== 1 ? 's' : ''}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // LEAVE REQUEST ACTIONS (list, approve, deny)
    // Union lead manages club leave requests
    // ═══════════════════════════════════════════════════════════════
    if (action === 'list_leave') {
      const { data: leaveReqs } = await supabaseAdmin
        .from('union_leave_requests')
        .select('id, union_id, club_id, club_name, reason, status, requested_at, reviewed_by, reviewed_at')
        .eq('union_id', unionId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      return res.status(200).json({ success: true, leaveRequests: leaveReqs || [] });
    }

    if (action === 'approve_leave' || action === 'deny_leave') {
      if (callerAdmin.role !== 'union_lead') {
        return res.status(403).json({ success: false, error: 'Only union lead can handle leave requests' });
      }
      if (!leaveRequestId) return res.status(400).json({ success: false, error: 'leaveRequestId required' });

      const { data: leaveReq } = await supabaseAdmin
        .from('union_leave_requests')
        .select('club_id, status, union_id')
        .eq('id', leaveRequestId)
        .maybeSingle();

      if (!leaveReq) return res.status(404).json({ success: false, error: 'Leave request not found' });
      if (leaveReq.union_id !== unionId) return res.status(403).json({ success: false, error: 'Leave request belongs to a different union' });
      if (leaveReq.status !== 'pending') return res.status(400).json({ success: false, error: `Already ${leaveReq.status}` });

      const newStatus = action === 'approve_leave' ? 'approved' : 'denied';

      await supabaseAdmin
        .from('union_leave_requests')
        .update({ status: newStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', leaveRequestId);

      if (action === 'approve_leave') {
        // Remove club from union
        await supabaseAdmin.from('union_clubs').delete().eq('union_id', unionId).eq('club_id', leaveReq.club_id);
        await supabaseAdmin.from('clubs').update({ union_id: null }).eq('id', leaveReq.club_id).eq('union_id', unionId);
      }

      return res.status(200).json({ success: true, status: newStatus });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[manage-union]', err);
    return res.status(500).json({ success: false, error: 'Union management failed', details: err.message });
  }
}
