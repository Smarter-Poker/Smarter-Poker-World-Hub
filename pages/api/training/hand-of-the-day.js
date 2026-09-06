import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * HAND OF THE DAY API (v2 — Rewired to training_question_cache)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GET  - Returns today's curated daily challenge (random from training_question_cache)
 * POST - Records a user's daily challenge completion
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming, reconcileAnswerKey } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { safeAward } from '../../../src/lib/rewards/awardGuard';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import { enforceTrainingQuestionContract, isTrainingQuestionValid } from '../../../src/lib/training/questionContract.mjs';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

// Deterministic hash from date string to get consistent daily question
function dateHash(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

async function getUserDailyState(req, dailyId) {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return { completion: null, completedDays: [] };
  }
  const { user, error } = await getServerUserWithFallback(req, getSupabase());
  if (error || !user) return { completion: null, completedDays: [] };
  const { data } = await getSupabase()
    .from('training_daily_challenge')
    .select('daily_id, score, ev_loss, selected_action, completed_at')
    .eq('user_id', user.id)
    .like('daily_id', 'daily-%')
    .order('completed_at', { ascending: false })
    .limit(365);
  const rows = Array.isArray(data) ? data : [];
  return {
    completion: rows.find((row) => row.daily_id === dailyId) || null,
    completedDays: rows.map((row) => String(row.daily_id).replace(/^daily-/, '')),
  };
}

