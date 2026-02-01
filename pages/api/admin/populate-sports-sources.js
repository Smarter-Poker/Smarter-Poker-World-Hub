/**
 * POPULATE SPORTS SOURCE ASSIGNMENTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Assigns exclusive sports content sources to each horse.
 * Each horse gets 2 unique sports sources to prevent content overlap.
 * 
 * Sports sources: ESPN, NBA, NFL, MLB, NHL, SOCCER, HIGHLIGHTS, BLEACHER
 * 
 * GET /api/admin/populate-sports-sources
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Available sports content sources
const SPORTS_SOURCES = [
    'ESPN',
    'NBA',
    'NFL',
    'MLB',
    'NHL',
    'SOCCER',
    'HIGHLIGHTS',  // House of Highlights
    'BLEACHER'     // Bleacher Report
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('🏈 Starting sports source assignment...');

        // Get all active horses
        const { data: horses, error: horsesError } = await supabase
            .from('content_authors')
            .select('profile_id, alias')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .order('created_at', { ascending: true });

        if (horsesError) {
            console.error('Error fetching horses:', horsesError);
            return res.status(500).json({ error: 'Failed to fetch horses', details: horsesError });
        }

        if (!horses || horses.length === 0) {
            return res.status(200).json({ success: true, message: 'No horses found', assigned: 0 });
        }

        console.log(`   Found ${horses.length} active horses`);

        // Check if assignments already exist
        const { count: existingCount } = await supabase
            .from('horse_sports_source_assignments')
            .select('*', { count: 'exact', head: true });

        if (existingCount > 0) {
            console.log(`   ⚠️ ${existingCount} assignments already exist`);
            return res.status(200).json({
                success: true,
                message: 'Assignments already exist',
                existing_count: existingCount,
                note: 'Delete existing assignments first if you want to reassign'
            });
        }

        // Assign 2 sources per horse, cycling through available sources
        const assignments = [];
        let sourceIndex = 0;

        for (const horse of horses) {
            // Assign primary source
            const primarySource = SPORTS_SOURCES[sourceIndex % SPORTS_SOURCES.length];
            sourceIndex++;

            // Assign secondary source
            const secondarySource = SPORTS_SOURCES[sourceIndex % SPORTS_SOURCES.length];
            sourceIndex++;

            assignments.push({
                horse_id: horse.profile_id,
                source_name: primarySource,
                is_primary: true
            });

            assignments.push({
                horse_id: horse.profile_id,
                source_name: secondarySource,
                is_primary: false
            });

            console.log(`   ✅ ${horse.alias}: ${primarySource} (primary), ${secondarySource} (secondary)`);
        }

        // Insert all assignments
        const { data: inserted, error: insertError } = await supabase
            .from('horse_sports_source_assignments')
            .insert(assignments)
            .select();

        if (insertError) {
            console.error('Error inserting assignments:', insertError);
            return res.status(500).json({ error: 'Failed to insert assignments', details: insertError });
        }

        console.log(`   ✅ Inserted ${inserted.length} sports source assignments`);

        // Get summary by source
        const sourceCounts = {};
        assignments.forEach(a => {
            sourceCounts[a.source_name] = (sourceCounts[a.source_name] || 0) + 1;
        });

        return res.status(200).json({
            success: true,
            horses_assigned: horses.length,
            total_assignments: inserted.length,
            assignments_per_horse: 2,
            source_distribution: sourceCounts,
            message: `Successfully assigned ${SPORTS_SOURCES.length} sports sources to ${horses.length} horses`
        });

    } catch (error) {
        console.error('Error in populate-sports-sources:', error);
        return res.status(500).json({ error: error.message });
    }
}
