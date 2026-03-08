/**
 * Sandbox Templates API
 * GET:    List user's saved templates
 * POST:   Save a new template
 * DELETE:  Remove a template by ID
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    try {
        // Extract user from auth header
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('sandbox_templates')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) return res.status(500).json({ error: error.message });
            return res.status(200).json({ templates: data || [] });
        }

        if (req.method === 'POST') {
            const { name, scenario } = req.body;
            if (!name || !scenario) return res.status(400).json({ error: 'Name and scenario required' });

            const { data, error } = await supabase
                .from('sandbox_templates')
                .insert({
                    user_id: user.id,
                    name: name.substring(0, 100),
                    scenario_json: scenario,
                })
                .select()
                .maybeSingle();

            if (error) {
                console.warn('[Templates] Save error:', error.message);
                return res.status(500).json({ error: error.message });
            }

            return res.status(201).json({ template: data });
        }

        if (req.method === 'DELETE') {
            const { id } = req.body || req.query;
            if (!id) return res.status(400).json({ error: 'Template ID required' });

            const { error } = await supabase
                .from('sandbox_templates')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) return res.status(500).json({ error: error.message });
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[Templates API] Error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
