#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSnapshotVenueDirectory } from '../../src/lib/poker-near-me/venueDirectoryServer.js';
import { fetchCompleteDirectory, materialSha, sha } from '../lib/pnm-directory-snapshot.mjs';

export const SUPABASE_ORIGIN = 'https://kuklfnapbkmacvwxktbh.supabase.co';
export const PUBLIC_ORIGIN = 'https://smarter.poker';
export const REQUIRED_CHECKS = Object.freeze(['calendar_inventory_floor', 'charity_rows_written_8d',
  'daily_tournaments_breadth_36h', 'daily_tournaments_written_36h', 'live_tables_written_3h',
  'no_sim_rows_claiming_scraped', 'series_scraped_4d', 'tour_stops_scraped_4d']);
const unknown = (reason) => ({ status: 'UNKNOWN', reason });
export function classifyFreshness(rows) {
  if (!Array.isArray(rows) || !rows.length) return unknown('Missing freshness rows');
  const names = new Set();
  for (const row of rows) {
    if (!row || !/^[a-z][a-z0-9_]{0,100}$/.test(row.check_name) || names.has(row.check_name)
      || typeof row.ok !== 'boolean' || typeof row.detail !== 'string') return unknown('Invalid freshness contract');
    names.add(row.check_name);
  }
  if (REQUIRED_CHECKS.some((name) => !names.has(name))) return unknown('Missing required freshness gates');
  // RPC details contain only maintained aggregate counts, never return arbitrary provider text.
  return { status: rows.every((row) => row.ok) ? 'PASS' : 'FAIL', checks: rows.map((row) => ({
    check_name: row.check_name, ok: row.ok,
    detail: /^[a-zA-Z0-9 .,=:;()_+\-/]*$/.test(row.detail) ? row.detail.slice(0, 1000) : '[detail withheld]',
  })) };
}
export async function boundedJson(url, { fetchImpl = fetch, timeoutMs = 30000, ...options } = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Read deadline exceeded')); }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetchImpl(url, { ...options, redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error('Read request refused');
      return await response.json();
    })()]);
  } finally { clearTimeout(timer); }
}
export async function readFreshness({ env = process.env, fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  // Exact origin, no credentials, path, query, or redirects. Never load an environment file.
  const origin = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (origin !== SUPABASE_ORIGIN || typeof key !== 'string' || !key.trim()) return unknown('Canonical service configuration unavailable');
  try {
    const rows = await boundedJson(`${SUPABASE_ORIGIN}/rest/v1/rpc/pnm_freshness_invariants`, {
      fetchImpl, timeoutMs, method: 'POST', headers: {
        apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json',
      }, body: '{}',
    });
    return classifyFreshness(rows);
  } catch { return unknown('Freshness RPC read unavailable or timed out'); }
}
export function classifyCatalog(json) {
  const m = json?.metadata;
  if (!m || !Array.isArray(json.venues) || !['live', 'mixed', 'estimated', 'catalog', 'none'].includes(m.data_mode)
    || typeof m.data_is_live !== 'boolean' || typeof m.live_count_known !== 'boolean'
    || !Number.isFinite(m.catalog_venue_count) || !Number.isFinite(m.catalog_game_count)
    || !Number.isFinite(m.total_tables_live) || !Number.isFinite(m.total_tables_simulated)
    || !Number.isFinite(m.venues_with_observed_evidence) || !Number.isFinite(m.venues_with_estimated_evidence)) return unknown('Catalog truth fields unavailable');
  const invalid = m.total_tables_catalog !== null || m.catalog_live_counts_known !== false
    || m.data_is_live !== (m.venues_with_observed_evidence > 0)
    || m.live_count_known !== (m.venues_with_observed_evidence > 0 || m.venues_with_estimated_evidence > 0)
    || (m.data_mode === 'catalog' && (m.live_count_known || m.total_tables_running !== null
      || m.total_tables_live !== 0 || m.total_tables_simulated !== 0))
    || (m.data_mode === 'estimated' && m.data_is_live);
  const expectedMode = m.venues_with_observed_evidence > 0
    ? (m.venues_with_estimated_evidence > 0 ? 'mixed' : 'live')
    : m.venues_with_estimated_evidence > 0 ? 'estimated' : m.catalog_venue_count > 0 ? 'catalog' : 'none';
  const counts = [m.catalog_venue_count, m.catalog_game_count, m.total_tables_live, m.total_tables_simulated,
    m.venues_with_observed_evidence, m.venues_with_estimated_evidence];
  return { status: invalid || expectedMode !== m.data_mode || counts.some((n) => !Number.isInteger(n) || n < 0)
    || (m.data_mode !== 'catalog' && (!Number.isInteger(m.total_tables_running) || m.total_tables_running < 0
      || m.total_tables_running !== m.total_tables_live + m.total_tables_simulated))
    || m.truncated === true ? 'FAIL' : 'PASS', metadata: Object.fromEntries([
    'data_mode', 'data_is_live', 'live_count_known', 'catalog_venue_count', 'catalog_game_count',
    'total_tables_catalog', 'total_tables_running', 'total_tables_live', 'total_tables_simulated', 'last_catalog_scrape',
  ].map((name) => [name, m[name]])) };
}
export async function readDirectory({ cwd = process.cwd(), fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    const snapshots = await Promise.all(['data', 'public/data'].map(async (folder) => {
      const source = JSON.parse(await readFile(resolve(cwd, folder, 'poker-venue-directory-snapshot.json'), 'utf8'));
      const directory = buildSnapshotVenueDirectory({ params: { limit: 1000, offset: 0 }, venues: source.venues || [], metadata: source.metadata || {} });
      const m = source.metadata;
      const ageDays = (now - Date.parse(m?.generated_at)) / 86400000;
      const valid = Number.isFinite(ageDays) && ageDays >= -10 / 1440 && ageDays <= 30
        && m.public_count === directory.total && m.projected_sha256 === sha(directory.data)
        && (m.schema_version < 2 || m.material_sha256 === materialSha(directory.data));
      return { valid, ageDays, hash: sha(directory.data), materialHash: materialSha(directory.data), rows: directory.data };
    }));
    const [a, b] = snapshots;
    const live = await fetchCompleteDirectory({ sourceOrigin: PUBLIC_ORIGIN, fetchImpl });
    const ids = new Set(a.rows.map((v) => String(v.id)));
    const liveIds = new Set(live.venues.map((v) => String(v.id)));
    const driftCount = [...ids].filter((id) => !liveIds.has(id)).length + [...liveIds].filter((id) => !ids.has(id)).length;
    const driftPercent = Math.round(driftCount / Math.max(ids.size, liveIds.size, 1) * 10000) / 100;
    return { status: snapshots.every((s) => s.valid) && a.hash === b.hash && driftCount <= 5 && driftPercent <= 2 ? 'PASS' : 'FAIL',
      snapshotCount: ids.size, liveCount: liveIds.size, projectedSha256: a.hash, ageDays: a.ageDays,
      driftCount, driftPercent, exactIdParity: driftCount === 0,
      materialParity: a.materialHash === materialSha(live.venues), dataRevision: live.dataRevision,
      thresholds: { ageDays: 30, futureSkewMinutes: 10, driftCount: 5, driftPercent: 2 } };
  } catch { return unknown('Directory manifest or public source unavailable'); }
}
export async function qualifyLaunchFreshness(options = {}) {
  const expectedSha = options.expectedSha ?? (options.env || process.env).PNM_LAUNCH_EXPECTED_SHA;
  const healthRead = async () => {
    try {
      const health = await boundedJson(`${PUBLIC_ORIGIN}/api/health`, { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
      return { commit: /^[a-f0-9]{40}$/.test(health.commitSha || '') ? health.commitSha : null,
        status: health.status === 'ok' ? 'ok' : 'unknown', database: health.checks?.db?.status === 'ok' ? 'ok' : 'unknown',
        deploymentId: /^dpl_[a-zA-Z0-9]+$/.test(health.deploymentId || '') ? health.deploymentId : null };
    } catch { return null; }
  };
  const before = await healthRead();
  const [freshness, directory, catalog] = await Promise.all([
    readFreshness(options), readDirectory(options),
    boundedJson(`${PUBLIC_ORIGIN}/api/poker/live-tables`, { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs }).then(classifyCatalog).catch(() => unknown('Public catalog unavailable')),
  ]);
  const after = await healthRead();
  const identity = /^[a-f0-9]{40}$/.test(expectedSha || '') && before?.commit === expectedSha && after?.commit === expectedSha
    && before.status === 'ok' && after.status === 'ok' && before.database === 'ok' && after.database === 'ok'
    && before.deploymentId !== null && before.deploymentId === after.deploymentId
    ? { status: 'PASS', expectedSha, before, after } : { status: 'UNKNOWN', expectedSha: /^[a-f0-9]{40}$/.test(expectedSha || '') ? expectedSha : null,
      before, after, reason: 'Exact production identity absent or changed during qualification' };
  const statuses = [identity, freshness, directory, catalog].map((part) => part.status);
  return { schemaVersion: 1, observedAt: new Date().toISOString(), status: statuses.includes('FAIL') ? 'FAIL'
    : statuses.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS', identity, freshness, directory, catalog };
}
export function receiptPath(cwd = process.cwd(), env = process.env) {
  const root = resolve(cwd);
  if (env.GITHUB_ACTIONS !== 'true' && !root.startsWith('/Volumes/SmarterWork/agent-work/')) {
    throw new Error('Local evidence must remain on the external work SSD');
  }
  return resolve(root, 'test-results/pnm-launch-phase6/freshness.json');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const receipt = await qualifyLaunchFreshness();
  try {
    const target = receiptPath();
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`);
  } catch {
    receipt.status = 'UNKNOWN';
    receipt.evidence = unknown('Durable receipt unavailable');
  }
  console.log(JSON.stringify(receipt, null, 2));
  process.exitCode = receipt.status === 'PASS' ? 0 : 1;
}
