/**
 * Simple endpoint to populate horse source assignments
 * POST /api/admin/populate-sources
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// All 50 poker content sources
const SOURCES = [
    'HCL', 'LODGE', 'LATB', 'TCH', 'TRITON', 'POKERGO', 'WSOP', 'WPT', 'EPT', 'PAD',
    'PARTYPOKER', 'GGP', 'POKERSTARS', 'POKERNEWS', 'BRAD', 'NEEME', 'MARIANO', 'RAMPAGE',
    'WOLFGANG', 'JAMAN', 'JOHNNIE', 'BOSKI', 'RYAN', 'LEX_O', 'FRANKIE', 'NORCAL',
    'GREG_ALL_IN', 'BRANTZEN', 'HARRY_B', 'SETHY', 'POKER_BABO', 'DOUG_MC', 'CHARLIE',
    'BOTEZ', 'JLITTLE', 'BART', 'POLK', 'UPSWING', 'POKERCOACHING', 'SPLITSUIT',
    'GRIPSED', 'BLACKRAIN', 'POKERBANK', 'ALEC', 'BENCB', 'KEVIN_M', 'DANIEL',
    'HELLMUTH', 'IVEY', 'DWAN'
];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get all horse profiles
        const { data: horses, error: horsesError } = await supabase
            .from('profiles')
            .select('id, alias')
            .eq('is_horse', true)
            .order('created_at', { ascending: true });

        if (horsesError) {
            return res.status(500).json({ error: 'Failed to fetch horses', details: horsesError });
        }

        console.log(`Found ${horses.length} horses`);

        // Clear existing assignments
        await supabase.from('horse_source_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // Assign each horse to 2 sources
        const assignments = [];
        for (let i = 0; i < horses.length; i++) {
            const horse = horses[i];
            const primarySource = SOURCES[i % SOURCES.length];
            const secondarySource = SOURCES[(i + 25) % SOURCES.length];

            assignments.push({
                horse_id: horse.id,
                source_name: primarySource,
                is_primary: true
            });

            if (primarySource !== secondarySource) {
                assignments.push({
                    horse_id: horse.id,
                    source_name: secondarySource,
                    is_primary: false
                });
            }
        }

        // Insert in batches
        let inserted = 0;
        for (let i = 0; i < assignments.length; i += 50) {
            const batch = assignments.slice(i, i + 50);
            const { error } = await supabase.from('horse_source_assignments').insert(batch);
            if (!error) inserted += batch.length;
        }

        return res.status(200).json({
            success: true,
            horses: horses.length,
            assignments: inserted
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
