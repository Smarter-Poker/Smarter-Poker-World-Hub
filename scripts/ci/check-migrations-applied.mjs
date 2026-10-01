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

function functionArguments(signature) {
  return splitSqlArguments(signature)
    // OUT parameters are results, not inputs: PostgREST never lists them among
    // an RPC's arguments, so requiring them would fail every applied function
    // that declares any.
    .filter((argument) => !/^\s*out\s+/i.test(argument))
    .map((argument) => argument.replace(/^\s*(?:inout|in|variadic)\s+/i, '').trim())
    .map((argument) => {
      const match = argument.match(
        /^"?([a-z_][a-z0-9_]*)"?\s+((?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?)/i
      );
      if (!match) return null;
      return {
        name: match[1].toLowerCase(),
        type: match[2].replaceAll('"', '').toLowerCase(),
      };
    })
    .filter(Boolean);
}

// Function headers, read with balanced parentheses. A lazy match up to the
// next ") RETURNS" misreads a function declared with OUT parameters and no
// RETURNS clause: it runs on into the following function's header and reports
// arguments that belong to neither. The result keeps the shape of a regex match
// ([header, name, arguments, return type] plus index) for the code below.
function functionHeaders(clean) {
  const headers = [];
  const start = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
  let match;
  while ((match = start.exec(clean))) {
    let depth = 1;
    let quote = null;
    let index = start.lastIndex;
    for (; index < clean.length && depth > 0; index += 1) {
      const char = clean[index];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') quote = char;
      else if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
    }
    if (depth !== 0) break;
    const args = clean.slice(start.lastIndex, index - 1);
    const returns = clean.slice(index).match(/^\s*returns\s+"?([a-z0-9_.]+)"?/i);
    // Without a RETURNS clause only OUT parameters make a declaration (PostgreSQL
    // then returns a record); anything else is not a header this gate can judge,
    // such as CREATE FUNCTION text assembled inside a string for EXECUTE.
    const hasOut = splitSqlArguments(args).some((argument) => /^\s*out\s+/i.test(argument));
    start.lastIndex = index;
    if (!returns && !hasOut) continue;
    const header = clean.slice(match.index, index + (returns ? returns[0].length : 0));
    headers.push(Object.assign([header, match[1], args, returns ? returns[1] : 'record'], { index: match.index }));
  }
  return headers;
}

// Keep SQL types private so the long-standing declaredObjects().fns contract
// remains `{ name, args }` for callers that compare or serialize it.
const functionArgumentTypes = new WeakMap();
const functionVolatility = new WeakMap();

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
  const fns = functionHeaders(clean)
    .filter((m) => !/^(?:trigger|event_trigger)$/i.test(m[3]))
    .map((m) => {
      const args = functionArguments(m[2]);
      const fn = {
        name: m[1].toLowerCase(),
        args: args.map((argument) => argument.name),
      };
      functionArgumentTypes.set(fn, args.map((argument) => argument.type));
      // A path-level OpenAPI GET can belong to a sibling overload, so retain
      // the declared volatility of this exact overload as a second guard before
      // exercising a hidden composite signature. Missing volatility means
      // PostgreSQL's VOLATILE default and is deliberately not probe-eligible.
      const remainder = clean.slice(m.index + m[0].length);
      const bodyMarker = remainder.search(/\bas\s+(?:\$[a-z0-9_]*\$|e?')/i);
      const attributes = bodyMarker >= 0 ? remainder.slice(0, bodyMarker) : '';
      const volatility = attributes.match(/\b(stable|immutable)\b/i)?.[1]?.toLowerCase() || null;
      functionVolatility.set(fn, volatility);
      return fn;
    });
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
  const readOnlyRpcs = new Set(
    Object.entries(doc.paths || {})
      .filter(([path, operations]) => path.startsWith('/rpc/') && operations?.get)
      .map(([path]) => path.slice(5))
  );
  return { tables, fns, rpcArgs, readOnlyRpcs, url: url.replace(/\/$/, ''), key };
}

function compositeSignatureProofKey(fn) {
  const argumentTypes = functionArgumentTypes.get(fn) || [];
  if (fn.args.length !== 1 || argumentTypes.length !== 1) return null;
  return `${fn.name}(${fn.args[0]}:${argumentTypes[0]})`;
}

function hasPublishedSignature(fn, live) {
  const argumentTypes = functionArgumentTypes.get(fn) || [];
  const singleArgumentType = argumentTypes.length === 1
    ? argumentTypes[0].split('.').at(-1)
    : null;
  const liveSignatures = live.rpcArgs.get(fn.name) || [];
  if (singleArgumentType && fn.args.length === 1 && live.tables.has(singleArgumentType)) {
    const relationColumns = live.tables.get(singleArgumentType);
    const expandedCompositeReady = relationColumns.size > 0
      && liveSignatures.some((liveArgs) =>
        liveArgs.size === relationColumns.size
        && [...relationColumns].every((column) => liveArgs.has(column))
      );
    if (expandedCompositeReady) return true;
  }
  return liveSignatures.some((liveArgs) =>
    fn.args.every((argument) => liveArgs.has(argument))
  );
}

/** PostgREST collapses overloads onto one OpenAPI path and can omit one
 * composite-row signature from the document. Return only exact declarations
 * that are safe to prove with a read-only function call. */
export function compositeRpcProbeCandidates(declaredFunctions, live) {
  const candidates = new Map();
  for (const fn of declaredFunctions) {
    const argumentTypes = functionArgumentTypes.get(fn) || [];
    const qualifiedType = argumentTypes[0];
    const relation = qualifiedType?.split('.').at(-1);
    const proofKey = compositeSignatureProofKey(fn);
    if (
      !proofKey
      || fn.args.length !== 1
      || argumentTypes.length !== 1
      || !live.fns.has(fn.name)
      || !live.tables.has(relation)
      || !live.readOnlyRpcs?.has(fn.name)
      || !['stable', 'immutable'].includes(functionVolatility.get(fn))
      || hasPublishedSignature(fn, live)
    ) {
      continue;
    }
    candidates.set(proofKey, {
      name: fn.name,
      argument: fn.args[0],
      qualifiedType,
      proofKey,
    });
  }
  return [...candidates.values()];
}

/** Positively exercise an otherwise hidden PostgREST overload. JSON null is
 * an actual SQL NULL, unlike the text `null` in a GET query parameter. The
 * candidate builder requires both a GET-exposed RPC path and an exact
 * STABLE/IMMUTABLE declaration, so this POST cannot perform a write. */
export async function proveCompositeRpcSignatures(
  candidates,
  { url, key },
  request = resilientFetch
) {
  const proofs = new Set();
  for (const candidate of candidates) {
    const response = await request(
      `check-migrations-applied:${candidate.name}:${candidate.argument}`,
      `${url}/rest/v1/rpc/${encodeURIComponent(candidate.name)}`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Prefer: 'tx=rollback',
        },
        body: JSON.stringify({ [candidate.argument]: null }),
      },
      {
        exitCode: 2,
        parse: 'response',
        // Missing, ambiguous, or uncallable overloads are assertion failures.
        // Authentication and transient failures retain resilientFetch's
        // fail/error behavior and can never manufacture a proof token.
        returnStatuses: [300, 400, 404, 405, 406, 409, 422],
      }
    );
    if (response?.ok) proofs.add(candidate.proofKey);
  }
  return proofs;
}

