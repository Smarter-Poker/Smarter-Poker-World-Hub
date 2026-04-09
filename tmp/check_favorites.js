const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFavorites() {
    const obsoleteIds = [2959, 2960, 2818, 2633, 2658, 2718];
    const { data, error } = await supabase
        .from('poker_near_me_favorites')
        .select('*');
        // If there's an FK constraint, they would be cascade deleted, but let's check ALL favorites to see how many exist.
        
    if (error) {
        console.error("Error checking favorites:", error.message);
    } else {
        console.log(`There are ${data.length} total favorites.`);
        const orphaned = data.filter(d => obsoleteIds.includes(d.venue_id));
        console.log("Orphaned/Obsolete favorites found:", orphaned.length);
        if (orphaned.length > 0) {
            console.log(orphaned);
        }
    }
}
checkFavorites();
