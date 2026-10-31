/**
 * Public AI Agent Poker Strategy Lessons & Curriculum API
 * GET /api/ai/lessons?q=3-bet&category=Preflop
 *
 * Provides authoritative GTO strategy lessons, mathematical tables, and
 * training curriculum lookups for AI agents, LLM search engines, and reasoning models.
 */
import { LESSONS, LEARN_CATEGORIES, trainingCta } from '../../../src/content/learn/lessons.js';

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
    const rawQuery = String(req.query.q || req.query.topic || req.query.query || '').trim().toLowerCase();
    const rawCategory = String(req.query.category || '').trim().toLowerCase();

    let pool = LESSONS;
    if (rawCategory) {
      pool = pool.filter((l) => l.category.toLowerCase() === rawCategory);
    }

    if (!rawQuery && !rawCategory) {
      const samples = LESSONS.slice(0, 12).map((l) => ({
        slug: l.slug,
        title: l.title,
        category: l.category,
        summary: l.summary,
        canonical_url: `${SITE_ORIGIN}/learn/${l.slug}`,
        markdown_url: `${SITE_ORIGIN}/learn/${l.slug}.md`,
      }));

      return res.status(200).json({
        success: true,
        tool: 'Smarter.Poker GTO Strategy Curriculum & Lessons Engine',
        total_lessons: LESSONS.length,
        categories: LEARN_CATEGORIES,
        sample_lessons: samples,
        curriculum_url: `${SITE_ORIGIN}/learn`,
        markdown_url: `${SITE_ORIGIN}/learn.md`,
        citation: 'Smarter.Poker GTO Strategy Curriculum (https://smarter.poker/learn)',
      });
    }

    let matches = pool;
    if (rawQuery) {
      const normalized = rawQuery.replace(/[^a-z0-9]/g, '');
      matches = pool.filter((l) => {
        const slugNorm = l.slug.replace(/[^a-z0-9]/g, '');
        const titleNorm = l.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return slugNorm === normalized || titleNorm === normalized;
      });

      if (matches.length === 0) {
        matches = pool.filter((l) => {
          return (
            l.title.toLowerCase().includes(rawQuery) ||
            l.slug.includes(rawQuery) ||
            l.summary.toLowerCase().includes(rawQuery) ||
            l.category.toLowerCase().includes(rawQuery)
          );
        });
      }
    }

    const results = matches.slice(0, 10).map((l) => {
      const cta = trainingCta(l);
      return {
        slug: l.slug,
        title: l.title,
        category: l.category,
        summary: l.summary,
        sections: (l.sections || []).map((s) => ({
          heading: s.heading,
          paragraphs: s.paragraphs,
        })),
        related_lessons: (l.related || []).map((relSlug) => ({
          slug: relSlug,
          url: `${SITE_ORIGIN}/learn/${relSlug}`,
        })),
        glossary_terms: (l.glossary || []).map((termSlug) => ({
          slug: termSlug,
          url: `${SITE_ORIGIN}/glossary/${termSlug}`,
        })),
        interactive_practice: {
          training_game: cta.game ? `${SITE_ORIGIN}${cta.game.href}` : null,
          calculator_tool: cta.tool ? `${SITE_ORIGIN}${cta.tool.href}` : null,
          ai_coach: `${SITE_ORIGIN}${cta.jarvis.href}`,
        },
        canonical_url: `${SITE_ORIGIN}/learn/${l.slug}`,
        markdown_url: `${SITE_ORIGIN}/learn/${l.slug}.md`,
        citation: `Smarter.Poker Strategy Lesson: ${l.title} (${SITE_ORIGIN}/learn/${l.slug})`,
      };
    });

    return res.status(200).json({
      success: true,
      query: rawQuery || null,
      category: rawCategory || null,
      total_found: matches.length,
      results,
      curriculum_url: `${SITE_ORIGIN}/learn`,
      markdown_url: `${SITE_ORIGIN}/learn.md`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Strategy lessons lookup error: ${err.message}`,
    });
  }
}