export function unappliedObjects(declared, live) {
  const failures = [];
  const { tables, fns, compositeRpcProofs = new Set() } = live;
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
      // PostgREST represents a single relation-row argument as the composite
      // object's fields, not as a JSON property bearing the SQL argument name.
      // Requiring `p_reel` for `(p_reel public.social_reels)` therefore creates
      // a false missing-signature report. Limit this exception to a single
      // argument whose declared type is an exposed relation, and require the
      // live expanded signature to equal that relation's complete column set.
      // A scalar overload named like one relation column must not satisfy it;
      // scalar and multi-argument overloads retain the named-argument check.
      const signatureReady = hasPublishedSignature(fn, live)
        || compositeRpcProofs.has(compositeSignatureProofKey(fn));
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

  const declarations = [];
  for (const file of files) {
    if (!existsSync(join(REPO, file))) continue;
    declarations.push({ file, declared: declaredObjects(readFileSync(join(REPO, file), 'utf8')) });
  }

  const live = await liveSchema();
  const probeCandidates = compositeRpcProbeCandidates(
    declarations.flatMap(({ declared }) => declared.fns),
    live
  );
  const compositeRpcProofs = await proveCompositeRpcSignatures(probeCandidates, live);
  const failures = [];

  for (const { file, declared } of declarations) {
    for (const [kind, name] of unappliedObjects(declared, { ...live, compositeRpcProofs })) {
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
