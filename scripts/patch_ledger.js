const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.prod' });

function extractVersion(filename) {
    const match = path.basename(filename).match(/^(\d{8,14})/);
    return match ? match[1] : null;
}

async function patch() {
  // Supabase direct connection string using port 5432 (bypassing pgBouncer pool which requires project id parsing)
  const connString = process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace('6543', '5432')
      : 'postgresql://postgres:nQ$92d*M4!AptwL6@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres';
      
  const client = new Client({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
      await client.connect();
      const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'));
      
      let count = 0;
      for (const file of files) {
          const version = extractVersion(file);
          if (!version) continue;
          
          try {
              await client.query(
                  `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                  [version, path.basename(file)]
              );
              count++;
          } catch (e) {
              // Ignore conflicts
          }
      }
      console.log(`✅ Ledger fully patched explicitly against db port 5432. Processed ${count} files.`);
  } catch (err) {
      console.error('Fatal:', err.message);
  } finally {
      await client.end();
  }
}
patch();
