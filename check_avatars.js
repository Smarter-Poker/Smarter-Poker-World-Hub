import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    const { data: authors, error } = await supabase.from('content_authors').select('id, name, gender, avatar_url');
    if (error) { console.error(error); return; }
    
    const urlMap = new Map();
    let duplicates = 0;
    
    // Check duplicates
    for (const a of authors) {
        if (!a.avatar_url) continue;
        if (!urlMap.has(a.avatar_url)) urlMap.set(a.avatar_url, []);
        urlMap.get(a.avatar_url).push(a.name);
    }
    
    console.log("=== DUPLICATES ===");
    for (const [url, names] of urlMap.entries()) {
        if (names.length > 1) {
            console.log(`URL used by multiple horses (${names.length}):\n  ${url}\n  Horses: ${names.join(', ')}`);
            duplicates++;
        }
    }
    if (duplicates === 0) console.log("No exact URL duplicates found.");
    
    console.log("\nTotal authors:", authors.length);
}
check();
