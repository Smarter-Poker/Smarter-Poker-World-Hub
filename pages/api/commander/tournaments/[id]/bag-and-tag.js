import { createClient } from '../../../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { id } = req.query; // tournamentId
        const { chip_counts } = req.body; // Array of { entry_id, player_name, chip_count }

        if (!id || !chip_counts || !Array.isArray(chip_counts)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify Staff token (assuming middleware handles the main check, but double-checking)
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        // 1. Get current tournament to verify existence and multi-day status
        const { data: tournament, error: fetchErr } = await supabase
            .from('commander_tournaments')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchErr || !tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }

        if (!tournament.is_multi_day) {
            return res.status(400).json({ error: 'Cannot bag-and-tag a single-day tournament' });
        }

        // 2. Add 'bagged_at' timestamp to all chip counts
        const timestamp = new Date().toISOString();
        const formattedChipCounts = chip_counts.map(c => ({
            ...c,
            bagged_at: c.bagged_at || timestamp
        }));

        // 3. Update the tournament's JSONB column
        // We append if there are existing counts, or just set if empty
        const existingCounts = tournament.day_end_chip_counts || [];

        // Filter out any previous counts for these specific entries to prevent duplicates
        const entryIdsToUpdate = new Set(formattedChipCounts.map(c => c.entry_id));
        const keptExistingCounts = existingCounts.filter(c => !entryIdsToUpdate.has(c.entry_id));

        const mergedCounts = [...keptExistingCounts, ...formattedChipCounts];

        const { error: updateErr } = await supabase
            .from('commander_tournaments')
            .update({ day_end_chip_counts: mergedCounts })
            .eq('id', id);

        if (updateErr) throw updateErr;

        // 4. Update the actual entries in commander_tournament_entries to 'bagged' status
        if (entryIdsToUpdate.size > 0) {
            const entryIdsArr = Array.from(entryIdsToUpdate);
            const { error: entriesErr } = await supabase
                .from('commander_tournament_entries')
                .update({ status: 'bagged' })
                .in('id', entryIdsArr);

            if (entriesErr) {
                console.error('Failed to update entry statuses to bagged', entriesErr);
                // Continuing since the chip counts were saved on the tournament level
            }
        }

        return res.status(200).json({ success: true, count: formattedChipCounts.length });

    } catch (err) {
        console.error('[BagAndTag Error]:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
