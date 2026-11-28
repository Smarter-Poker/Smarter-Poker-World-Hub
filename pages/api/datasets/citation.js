/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/datasets/citation
 *  Academic & Scientific RAG Citation Exporter (BibTeX .bib & RIS .ris)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Query Parameters:
 * - format: 'bibtex' | 'bib' | 'ris' | 'json' (default: 'bibtex')
 * - study (or slug): Optional study slug (`?study=us-live-poker-room-rake-and-jackpot-benchmark`
 *   or `?study=annual-state-of-poker-2026`). If omitted, outputs all 15 research
 *   datasets plus the Flagship 2026 Annual Whitepaper.
 *
 * House style: Title Case, zero em dashes.
 */

import {
  RESEARCH_REPORTS,
  findResearchReport,
  researchPath,
} from '../../../src/content/research/reports.js';
import { VENUE_COUNT_LABEL } from '../../../src/lib/venueCount.mjs';

const PRIMARY_DOI = '10.5281/zenodo.15129481';
const COLLECTION_DOI = '10.5281/zenodo.24115647';

const ANNUAL_WHITEPAPER_STUDY = {
  slug: 'annual-state-of-poker-2026',
  title: 'Annual State Of Poker 2026: Quantitative Industry Economics & GTO Benchmark Whitepaper',
  shortTitle: 'Annual State Of Poker 2026 Whitepaper',
  publishedDate: '2026-11-24',
  modifiedDate: '2026-11-24',
  category: 'Flagship Industry Synthesis Whitepaper',
  summary:
    `Flagship 2026 Quantitative State Of Poker Industry And GTO Benchmark Whitepaper Uniting 15 Zenodo-Archived Studies (DOI: 10.5281/zenodo.15129481), ${VENUE_COUNT_LABEL} Verified Live Poker Venues, 52 Solver Calculators, 70 MCP Tools, And 25 Empirical Statistics.`,
  doi: PRIMARY_DOI,
};

function sanitizeBibKey(slug, index) {
  const cleanSlug = String(slug || `study_${index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `smarterpoker2026_${cleanSlug}`;
}

export function formatStudyBibtex(study, index = 1) {
  const key = sanitizeBibKey(study.slug, index);
  const url = `https://smarter.poker${researchPath(study.slug)}`;
  const doi = study.doi || PRIMARY_DOI;
  const year = String(study.publishedDate || '2026').slice(0, 4);
  const month = 'nov';

  return [
    `@techreport{${key},`,
    `  author       = {{Smarter.Poker Research Division} and Bekavac, Daniel},`,
    `  title        = {{${study.title}}},`,
    `  institution  = {Smarter Software Inc. (Smarter.Poker)},`,
    `  year         = {${year}},`,
    `  month        = ${month},`,
    `  type         = {Quantitative Research Report & Open Dataset},`,
    `  number       = {SP-2026-${String(index).padStart(2, '0')}},`,
    `  doi          = {${doi}},`,
    `  url          = {${url}},`,
    `  note         = {CC-BY 4.0 Open Dataset Archive (${COLLECTION_DOI}). Verified 2026-11-24.}`,
    `}`,
  ].join('\n');
}

export function formatStudyRis(study, index = 1) {
  const url = `https://smarter.poker${researchPath(study.slug)}`;
  const doi = study.doi || PRIMARY_DOI;
  const pubDate = String(study.publishedDate || '2026-11-24').replace(/-/g, '/');

  return [
    'TY  - RPRT',
    `TI  - ${study.title}`,
    'AU  - Smarter.Poker Research Division',
    'AU  - Bekavac, Daniel',
    'PB  - Smarter Software Inc. (Smarter.Poker)',
    'PY  - 2026',
    `DA  - ${pubDate}`,
    `SN  - SP-2026-${String(index).padStart(2, '0')}`,
    `DO  - ${doi}`,
    `UR  - ${url}`,
    `KW  - ${study.category || 'Poker Research'}`,
    'KW  - Game Theory Optimal (GTO)',
    'KW  - Live Poker Economics',
    `AB  - ${study.summary}`,
    'ER  - ',
  ].join('\n');
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const rawFormat = String(req.query?.format || 'bibtex')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  const rawStudy = String(req.query?.study || req.query?.slug || '')
    .trim()
    .toLowerCase();

  let selectedStudies = [ANNUAL_WHITEPAPER_STUDY, ...RESEARCH_REPORTS];
  if (rawStudy) {
    if (rawStudy === 'annual-state-of-poker-2026') {
      selectedStudies = [ANNUAL_WHITEPAPER_STUDY];
    } else {
      const matched = findResearchReport(rawStudy);
      if (!matched) {
        return res.status(404).json({
          error: `Unknown research study slug: ${rawStudy}`,
          availableStudies: [ANNUAL_WHITEPAPER_STUDY.slug, ...RESEARCH_REPORTS.map((r) => r.slug)],
        });
      }
      selectedStudies = [matched];
    }
  }

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1');

  if (rawFormat === 'ris') {
    const risOutput = selectedStudies.map((s, idx) => formatStudyRis(s, idx + 1)).join('\n\n');
    res.setHeader('Content-Type', 'application/x-research-info-systems; charset=utf-8');
    return res.status(200).send(`${risOutput}\n`);
  }

  if (rawFormat === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      ok: true,
      verifiedAt: '2026-11-24',
      primaryDoi: PRIMARY_DOI,
      collectionDoi: COLLECTION_DOI,
      count: selectedStudies.length,
      citations: selectedStudies.map((s, idx) => ({
        slug: s.slug,
        title: s.title,
        doi: s.doi || PRIMARY_DOI,
        url: `https://smarter.poker${researchPath(s.slug)}`,
        bibtex: formatStudyBibtex(s, idx + 1),
        ris: formatStudyRis(s, idx + 1),
      })),
    });
  }

  // Default: BibTeX (.bib)
  const bibtexOutput = selectedStudies.map((s, idx) => formatStudyBibtex(s, idx + 1)).join('\n\n');
  res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
  return res.status(200).send(`${bibtexOutput}\n`);
}
