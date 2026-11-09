/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/datasets/catalog
 *  Open Dataset Catalog, Schema.org DataCatalog, Zenodo & Wikipedia Citations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Query Parameters:
 * - slug: Optional research study slug filter
 * - format: 'json' (default) | 'zenodo' | 'cff' | 'jsonld' | 'wikipedia'
 */

import {
  getDatasetCatalogPayload,
  buildZenodoMetadata,
  buildCitationCff,
  buildDataCatalogJsonLd,
  WIKIPEDIA_CITATION_TARGETS,
} from '../../../src/lib/seo/datasetCatalog.mjs';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { slug = '', format = 'json' } = req.query || {};
  const normalizedFormat = String(format || 'json').toLowerCase();

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (normalizedFormat === 'cff') {
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    return res.status(200).send(buildCitationCff());
  }

  if (normalizedFormat === 'zenodo') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(buildZenodoMetadata());
  }

  if (normalizedFormat === 'jsonld') {
    res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
    return res.status(200).json(buildDataCatalogJsonLd());
  }

  if (normalizedFormat === 'wikipedia') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      count: WIKIPEDIA_CITATION_TARGETS.length,
      wikipedia_citation_targets: WIKIPEDIA_CITATION_TARGETS,
    });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(getDatasetCatalogPayload({ slug }));
}
