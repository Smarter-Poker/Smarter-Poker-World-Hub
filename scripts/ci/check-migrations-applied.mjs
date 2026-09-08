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
 * LIMIT WORTH KNOWING: PostgREST only exposes what the API role can see. New
 * client-facing RPCs must appear in `paths`; an absent declared function is a
 * deployment failure, not a warning. Service-only SQL should live outside the
 * exposed public schema when it is intentionally not callable through the API.
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     node scripts/ci/check-migrations-applied.mjs [baseRef]
 * EXIT: 0 clean · 1 an unapplied table/view/column · 2 script error
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resilientFetch } from './lib/resilient-fetch.mjs';

const require = createRequire(import.meta.url);
const { topLevelSqlStatements } = require('../lib/sql-transaction-control.js');

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
function splitSqlArguments(source) {
  const args = [];
  let current = '';
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      current += char;
      if (char === quote && source[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      if (current.trim()) args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function functionArgumentNames(signature) {
  return splitSqlArguments(signature)
    .map((argument) => argument.replace(/^\s*(?:inout|in|out|variadic)\s+/i, '').trim())
    .map((argument) => argument.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i)?.[1]?.toLowerCase())
    .filter(Boolean);
}

export function declaredObjects(sql) {
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Use the hardened migration-runner lexer for lifecycle decisions. Unlike a
  // source-wide regex, it cannot mistake DROP text in a comment, quoted value,
  // identifier, or PL/pgSQL dollar body for a top-level schema transition. It
  // also throws on unterminated tokens, keeping this deployment gate fail-closed.
  const statements = topLevelSqlStatements(sql);

  // PostgREST deliberately omits trigger functions from its OpenAPI /rpc paths,
  // even when they live in `public`. Treating those as missing makes every
  // migration that creates or replaces a trigger function fail this check after
  // it has been applied successfully. Only validate functions that can actually
  // be represented by the live-schema source used below.
  const fns = [
    ...clean.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\)\s*returns\s+"?([a-z0-9_.]+)"?/gi
    ),
  ]
    .filter((m) => !/^(?:trigger|event_trigger)$/i.test(m[3]))
    .map((m) => ({ name: m[1].toLowerCase(), args: functionArgumentNames(m[2]) }));
  // A migration can legitimately use a durable table as private staging and
  // deliberately remove it after the data swap succeeds. CHECK 17 validates
  // the migration's *final* desired schema, not every object that existed
  // midway through its transaction. Preserve statement order so DROP→CREATE
  // still requires the recreated object while CREATE→DROP does not require a
  // migration-only object to remain exposed by PostgREST forever.
  const relationEvents = [];
  for (const statement of statements) {
    const create = statement.match(
      /^create\s+(?:table\s+|(?:or\s+replace\s+)?(?:materialized\s+)?view\s+)(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\b/i
    );
    if (create && create[1].toLowerCase() !== 'identifier') {
      relationEvents.push({ name: create[1].toLowerCase(), operation: 'create' });
      continue;
    }
    const drop = statement.match(
      /^drop\s+(?:table|(?:materialized\s+)?view)\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\b/i
    );
    if (drop && drop[1].toLowerCase() !== 'identifier') {
      relationEvents.push({ name: drop[1].toLowerCase(), operation: 'drop' });
    }
  }
  const finalRelationState = new Map();
  for (const event of relationEvents) finalRelationState.set(event.name.toLowerCase(), event);
  const tables = [...finalRelationState.values()]
    .filter((event) => event.operation === 'create')
    .map((event) => event.name);
  // Preserve the former gate's conservative coverage for declarations that
  // the top-level classifier cannot name (for example a quoted identifier).
  // They remain required rather than being silently skipped. Only a positively
  // matched top-level CREATE followed by a positively matched top-level DROP
  // receives the transient-object treatment.
  const topLevelCreatedRelations = new Set(
    relationEvents
      .filter((event) => event.operation === 'create')
      .map((event) => event.name.toLowerCase())
  );
  const rawCreatedRelations = [
    ...[...clean.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi
    )].map((match) => match[1].toLowerCase()),
    ...[...clean.matchAll(
      /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi
    )].map((match) => match[1].toLowerCase()),
  ];
  for (const name of rawCreatedRelations) {
    if (!topLevelCreatedRelations.has(name)) tables.push(name);
  }
  const finallyDroppedRelations = new Set(
    [...finalRelationState.entries()]
      .filter(([, event]) => event.operation === 'drop')
      .map(([name]) => name)
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
    // A column added only to a relation that is deliberately gone at the end
    // of this migration is transient too. Existing relations that remain live
    // continue through the exact same column check below.
    .filter((m) => !finallyDroppedRelations.has(m[1].toLowerCase()))
    .map((m) => [m[1], m[2]]);

  return {
    fns: [...new Map(fns.map((fn) => [`${fn.name}(${fn.args.join(',')})`, fn])).values()],
    tables: [...new Set(tables)],
    columns: [...new Map(columns.map((c) => [c.join('.'), c])).values()],
  };
}

function resolveSchema(doc, schema) {
  if (!schema || typeof schema !== 'object') return null;
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return schema;
  return ref
    .slice(2)
    .split('/')
    .reduce((value, key) => value?.[key], doc) || null;
}

export function rpcArgumentSets(doc, rpcName) {
  const path = doc?.paths?.[`/rpc/${rpcName}`];
  if (!path || typeof path !== 'object') return [];
  const sets = [];
  for (const operationName of ['get', 'post']) {
    const operation = path[operationName];
    if (!operation || typeof operation !== 'object') continue;
    const names = new Set();
    for (const parameter of [...(path.parameters || []), ...(operation.parameters || [])]) {
      if (parameter?.in === 'query' && parameter.name) names.add(String(parameter.name).toLowerCase());
      if (parameter?.in === 'body') {
        const schema = resolveSchema(doc, parameter.schema);
        for (const name of Object.keys(schema?.properties || {})) names.add(name.toLowerCase());
      }
    }
    const content = operation.requestBody?.content || {};
    for (const media of Object.values(content)) {
      const schema = resolveSchema(doc, media?.schema);
      for (const name of Object.keys(schema?.properties || {})) names.add(name.toLowerCase());
    }
    if (names.size > 0) sets.push(names);
  }
  return sets;
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
  const doc = await resilientFetch(
    'check-migrations-applied',
    `${url.replace(/\/$/, '')}/rest/v1/`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' } },
    { exitCode: 2 }
  );
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
  const rpcArgs = new Map([...fns].map((name) => [name, rpcArgumentSets(doc, name)]));
  return { tables, fns, rpcArgs };
}

export function unappliedObjects(declared, live) {
  const failures = [];
  const { tables, fns, rpcArgs } = live;
  for (const t of declared.tables) if (!tables.has(t)) failures.push(['table/view', t]);
  for (const [t, c] of declared.columns) {
    // A column on a table the API does not expose cannot be judged here.
    if (!tables.has(t)) continue;
    if (!tables.get(t).has(c)) failures.push(['column', `${t}.${c}`]);
  }
  for (const fn of declared.fns) {
    if (!fns.has(fn.name)) {
      failures.push(['function', `${fn.name}(${fn.args.join(', ')})`]);
      continue;
    }
    if (fn.args.length > 0) {
      const liveSignatures = rpcArgs.get(fn.name) || [];
      const signatureReady = liveSignatures.some((liveArgs) =>
        fn.args.every((argument) => liveArgs.has(argument))
      );
      if (!signatureReady) {
        failures.push(['function signature', `${fn.name}(${fn.args.join(', ')})`]);
      }
    }
  }
  return failures;
}

async function main() {
  const base = baseRef();
  const files = changedMigrations(base);
  if (files.length === 0) {
    console.log(`[check-migrations-applied] no new migrations against ${base} — nothing to check.`);
    return;
  }

  const { tables, fns, rpcArgs } = await liveSchema();
  const failures = [];

  for (const file of files) {
    if (!existsSync(join(REPO, file))) continue;
    const d = declaredObjects(readFileSync(join(REPO, file), 'utf8'));
    for (const [kind, name] of unappliedObjects(d, { tables, fns, rpcArgs })) {
      failures.push([file, kind, name]);
    }
  }

  console.log(
    `[check-migrations-applied] ${files.length} changed migration(s) vs ${base}; ` +
      `${failures.length} unapplied object(s).`
  );

  if (failures.length === 0) {
    console.log('\nOK — every table, view, column and function these migrations declare exists live.');
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

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('[check-migrations-applied] script error:', err?.message || err);
    process.exit(2);
  });
}