export default async function handler(req, res) {
  try {
    withTiming(res);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      // GET: Return today's daily challenge hand from training_question_cache
      try {
        // Phase 76 — Hand of the Day rotates at America/Chicago midnight.
        // Old UTC anchor caused a 6h drift in user-facing rotation.
        const today = getTodayCST(); // YYYY-MM-DD in America/Chicago
        const dailyId = `daily-${today}`;

        // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        // PULL FROM training_question_cache (same pipeline as arena)
        // Only select PIO and CHART engine questions (not SCENARIO/psychology)
        // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        const { count } = await getSupabase()
          .from('training_question_cache')
          .select('*', { count: 'exact', head: true })
          .in('engine_type', ['PIO', 'CHART']);

        if (!count || count === 0) {
          return res.status(200).json({
            success: true,
            dailyId,
            question: null,
            message: 'No training questions available',
          });
        }

        // Use date hash to pick a consistent question for the day
        const offset = dateHash(today) % count;

        const { data: cached, error } = await getSupabase()
          .from('training_question_cache')
          .select('question_data, question_id, game_id, engine_type, level')
          .in('engine_type', ['PIO', 'CHART'])
          .range(offset, offset)
          .maybeSingle();

        if (error) {
          console.warn('[HandOfTheDay] Query error:', error);
          return res.status(500).json({ success: false, error: 'Failed to fetch daily hand' });
        }

        if (!cached || !cached.question_data) {
          return res.status(200).json({
            success: true,
            dailyId,
            question: null,
            message: 'No question data found',
          });
        }

        // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        // MAP question_data to the daily challenge display format
        // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        let qd = cached.question_data;
        // 2026-07-19 AUDIT FIX: ~7% of cache rows carry a correctAnswer /
        // correctAnswerText contradicting their own solver `frequencies` —
        // and this endpoint grades by TEXT. Reconcile before mapping.
        reconcileAnswerKey(qd);
        qd = enforceTrainingQuestionContract(qd);
        if (!isTrainingQuestionValid(qd)) {
          return res.status(422).json({
            success: false,
            error: 'Today’s hand did not pass the training integrity audit.',
          });
        }
        const scenario = qd.scenario || {};

        // Phase 93: Prefer scenario.heroHand (canonical, matches explanation prose)
        // over qd.heroCards. Some cache rows have stale heroCards from before
        // Phase 77/78/79/80 swap migrations, which would surface as a visible
        // mismatch (hero_hand="Ts2h" but explanation says "you hold AA").
        let heroHand = '';
        if (scenario.heroHand) {
          heroHand = scenario.heroHand;
        } else if (qd.heroHand) {
          heroHand = qd.heroHand;
        } else if (qd.heroCards && Array.isArray(qd.heroCards) && qd.heroCards.length >= 2) {
          heroHand = qd.heroCards.join('');
        }

        // Extract board cards
        let boardCards = [];
        if (qd.boardCards && Array.isArray(qd.boardCards)) {
          boardCards = qd.boardCards;
        } else if (scenario.board) {
          // Parse board string like "Jh 7s 2d" or "Jh7s2d"
          const clean = scenario.board.replace(/\s+/g, '');
          for (let i = 0; i < clean.length; i += 2) {
            if (i + 1 < clean.length) boardCards.push(clean.substring(i, i + 2));
          }
        }

        const options = qd.options || [];

        // Build the question object that daily-challenge.js expects
        const question = {
          id: cached.question_id || dailyId,
          game_id: cached.game_id,
          engine_type: cached.engine_type,
          level: cached.level,
          // Fields that daily-challenge.js looks for:
          hero_hand: heroHand,
          hero_position: scenario.heroPosition || '',
          street: scenario.street || 'flop',
          board_cards: boardCards,
          scenario_text: qd.question || scenario.context || `What is the GTO play?`,
          options: options.map((o) => o.text || o),
          choices: options.map((o) => o.text || o),
          correct_answer:
            qd.correctAnswerText || options.find((o) => o.id === qd.correctAnswer)?.text || 'Raise',
          gto_action: qd.correctAnswerText || 'Raise',
          explanation: qd.explanation || '',
          gto_explanation: qd.explanation || '',
          action_breakdown: qd.gtoFrequencies || null,
          gto_frequencies: qd.gtoFrequencies || null,
          // Pass through raw data for rich display
          heroCards: qd.heroCards || [],
          evData: qd.evData || null,
          scenario: scenario,
        };

        // Phase 76 — expiry is CST midnight tomorrow, matching the dailyId
        // rotation. Auto-detects -05:00 (CDT) vs -06:00 (CST) via Intl.
        const cstNow = new Date(
          new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
        );
        cstNow.setDate(cstNow.getDate() + 1);
        const tYear = cstNow.getFullYear();
        const tMonth = String(cstNow.getMonth() + 1).padStart(2, '0');
        const tDate = String(cstNow.getDate()).padStart(2, '0');
        const tzParts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          timeZoneName: 'short',
        }).formatToParts(new Date());
        const tzAbbr = tzParts.find((p) => p.type === 'timeZoneName')?.value || 'CST';
        const tzOffset = tzAbbr === 'CDT' ? '-05:00' : '-06:00';
        const tomorrowMidnightCST = new Date(`${tYear}-${tMonth}-${tDate}T00:00:00${tzOffset}`);

        const dailyState = await getUserDailyState(req, dailyId);
        return res.status(200).json({
          success: true,
          dailyId,
          question,
          expiresAt: tomorrowMidnightCST.toISOString(),
          completion: dailyState.completion,
          completedDays: dailyState.completedDays,
        });
      } catch (error) {
        console.warn('[HandOfTheDay] Error:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    } else if (req.method === 'POST') {
      // POST: Record daily challenge completion
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 10240)
        return res.status(413).json({ success: false, error: 'Request body too large' });
      // ●● Auth: verify JWT identity ●●
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      try {
        const userId = user.id; // From JWT, NOT from req.body
        const { dailyId, selectedAction } = req.body;

        if (!dailyId) {
          return res.status(400).json({ success: false, error: 'dailyId required' });
        }
        const today = getTodayCST();
        const expectedDailyId = `daily-${today}`;
        if (dailyId !== expectedDailyId) {
          return res.status(400).json({ success: false, error: 'Daily challenge has expired' });
        }
        if (typeof selectedAction !== 'string' || !selectedAction.trim() || selectedAction.length > 80) {
          return res.status(400).json({ success: false, error: 'A valid selected action is required' });
        }

        // Never trust score, correctness, EV loss, or the reward decision from
        // the browser. Reload the same deterministic cache row used by GET and
        // grade the submitted action against its canonical answer.
        const { count, error: countError } = await getSupabase()
          .from('training_question_cache')
          .select('*', { count: 'exact', head: true })
          .in('engine_type', ['PIO', 'CHART']);
        if (countError || !count) {
          return res.status(503).json({ success: false, error: 'Daily challenge is unavailable' });
        }
        const offset = dateHash(today) % count;
        const { data: cached, error: questionError } = await getSupabase()
          .from('training_question_cache')
          .select('question_data')
          .in('engine_type', ['PIO', 'CHART'])
          .range(offset, offset)
          .maybeSingle();
        if (questionError || !cached?.question_data) {
          return res.status(503).json({ success: false, error: 'Daily challenge is unavailable' });
        }
        let gradedQuestion = cached.question_data;
        reconcileAnswerKey(gradedQuestion);
        gradedQuestion = enforceTrainingQuestionContract(gradedQuestion);
        if (!isTrainingQuestionValid(gradedQuestion)) {
          return res.status(422).json({ success: false, error: 'Daily challenge did not pass validation' });
        }
        const gradedOptions = Array.isArray(gradedQuestion.options) ? gradedQuestion.options : [];
        const canonicalSelection = gradedOptions.find((option) => {
          const label = typeof option === 'string' ? option : option?.text;
          const id = typeof option === 'string' ? option : option?.id;
          return [label, id].some((value) => String(value || '').toLowerCase() === selectedAction.trim().toLowerCase());
        });
        if (!canonicalSelection) {
          return res.status(400).json({ success: false, error: 'Selected action is not part of today’s challenge' });
        }
        const canonicalSelectedLabel = typeof canonicalSelection === 'string'
          ? canonicalSelection
          : canonicalSelection.text || canonicalSelection.id;
        const canonicalSelectedId = typeof canonicalSelection === 'string'
          ? canonicalSelection
          : canonicalSelection.id || canonicalSelection.text;
        const correctOption = gradedOptions.find((option) => (
          typeof option === 'object' && String(option?.id) === String(gradedQuestion.correctAnswer)
        ));
        const correctLabel = gradedQuestion.correctAnswerText
          || (typeof correctOption === 'object' ? correctOption?.text : correctOption)
          || gradedQuestion.correctAnswer;
        const submittedCorrect = String(canonicalSelectedId || '').toLowerCase() === String(gradedQuestion.correctAnswer || '').toLowerCase()
          || String(canonicalSelectedLabel || '').toLowerCase() === String(correctLabel || '').toLowerCase();

        // 2026-07-19 AUDIT FIX: check for an existing completion FIRST so the
        // 25-diamond reward is credited exactly once per user per day.
        const { data: existing, error: existingError } = await getSupabase()
          .from('training_daily_challenge')
          .select('user_id, score, selected_action')
          .eq('user_id', userId)
          .eq('daily_id', dailyId)
          .maybeSingle();
        if (existingError) {
          return res.status(503).json({ success: false, error: 'Daily completion status is unavailable' });
        }
        let alreadyCompleted = !!existing;
        let isCorrect = alreadyCompleted ? Number(existing.score) >= 100 : submittedCorrect;

        if (!alreadyCompleted) {
          const { error } = await getSupabase()
            .from('training_daily_challenge')
            .insert(
            {
              user_id: userId,
              daily_id: dailyId,
              score: isCorrect ? 100 : 0,
              // This cache generation has frequency-backed strategy evidence,
              // not provenance-sealed per-action BB values. Preserve unknown
              // loss as null instead of inventing a one-BB penalty.
              ev_loss: isCorrect ? 0 : null,
              selected_action: canonicalSelectedLabel,
              completed_at: new Date().toISOString(),
            }
          );

          if (error) {
            // A concurrent identical request can win the unique key. Re-read
            // once so a transport retry remains idempotent without overwriting
            // the first immutable answer.
            const { data: raced, error: raceError } = await getSupabase()
              .from('training_daily_challenge')
              .select('user_id, score')
              .eq('user_id', userId)
              .eq('daily_id', dailyId)
              .maybeSingle();
            if (raceError || !raced) {
              console.warn('[HandOfTheDay] Insert error:', error);
              return res.status(500).json({
                success: false,
                error: 'Failed to record daily challenge completion',
                code: error.code || 'INSERT_FAILED',
              });
            }
            alreadyCompleted = true;
            isCorrect = Number(raced.score) >= 100;
          }
        }

        // 2026-07-19 AUDIT FIX: the endpoint previously RETURNED
        // `diamondsEarned: 25` without ever crediting the diamonds — clients
        // told users they earned a reward that never landed. Credit for real
        // via the same RPC save-progress uses, only on first completion.
        let diamondsEarned = 0;
        if (isCorrect) {
          // Award via award_diamonds_v2 (training_reward catalog key).
          // Amount passed in metadata.reward_diamonds; 1,500 ◆/month family ceiling applies.
          const HOTD_DIAMONDS = 25;
          const { ok: rpcOk, data: rpcData } = await safeAward(getSupabase(), {
            p_user_id: userId,
            p_action_key: 'training_reward',
            p_reference_id: `hotd_${userId}_${dailyId}`,
            p_target_id: `hotd_${dailyId}`,
            p_metadata: {
              reward_diamonds: HOTD_DIAMONDS,
              source_type: 'hand_of_the_day',
              daily_id: dailyId,
              _source: 'api/training/hand-of-the-day',
            },
          });
          if (rpcOk) {
            const result = rpcData && typeof rpcData === 'object' ? rpcData : {};
            diamondsEarned = result.success ? (Number(result.awarded) || 0) : 0;
          } else {
            console.warn('[HandOfTheDay] award_diamonds_v2 failed:', rpcOk);
          }
        }

        return res.status(200).json({
          success: true,
          message: alreadyCompleted ? 'Daily challenge already completed today' : 'Daily challenge completed!',
          diamondsEarned,
          alreadyCompleted,
          isCorrect,
          score: isCorrect ? 100 : 0,
          evLoss: isCorrect ? 0 : null,
        });
      } catch (error) {
        console.warn('[HandOfTheDay] Error:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
