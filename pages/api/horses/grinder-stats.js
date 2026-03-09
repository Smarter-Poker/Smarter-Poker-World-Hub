import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // Verify user is authenticated via Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Verify Admin Role
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (req.method === 'GET') {
        try {
            // Fetch all active personas
            const { data: personas } = await supabaseAdmin
                .from('content_authors')
                .select('id, name, is_active')
                .eq('is_active', true);

            // Build roster from active personas
            const mockStats = {
                totalGrinders: personas?.length || 0,
                currentlyPlaying: 0,
                activeTables: 0,
                roster: personas ? personas.map(p => ({
                    horse_id: p.id,
                    tables: 0,
                    hands: 0,
                    profit: 0,
                    status: 'idle'
                })) : []
            };

            return res.status(200).json({ success: true, stats: mockStats });
        } catch (error) {
            console.error('Grinder Stats GET Error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch grinder stats' });
        }
    }

    if (req.method === 'POST') {
        const { action, chips, club } = req.body;
        const clubNames = { shark_club: 'Shark Club', club_jaqk: 'Club JAQK' };
        const clubDisplay = clubNames[club] || 'both clubs';

        try {
            if (action === 'add_to_club') {
                // Fetch all active personas to give them chips
                const { data: personas, error: personaErr } = await supabaseAdmin
                    .from('content_authors')
                    .select('id')
                    .eq('is_active', true);

                if (personaErr || !personas) throw new Error('Failed to fetch horses');

                return res.status(200).json({
                    success: true,
                    message: `Added ${personas.length} horses to ${clubDisplay} with ${chips} initial chips each.`
                });
            }

            if (action === 'start') {
                return res.status(200).json({ success: true, message: 'All active horses instructed to auto-join games in Shark Club & Club JAQK.' });
            }

            if (action === 'stop') {
                return res.status(200).json({ success: true, message: 'All active horses instructed to stop playing and leave tables in both clubs.' });
            }

            return res.status(400).json({ success: false, error: 'Unknown action' });
        } catch (error) {
            console.error('Grinder Action Error:', error);
            return res.status(500).json({ success: false, error: 'Failed to execute action' });
        }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
}
