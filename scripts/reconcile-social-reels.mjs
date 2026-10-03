#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const apply = args.includes('--apply') || process.env.REELS_RECONCILIATION_MODE === 'apply';
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const expectedFingerprint = valueFor('--expected-fingerprint') || process.env.REELS_RECONCILIATION_EXPECTED_FINGERPRINT || null;
const expectedPending = valueFor('--expected-pending') ?? process.env.REELS_RECONCILIATION_EXPECTED_PENDING ?? null;
const receiptPath = valueFor('--receipt') || process.env.REELS_RECONCILIATION_RECEIPT || null;
const knownFlags = new Set(['--apply', '--expected-fingerprint', '--expected-pending', '--receipt']);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith('--') || !knownFlags.has(arg)) throw new Error(`Unknown argument: ${arg}`);
  if (arg !== '--apply') index += 1;
}
if (apply && (!expectedFingerprint || expectedPending === null)) {
  throw new Error('--apply requires the fingerprint and pending count from an immediately preceding read-only census');
}
if (expectedFingerprint && !/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
  throw new Error('Expected fingerprint must be one lowercase SHA-256 value');
}
if (expectedPending !== null && !/^(0|[1-9][0-9]*)$/.test(String(expectedPending))) {
  throw new Error('Expected pending count must be a non-negative integer');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Production Reels census requires configured Supabase service credentials');
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { 'X-Client-Info': 'smarter-poker-reels-reconciliation-v1' } },
});

async function readAll(table, columns, order = 'id') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order, { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`${table} census failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stableUuid = (value) => {
  const hex = digest(value).slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};

async function census() {
  const [reels, aliases, reconciliations, quarantines] = await Promise.all([
    readAll('social_reels', 'id,canonical_asset_key,created_at'),
    readAll('social_reel_aliases', 'alias_reel_id,canonical_reel_id,canonical_asset_key'),
    readAll('social_reel_reconciliations', 'operation_id,canonical_asset_key,status'),
    readAll('social_reel_reconciliation_quarantine', 'operation_id,canonical_asset_key,proposed_canonical_reel_id,proposed_alias_reel_ids,reason_code,resolved_at'),
  ]);
  const grouped = new Map();
  for (const reel of reels) {
    if (!reel.canonical_asset_key) continue;
    const group = grouped.get(reel.canonical_asset_key) || [];
    group.push(reel);
    grouped.set(reel.canonical_asset_key, group);
  }
  const aliasByLoser = new Map(aliases.map((row) => [row.alias_reel_id, row]));
  const unresolvedQuarantineGroups = new Set(quarantines
    .filter((row) => !row.resolved_at)
    .map((row) => JSON.stringify([
      row.canonical_asset_key,
      ...[row.proposed_canonical_reel_id, ...(row.proposed_alias_reel_ids || [])].filter(Boolean).sort(),
    ])));
  const duplicates = [...grouped.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([canonicalAssetKey, rows]) => {
      const ordered = [...rows].sort((left, right) => {
        const byTime = String(left.created_at || '').localeCompare(String(right.created_at || ''));
        return byTime || left.id.localeCompare(right.id);
      });
      const ids = new Set(ordered.map((row) => row.id));
      const aliasCoverage = ordered.filter((row) => {
        const alias = aliasByLoser.get(row.id);
        return alias && ids.has(alias.canonical_reel_id) && alias.canonical_asset_key === canonicalAssetKey;
      }).length;
      const groupIdentity = JSON.stringify([canonicalAssetKey, ...ordered.map((row) => row.id).sort()]);
      const represented = aliasCoverage === ordered.length - 1 || unresolvedQuarantineGroups.has(groupIdentity);
      return { canonicalAssetKey, ordered, represented };
    });
  const pending = duplicates.filter((group) => !group.represented);
  const fingerprint = digest(JSON.stringify(pending.map((group) => ({
    key: group.canonicalAssetKey,
    ids: group.ordered.map((row) => row.id),
  }))));
  return { reels, aliases, reconciliations, quarantines, duplicates, pending, fingerprint };
}

function sanitized(state, outcomes = []) {
  return {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'audit',
    rawReels: state.reels.length,
    rawDuplicateGroups: state.duplicates.length,
    representedDuplicateGroups: state.duplicates.length - state.pending.length,
    pendingDuplicateGroups: state.pending.length,
    aliases: state.aliases.length,
    appliedReconciliations: state.reconciliations.filter((row) => row.status === 'applied').length,
    rolledBackReconciliations: state.reconciliations.filter((row) => row.status === 'rolled_back').length,
    quarantines: state.quarantines.length,
    quarantineReasons: Object.fromEntries(Object.entries(state.quarantines.reduce((counts, row) => {
      counts[row.reason_code] = (counts[row.reason_code] || 0) + 1;
      return counts;
    }, {})).sort()),
    pendingFingerprint: state.fingerprint,
    outcomes: outcomes.map((outcome) => ({ applied: outcome.applied === true, reason: outcome.reason || null })),
  };
}

let state = await census();
const outcomes = [];
if (apply) {
  if (state.fingerprint !== expectedFingerprint) throw new Error('Reels reconciliation census changed after approval; refusing mutation');
  if (state.pending.length !== Number(expectedPending)) throw new Error('Reels reconciliation pending count changed after approval; refusing mutation');
  for (const group of state.pending) {
    const winner = group.ordered[0];
    const losers = group.ordered.slice(1);
    const operationId = stableUuid(`phase2-reconciliation:${group.canonicalAssetKey}:${group.ordered.map((row) => row.id).join(',')}`);
    const { data, error } = await supabase.rpc('reconcile_social_reel_duplicates', {
      p_canonical_asset_key: group.canonicalAssetKey,
      p_canonical_reel_id: winner.id,
      p_alias_reel_ids: losers.map((row) => row.id),
      p_reason: 'phase2_historical_reconciliation',
      p_operation_id: operationId,
    });
    if (error) throw new Error(`Reconciliation operation failed: ${error.message}`);
    outcomes.push(data || {});
  }
  state = await census();
  if (state.pending.length !== 0) throw new Error('Post-apply census retained unrepresented duplicate groups');
}

const receipt = sanitized(state, outcomes);
const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
if (receiptPath) {
  const resolvedReceipt = path.resolve(receiptPath);
  fs.mkdirSync(path.dirname(resolvedReceipt), { recursive: true });
  fs.writeFileSync(resolvedReceipt, serialized, { mode: 0o600 });
}
process.stdout.write(serialized);
