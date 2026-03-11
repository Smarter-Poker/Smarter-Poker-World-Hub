const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

function extractVersion(filename) {
    const match = path.basename(filename).match(/^(\d{8,14})/);
    return match ? match[1] : null;
}

async function patch() {
  const files = ['20260311000000_club_chat.sql', '20260311000001_orb8_phase4_audit.sql'];
  let count = 0;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  for (const file of files) {
    const version = extractVersion(file);
    if (!version) continue;
    
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
           query: `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${version}', '${file}') ON CONFLICT DO NOTHING;` 
        })
      });
      
      if (res.ok) {
        count++;
      } else {
        console.log('Error hitting RPC for', file, await res.text());
      }
    } catch (e) {
      console.log('Fetch error:', file, e.message);
    }
  }
  console.log(`✅ Ledger fully patched via exec_sql RPC from .env.local. Processed ${count} files.`);
}
patch();
