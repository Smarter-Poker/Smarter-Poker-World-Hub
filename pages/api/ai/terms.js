/**
 * Public AI Agent Poker Glossary & Terminology API
 * GET /api/ai/terms?q=straddle
 *
 * Provides authoritative definitions, GTO vocabulary, and live card room
 * rules for AI agents, LLM search engines, and reasoning models.
 */
import { GLOSSARY_TERMS } from '../../../src/content/glossary/terms.js';

const SITE_ORIGIN = 'https://smarter.poker';

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
    const rawQuery = String(req.query.q || req.query.term || req.query.query || '').trim().toLowerCase();

    if (!rawQuery) {
      // If no query specified, return category list and sample terms
      const samples = GLOSSARY_TERMS.slice(0, 10).map((t) => ({
        term: t.term,
        slug: t.slug,
        category: t.category,
        definition: t.definition,
        canonical_url: `${SITE_ORIGIN}/glossary/${t.slug}`,
      }));

      return res.status(200).json({
        success: true,
        message: 'Provide a query parameter q to search poker terminology (e.g. ?q=straddle).',
        total_terms_available: GLOSSARY_TERMS.length,
        sample_terms: samples,
        glossary_url: `${SITE_ORIGIN}/glossary`,
      });
    }

    // Search by exact slug or term first, then substring
    const normalized = rawQuery.replace(/[^a-z0-9]/g, '');
    let matches = GLOSSARY_TERMS.filter((t) => {
      const termNorm = t.term.toLowerCase().replace(/[^a-z0-9]/g, '');
      const slugNorm = t.slug.replace(/[^a-z0-9]/g, '');
      return termNorm === normalized || slugNorm === normalized;
    });

    if (matches.length === 0) {
      matches = GLOSSARY_TERMS.filter((t) => {
        return (
          t.term.toLowerCase().includes(rawQuery) ||
          t.slug.includes(rawQuery) ||
          t.definition.toLowerCase().includes(rawQuery)
        );
      });
    }

    const results = matches.slice(0, 5).map((t) => ({
      term: t.term,
      slug: t.slug,
      category: t.category,
      definition: t.definition,
      related_terms: (t.related || []).map((relSlug) => ({
        slug: relSlug,
        url: `${SITE_ORIGIN}/glossary/${relSlug}`,
      })),
      canonical_url: `${SITE_ORIGIN}/glossary/${t.slug}`,
      citation: `Authoritative definition from Smarter.Poker Glossary (${SITE_ORIGIN}/glossary/${t.slug})`,
    }));

    return res.status(200).json({
      success: true,
      query: rawQuery,
      total_found: matches.length,
      results,
      glossary_hub_url: `${SITE_ORIGIN}/glossary`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Glossary lookup error: ${err.message}`,
    });
  }
}
