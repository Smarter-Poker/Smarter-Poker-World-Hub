// Admin CRUD for promo codes — GET (list), POST (create), DELETE (deactivate)
import { createClient } from '@supabase/supabase-js';

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
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // GET — List all promo codes
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabaseAdmin
                .from('promo_codes')
                .select(`
                    *,
                    promo_code_redemptions(count)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return res.status(200).json({ codes: data || [] });
        } catch (err) {
            console.error('List promo codes error:', err);
            return res.status(500).json({ error: 'Failed to fetch promo codes' });
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
                    type: type || 'signup_bonus',
                    value: parseInt(value) || 0,
                    max_uses: maxUses ? parseInt(maxUses) : null,
                    expires_at: expiresAt || null,
                    created_by: user.id,
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    return res.status(400).json({ error: 'A promo code with this name already exists' });
                }
                throw error;
            }

            return res.status(201).json({ code: data });
        } catch (err) {
            console.error('Create promo code error:', err);
            return res.status(500).json({ error: 'Failed to create promo code' });
        }
    }

    // DELETE — Deactivate a promo code
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Code ID required' });

        try {
            const { error } = await supabaseAdmin
                .from('promo_codes')
                .update({ is_active: false })
                .eq('id', id);

            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (err) {
            console.error('Deactivate promo code error:', err);
            return res.status(500).json({ error: 'Failed to deactivate promo code' });
        }
    }

    // PATCH — Toggle active status
    if (req.method === 'PATCH') {
        const { id, is_active } = req.body;
        if (!id) return res.status(400).json({ error: 'Code ID required' });

        try {
            const { error } = await supabaseAdmin
                .from('promo_codes')
                .update({ is_active })
                .eq('id', id);

            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (err) {
            console.error('Toggle promo code error:', err);
            return res.status(500).json({ error: 'Failed to update promo code' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
