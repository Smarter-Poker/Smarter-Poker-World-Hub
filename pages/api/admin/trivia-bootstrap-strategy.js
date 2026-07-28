/**
 * TRIVIA BOOTSTRAP - Seeds 250 questions per new strategy category
 * One-time bootstrap endpoint for new categories
 * Route: /api/admin/trivia-bootstrap-strategy
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { validateBatch } from '../../../src/lib/triviaValidator';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const NEW_CATEGORIES = [
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        subcategories: [
            'Bubble play and ICM pressure',
            'Short stack strategy (10-15BB)',
            'Medium stack strategy (25-40BB)',
            'Big stack bullying',
            'Final table dynamics',
            'Pay jump considerations',
            'Blind defense in tournaments',
            'Satellite tournament strategy'
        ]
    },
    {
        id: 'cash_game_situations',
        name: 'Cash Game Situations',
        subcategories: [
            'Deep stack postflop play (200+ BB)',
            'Set mining and implied odds',
            'Float and probe betting',
            'Stack-to-pot ratio decisions',
            '3-bet pots strategy',
            'Multi-way pot navigation',
            'Exploiting recreational players',
            'Live vs online adjustments'
        ]
    },
    {
        id: 'icm_chip_ev',
        name: 'ICM & Chip EV',
        subcategories: [
            'Risk premium calculations',
            'Bubble factor adjustments',
            'Nash equilibrium push/fold',
            'Final table ICM spots',
            'Satellite ICM strategy',
            'Chip EV vs $EV differences',
            'Deal-making and ICM chops',
            'Short stack ICM decisions'
        ]
    },
    {
        id: 'gto_scenarios',
        name: 'GTO Scenarios',
        subcategories: [
            'Minimum defense frequency applications',
            'Polarized vs linear betting',
            'Solver-based river decisions',
            'Optimal 3-bet/4-bet frequencies',
            'Board texture and c-betting',
            'Blocker effects in bluffing',
            'Node locking and exploitation',
            'Mixed strategy applications'
        ]
    }
];

const TARGET_PER_CATEGORY = 250;
const BATCH_SIZE = 25;

async function generateBatch(category, subcategory, difficulty, count) {
    const grok = getGrokClient();

    const prompt = `Generate ${count} unique poker strategy trivia questions.

Category: ${category.name}
Specific Focus: ${subcategory}
Difficulty: ${difficulty}

Requirements:
- Questions must test PRACTICAL POKER KNOWLEDGE
- Include specific scenarios with stack sizes, positions, and actions
- Make questions CHALLENGING and EDUCATIONAL
- For ${difficulty} difficulty:
  ${difficulty === 'easy' ? '- Basic concepts most regular players would know' : ''}
  ${difficulty === 'medium' ? '- Requires solid strategy understanding' : ''}
  ${difficulty === 'hard' ? '- Expert-level decisions, solver-based knowledge' : ''}
- Each question must have EXACTLY 4 answer options
- Provide a brief explanation for the correct answer

Return ONLY a valid JSON array:
[
    {
        "question": "The exact question text",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct_index": 0,
        "explanation": "Brief explanation"
    }
]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are a world-class poker strategist and GTO expert. Generate practical, scenario-based trivia questions about ${subcategory}. Return valid JSON only.`
                },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.9,
            max_tokens: 4000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        const parsed = JSON.parse(content);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        return questions
            .filter(q => q.question && q.options?.length === 4 && typeof q.correct_index === 'number')
            .map(q => ({
                category: category.id,
                difficulty,
                question: q.question.trim(),
                options: q.options.map(o => o.trim()),
                correct_index: q.correct_index,
                explanation: q.explanation || '',
                subcategory,
                source: 'grok-bootstrap',
                created_at: new Date().toISOString()
            }));
    } catch (error) {
        console.warn(`Bootstrap error for ${category.name}/${subcategory}:`, error);
        return [];
    }
}

export default async function handler(req, res) {
  try {
      // SECURITY: a missing CRON_SECRET is a server misconfiguration, not a grant.
      // This previously FAILED OPEN: with CRON_SECRET unset the template below
      // collapsed to the literal string "Bearer undefined", so any caller
      // sending `Authorization: Bearer undefined` authenticated successfully.
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
          console.warn('[trivia-bootstrap-strategy] CRON_SECRET is not configured — rejecting request');
          return res.status(500).json({ error: 'Server misconfigured' });
      }

      // Admin-only endpoint
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${cronSecret}`) {
          return res.status(401).json({ error: 'Unauthorized' });
      }

      const { category: targetCategory, batchCount = 5 } = req.query;
      const categories = targetCategory
          ? NEW_CATEGORIES.filter(c => c.id === targetCategory)
          : NEW_CATEGORIES;

      const results = { generated: 0, categories: {} };

      for (const cat of categories) {
          // Check current count
          const { count: existing } = await getSupabase()
              .from('trivia_questions')
              .select('*', { count: 'exact', head: true })
              .eq('category', cat.id);

          const needed = TARGET_PER_CATEGORY - (existing || 0);
          if (needed <= 0) {
              results.categories[cat.id] = { existing: existing || 0, needed: 0, generated: 0 };
              continue;
          }

          let catGenerated = 0;
          const difficulties = ['easy', 'medium', 'hard'];

          for (let batch = 0; batch < Math.min(batchCount, Math.ceil(needed / BATCH_SIZE)); batch++) {
              const diff = difficulties[batch % 3];
              const subcat = cat.subcategories[batch % cat.subcategories.length];

              const questions = await generateBatch(cat, subcat, diff, BATCH_SIZE);

              if (questions.length > 0) {
                  // ═══ QA VALIDATION GATE ═══
                  const { valid: validQuestions, rejected } = validateBatch(questions);
                  if (rejected.length > 0) {
                      rejected.forEach(r => r.errors.forEach(e => console.debug(`  → ${e}`)));
                  }

                  if (validQuestions.length > 0) {
                      const { data, error } = await getSupabase()
                          .from('trivia_questions')
                          .insert(validQuestions)
                          .select();

                      if (!error && data) {
                          catGenerated += data.length;
                      }
                  }
              }

              // Rate limit
              await new Promise(r => setTimeout(r, 1500));
          }

          results.generated += catGenerated;
          results.categories[cat.id] = { existing: existing || 0, needed, generated: catGenerated };
      }

      return res.status(200).json({
          success: true,
          message: `Bootstrap complete: ${results.generated} questions generated`,
          results
      });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
