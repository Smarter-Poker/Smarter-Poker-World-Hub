const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: `${__dirname}/../../.agent/skills/credentials/.env` });

function getBaseName(name) {
    let base = name;
    if (base.includes(' - ')) {
        base = base.split(' - ')[0];
    }
    if (base.includes(' — ')) {
        base = base.split(' — ')[0];
    }
    base = base.trim();
    if (base.toLowerCase().startsWith('lodge ')) {
        return 'Lodge';
    }
    return base;
}

/**
 * Robust, canonical utility for "Upsert by Name/Address"
 * Used by existing scrapers and cron jobs.
 */
async function upsertVenue(supabase, venueData) {
    if (!venueData.name) {
        return { success: false, reason: 'No name provided' };
    }

    const baseName = getBaseName(venueData.name);

    // Find existing
    const { data: existingVenues, error: searchError } = await supabase
        .from('poker_venues')
        .select('id, name')
        .filter('name', 'ilike', `${baseName}%`)
        .order('id', { ascending: true }); // Prefer oldest/primary

    if (searchError) {
        console.error(`  ❌ Error searching for venue ${venueData.name}:`, searchError.message);
        return { success: false, reason: searchError.message };
    }

    // Clean data
    const cleanData = {};
    for (const [key, value] of Object.entries(venueData)) {
        if (value !== undefined && value !== null && value !== '') {
            cleanData[key] = value;
        }
    }
    if ('is_active' in cleanData) {
        cleanData['is_active'] = true;
    }

    if (existingVenues && existingVenues.length > 0) {
        const targetId = existingVenues[0].id;
        // Update the existing venue with new information
        const { error: updateError } = await supabase
            .from('poker_venues')
            .update(cleanData)
            .eq('id', targetId);

        if (updateError) {
            console.error(`  ❌ Update failed for ${venueData.name}:`, updateError.message);
            return { success: false, status: 'error', reason: updateError.message };
        }
        
        console.log(`  🔄 Updated existing venue (ID: ${targetId}): ${venueData.name}`);
        return { success: true, status: 'updated', id: targetId };
    } else {
        // Insert new venue
        const { data: newVenue, error: insertError } = await supabase
            .from('poker_venues')
            .insert([cleanData])
            .select('id')
            .single();

        if (insertError) {
            if (insertError.code === '23505') {
                console.log(`  ⏭️  Unique constraint duplicate: ${venueData.name}`);
                return { success: false, status: 'skipped', reason: 'unique constraint' };
            }
            console.error(`  ❌ Insert failed for ${venueData.name}:`, insertError.message);
            return { success: false, status: 'error', reason: insertError.message };
        }

        console.log(`  ✅ Inserted new venue: ${venueData.name}`);
        return { success: true, status: 'inserted', id: newVenue.id };
    }
}

module.exports = {
    upsertVenue,
    getBaseName
};
