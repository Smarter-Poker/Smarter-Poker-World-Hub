/**
 * Crews Management API
 * POST /api/social/crews
 * Handles creating crews, joining via crew code, and leaving.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const supabase = getSupabase();
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);

        if (authErr || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const userId = user.id;
        const { action, payload } = req.body;

        if (!action) {
            return res.status(400).json({ error: 'Action is required.' });
        }

        switch (action) {
            case 'create': {
                const { name, description, avatar_url } = payload;
                if (!name || name.trim() === '') {
                    return res.status(400).json({ error: 'Crew name is required.' });
                }

                // Generate a random 6-character crew code
                const crew_code = 'CRW-' + Math.random().toString(36).substring(2, 8).toUpperCase();

                // Insert Crew
                const { data: crew, error: createErr } = await supabase
                    .from('crews')
                    .insert({
                        name: name.trim(),
                        description: description ? description.trim() : null,
                        avatar_url: avatar_url || null,
                        owner_id: userId,
                        crew_code: crew_code
                    })
                    .select()
                    .single();

                if (createErr) {
                    console.error('[Crews API] Create error:', createErr);
                    return res.status(500).json({ error: 'Failed to create crew.', details: createErr.message });
                }

                // Make the creator the owner in crew_members
                const { error: memberErr } = await supabase
                    .from('crew_members')
                    .insert({
                        crew_id: crew.id,
                        user_id: userId,
                        role: 'owner'
                    });

                if (memberErr) {
                    console.error('[Crews API] Add member error:', memberErr);
                }

                return res.status(200).json({ success: true, crew });
            }

            case 'join': {
                const { crew_code } = payload;
                if (!crew_code) {
                    return res.status(400).json({ error: 'Crew code is required.' });
                }

                const sanitizedCode = crew_code.trim().toUpperCase();

                // Find crew by code
                const { data: crew, error: findErr } = await supabase
                    .from('crews')
                    .select('id, name')
                    .eq('crew_code', sanitizedCode)
                    .maybeSingle();

                if (findErr || !crew) {
                    return res.status(404).json({ error: 'Invalid crew code.' });
                }

                // Enforce Crew size constraints (e.g. max 20)
                const { count: memberCount, error: countErr } = await supabase
                    .from('crew_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('crew_id', crew.id);

                if (countErr) {
                    return res.status(500).json({ error: 'Failed to check crew capacity.' });
                }

                if (memberCount >= 20) {
                    return res.status(400).json({ error: 'This Crew has reached the maximum size of 20 members.' });
                }

                // Check if already a member
                const { data: existing, error: existErr } = await supabase
                    .from('crew_members')
                    .select('id')
                    .eq('crew_id', crew.id)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (existing) {
                    return res.status(400).json({ error: 'You are already a member of this crew.' });
                }

                // Insert into crew_members
                const { data: joinRecord, error: joinErr } = await supabase
                    .from('crew_members')
                    .insert({
                        crew_id: crew.id,
                        user_id: userId,
                        role: 'member'
                    })
                    .select()
                    .single();

                if (joinErr) {
                    console.error('[Crews API] Join error:', joinErr);
                    return res.status(500).json({ error: 'Failed to join crew.' });
                }

                return res.status(200).json({ success: true, message: `Successfully joined ${crew.name}`, record: joinRecord });
            }

            case 'leave': {
                const { crew_id } = payload;
                if (!crew_id) {
                    return res.status(400).json({ error: 'Crew ID is required.' });
                }

                const { error: leaveErr } = await supabase
                    .from('crew_members')
                    .delete()
                    .match({ crew_id: crew_id, user_id: userId });

                if (leaveErr) {
                    console.error('[Crews API] Leave error:', leaveErr);
                    return res.status(500).json({ error: 'Failed to leave crew.' });
                }

                return res.status(200).json({ success: true, message: 'Successfully left crew.' });
            }

            default:
                return res.status(400).json({ error: 'Invalid action.' });
        }

    } catch (err) {
        console.error('[Crews API Error]', err);
        if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
    }
}
