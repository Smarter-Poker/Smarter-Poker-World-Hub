/**
 * TRIVIA BOOTSTRAP SCRIPT
 * One-time bulk generation of questions for initial pool
 * Generates 250 questions per category (1,500 total)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { validateBatch, normalizeQuestionText } from '../../../src/lib/triviaValidator';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

// Vercel kills the default-duration invocation mid-run on a large bootstrap.
// The handler is ALSO incremental (see `nextCategory` in the response) so a
// scheduler can loop calls instead of relying on one long invocation.
export const config = { maxDuration: 300 };

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            // This route writes to trivia_questions; with the anon key every
            // insert is silently rejected by RLS. Fail loudly instead.
            throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — bootstrap cannot write to trivia_questions');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/** Baseline score for validator-passed questions. Gameplay floor is 6. */
const SEEDED_QUALITY_SCORE = 7;

/** Wall-clock budget for one invocation, leaving headroom under maxDuration. */
const RUN_BUDGET_MS = 240000;

/**
 * Existing question texts for a category, normalized, so re-runs stop
 * inflating the pool with paraphrased near-duplicates that still count toward
 * the depth target the 60-day guarantee depends on.
 */
async function loadExistingTexts(supabase, categoryId) {
    const texts = new Set();
    const PAGE = 1000;
    for (let from = 0; from < 5000; from += PAGE) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('question')
            .eq('category', categoryId)
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) {
            console.warn('[Bootstrap] existing-text load failed:', error.message);
            break;
        }
        for (const row of data || []) {
            const norm = normalizeQuestionText(row?.question);
            if (norm) texts.add(norm);
        }
        if (!data || data.length < PAGE) break;
    }
    return texts;
}

const CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        topics: [
            'Origins of poker and card games',
            'Evolution of Texas Hold\'em',
            'Famous poker venues and casinos',
            'Televised poker history',
            'Online poker evolution',
            'Poker legislation history',
            'Historic high-stakes games'
        ]
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        topics: [
            'WSOP Main Event famous hands',
            'High Stakes Poker iconic moments',
            'Poker After Dark memorable plays',
            'Historic bluffs',
            'Famous bad beats',
            'Championship final table hands',
            'Million dollar pots'
        ]
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        topics: [
            'WSOP bracelet records',
            'Poker Hall of Fame members',
            'Famous tournament winners',
            'Online poker legends',
            'International poker champions',
            'Notable cash game players',
            'Poker personalities and commentators'
        ]
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        topics: [
            'WSOP history and statistics',
            'WPT history and champions',
            'EPT and international tours',
            'High roller events',
            'Record prize pools',
            'Notable tournament structures',
            'Online tournament milestones'
        ]
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        topics: [
            'Hand rankings and terminology',
            'Betting rules and structures',
            'Tournament rules (TDA)',
            'Cash game procedures',
            'Dealer responsibilities',
            'Table etiquette',
            'Common rule disputes'
        ]
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        topics: [
            'Range construction',
            'Pot odds and implied odds',
            'Position strategy',
            'Bet sizing concepts',
            'Balance and polarization',
            'Exploitative adjustments',
            'ICM and tournament theory'
        ]
    },
    // NEW STRATEGY CATEGORIES - Added Feb 2026
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        topics: [
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
        topics: [
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
        topics: [
            'Risk premium calculations',
            'Bubble factor adjustments',
            'Nash equilibrium push/fold',
            'Final table ICM spots',
            'Satellite ICM strategy',
            'Chip EV vs dollar EV differences',
            'Deal-making and ICM chops',
            'Short stack ICM decisions'
        ]
    },
    {
        id: 'gto_scenarios',
        name: 'GTO Scenarios',
        topics: [
            'Minimum defense frequency applications',
            'Polarized vs linear betting',
            'Solver-based river decisions',
            'Optimal 3-bet and 4-bet frequencies',
            'Board texture and c-betting',
            'Blocker effects in bluffing',
            'Node locking and exploitation',
            'Mixed strategy applications'
        ]
    }
];

const TARGET_PER_CATEGORY = 250;
const BATCH_SIZE = 25; // Questions per Grok call

async function generateBatch(category, topic, difficulty, count) {
    const grok = getGrokClient();

    const prompt = `Generate exactly ${count} unique poker trivia questions.

Category: ${category.name}
Topic: ${topic}
Difficulty: ${difficulty}

CRITICAL REQUIREMENTS:
- Questions must be FACTUALLY ACCURATE and VERIFIABLE
- Include specific names, dates, dollar amounts, and statistics
- Make them ENGAGING for poker enthusiasts
- NO generic or obvious questions
- Each question has EXACTLY 4 answer options
- Include brief explanation for correct answer

Difficulty Guidelines:
${difficulty === 'easy' ? '- Common knowledge most poker fans would know' : ''}
${difficulty === 'medium' ? '- Requires solid poker knowledge' : ''}
${difficulty === 'hard' ? '- Expert-level, obscure facts' : ''}

Return ONLY valid JSON array:
[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert poker historian and strategist. Generate accurate, engaging trivia. Focus specifically on: ${topic}. Return valid JSON only.`
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
                difficulty: difficulty,
                question: q.question.trim(),
                options: q.options.map(o => String(o).trim()),
                correct_index: q.correct_index,
                explanation: q.explanation || '',
                subcategory: topic,
                source: 'grok-bootstrap',
                // Without this the column default of 5 applied, which is below
                // the gameplay floor of 6 — every bootstrapped question was
                // invisible to players until a quality audit re-scored it.
                // Matches scripts/trivia-grok-seed.js.
                quality_score: SEEDED_QUALITY_SCORE,
                created_at: new Date().toISOString()
            }));
    } catch (error) {
        console.warn(`[Bootstrap] Error generating for ${category.name}/${topic}:`, error.message);
        return [];
    }
}

