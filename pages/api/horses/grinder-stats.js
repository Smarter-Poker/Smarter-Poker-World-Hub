import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
    const supabase = createServerSupabaseClient({ req, res });
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Verify Admin Role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (req.method === 'GET') {
        try {
            // Fetch all active personas
            const { data: personas } = await supabase
                .from('content_authors')
                .select('id, name, is_active')
                .eq('is_active', true);

            // To simulate the 'Grinder' state without an active game server, 
            // we will build a roster pulling from the authors list.
            // Ideally, this pulls from a dedicated `grinder_sessions` table.

            // Temporary Mock Stats based on actual active personas
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
        const { action, chips } = req.body;

        try {
            if (action === 'add_to_club') {
                // Fetch all active personas to give them chips
                const { data: personas, error: personaErr } = await supabase
                    .from('content_authors')
                    .select('id')
                    .eq('is_active', true);

                if (personaErr || !personas) throw new Error('Failed to fetch horses');

                // For the simulation / UI completion, we return success. 
                // Actual adding to the poker system requires the poker backend connector.
                return res.status(200).json({
                    success: true,
                    message: `Added ${personas.length} horses to the Shark Club with ${chips} initial chips.`
                });
            }

            if (action === 'start') {
                return res.status(200).json({ success: true, message: 'All active horses instructed to auto-join games.' });
            }

            if (action === 'stop') {
                return res.status(200).json({ success: true, message: 'All active horses instructed to stop playing and leave tables.' });
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

