/**
 * POST /api/club-arena/save-settings
 * Update club name, description, and settings.
 * Auth: Bearer token (owner or admin only)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { clubId, name, description, isPublic, requiresApproval, colorTheme } = req.body;
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

    try {
        const { data: member } = await supabaseAdmin
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .single();

        if (!member || !['owner', 'admin'].includes(member.role)) {
            // Union admin fallback
            const { data: clubInfo } = await supabaseAdmin.from('clubs').select('union_id').eq('id', clubId).single();
            let unionAuth = false;
            if (clubInfo?.union_id) {
                const { data: ua } = await supabaseAdmin.from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).single();
                unionAuth = !!ua;
            }
            if (!unionAuth) {
                return res.status(403).json({ success: false, error: 'Only owners, admins, or union admins can edit settings' });
            }
        }

        const updates = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name.trim().slice(0, 100);
        if (description !== undefined) updates.description = description.trim().slice(0, 500);
        if (isPublic !== undefined) updates.is_public = !!isPublic;
        if (requiresApproval !== undefined) updates.requires_approval = !!requiresApproval;
        if (colorTheme !== undefined) updates.color_theme = colorTheme;

        const { error: updateErr } = await supabaseAdmin
            .from('clubs')
            .update(updates)
            .eq('id', clubId);

        if (updateErr) throw updateErr;

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[save-settings]', err);
        return res.status(500).json({ success: false, error: err.message || 'Failed to save settings' });
    }
}
