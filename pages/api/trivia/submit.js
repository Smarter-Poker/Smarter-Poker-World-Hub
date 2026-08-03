import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * TRIVIA SUBMIT API - Save Quiz Results
 * ═══════════════════════════════════════════════════════════════════════════
 * Saves a player's trivia result. All dates are in CST (America/Chicago).
 *
 * Trust model:
 *   - The caller is authenticated by JWT; the identity comes from the token,
 *     never the body.
 *   - When the client sends `answers` ([{questionId, answerIndex}]), the
 *     server GRADES them against trivia_questions.correct_index and IGNORES
 *     any client-supplied score/correctCount. This is the trusted path.
 *   - When only score/correctCount are sent (legacy clients), the values are
 *     range-checked AND plausibility-checked against the mode's question
 *     count and points ceiling, and the row is marked unverified.
 *   - One score row per (user, mode, CST day): keep-best. Repeat submissions
 *     update the existing row instead of flooding the leaderboard.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import { recordQuestionsSeen } from '../../../src/lib/triviaQuestionLoader';

/**
 * Exactly the modes allowed by trivia_scores_mode_check
 * (supabase/migrations/20260317_fix_trivia_scores_mode_check.sql).
 * Anything else is a CHECK violation -> 500, so reject it as a 400 up front.
 * The old code defaulted to 'unknown', which the constraint rejects.
 */
const VALID_MODES = new Set([
    'daily', 'history', 'rules', 'pro', 'arcade',
    'mtt', 'cash', 'icm', 'gto',
    'survival', 'endless', 'tournaments',
    'mixed', 'time-attack', 'pvp',
]);

/** Upper bound on points a single question can be worth, per mode. */
const MAX_POINTS_PER_QUESTION = {
    daily: 100, history: 100, rules: 100, pro: 100, arcade: 200,
    mtt: 100, cash: 100, icm: 100, gto: 150,
    survival: 200, endless: 200, tournaments: 200,
    mixed: 100, 'time-attack': 200, pvp: 100,
};
const DEFAULT_MAX_POINTS_PER_QUESTION = 200;

/** Sanity ceiling on questions answered in a single session, per mode. */
const MAX_QUESTIONS = {
    daily: 30, history: 30, rules: 30, pro: 30, arcade: 30,
    mtt: 30, cash: 30, icm: 30, gto: 30, mixed: 30, pvp: 20, tournaments: 60,
    survival: 400, endless: 1000, 'time-attack': 400,
};
const DEFAULT_MAX_QUESTIONS = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _supabase = null;
let _warnedNoServiceRole = false;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey && !_warnedNoServiceRole) {
            _warnedNoServiceRole = true;
            console.warn('[Trivia Submit] SUPABASE_SERVICE_ROLE_KEY missing — RLS reads/writes will silently fail');
        }
        _supabase = createClient(url, serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    }
    return _supabase;
}

/**
 * Grade client answers against the database answer key.
 * @returns {Promise<{graded:boolean, correctCount:number, total:number, questionIds:string[]}>}
 */
