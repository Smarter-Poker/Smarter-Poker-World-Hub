const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function exec() {
  const sql = fs.readFileSync('/tmp/orb-04-notification-preferences.sql', 'utf8');
  console.log('Deploying via rpc/exec_sql...');
  const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ query: sql })
  });
  if (!res.ok) console.error(await res.text());
  else {
    console.log('SUCCESS:', await res.json());
  }
}
exec();
