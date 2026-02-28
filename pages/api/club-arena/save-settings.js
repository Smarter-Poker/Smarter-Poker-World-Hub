/**
 * POST /api/club-arena/save-settings
 * Update club name, description, and settings.
 * Auth: Bearer token (owner or admin only)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { clubId, name, description, isPublic, requiresApproval, colorTheme } = req.body;
    if (!clubId) return res.status(400).json({ error: 'clubId required' });

    try {
        const { data: member } = await supabaseAdmin
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .single();

        if (!member || !['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ error: 'Only owners and admins can edit settings' });
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
        return res.status(500).json({ error: err.message || 'Failed to save settings' });
    }
}