export default async function handler(req, res) {
  try {
      // Header-only, fail-closed auth. See src/lib/trivia/adminAuth.js for
      // what was wrong with the previous check (it authenticated requests
      // carrying no credentials at all whenever CRON_SECRET was unset).
      if (!requireAdminSecret(req, res, { label: 'trivia-bootstrap' })) return;

      const deadline = Date.now() + RUN_BUDGET_MS;

      // Get target category from query or do all
      const { category: targetCat } = req.query;
      const categoriesToProcess = targetCat
          ? CATEGORIES.filter(c => c.id === targetCat)
          : CATEGORIES;

      if (categoriesToProcess.length === 0) {
          return res.status(400).json({ error: 'Invalid category' });
      }

      const maxBatches = Math.max(1, Math.min(15, parseInt(req.query.batchCount, 10) || 15));

      const results = {
          started: new Date().toISOString(),
          targetPerCategory: TARGET_PER_CATEGORY,
          categories: {},
          timedOut: false,
          nextCategory: null,
      };

      // Process each category
      for (let ci = 0; ci < categoriesToProcess.length; ci++) {
          const category = categoriesToProcess[ci];

          // Incremental: stop cleanly before Vercel kills the invocation and
          // hand the caller a cursor to resume from, instead of returning a
          // 504 with no results and no way to tell what got inserted.
          if (Date.now() > deadline) {
              results.timedOut = true;
              results.nextCategory = category.id;
              break;
          }

          // Get current count
          const { count: existingCount } = await getSupabase()
              .from('trivia_questions')
              .select('*', { count: 'exact', head: true })
              .eq('category', category.id);

          const needed = Math.max(0, TARGET_PER_CATEGORY - (existingCount || 0));

          if (needed === 0) {
              results.categories[category.id] = {
                  name: category.name,
                  existing: existingCount,
                  generated: 0,
                  message: 'Already at target'
              };
              continue;
          }

          const existingTexts = await loadExistingTexts(getSupabase(), category.id);

          let generated = 0;
          let duplicatesRejected = 0;
          const difficulties = ['easy', 'medium', 'medium', 'medium', 'hard']; // 20/60/20 distribution

          // Generate in batches across topics
          let batchCount = 0;
          while (generated < needed && batchCount < maxBatches) {
              if (Date.now() > deadline) {
                  results.timedOut = true;
                  results.nextCategory = category.id;
                  break;
              }

              const topic = category.topics[batchCount % category.topics.length];
              const difficulty = difficulties[batchCount % difficulties.length];
              const batchNeeded = Math.min(BATCH_SIZE, needed - generated);


              const questions = await generateBatch(category, topic, difficulty, batchNeeded);

              if (questions.length > 0) {
                  // ═══ QA VALIDATION + DEDUP GATE ═══
                  const { valid: validQuestions, rejected } = validateBatch(questions, { existingTexts });
                  if (rejected.length > 0) {
                      duplicatesRejected += rejected.filter(r => r.errors.some(e => e.startsWith('DUP-'))).length;
                      rejected.forEach(r => r.errors.forEach(e => console.debug(`  → ${e}`)));
                  }

                  if (validQuestions.length > 0) {
                      const { data, error } = await getSupabase()
                          .from('trivia_questions')
                          .insert(validQuestions)
                          .select();

                      if (!error && data) {
                          generated += data.length;
                          for (const q of validQuestions) {
                              const norm = normalizeQuestionText(q.question);
                              if (norm) existingTexts.add(norm);
                          }
                      } else if (error) {
                          console.warn(`[Bootstrap] Insert error:`, error.message);
                      }
                  }
              }

              batchCount++;

              // Rate limiting
              await new Promise(r => setTimeout(r, 500));
          }

          results.categories[category.id] = {
              name: category.name,
              existing: existingCount || 0,
              generated,
              duplicatesRejected,
              total: (existingCount || 0) + generated,
              target: TARGET_PER_CATEGORY
          };

          if (results.timedOut) break;
      }

      // Get final counts (parallel — this used to be 10 serial round-trips)
      const counts = await Promise.all(CATEGORIES.map(cat =>
          getSupabase()
              .from('trivia_questions')
              .select('*', { count: 'exact', head: true })
              .eq('category', cat.id)
              .then(({ count }) => count || 0)
      ));
      const totalQuestions = counts.reduce((a, b) => a + b, 0);

      results.completed = new Date().toISOString();
      results.totalQuestions = totalQuestions;
      results.targetTotal = CATEGORIES.length * TARGET_PER_CATEGORY;
      results.progress = `${Math.round((totalQuestions / results.targetTotal) * 100)}%`;


      return res.status(200).json(results);

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