async function gradeAnswers(supabase, answers) {
    const byId = new Map();
    for (const a of answers) {
        const qid = a?.questionId ?? a?.question_id ?? a?.id;
        const idx = a?.answerIndex ?? a?.answer_index ?? a?.index;
        if (typeof qid !== 'string' || !UUID_RE.test(qid)) continue;
        if (byId.has(qid)) continue; // first answer per question wins
        byId.set(qid, Number.isInteger(idx) ? idx : -1);
    }
    if (byId.size === 0) return { graded: false, correctCount: 0, total: 0, questionIds: [] };

    const ids = [...byId.keys()];
    const { data, error } = await supabase
        .from('trivia_questions')
        .select('id, correct_index')
        .in('id', ids);

    if (error) {
        console.warn('[Trivia Submit] grading lookup failed:', error.message || error);
        return { graded: false, correctCount: 0, total: 0, questionIds: [] };
    }

    let correctCount = 0;
    for (const row of data || []) {
        if (byId.get(row.id) === row.correct_index) correctCount += 1;
    }
    return { graded: true, correctCount, total: byId.size, questionIds: ids };
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();
          const { score, correctCount, xpEarned, totalQuestions, mode, answers, timeSpent } = req.body || {};

          // ─── MODE: must be one of the CHECK-constraint values ─────────────
          if (typeof mode !== 'string' || !VALID_MODES.has(mode)) {
              return res.status(400).json({
                  success: false,
                  error: 'invalid_mode',
                  allowed: [...VALID_MODES],
              });
          }

          // ─── AUTH REQUIRED (identity comes from the token, never the body) ─
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'authentication_required' });
          }
          const token = authHeader.slice(7).trim();
          if (!token) {
              return res.status(401).json({ success: false, error: 'authentication_required' });
          }
          // Identity via the shared server-auth helper (devhead), which also
          // covers the session-cookie fallback. Shaped as { user } so the
          // checks below are unchanged.
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, supabase);
          const authData = { user: authUser };
          if (authErr || !authData?.user) {
              return res.status(401).json({ success: false, error: 'invalid_token' });
          }
          const userId = authData.user.id;

          // ─── SERVER-SIDE GRADING (trusted path) ───────────────────────────
          let verified = false;
          let finalCorrect = null;
          let finalTotal = null;
          let gradedIds = [];

          if (Array.isArray(answers) && answers.length > 0) {
              if (answers.length > DEFAULT_MAX_QUESTIONS) {
                  return res.status(400).json({ success: false, error: 'too_many_answers' });
              }
              const graded = await gradeAnswers(supabase, answers);
              if (graded.graded) {
                  verified = true;
                  finalCorrect = graded.correctCount;
                  finalTotal = graded.total;
                  gradedIds = graded.questionIds;
              }
          }

          // ─── LEGACY PATH: validate client-reported numbers ────────────────
          if (!verified) {
              if (!Number.isInteger(correctCount) || correctCount < 0) {
                  return res.status(400).json({ success: false, error: 'invalid_correct_count' });
              }
              if (totalQuestions != null && (!Number.isInteger(totalQuestions) || totalQuestions < 0)) {
                  return res.status(400).json({ success: false, error: 'invalid_total_questions' });
              }
              finalTotal = totalQuestions ?? correctCount;
              finalCorrect = correctCount;

              const maxQuestions = MAX_QUESTIONS[mode] ?? DEFAULT_MAX_QUESTIONS;
              if (finalTotal > maxQuestions) {
                  return res.status(400).json({ success: false, error: 'total_questions_exceeds_mode_limit' });
              }
              if (finalCorrect > finalTotal) {
                  return res.status(400).json({ success: false, error: 'correct_exceeds_total' });
              }
          }

          // ─── SCORE: range + plausibility against correctCount ─────────────
          // Absolute ceiling is per-mode: endless legitimately allows up to
          // MAX_QUESTIONS(1000) × 200 pts = 200,000, which the old flat
          // 100,000 cap rejected as invalid_score.
          const modeMaxQuestions = MAX_QUESTIONS[mode] ?? DEFAULT_MAX_QUESTIONS;
          const modeMaxPoints = MAX_POINTS_PER_QUESTION[mode] ?? DEFAULT_MAX_POINTS_PER_QUESTION;
          const absoluteScoreCeiling = modeMaxQuestions * modeMaxPoints;
          if (!Number.isInteger(score) || score < 0 || score > absoluteScoreCeiling) {
              return res.status(400).json({ success: false, error: 'invalid_score' });
          }
          const perQuestionCap = MAX_POINTS_PER_QUESTION[mode] ?? DEFAULT_MAX_POINTS_PER_QUESTION;
          const scoreCeiling = Math.max(perQuestionCap, finalCorrect * perQuestionCap);
          if (score > scoreCeiling) {
              return res.status(400).json({
                  success: false,
                  error: 'score_implausible_for_correct_count',
                  max: scoreCeiling,
              });
          }

          if (xpEarned != null && (!Number.isFinite(xpEarned) || xpEarned < 0 || xpEarned > 1_000_000)) {
              return res.status(400).json({ success: false, error: 'invalid_xp' });
          }
          if (timeSpent != null && (!Number.isInteger(timeSpent) || timeSpent < 0 || timeSpent > 86400)) {
              return res.status(400).json({ success: false, error: 'invalid_time_spent' });
          }

          // Resolve username (NEVER fall back to email prefix — PII leak to the public leaderboard)
          const { data: profile } = await supabase
              .from('profiles')
              .select('username, full_name')
              .eq('id', userId)
              .maybeSingle();
          const username = profile?.username || profile?.full_name || 'Player';

          const today = getTodayCST();

          // ─── ONE ROW PER (user, mode, day): keep-best ─────────────────────
          // Without this, a client could POST unlimited times and occupy every
          // leaderboard slot.
          const { data: existing } = await supabase
              .from('trivia_scores')
              .select('id, score')
              .eq('user_id', userId)
              .eq('mode', mode)
              .eq('play_date', today)
              .order('score', { ascending: false })
              .limit(1)
              .maybeSingle();

          const row = {
              user_id: userId,
              username,
              mode,
              score,
              correct_count: finalCorrect,
              total_questions: finalTotal,
              diamonds_earned: 0,
              xp_earned: Number.isFinite(xpEarned) ? Math.floor(xpEarned) : 0,
              time_spent: Number.isInteger(timeSpent) ? timeSpent : 0,
              play_date: today,
          };

          let improved = true;
          if (existing) {
              if (score <= (existing.score || 0)) {
                  improved = false;
              } else {
                  const { error: updErr } = await supabase
                      .from('trivia_scores')
                      .update(row)
                      .eq('id', existing.id);
                  if (updErr) {
                      console.warn('[Trivia Submit] Update error:', updErr);
                      return res.status(500).json({ success: false, error: 'score_persist_failed' });
                  }
              }
          } else {
              const { error: insertError } = await supabase
                  .from('trivia_scores')
                  .insert({ ...row, created_at: new Date().toISOString() });

              if (insertError) {
                  console.warn('[Trivia Submit] Insert error:', insertError);
                  return res.status(500).json({ success: false, error: 'score_persist_failed' });
              }
          }

          // ─── KEEP THE READ MODEL COHERENT ────────────────────────────────
          // daily.js derives hasPlayedToday from daily_trivia_plays and stats
          // from trivia_streaks. Writing only trivia_scores left both stale,
          // so a client using this API pair saw hasPlayedToday=false and zero
          // stats immediately after submitting.
          if (mode === 'daily') {
              const { error: playErr } = await supabase
                  .from('daily_trivia_plays')
                  .upsert(
                      {
                          user_id: userId,
                          played_date: today,
                          was_correct: finalCorrect > 0,
                      },
                      { onConflict: 'user_id,played_date' }
                  );
              if (playErr) console.warn('[Trivia Submit] daily_trivia_plays upsert failed:', playErr.message || playErr);
          }

          await updateStreaks(supabase, userId, today, finalCorrect, mode);

          // Record graded questions in the 60-day history so every other mode
          // excludes them too.
          if (gradedIds.length > 0) {
              recordQuestionsSeen(supabase, userId, gradedIds, mode)
                  .catch(e => console.warn('[Trivia Submit] history record failed:', e?.message || e));
          }

          // Deduped, mode-scoped leaderboard.
          const { data: leaderboardRows } = await supabase
              .from('trivia_scores')
              .select('username, score')
              .eq('play_date', today)
              .eq('mode', mode)
              .order('score', { ascending: false })
              .limit(50);

          const bestByUser = new Map();
          for (const r of leaderboardRows || []) {
              const name = r?.username || 'Player';
              const prev = bestByUser.get(name);
              if (!prev || (r.score || 0) > prev.score) bestByUser.set(name, { username: name, score: r.score || 0 });
          }
          const leaderboard = [...bestByUser.values()].sort((a, b) => b.score - a.score).slice(0, 10);

          return res.status(200).json({
              success: true,
              message: improved ? 'Score saved successfully' : 'Existing best score kept',
              score,
              improved,
              verified,
              correctCount: finalCorrect,
              totalQuestions: finalTotal,
              // xpEarned is persisted to trivia_scores.xp_earned; it is echoed
              // back so clients can display what was actually recorded.
              xpEarned: row.xp_earned,
              leaderboard
          });

      } catch (error) {
          console.warn('[Trivia Submit] Error:', error);
          try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Maintain the trivia_streaks aggregate row that daily.js reads.
 * Daily-mode plays advance the day streak; every mode contributes to totals.
 */
async function updateStreaks(supabase, userId, today, correctCount, mode) {
    try {
        const { data: current } = await supabase
            .from('trivia_streaks')
            .select('current_streak, best_streak, last_play_date, total_games_played, total_correct')
            .eq('user_id', userId)
            .maybeSingle();

        let currentStreak = current?.current_streak || 0;
        const lastPlay = current?.last_play_date || null;

        if (mode === 'daily') {
            if (lastPlay === today) {
                // already counted today
            } else if (!lastPlay) {
                currentStreak = 1;
            } else {
                const gapDays = Math.round(
                    (new Date(`${today}T12:00:00Z`) - new Date(`${lastPlay}T12:00:00Z`)) / 86400000
                );
                currentStreak = gapDays === 1 ? currentStreak + 1 : 1;
            }
        }

        const payload = {
            user_id: userId,
            current_streak: currentStreak,
            best_streak: Math.max(current?.best_streak || 0, currentStreak),
            total_games_played: (current?.total_games_played || 0) + 1,
            total_correct: (current?.total_correct || 0) + (correctCount || 0),
            updated_at: new Date().toISOString(),
        };
        if (mode === 'daily') payload.last_play_date = today;

        const { error } = await supabase
            .from('trivia_streaks')
            .upsert(payload, { onConflict: 'user_id' });
        if (error) console.warn('[Trivia Submit] streak upsert failed:', error.message || error);
    } catch (e) {
        console.warn('[Trivia Submit] streak update failed:', e?.message || e);
    }
}
