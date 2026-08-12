#!/usr/bin/env node
/**
 * dump-home-games-schema.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Snapshot the LIVE definitions of every Home Games database object into a
 * migration file, so the repo can reproduce production.
 *
 * WHY THIS EXISTS
 * The 2026-08-12 audit found three hardening changes recorded as applied in
 * supabase_migrations.schema_migrations but ABSENT from the live database —
 * reverted out-of-band, with no migration explaining it, and undetected for
 * an unknown period:
 *
 *   * SECURITY DEFINER on fn_home_is_group_staff / fn_home_is_approved_member
 *   * policy home_members_host_sees_group (replaced by a dashboard default)
 *   * unique index uq_commander_home_games_one_active_per_group_per_date
 *
 * The root cause is that the repo holds ~703 migration files against ~1,263
 * applied rows. Roughly 162 Home Games functions (~350KB of definitions),
 * including all of phase23's core RPCs and all 22 phase40 hardening
 * migrations, exist ONLY in the live database. `supabase db reset` therefore
 * cannot reproduce production, and there is nothing to diff against — which
 * is precisely why a silent revert stayed silent.
 *
 * This script closes that gap by pulling the definitions back into the repo.
 * It is intentionally a script rather than a one-off paste: the dump is far
 * too large to move through an agent's context window without truncation,
 * and truncated SQL committed to a migrations directory is worse than none.
 *
 * USAGE
 *   DATABASE_URL='postgresql://...' node scripts/dump-home-games-schema.mjs
 *   node scripts/dump-home-games-schema.mjs --check     # drift check, no write
 *
 * Requires a direct Postgres connection (the Supabase pooler URL works).
 * Agent sandboxes cannot reach the database host; run this on the Mac, on
 * Hetzner, or in CI.
 *
 * --check exits non-zero when live and repo disagree, which makes it usable
 * as a CI gate. Pair it with SELECT * FROM verify_home_games_invariants(),
 * which asserts security POSTURE where this asserts DEFINITIONS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
const OUT_NAME = 'ZZZZ_snapshot_home_games_schema.sql';
const OUT_PATH = path.join(OUT_DIR, OUT_NAME);
const CHECK_ONLY = process.argv.includes('--check');

// Matches the object families the audit covered.
const FN_PREDICATE = `(
     p.proname LIKE 'rpc\\_hg\\_%'
  OR p.proname LIKE 'fn\\_home\\_%'
  OR p.proname LIKE 'fn\\_hg\\_%'
  OR p.proname LIKE '%home\\_group%'
  OR p.proname LIKE '%home\\_game%'
)`;
const TBL_PREDICATE = `(c.relname LIKE 'commander\\_home%' OR c.relname LIKE 'home\\_%')`;

const QUERIES = {
  functions: `
    SELECT pg_get_functiondef(p.oid) AS ddl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND ${FN_PREDICATE}
    ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);`,

  policies: `
    SELECT format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
      policyname, tablename,
      CASE WHEN permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      cmd, array_to_string(roles, ', '),
      CASE WHEN qual       IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
      CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END
    ) AS ddl
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (tablename LIKE 'commander\\_home%' OR tablename LIKE 'home\\_%'
           OR tablename LIKE 'social\\_page%')
    ORDER BY tablename, policyname;`,

  indexes: `
    SELECT indexdef || ';' AS ddl
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND (tablename LIKE 'commander\\_home%' OR tablename LIKE 'home\\_%')
    ORDER BY tablename, indexname;`,

  grants: `
    SELECT format('-- %s: %s on %s', grantee, privilege_type, table_name) AS ddl
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon','authenticated','service_role')
      AND (table_name LIKE 'commander\\_home%' OR table_name LIKE 'home\\_%')
    ORDER BY table_name, grantee, privilege_type;`,
};

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      'DATABASE_URL (or SUPABASE_DB_URL) is required.\n' +
      'Supabase dashboard -> Project Settings -> Database -> Connection string.'
    );
    process.exit(2);
  }

  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.error("Missing dependency: 'pg'. Install it, then re-run:\n  npm i -D pg");
    process.exit(2);
  }

  const client = new pg.default.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const sections = [];
  let objectCount = 0;
  try {
    for (const [name, sql] of Object.entries(QUERIES)) {
      const { rows } = await client.query(sql);
      objectCount += rows.length;
      const body = rows.map((r) => r.ddl).filter(Boolean).join('\n\n');
      sections.push(
        `-- ${'='.repeat(69)}\n-- ${name.toUpperCase()} (${rows.length})\n-- ${'='.repeat(69)}\n\n${body}`
      );
    }
  } finally {
    await client.end();
  }

  const header = [
    '-- AUTO-GENERATED by scripts/dump-home-games-schema.mjs — DO NOT EDIT BY HAND.',
    '--',
    '-- A snapshot of the LIVE definitions of every Home Games database object.',
    '-- It exists because ~559 migrations are applied in production but absent',
    '-- from this repo, which is how three hardening changes were reverted',
    '-- out-of-band without anyone noticing (audit 2026-08-12).',
    '--',
    '-- Regenerate:  DATABASE_URL=... node scripts/dump-home-games-schema.mjs',
    '-- Drift check: DATABASE_URL=... node scripts/dump-home-games-schema.mjs --check',
    '--',
    '-- Filename is prefixed ZZZZ_ so the Supabase CLI orders it LAST and never',
    '-- tries to replay it ahead of the real migration history. It is a',
    '-- reference artifact for diffing, not a migration to apply.',
    `-- Objects captured: ${objectCount}`,
    '',
  ].join('\n');

  const content = `${header}\n${sections.join('\n\n')}\n`;

  if (CHECK_ONLY) {
    const existing = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
    // Ignore the object-count line so an unrelated count change is not noise.
    const strip = (s) => s.replace(/^-- Objects captured: \d+$/m, '');
    if (strip(existing) === strip(content)) {
      console.log(`No drift. ${objectCount} objects match the committed snapshot.`);
      process.exit(0);
    }
    console.error(
      `DRIFT DETECTED between the live database and ${OUT_NAME}.\n` +
      `Something changed in production that is not reflected in the repo — ` +
      `or vice versa.\nRegenerate and review the diff:\n` +
      `  DATABASE_URL=... node scripts/dump-home-games-schema.mjs`
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, content, 'utf8');
  console.log(`Wrote ${objectCount} objects to supabase/migrations/${OUT_NAME}`);
}

main().catch((err) => {
  console.error('dump-home-games-schema failed:', err?.message || err);
  process.exit(1);
});
