/**
 * Club Arena Engine Migration Runner
 * POST /api/admin/run-engine-migration
 * Executes SQL via direct Postgres connection
 * Tries multiple connection strategies
 * DELETE AFTER USE
 */
import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ready', hint: 'POST with x-migration-key header and {sql} body' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = req.headers['x-migration-key'];
  if (key !== 'club-arena-engine-2026') return res.status(403).json({ error: 'Forbidden' });

  const { sql, step, check_env } = req.body;

  // Diagnostic mode
  if (check_env) {
    const envKeys = [
      'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD', 'POSTGRES_URL',
      'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING',
      'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'
    ];
    const found = {};
    envKeys.forEach(k => { found[k] = !!process.env[k]; });
    return res.status(200).json({ env_check: found });
  }

  if (!sql) return res.status(400).json({ error: 'sql required in body' });

  // Try multiple connection strategies
  const strategies = [];

  if (process.env.DATABASE_URL) {
    strategies.push({ name: 'DATABASE_URL', url: process.env.DATABASE_URL });
  }
  if (process.env.SUPABASE_DB_URL) {
    strategies.push({ name: 'SUPABASE_DB_URL', url: process.env.SUPABASE_DB_URL });
  }
  if (process.env.POSTGRES_URL) {
    strategies.push({ name: 'POSTGRES_URL', url: process.env.POSTGRES_URL });
  }
  if (process.env.SUPABASE_DB_PASSWORD) {
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const ref = supaUrl.replace('https://', '').replace('.supabase.co', '');
    strategies.push({
      name: 'SUPABASE_DB_PASSWORD (transaction pooler)',
      url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
    });
    strategies.push({
      name: 'SUPABASE_DB_PASSWORD (direct)',
      url: `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`
    });
  }

  if (strategies.length === 0) {
    return res.status(500).json({
      error: 'No database connection configured',
      hint: 'Set DATABASE_URL or SUPABASE_DB_PASSWORD in Vercel env vars'
    });
  }

  const errors = [];
  for (const strat of strategies) {
    let client;
    try {
      client = new Client({
        connectionString: strat.url,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
        statement_timeout: 30000
      });
      await client.connect();
      const result = await client.query(sql);
      await client.end();
      return res.status(200).json({
        success: true,
        step: step || 'unknown',
        strategy: strat.name,
        rowCount: result.rowCount,
        command: result.command,
        rows: result.rows?.slice(0, 10)
      });
    } catch (err) {
      errors.push({ strategy: strat.name, error: err.message });
      if (client) await client.end().catch(() => {});
    }
  }

  return res.status(500).json({
    success: false,
    step: step || 'unknown',
    errors,
    hint: 'All connection strategies failed'
  });
}
