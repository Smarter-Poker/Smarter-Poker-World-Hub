import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS
const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncProfiles() {
    console.log('Fetching all content_authors to sync with profiles...');
    
    // Get all authors mapping name -> alias, bio
    const { data: authors, error: errA } = await supabase
        .from('content_authors')
        .select('name, alias, bio');
        
    if (errA || !authors) {
        console.error('Failed to get authors:', errA);
        return;
    }
    
    // Create map by display name
    const authorMap = {};
    for (const a of authors) {
        authorMap[a.name] = a;
    }
    
    console.log(`Loaded ${authors.length} authors.`);
    console.log('Fetching all profiles to check for matches...');
    
    // Fetch all profiles (paginate if large, but there might not be *that* many bot profiles)
    let allProfiles = [];
    let offset = 0;
    while (true) {
        const { data: profs, error: errP } = await supabase
            .from('profiles')
            .select('id, username, display_name, bio, role')
            .range(offset, offset + 999);
            
        if (errP) {
            console.error('Error fetching profiles:', errP);
            break;
        }
        if (!profs || profs.length === 0) break;
        allProfiles = allProfiles.concat(profs);
        if (profs.length < 1000) break;
        offset += 1000;
    }
    
    console.log(`Checking ${allProfiles.length} profiles against authors...`);
    
    let updated = 0;
    
    for (const p of allProfiles) {
        // If display match an author, or if bio has "AI grinder" etc
        const matchedAuthor = authorMap[p.display_name];
        
        // Also check if bio needs cleaning just in case
        let needsBioClean = false;
        let pBio = p.bio || '';
        if (pBio.match(/\b(AI|horse|smarter\.poker|bot|Club Arena)\b/i)) {
            needsBioClean = true;
        }
        
        if (matchedAuthor) {
            // Need to sync username -> alias, and bio -> clean bio
            if (p.username !== matchedAuthor.alias || p.bio !== matchedAuthor.bio) {
                console.log(`Updating profile ${p.display_name} -> alias: ${matchedAuthor.alias}`);
                const { error: upErr } = await supabase
                    .from('profiles')
                    .update({
                        username: matchedAuthor.alias,
                        bio: matchedAuthor.bio
                    })
                    .eq('id', p.id);
                    
                if (upErr) {
                    console.error(`Failed to update profile ${p.display_name}:`, upErr);
                } else {
                    updated++;
                }
            }
        } else if (needsBioClean) {
            // No matching author but bio has prohibited terms
            let newBio = pBio.replace(/\b(AI|horse|smarter\.poker|bot|Club Arena)\b/gi, '').replace(/\s+/g, ' ').trim();
            console.log(`Cleaning bio for profile ${p.display_name || p.username} -> ${newBio}`);
            
            const { error: upErr } = await supabase
                .from('profiles')
                .update({ bio: newBio })
                .eq('id', p.id);
                
            if (upErr) {
                console.error(`Failed to update profile ${p.id}:`, upErr);
            } else {
                updated++;
            }
        }
    }
    
    console.log(`Finished. Updated ${updated} profiles.`);
}

syncProfiles().catch(console.error);
