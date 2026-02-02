const https = require('https');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const sql = fs.readFileSync('./supabase/migrations/20260129_live_help_system.sql', 'utf8');

// Use Supabase Management API
const options = {
    hostname: 'api.supabase.com',
    path: '/v1/projects/kuklfnapbkmacvwxktbh/database/query',
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('Response:', data);
        if (res.statusCode === 200) {
            console.log('✅ Migration successful!');
        } else {
            console.error('❌ Migration failed');
        }
    });
});

req.on('error', (e) => {
    console.error('Error:', e);
});

req.write(JSON.stringify({ query: sql }));
req.end();
