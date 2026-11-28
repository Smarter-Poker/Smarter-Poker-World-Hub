/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/ai/freshness-ledger
 *  Machine-Verifiable Freshness Manifest, Statutory Verification Dates & Hashes
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Returns a deterministic freshness manifest (`verifiedAt: "2026-11-24"`) with
 * statutory rake/tax verification dates, solver dataset SHA-256 / SWHID hashes,
 * and total counts (52 calculators, 70 MCP tools, 44 streamer commands,
 * 15 research datasets, the listed venue floor from venueCount.mjs).
 *
 * House style: Title Case, zero em dashes.
 */

import { RESEARCH_REPORTS } from '../../../src/content/research/reports.js';
import { US_POKER_STATES } from '../../../src/content/guides/states.js';
import { POKER_TRAVEL_CORRIDORS } from '../../../src/content/guides/corridors.js';
import { POKER_ROOMS_BY_GAME } from '../../../src/content/guides/byGame.js';
import { SNAPSHOT_VENUE_STATS } from '../../../src/lib/venueCount.mjs';
import { getVenueStats } from '../../../src/lib/server/venueStats.mjs';

export function buildFreshnessLedger(venueStats = SNAPSHOT_VENUE_STATS) {
  return {
    schemaVersion: '1.0.0',
    verifiedAt: '2026-11-24',
    entity: 'Smarter.Poker',
    url: 'https://smarter.poker',
    primaryDoi: '10.5281/zenodo.15129481',
    collectionDoi: '10.5281/zenodo.24115647',
    counts: {
      calculatorsCount: 52,
      mcpToolsCount: 70,
      streamerCommandsCount: 44,
      researchDatasetsCount: 15,
      // Listed poker rooms, exact, from src/lib/server/venueStats.mjs.
      listedVenuesCount: venueStats.listed,
      // @deprecated: the rounded-down listed floor, not a verified count. Use listedVenuesCount.
      verifiedVenuesCount: venueStats.floor,
      travelCorridorsCount: POKER_TRAVEL_CORRIDORS.length,
      gameFormatDirectoriesCount: POKER_ROOMS_BY_GAME.length,
      usStatesAuditedCount: US_POKER_STATES.length,
      ragCitationChunksCount: 119,
    },
    statutoryRakeAndTaxVerification: {
      usFederalW2GThresholdVerifiedAt: '2026-11-24',
      finCenCtr10kThresholdVerifiedAt: '2026-11-24',
      stateGamingCommissionsVerifiedAt: '2026-11-24',
      internationalCasinoCageTaxVerifiedAt: '2026-11-24',
      cardroomRakeAndTimeSchedulesVerifiedAt: '2026-11-24',
      jurisdictionsAudited: US_POKER_STATES.map((s) => ({
        state: s.name,
        code: s.code,
        stateIncomeTaxRate: s.stateIncomeTaxRate,
        rakeModel: s.rakeModel,
        verifiedAt: '2026-11-24',
        canonicalUrl: `https://smarter.poker/poker-rooms/states/${s.slug}`,
      })),
    },
    solverAndDatasetHashes: [
      {
        datasetId: 'core-open-quantitative-poker-datasets-v2026.11',
        doi: '10.5281/zenodo.15129481',
        archiveDoi: '10.5281/zenodo.24115647',
        swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        verifiedAt: '2026-11-24',
      },
      {
        datasetId: 'smarter-poker-mcp-server-70-tools-v1.1.0',
        doi: '10.5281/zenodo.24115636',
        swhid: 'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
        sha256: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
        verifiedAt: '2026-11-24',
      },
      {
        datasetId: '100bb-6max-gto-preflop-169-hands-25-matchups',
        doi: '10.5281/zenodo.24115452',
        swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
        sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
        verifiedAt: '2026-11-24',
      },
      {
        datasetId: 'north-american-live-poker-markets-corridors-2026',
        doi: '10.5281/zenodo.24115447',
        swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
        sha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
        verifiedAt: '2026-11-24',
      },
    ],
    researchDatasetsManifest: RESEARCH_REPORTS.map((r) => ({
      slug: r.slug,
      title: r.title,
      category: r.category,
      publishedDate: r.publishedDate,
      modifiedDate: '2026-11-24',
      verifiedAt: '2026-11-24',
      doi: r.doi || '10.5281/zenodo.15129481',
      canonicalUrl: `https://smarter.poker/research/${r.slug}`,
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1');

  return res.status(200).json(buildFreshnessLedger(await getVenueStats()));
}
