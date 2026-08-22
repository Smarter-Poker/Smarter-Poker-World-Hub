#!/usr/bin/env node
/**
 * check-migrations-applied.mjs — CHECK 17
 * ─────────────────────────────────────────────────────────────────────────
 * A MIGRATION THIS BRANCH ADDS MUST ALREADY EXIST IN THE LIVE SCHEMA.
 *
 * WHY THIS EXISTS (2026-08-22)
 * Two migrations - 20260821210000_user_avatars_cosmetics.sql and
 * 20260821210001_profiles_cosmetics.sql - sat in supabase/migrations/ for a
 * day and were never applied. The avatar frames-and-auras feature is fully
 * built around the columns they declare: AvatarGallery renders frame and aura,
 * avatar-service maps them, AvatarContext.setAvatarCosmetics writes them.
 * Every write failed with 42703 into a catch block. Nothing went red. The
 * repository claimed a feature the database had never heard of.
 *
 * That is the database half of the failure this estate keeps hitting: merged,
 * and never published. Every other gate here checks CODE against the live
 * schema. Nothing checked the MIGRATIONS against it.
 *
 * WHY IT ALSO READS ALTER TABLE ... ADD COLUMN
 * Club Arena's version of this gate checks CREATE FUNCTION / TABLE / VIEW.
 * Both stranded migrations here added COLUMNS, so that version would have
 * watched them go by. A column is the most common thing a migration adds and
 * the easiest to strand, because the table already exists and every other
 * check stays green.
 *
 * SCOPE: only migrations this branch ADDS or MODIFIES. The directory is full
 * of historical files whose objects were later dropped or renamed; auditing
 * those is archaeology. Letting a NEW one slip is a bug that ships today.
 *
 * HOW IT KNOWS THE SCHEMA: the PostgREST OpenAPI document, the same source
 * CHECK 11 and CHECK 13 use. `definitions` gives tables, views and their
 * columns; `paths` gives the exposed /rpc/ functions.
 *
 * LIMIT WORTH KNOWING: PostgREST only exposes what the API role can see. A
 * function that is deliberately service-role-only will not appear in `paths`,
 * so functions are reported as a WARNING and tables/columns as a FAILURE.
 * Being loud about what it can prove beats being wrong about what it cannot.
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     node scripts/ci/check-migrations-applied.mjs [baseRef]
 * EXIT: 0 clean · 1 an unapplied table/view/column · 2 script error
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const DIR = 'supabase/migrations/';

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The commit this branch grew from. A PR gets it from GitHub; a push compares
 *  to its own parent, the smallest honest unit of "what this adds". */
function baseRef() {
  if (process.argv[2] && !process.argv[2].startsWith('-')) return process.argv[2];
  const b = process.env.GITHUB_BASE_REF;
  if (b) {
    for (const ref of [`origin/${b}`, b]) {
      try {
        git(['rev-parse', '--verify', ref]);
        return ref;
      } catch {
        /* try the next form */
      }
    }
  }
  return 'HEAD~1';
}

