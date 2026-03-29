const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function exec() {
  const sql = fs.readFileSync('/tmp/orb-04-notification-preferences.sql', 'utf8');
  console.log('Sending migration to smarter.poker...');
  const res = await fetch('https://smarter.poker/api/admin/execute-sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ sql })
  });
  if (!res.ok) {
      console.error('Failed:', await res.text());
  } else {
    console.log('Successfully deployed to Live Database!');
    console.log(await res.json());
  }
}
exec();
