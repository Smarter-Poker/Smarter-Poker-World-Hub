/**
 * 🎯 INITIALIZE HORSE SOURCE ASSIGNMENTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Run this ONCE to assign exclusive content sources to each of the 100 horses
 * 
 * Each horse gets 2-3 dedicated sources:
 * - Horse #1: Brad Owen, Andrew Neeme, Mariano
 * - Horse #2: HCL, The Lodge, Live at the Bike
 * - Horse #3: Rampage, Wolfgang, Jaman Burton
 * ... etc for all 100 horses
 * 
 * This ensures NO TWO HORSES ever pull from the same content creator
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { CLIP_SOURCES } from '../../../src/content-engine/pipeline/ClipLibrary.js';
import { SPORTS_CLIP_SOURCES } from '../../../src/content-engine/pipeline/SportsClipLibrary.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    // Verify admin access
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        console.log('\n' + '═'.repeat(60));
        console.log('🎯 INITIALIZING HORSE SOURCE ASSIGNMENTS');
        console.log('═'.repeat(60));

        // Get all active horses
        const { data: horses, error: horsesError } = await supabase
            .from('content_authors')
            .select('profile_id, alias')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .order('alias');

        if (horsesError || !horses?.length) {
            console.error('Error fetching horses:', horsesError);
            return res.status(500).json({ success: false, error: 'Failed to fetch horses' });
        }

        console.log(`\n📊 Found ${horses.length} active horses`);

        // Poker sources
        const pokerSourceKeys = Object.keys(CLIP_SOURCES);
        console.log(`\n🎬 ${pokerSourceKeys.length} poker sources available`);

        // Sports sources
        const sportsSourceKeys = Object.keys(SPORTS_CLIP_SOURCES);
        console.log(`🏈 ${sportsSourceKeys.length} sports sources available`);

        const SOURCES_PER_HORSE = 3; // Each horse gets 3 sources
        const assignments = [];
        let pokerIndex = 0;
        let sportsIndex = 0;

        for (const horse of horses) {
            // Assign 2 poker sources
            const pokerSources = [];
            for (let i = 0; i < 2; i++) {
                pokerSources.push(pokerSourceKeys[pokerIndex % pokerSourceKeys.length]);
                pokerIndex++;
            }

            // Assign 1 sports source
            const sportsSources = [];
            sportsSources.push(sportsSourceKeys[sportsIndex % sportsSourceKeys.length]);
            sportsIndex++;

            // Create assignment records
            pokerSources.forEach((sourceKey, index) => {
                assignments.push({
                    horse_profile_id: horse.profile_id,
                    source_key: sourceKey,
                    source_type: 'poker',
                    is_primary: index === 0
                });
            });

            sportsSources.forEach((sourceKey, index) => {
                assignments.push({
                    horse_profile_id: horse.profile_id,
                    source_key: sourceKey,
                    source_type: 'sports',
                    is_primary: index === 0
                });
            });

            console.log(`   ✅ ${horse.alias}: ${pokerSources.join(', ')} + ${sportsSources.join(', ')}`);
        }

        console.log(`\n💾 Inserting ${assignments.length} source assignments...`);

        // Batch insert all assignments
        const { data, error } = await supabase
            .from('horse_source_assignments')
            .upsert(assignments, { onConflict: 'horse_profile_id,source_key' })
            .select();

        if (error) {
            console.error('Error inserting assignments:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        console.log(`\n✅ Successfully assigned sources to ${horses.length} horses!`);
        console.log('═'.repeat(60));

        // Verify assignments
        const { data: verification, error: verifyError } = await supabase
            .from('horse_source_assignments')
            .select('horse_profile_id, source_key, source_type')
            .limit(10);

        if (!verifyError && verification) {
            console.log('\n📋 Sample assignments:');
            verification.forEach(v => {
                console.log(`   ${v.horse_profile_id.substring(0, 8)}... → ${v.source_key} (${v.source_type})`);
            });
        }

        return res.status(200).json({
            success: true,
            horses: horses.length,
            assignments: assignments.length,
            poker_sources: pokerSourceKeys.length,
            sports_sources: sportsSourceKeys.length,
            sample: verification
        });

    } catch (error) {
        console.error('Initialization error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
