/**
 * Quick audit: Query content_authors + profiles for horse data
 */
import { createClient } from '@supabase/supabase-js';

// Use known credentials (same as registerHorsesAsUsers.js)
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function audit() {
    console.log('🐴 HORSE AUDIT\n');

    // 1. Get ALL content_authors
    const { data: allAuthors, error: authErr } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, avatar_url, profile_id, is_active, created_at, location, bio, voice')
        .order('created_at', { ascending: false })
        .limit(500);

    if (authErr) { console.error('Error:', authErr.message); return; }
    console.log(`Total content_authors: ${allAuthors?.length || 0}\n`);

    // 2. Horses added today
    const today = '2026-03-11';
    const todayHorses = allAuthors?.filter(h => h.created_at?.startsWith(today)) || [];
    console.log(`Horses added today (${today}): ${todayHorses.length}`);

    // 3. Stats
    const noAvatar = allAuthors?.filter(h => !h.avatar_url) || [];
    const noGender = allAuthors?.filter(h => !h.gender) || [];
    const noProfile = allAuthors?.filter(h => !h.profile_id) || [];
    const noBio = allAuthors?.filter(h => !h.bio) || [];
    const noLoc = allAuthors?.filter(h => !h.location) || [];
    console.log(`Missing avatars: ${noAvatar.length}`);
    console.log(`Missing gender: ${noGender.length}`);
    console.log(`Missing profile_id: ${noProfile.length}`);
    console.log(`Missing bio: ${noBio.length}`);
    console.log(`Missing location: ${noLoc.length}`);

    // 4. Alias-style names (no space = probably an alias, not a real name)
    const aliasNames = allAuthors?.filter(h => h.name && !h.name.includes(' ')) || [];
    console.log(`\nAlias-style names (no space): ${aliasNames.length}`);
    if (aliasNames.length > 0) {
        aliasNames.slice(0, 15).forEach(h => console.log(`  "${h.name}" (alias: ${h.alias})`));
        if (aliasNames.length > 15) console.log(`  ... and ${aliasNames.length - 15} more`);
    }

    // 5. Show first 50 of today's horses
    if (todayHorses.length > 0) {
        console.log(`\n--- FIRST 50 TODAY'S HORSES ---`);
        todayHorses.slice(0, 50).forEach((h, i) => {
            console.log(`${String(i+1).padStart(3)}. name="${h.name}" gender=${h.gender||'NONE'} avatar=${h.avatar_url ? 'YES' : 'NO'} profile=${h.profile_id ? 'YES' : 'NO'} loc="${h.location||'NONE'}"`);
        });
        if (todayHorses.length > 50) console.log(`... and ${todayHorses.length - 50} more`);
    }

    // 6. Horse profiles
    const { data: horseProfiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .like('id', 'horse-%')
        .order('id')
        .limit(500);

    console.log(`\n--- PROFILES TABLE ---`);
    console.log(`Horse profiles (horse-*): ${horseProfiles?.length || 0}`);
    const profilesNoAvatar = horseProfiles?.filter(p => !p.avatar_url) || [];
    const profilesAliasDisplay = horseProfiles?.filter(p => p.display_name && !p.display_name.includes(' ')) || [];
    console.log(`Profiles missing avatars: ${profilesNoAvatar.length}`);
    console.log(`Profiles with alias-style display_name: ${profilesAliasDisplay.length}`);
    if (profilesAliasDisplay.length > 0) {
        console.log('  Alias display_names:');
        profilesAliasDisplay.slice(0, 10).forEach(p => console.log(`    ${p.id}: display="${p.display_name}" user="${p.username}"`));
    }

    // Sample profiles
    if (horseProfiles?.length > 0) {
        console.log('\nSample profiles (first 10):');
        horseProfiles.slice(0, 10).forEach(p => {
            console.log(`  ${p.id}: user="${p.username}" display="${p.display_name}" avatar=${p.avatar_url ? p.avatar_url.slice(0,60)+'...' : 'NONE'}`);
        });
    }

    // 7. Content authors that have profile but profile might show username (alias)
    // Check if today's horses have matching entries in profiles
    const todayWithProfile = todayHorses.filter(h => h.profile_id);
    const todayWithoutProfile = todayHorses.filter(h => !h.profile_id);
    console.log(`\nToday's horses WITH profile: ${todayWithProfile.length}`);
    console.log(`Today's horses WITHOUT profile: ${todayWithoutProfile.length}`);
}

audit().catch(console.error);
