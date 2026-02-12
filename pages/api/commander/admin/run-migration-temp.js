/**
 * TEMPORARY MIGRATION RUNNER — DELETE AFTER SUCCESSFUL RUN
 * POST /api/commander/admin/run-migration-temp
 */
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (req.headers['x-migration-key'] !== 'run-migrations-20260212') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let pg;
  try {
    pg = (await import('pg')).default;
  } catch (e) {
    return res.status(500).json({ error: 'pg not available: ' + e.message });
  }

  const supabaseRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .replace('https://', '').replace('.supabase.co', '');
  
  if (!supabaseRef) {
    return res.status(500).json({ error: 'NEXT_PUBLIC_SUPABASE_URL not set' });
  }

  // Try multiple connection methods
  const connectionConfigs = [
    // Method 1: Direct connection with DB password
    process.env.SUPABASE_DB_PASSWORD ? {
      name: 'direct+db_password',
      host: `db.${supabaseRef}.supabase.co`,
      port: 5432, database: 'postgres', user: 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    } : null,
    // Method 2: Supavisor pooler (transaction mode)
    {
      name: 'pooler+service_key',
      host: `aws-0-us-east-1.pooler.supabase.com`,
      port: 5432, database: 'postgres',
      user: `postgres.${supabaseRef}`,
      password: process.env.SUPABASE_SERVICE_ROLE_KEY,
      ssl: { rejectUnauthorized: false }
    },
    // Method 3: Direct connection with service role key
    {
      name: 'direct+service_key',
      host: `db.${supabaseRef}.supabase.co`,
      port: 5432, database: 'postgres', user: 'postgres',
      password: process.env.SUPABASE_SERVICE_ROLE_KEY,
      ssl: { rejectUnauthorized: false }
    },
    // Method 4: Pooler session mode (port 5432)
    {
      name: 'pooler_session+service_key',
      host: `aws-0-us-east-1.pooler.supabase.com`,
      port: 5432, database: 'postgres',
      user: `postgres.${supabaseRef}`,
      password: process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY,
      ssl: { rejectUnauthorized: false }
    },
  ].filter(Boolean);

  let client;
  let connectedWith = null;
  const connectionErrors = [];

  for (const config of connectionConfigs) {
    try {
      const { name, ...pgConfig } = config;
      client = new pg.Client({ ...pgConfig, connectionTimeoutMillis: 8000 });
      await client.connect();
      connectedWith = name;
      break;
    } catch (err) {
      connectionErrors.push(`${config.name}: ${err.message}`);
      try { await client.end(); } catch (e) {}
      client = null;
    }
  }

  if (!client) {
    return res.status(500).json({
      success: false,
      error: 'Could not connect to database with any method',
      connectionErrors,
      hint: 'Set SUPABASE_DB_PASSWORD env var in Vercel with your Supabase database password'
    });
  }

  const results = [`✅ Connected via ${connectedWith}`];

  try {
    const migrationFiles = [
      '20260211_commander_phase7.sql',
      '20260211_commander_table_assignments.sql',
      '20260212_cash_transactions.sql',
      '20260212_shift_handoffs.sql',
      '20260212_table_ratings_seat_prefs.sql',
      '20260212_player_reputation.sql',
      '20260212_pvp_stats_table.sql',
      '20260212_membership_plans.sql',
      '20260212_game_types_presets.sql',
      '20260212_members_comp_balance.sql',
      '20260212_tournament_brackets_and_rls.sql',
      '20260212_staff_name_fields.sql',
      '20260212_vip_system_rpcs.sql',
    ];

    for (const file of migrationFiles) {
      try {
        const filePath = path.join(process.cwd(), 'supabase', 'migrations', file);
        if (!fs.existsSync(filePath)) {
          results.push(`⏭️ ${file} — not found`);
          continue;
        }
        const sql = fs.readFileSync(filePath, 'utf8');
        await client.query(sql);
        results.push(`✅ ${file}`);
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          results.push(`⚠️ ${file} — already applied`);
        } else {
          results.push(`❌ ${file} — ${msg.substring(0, 150)}`);
        }
      }
    }

    await client.end();
    results.push('✅ Migration batch complete');
    return res.json({ success: true, results });
  } catch (error) {
    try { await client.end(); } catch (e) {}
    return res.status(500).json({ success: false, error: error.message, results });
  }
}