function changedMigrations(base) {
  for (const args of [
    ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`],
    ['diff', '--name-only', '--diff-filter=AM', base, 'HEAD'],
  ]) {
    try {
      return git(args)
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith(DIR) && l.endsWith('.sql'));
    } catch {
      /* try the next form */
    }
  }
  // A gate that silently skips is worse than no gate: it reports success for a
  // check it never ran. Fail loudly so a shallow checkout gets fixed instead.
  console.error(
    `[check-migrations-applied] cannot diff against "${base}" — the checkout is ` +
      'probably shallow. Give the job fetch-depth: 0, or pass an explicit base ref.'
  );
  process.exit(2);
}

/** What a migration CREATES or ADDS. Drops, renames and alters of existing
 *  objects are out of scope: this asks "did the thing you added land", not
 *  "is the schema perfect". */
function declaredObjects(sql) {
  const clean = sql.replace(/--[^\n]*/g, '');
  const grab = (re) => [...clean.matchAll(re)].map((m) => m[1]);

  const fns = grab(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi);
  const tables = grab(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi);
  const views = grab(
    /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi
  );

  // ALTER TABLE [IF EXISTS] [ONLY] [public.]t ADD [COLUMN] [IF NOT EXISTS] c
  const columns = [
    ...clean.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi
    ),
  ]
    // CONSTRAINT/PRIMARY/FOREIGN/UNIQUE/CHECK read identically to this regex and
    // are not columns; without this they would be reported as phantom forever.
    .filter((m) => !/^(constraint|primary|foreign|unique|check|exclude)$/i.test(m[2]))
    .map((m) => [m[1], m[2]]);

  return {
    fns: [...new Set(fns)],
    tables: [...new Set([...tables, ...views])],
    columns: [...new Map(columns.map((c) => [c.join('.'), c])).values()],
  };
}

async function liveSchema() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      '[check-migrations-applied] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.'
    );
    process.exit(2);
  }
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  });
  if (!res.ok) {
    console.error(`[check-migrations-applied] PostgREST returned ${res.status}.`);
    process.exit(2);
  }
  const doc = await res.json();
  const tables = new Map();
  for (const [t, def] of Object.entries(doc.definitions || {})) {
    tables.set(t, new Set(Object.keys(def.properties || {})));
  }
  if (tables.size === 0) {
    console.error('[check-migrations-applied] zero table definitions — refusing to pass vacuously.');
    process.exit(2);
  }
  const fns = new Set(
    Object.keys(doc.paths || {})
      .filter((p) => p.startsWith('/rpc/'))
      .map((p) => p.slice(5))
  );
  return { tables, fns };
}

async function main() {
  const base = baseRef();
  const files = changedMigrations(base);
  if (files.length === 0) {
    console.log(`[check-migrations-applied] no new migrations against ${base} — nothing to check.`);
    return;
  }

  const { tables, fns } = await liveSchema();
  const failures = [];
  const warnings = [];

  for (const file of files) {
    if (!existsSync(join(REPO, file))) continue;
    const d = declaredObjects(readFileSync(join(REPO, file), 'utf8'));
    for (const t of d.tables) if (!tables.has(t)) failures.push([file, 'table/view', t]);
    for (const [t, c] of d.columns) {
      // A column on a table the API does not expose cannot be judged here.
      if (!tables.has(t)) continue;
      if (!tables.get(t).has(c)) failures.push([file, 'column', `${t}.${c}`]);
    }
    for (const f of d.fns) if (!fns.has(f)) warnings.push([file, 'function', f]);
  }

  console.log(
    `[check-migrations-applied] ${files.length} changed migration(s) vs ${base}; ` +
      `${failures.length} unapplied object(s), ${warnings.length} unverifiable function(s).`
  );

  if (warnings.length > 0) {
    console.log('\nNot exposed through PostgREST — expected for service-role-only functions:');
    for (const [file, kind, name] of warnings) console.log(`  ${file}\n    ${kind} ${name}`);
  }

  if (failures.length === 0) {
    console.log('\nOK — every table, view and column these migrations declare exists live.');
    return;
  }

  console.error('\nA MIGRATION IN THIS BRANCH DECLARES SOMETHING THE LIVE SCHEMA DOES NOT HAVE:\n');
  for (const [file, kind, name] of failures) console.error(`  ${file}\n    ${kind} ${name}`);
  console.error(
    '\nThe migration was almost certainly never applied. Apply it with the Supabase' +
      '\nMCP `apply_migration`, which is the only sanctioned path (CLAUDE.md 1.2).' +
      '\n' +
      '\nA migration file that never ran is a feature the code believes in and the' +
      '\ndatabase has never heard of. It does not fail loudly — it fails with 42703' +
      '\ninto a catch block, and the feature silently never works. That is exactly' +
      '\nhow avatar frames and auras shipped dead on 2026-08-21.'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('[check-migrations-applied] script error:', err?.message || err);
  process.exit(2);
});
