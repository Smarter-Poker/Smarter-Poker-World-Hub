import { readFileSync } from 'fs';
const env = {};
readFileSync(new URL('.env.local', import.meta.url).pathname, 'utf-8').split('\n').forEach(l => {
    const m = l.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
});
const row = {
    id: crypto.randomUUID(),
    venue_id: 1864,
    export_type: 'players',
    format: 'csv',
    status: 'completed',
    row_count: 100,
};
console.log('Sending:', JSON.stringify(row, null, 2));
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/commander_export_jobs`, {
    method: 'POST',
    headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    },
    body: JSON.stringify(row),
});
console.log('Status:', res.status);
const txt = await res.text();
console.log('Response:', txt.substring(0, 500));
