/**
 * POST /api/club-arena/manage-union
 * 
 * Actions: create, update_settings, add_club, remove_club, add_admin, remove_admin
 * Auth: Bearer token
 */
import { createClient } from '@supabase/supabase-js';

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { action, unionId, name, description, settings, clubId, adminUserId, adminRole } = req.body;
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    // ═══════════════════════════════════════════════════════════════
    // CREATE UNION
    // ═══════════════════════════════════════════════════════════════
    if (action === 'create') {
      if (!name?.trim()) return res.status(400).json({ error: 'Union name required' });

      const unionCode = generateCode(8);
      const { data: union, error: createErr } = await supabaseAdmin
        .from('unions')
        .insert({
          name: name.trim(),
          description: description?.trim() || '',
          union_code: unionCode,
          owner_id: user.id,
          settings: settings || { union_rake_hold: 0.10, default_agent_commission: 0.50, default_club_commission_rate: 0.90 },
        })
        .select()
        .single();

      if (createErr) throw createErr;

      // Add creator as union admin (owner role)
      await supabaseAdmin.from('union_admins').insert({
        union_id: union.id,
        user_id: user.id,
        role: 'owner',
        permissions: { full_access: true },
      });

      return res.status(200).json({ success: true, union });
    }

    // All other actions require unionId
    if (!unionId) return res.status(400).json({ error: 'unionId required' });

    // Verify caller is union admin
    const { data: callerAdmin } = await supabaseAdmin
      .from('union_admins')
      .select('role, permissions')
      .eq('union_id', unionId)
      .eq('user_id', user.id)
      .single();

    if (!callerAdmin) return res.status(403).json({ error: 'Not a union admin' });

    // ═══════════════════════════════════════════════════════════════
    // UPDATE SETTINGS
    // ═══════════════════════════════════════════════════════════════
    if (action === 'update_settings') {
      if (callerAdmin.role !== 'owner') return res.status(403).json({ error: 'Only union owner can update settings' });

      const updates = {};
      if (name?.trim()) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      if (settings) updates.settings = settings;

      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

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
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify club exists
      const { data: club } = await supabaseAdmin
        .from('clubs')
        .select('id, name, union_id')
        .eq('id', clubId)
        .single();

      if (!club) return res.status(404).json({ error: 'Club not found' });
      if (club.union_id && club.union_id !== unionId) {
        return res.status(400).json({ error: 'Club already belongs to another union' });
      }

      // Add to union_clubs with commission rate
      const clubCommissionRate = req.body.clubCommissionRate || 0.90;  // 90% default for clubs
      
      const { error: linkErr } = await supabaseAdmin
        .from('union_clubs')
        .upsert({ union_id: unionId, club_id: clubId, club_commission_rate: clubCommissionRate }, { onConflict: 'union_id,club_id' });

      if (linkErr) throw linkErr;

      // Update club's union_id and commission rate
      await supabaseAdmin
        .from('clubs')
        .update({ 
          union_id: unionId,
          club_commission_rate: clubCommissionRate,
          auto_settlement_enabled: true,
        })
        .eq('id', clubId);

      return res.status(200).json({ success: true, clubName: club.name, club_commission_rate: clubCommissionRate });
    }

    // ═══════════════════════════════════════════════════════════════
    // REMOVE CLUB FROM UNION
    // ═══════════════════════════════════════════════════════════════
    if (action === 'remove_club') {
      if (!clubId) return res.status(400).json({ error: 'clubId required' });
      if (callerAdmin.role !== 'owner') return res.status(403).json({ error: 'Only union owner can remove clubs' });

      await supabaseAdmin
        .from('union_clubs')
        .delete()
        .eq('union_id', unionId)
        .eq('club_id', clubId);

      await supabaseAdmin
        .from('clubs')
        .update({ union_id: null })
        .eq('id', clubId);

      return res.status(200).json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADD UNION ADMIN
    // ═══════════════════════════════════════════════════════════════
    if (action === 'add_admin') {
      if (!adminUserId) return res.status(400).json({ error: 'adminUserId required' });
      if (callerAdmin.role !== 'owner') return res.status(403).json({ error: 'Only union owner can add admins' });

      // Verify user exists
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, username, display_name')
        .eq('id', adminUserId)
        .single();

      if (!profile) return res.status(404).json({ error: 'User not found' });

      const { error } = await supabaseAdmin
        .from('union_admins')
        .upsert({
          union_id: unionId,
          user_id: adminUserId,
          role: adminRole || 'admin',
          permissions: { manage_clubs: true, mint_chips: true, view_reports: true },
        }, { onConflict: 'union_id,user_id' });

      if (error) throw error;
      return res.status(200).json({ success: true, admin: profile });
    }

    // ═══════════════════════════════════════════════════════════════
    // REMOVE UNION ADMIN
    // ═══════════════════════════════════════════════════════════════
    if (action === 'remove_admin') {
      if (!adminUserId) return res.status(400).json({ error: 'adminUserId required' });
      if (callerAdmin.role !== 'owner') return res.status(403).json({ error: 'Only union owner can remove admins' });
      if (adminUserId === user.id) return res.status(400).json({ error: 'Cannot remove yourself' });

      const { error } = await supabaseAdmin
        .from('union_admins')
        .delete()
        .eq('union_id', unionId)
        .eq('user_id', adminUserId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[manage-union]', err);
    return res.status(500).json({ error: 'Union management failed', details: err.message });
  }
}
