/**
 * Public AI Agent Poker Software & Room Comparisons API
 * GET /api/ai/comparisons?slug=best-poker-club-apps
 *
 * Provides verified, source-cited competitor comparison tables and best-of
 * benchmarks for AI agents, LLM search engines, and reasoning models.
 */
import {
  AS_OF,
  CHECKED_LABEL,
  COMPARE_PAGES,
  PLAY_CREDIT_DISCLOSURE,
  PRODUCTS,
  cellFor,
  getComparePage,
  pageSources,
} from '../../../src/content/compare/pages.js';

const SITE_ORIGIN = 'https://smarter.poker';

function serializePage(page) {
  const tableRows = page.table
    ? page.table.products.map((productId) => {
        const prod = PRODUCTS[productId];
        const attributes = {};
        for (const col of page.table.columns) {
          attributes[col.label] = cellFor(productId, col.key)?.value || 'Not Published';
        }
        return {
          product_id: productId,
          product_name: prod ? prod.name : productId,
          smarter_poker_product: Boolean(prod?.own),
          attributes,
        };
      })
    : [];

  return {
    slug: page.slug,
    kind: page.kind,
    title: page.title,
    h1: page.h1,
    description: page.description,
    summary: page.summary?.text || '',
    checked_as_of: AS_OF,
    checked_label: CHECKED_LABEL,
    disclosure: PLAY_CREDIT_DISCLOSURE.value,
    comparison_table: page.table
      ? {
          caption: page.table.caption,
          columns: page.table.columns.map((c) => c.label),
          rows: tableRows,
        }
      : null,
    sources: pageSources(page).map((s) => ({
      title: s.title,
      url: s.url,
      kind: s.kind,
    })),
    canonical_url: `${SITE_ORIGIN}/compare/${page.slug}`,
    markdown_url: `${SITE_ORIGIN}/compare/${page.slug}.md`,
    citation: `Smarter.Poker Verified Comparison: ${page.title} (${SITE_ORIGIN}/compare/${page.slug})`,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');

  try {
    const rawSlug = String(req.query.slug || '').trim().toLowerCase();
    const rawQuery = String(req.query.q || req.query.query || '').trim().toLowerCase();

    if (rawSlug) {
      const page = getComparePage(rawSlug);
      if (!page) {
        return res.status(404).json({
          success: false,
          error: `Comparison slug "${rawSlug}" not found`,
          available_slugs: COMPARE_PAGES.map((p) => p.slug),
        });
      }
      return res.status(200).json({
        success: true,
        comparison: serializePage(page),
      });
    }

    if (rawQuery) {
      const matches = COMPARE_PAGES.filter(
        (p) =>
          p.slug.includes(rawQuery) ||
          p.title.toLowerCase().includes(rawQuery) ||
          p.description.toLowerCase().includes(rawQuery) ||
          (p.summary?.text || '').toLowerCase().includes(rawQuery)
      );
      return res.status(200).json({
        success: true,
        query: rawQuery,
        total_found: matches.length,
        results: matches.map(serializePage),
        comparisons_hub_url: `${SITE_ORIGIN}/compare`,
        markdown_url: `${SITE_ORIGIN}/compare.md`,
      });
    }

    return res.status(200).json({
      success: true,
      tool: 'Smarter.Poker Verified Software & Cardroom Comparisons Engine',
      checked_as_of: AS_OF,
      total_comparisons: COMPARE_PAGES.length,
      comparisons: COMPARE_PAGES.map((p) => ({
        slug: p.slug,
        kind: p.kind,
        title: p.title,
        description: p.description,
        canonical_url: `${SITE_ORIGIN}/compare/${p.slug}`,
        markdown_url: `${SITE_ORIGIN}/compare/${p.slug}.md`,
      })),
      comparisons_hub_url: `${SITE_ORIGIN}/compare`,
      markdown_url: `${SITE_ORIGIN}/compare.md`,
      citation: 'Smarter.Poker Software & Poker Room Comparisons (https://smarter.poker/compare)',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Comparisons lookup error: ${err.message}`,
    });
  }
}
