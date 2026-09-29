#!/usr/bin/env node
// Operator entrypoint for the Phase 6 audit-session custody files.
//
//   node scripts/training-phase6-audit-session-custody.mjs \
//     --seed-from-storage-state /absolute/path/to/playwright/.auth/user.json
//
// Re-seeds both custody files (the mode-0600 credential env named by
// TRAINING_PHASE6_AUDIT_ENV_FILE and the auth state it names) from a fresh
// Playwright storage state, such as the one `e2e/00-auth.setup.ts` writes for
// the audit account. The storage state's session must belong to the
// designated audit UUID and hold an unexpired access token. Writes are atomic
// (temp + fsync + rename, mode 0600) under the shared custody lock, env first,
// then auth state. Only metadata is printed; no token ever appears on stdout,
// stderr or argv. One bounded execution, no watcher, no retry loop.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_SESSION_ENV_KEYS,
  AUDIT_SESSION_TRUSTED_ORIGIN,
  auditSessionMaterialLeaks,
  redactAuditSessionMaterial,
  seedAuditSessionFromStorageState,
} from '../src/lib/training/trainingAuditSessionRefresh.mjs';

export const CUSTODY_CLI_USAGE =
  'usage: training-phase6-audit-session-custody.mjs --seed-from-storage-state <absolute path> '
  + '[--env-file <absolute path>] [--auth-state <absolute path>] [--audit-user-id <uuid>] '
  + '[--origin <origin>]...\n'
  + `environment fallbacks: ${AUDIT_SESSION_ENV_KEYS.envFile}, ${AUDIT_SESSION_ENV_KEYS.authState}, `
  + `${AUDIT_SESSION_ENV_KEYS.expectedAuditUserId}, ${AUDIT_SESSION_ENV_KEYS.supabaseUrl} `
  + `(or NEXT_PUBLIC_SUPABASE_URL), ${AUDIT_SESSION_ENV_KEYS.supabasePublishableKey} `
  + '(or NEXT_PUBLIC_SUPABASE_ANON_KEY)';

export function parseCustodyCliArgs(argv) {
  const options = { seedFromStorageState: null, envFile: null, authState: null, auditUserId: null, origins: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    const take = () => {
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${flag} requires a value`);
      }
      index += 1;
      return value;
    };
    switch (flag) {
      case '--seed-from-storage-state':
        options.seedFromStorageState = take();
        break;
      case '--env-file':
        options.envFile = take();
        break;
      case '--auth-state':
        options.authState = take();
        break;
      case '--audit-user-id':
        options.auditUserId = take();
        break;
      case '--origin':
        options.origins.push(take());
        break;
      default:
        throw new Error(`unknown argument ${flag}`);
    }
  }
  if (!options.seedFromStorageState) {
    throw new Error('--seed-from-storage-state is required');
  }
  return options;
}

export async function runAuditSessionCustodyCli(
  argv,
  env = process.env,
  { stdout = process.stdout, stderr = process.stderr, seed = seedAuditSessionFromStorageState, nowMs } = {},
) {
  // Token material never travels on argv: refuse before parsing so a mistaken
  // paste is neither used nor echoed.
  if (auditSessionMaterialLeaks(argv.join(' ')).length > 0) {
    stderr.write('[phase6-audit-session-custody] refused: an argument carries token material\n');
    return 2;
  }
  let options;
  try {
    options = parseCustodyCliArgs(argv);
  } catch (error) {
    stderr.write(`[phase6-audit-session-custody] ${redactAuditSessionMaterial(error.message)}\n${CUSTODY_CLI_USAGE}\n`);
    return 2;
  }
  const envFile = options.envFile || String(env[AUDIT_SESSION_ENV_KEYS.envFile] || '').trim();
  if (!envFile) {
    stderr.write(
      `[phase6-audit-session-custody] set ${AUDIT_SESSION_ENV_KEYS.envFile} or pass --env-file\n${CUSTODY_CLI_USAGE}\n`,
    );
    return 2;
  }
  try {
    const record = await seed({
      storageStatePath: resolve(options.seedFromStorageState),
      credentialEnvPath: resolve(envFile),
      authStatePath: options.authState || String(env[AUDIT_SESSION_ENV_KEYS.authState] || '').trim() || null,
      expectedAuditUserId:
        options.auditUserId || String(env[AUDIT_SESSION_ENV_KEYS.expectedAuditUserId] || '').trim() || null,
      origins: [AUDIT_SESSION_TRUSTED_ORIGIN, ...options.origins],
      supabaseUrl: env[AUDIT_SESSION_ENV_KEYS.supabaseUrl] || env.NEXT_PUBLIC_SUPABASE_URL || null,
      supabasePublishableKey:
        env[AUDIT_SESSION_ENV_KEYS.supabasePublishableKey] || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
      ...(nowMs ? { nowMs } : {}),
    });
    if (auditSessionMaterialLeaks(record).length > 0) {
      stderr.write('[phase6-audit-session-custody] seeded, but the metadata record was withheld: it carried token material\n');
      return 1;
    }
    stdout.write(`${JSON.stringify(record)}\n`);
    return 0;
  } catch (error) {
    const line = `${error?.code ? `${error.code}: ` : ''}${error?.message || String(error)}`;
    stderr.write(`[phase6-audit-session-custody] ${redactAuditSessionMaterial(line)}\n`);
    if (error?.operatorAction) {
      stderr.write(`[phase6-audit-session-custody] ${redactAuditSessionMaterial(error.operatorAction)}\n`);
    }
    return 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  runAuditSessionCustodyCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`[phase6-audit-session-custody] ${redactAuditSessionMaterial(error?.message || String(error))}\n`);
      process.exitCode = 1;
    },
  );
}
