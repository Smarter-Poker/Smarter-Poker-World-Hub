import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    const { data: authors, error } = await supabase.from('content_authors').select('id, name, gender, avatar_url');
    if (error) { console.error(error); return; }

    // Check specific horses
    const targetHorses = authors.filter(a => a.name.includes("Maria Rodriguez") || a.name.includes("Vanessa Morgan"));
    console.log("Target horses:");
    for (const h of targetHorses) {
        console.log(`- ${h.name} (${h.gender}): ${h.avatar_url}`);
    }

    // Let's also download them to compare sizes
    for (const h of targetHorses) {
        if (!h.avatar_url) continue;
        const res = await fetch(h.avatar_url);
        const buf = await res.arrayBuffer();
        console.log(`Buffer size for ${h.name}: ${buf.byteLength} bytes`);
    }
}
check();
