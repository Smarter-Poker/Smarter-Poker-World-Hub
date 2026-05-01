const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
    if (line && line.includes('=')) {
        const idx = line.indexOf('=');
        const key = line.substring(0, idx).trim();
        let val = line.substring(idx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        acc[key] = val;
    }
    return acc;
}, {});

const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const sql = fs.readFileSync('supabase/migrations/20260501000000_add_messenger_last_message_trigger.sql', 'utf8');

async function main() {
    const resp = await fetch('https://smarter.poker/api/admin/execute-sql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({ sql })
    });
    const result = await resp.json();
    console.log(result);
}

main().catch(console.error);
