// Admin CRUD for promo codes — GET (list), POST (create), DELETE (deactivate)
import { createClient } from '@supabase/supabase-js';
const { logAdminAction, extractClientIP } = require('../../../src/lib/antiAbuse');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateCode(length = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 for readability
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export default async function handler(req, res) {
    // Verify user is authenticated
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Verify user is owner or manager at a venue
    const { data: staff } = await supabaseAdmin
        .from('commander_staff')
        .select('id, role, venue_id')
        .eq('user_id', user.id)
        .in('role', ['owner', 'manager'])
        .eq('is_active', true)
        .limit(1)
        .single();

    if (!staff) {
        return res.status(403).json({ success: false, error: 'Only owners and managers can manage promo codes' });
    }

    // GET — List all promo codes
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabaseAdmin
                .from('promo_codes')
                .select(`
                    *,
                    promo_code_redemptions(count)
                `)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;

            return res.status(200).json({ codes: data || [] });
        } catch (err) {
            console.error('List promo codes error:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch promo codes' });
        }
    }

    // POST — Create a new promo code
    if (req.method === 'POST') {
        const { code, description, type, value, maxUses, expiresAt } = req.body;

        try {
            const promoCode = code?.toUpperCase().trim() || generateCode();

            const { data, error } = await supabaseAdmin
                .from('promo_codes')
                .insert({
                    code: promoCode,
                    description: description || '',
                    reward_type: type || 'signup_bonus',
                    reward_value: parseInt(value) || 0,
                    max_uses: maxUses ? parseInt(maxUses) : null,
                    expires_at: expiresAt || null,
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    return res.status(400).json({ success: false, error: 'A promo code with this name already exists' });
                }
                throw error;
            }

            // Audit log
            await logAdminAction(supabaseAdmin, {
                admin_user_id: user.id,
                action: 'promo_code_created',
                target_type: 'promo_code',
                target_id: data.id,
                details: { code: promoCode, type, value, maxUses, expiresAt },
                ip_address: extractClientIP(req),
            });

            return res.status(201).json({ code: data });
        } catch (err) {
            console.error('Create promo code error:', err);
            return res.status(500).json({ success: false, error: 'Failed to create promo code' });
        }
    }

    // DELETE — Deactivate a promo code
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ success: false, error: 'Code ID required' });

        try {
            const { error } = await supabaseAdmin
                .from('promo_codes')
                .update({ is_active: false })
                .eq('id', id);

            if (error) throw error;

            // Audit log
            await logAdminAction(supabaseAdmin, {
                admin_user_id: user.id,
                action: 'promo_code_deactivated',
                target_type: 'promo_code',
                target_id: id,
                ip_address: extractClientIP(req),
            });

            return res.status(200).json({ success: true });
        } catch (err) {
            console.error('Deactivate promo code error:', err);
            return res.status(500).json({ success: false, error: 'Failed to deactivate promo code' });
        }
    }

    // PATCH — Update promo code (toggle, rename, set max uses, etc.)
    if (req.method === 'PATCH') {
        const { id, is_active, code, description, max_uses, reward_type, reward_value, expires_at } = req.body;
        if (!id) return res.status(400).json({ success: false, error: 'Code ID required' });

        try {
            const updates = {};
            if (is_active !== undefined) updates.is_active = is_active;
            if (code !== undefined) updates.code = code.toUpperCase().trim();
            if (description !== undefined) updates.description = description;
            if (max_uses !== undefined) updates.max_uses = max_uses === '' || max_uses === null ? null : parseInt(max_uses);
            if (reward_type !== undefined) updates.reward_type = reward_type;
            if (reward_value !== undefined) updates.reward_value = parseInt(reward_value) || 0;
            if (expires_at !== undefined) updates.expires_at = expires_at || null;

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ success: false, error: 'No updates provided' });
            }

            const { data, error } = await supabaseAdmin
                .from('promo_codes')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    return res.status(400).json({ success: false, error: 'A promo code with this name already exists' });
                }
                throw error;
            }

            // Audit log for PATCH
            await logAdminAction(supabaseAdmin, {
                admin_user_id: user.id,
                action: 'promo_code_updated',
                target_type: 'promo_code',
                target_id: id,
                details: updates,
                ip_address: extractClientIP(req),
            });

            return res.status(200).json({ success: true, code: data });
        } catch (err) {
            console.error('Update promo code error:', err);
            return res.status(500).json({ success: false, error: 'Failed to update promo code' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
