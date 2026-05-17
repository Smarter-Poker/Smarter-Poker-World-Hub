require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
    try {
        console.log("Checking total articles in poker_news:");
        const { count, error: countErr } = await supabase
            .from('poker_news')
            .select('*', { count: 'exact', head: true });
        
        if (countErr) throw countErr;
        console.log(`Total count: ${count}`);

        console.log("\nChecking counts by source_name:");
        const { data: sources, error: sourceErr } = await supabase
            .from('poker_news')
            .select('source_name');
        
        if (sourceErr) throw sourceErr;
        const counts = {};
        sources.forEach(s => {
            counts[s.source_name] = (counts[s.source_name] || 0) + 1;
        });
        console.log(counts);

        console.log("\nChecking latest 5 articles:");
        const { data: latest, error: latestErr } = await supabase
            .from('poker_news')
            .select('id, title, source_name, published_at, is_published')
            .order('published_at', { ascending: false })
            .limit(5);
        
        if (latestErr) throw latestErr;
        console.log(latest);

        console.log("\nChecking latest 5 CardPlayer articles:");
        const { data: cp, error: cpErr } = await supabase
            .from('poker_news')
            .select('id, title, published_at, is_published')
            .eq('source_name', 'CardPlayer')
            .order('published_at', { ascending: false })
            .limit(5);
        
        if (cpErr) throw cpErr;
        console.log(cp);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspect();
