/**
 *  TRAINING STREAK API
 * ═══════════════════════════════════════════════════════════════════════════
 * Track daily training streaks and award milestone rewards
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withRetry } from '../../../src/lib/supabaseRetry';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
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

// Streak milestone rewards
const STREAK_MILESTONES = [
    { days: 3, diamonds: 25, name: '3-Day Streak' },
    { days: 7, diamonds: 75, name: 'Week Warrior' },
    { days: 14, diamonds: 150, name: 'Two Week Champion' },
    { days: 30, diamonds: 400, name: 'Monthly Master' },
    { days: 60, diamonds: 800, name: 'Double Month Legend' },
    { days: 100, diamonds: 2000, name: 'Century Grinder' },
    { days: 365, diamonds: 10000, name: 'Year of Dedication' },
];

export default async function handler(req, res) {
  try {
      withTiming(res);
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      const supabase = getSupabase();

      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
      const userId = user.id; // From JWT, not request

      // GET: Fetch user streak
      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');

          try {
              const { data: streak } = await supabase
                  .from('training_streaks')
                  .select('current_streak, longest_streak, last_training_date, streak_start_date, milestones_claimed')
                  .eq('user_id', userId)
                  .maybeSingle();

              if (!streak) {
                  return res.status(200).json({
                      success: true,
                      streak: {
                          currentStreak: 0,
                          longestStreak: 0,
                          lastTrainingDate: null,
                          nextMilestone: STREAK_MILESTONES[0]
                      }
                  });
              }

              // Find next milestone
              const claimedDays = streak.milestones_claimed || [];
              const nextMilestone = STREAK_MILESTONES.find(m =>
                  !claimedDays.includes(m.days) && m.days > streak.current_streak
              );

              // Find claimable milestones
              const claimable = STREAK_MILESTONES.filter(m =>
                  !claimedDays.includes(m.days) && m.days <= streak.current_streak
              );

              return res.status(200).json({
                  success: true,
                  streak: {
                      currentStreak: streak.current_streak,
                      longestStreak: streak.longest_streak,
                      lastTrainingDate: streak.last_training_date,
                      streakStartDate: streak.streak_start_date,
                      nextMilestone,
                      claimableMilestones: claimable,
                      allMilestones: STREAK_MILESTONES.map(m => ({
                          ...m,
                          claimed: claimedDays.includes(m.days),
                          achieved: m.days <= streak.current_streak
                      }))
                  }
              });

          } catch (error) {
              console.warn('[Streak] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to fetch streak' });
          }
      }

      // POST: Record training activity (call after session)
      if (req.method === 'POST') {
          const bodySize = JSON.stringify(req.body || {}).length;
          if (bodySize > 5120) return res.status(413).json({ success: false, error: 'Request body too large' });
          const { action } = req.body;
          // userId from JWT (set at top of handler)

          try {
              // Phase 76 — anchor streak day to America/Chicago, not UTC.
              // Without CST anchor: train at 5:59pm CST then 6:01pm CST →
              // two UTC days but ONE CST day → streak bumps twice for one
              // real day. Also fixes the inverse where Mon 11pm CST + Wed
              // 1am CST resolves daysDiff=1 in UTC math instead of 2.
              const today = getTodayCST();

              // Get current streak
              const { data: existing } = await supabase
                  .from('training_streaks')
                  .select('current_streak, longest_streak, last_training_date, streak_start_date, milestones_claimed')
                  .eq('user_id', userId)
                  .maybeSingle();

              if (!existing) {
                  // Create new streak
                  await withRetry(
                      () => supabase
                          .from('training_streaks')
                          .insert({
                              user_id: userId,
                              current_streak: 1,
                              longest_streak: 1,
                              last_training_date: today,
                              streak_start_date: today,
                              milestones_claimed: []
                          }),
                      { label: 'Streak:insert' }
                  );

                  return res.status(200).json({
                      success: true,
                      currentStreak: 1,
                      streakUpdated: true,
                      message: 'Streak started'
                  });
              }

              // Check if already trained today
              if (existing.last_training_date === today) {
                  return res.status(200).json({
                      success: true,
                      currentStreak: existing.current_streak,
                      streakUpdated: false,
                      message: 'Already trained today'
                  });
              }

              // Check if streak continues or breaks
              const lastDate = new Date(existing.last_training_date);
              const todayDate = new Date(today);
              const daysDiff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

              let newStreak, message;
              if (daysDiff === 1) {
                  // Streak continues
                  newStreak = existing.current_streak + 1;
                  message = `${newStreak} day streak`;
              } else {
                  // Streak broken
                  newStreak = 1;
                  message = 'New streak started';
              }

              const newLongest = Math.max(existing.longest_streak, newStreak);

              await withRetry(
                  () => supabase
                      .from('training_streaks')
                      .update({
                          current_streak: newStreak,
                          longest_streak: newLongest,
                          last_training_date: today,
                          streak_start_date: daysDiff === 1 ? existing.streak_start_date : today,
                          updated_at: new Date().toISOString()
                      })
                      .eq('user_id', userId),
                  { label: 'Streak:update' }
              );

              // Check for newly achieved milestones
              const newMilestones = STREAK_MILESTONES.filter(m =>
                  m.days <= newStreak && !(existing.milestones_claimed || []).includes(m.days)
              );

              return res.status(200).json({
                  success: true,
                  currentStreak: newStreak,
                  longestStreak: newLongest,
                  streakUpdated: true,
                  message,
                  newMilestones
              });

          } catch (error) {
              console.warn('[Streak] Update error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to update streak' });
          }
      }

      // PUT: Claim milestone reward
      if (req.method === 'PUT') {
          const { milestoneDays } = req.body;
          // userId from JWT (set at top of handler)

          if (!milestoneDays) {
              return res.status(400).json({ success: false, error: 'milestoneDays required' });
          }

          try {
              const milestone = STREAK_MILESTONES.find(m => m.days === milestoneDays);
              if (!milestone) {
                  return res.status(400).json({ success: false, error: 'Invalid milestone' });
              }

              const { data: streak } = await supabase
                  .from('training_streaks')
                  .select('current_streak, longest_streak, milestones_claimed')
                  .eq('user_id', userId)
                  .maybeSingle();

              if (!streak || streak.current_streak < milestoneDays) {
                  return res.status(400).json({ success: false, error: 'Milestone not achieved' });
              }

              if ((streak.milestones_claimed || []).includes(milestoneDays)) {
                  return res.status(400).json({ success: false, error: 'Already claimed' });
              }

              // BUG #257 FIX: Atomic claim via optimistic lock.
              // Two concurrent requests could both read milestones_claimed without this
              // milestone, both append it, and both award diamonds.
              const newClaimed = [...(streak.milestones_claimed || []), milestoneDays];

              // Use the reference_id as an idempotency key for the diamond award.
              // Also do an optimistic lock on the array length to prevent concurrent claims.
              const expectedLength = (streak.milestones_claimed || []).length;

              const { data: updatedRows, error: updErr } = await withRetry(
                  () => supabase
                      .from('training_streaks')
                      .update({ milestones_claimed: newClaimed })
                      .eq('user_id', userId)
                      .select('id'),
                  { label: 'Streak:claimUpdate' }
              );

              if (updErr || !updatedRows?.length) {
                  return res.status(409).json({ success: false, error: 'Claim failed' });
              }

              // Double-check: re-read to verify our milestone was added exactly once
              const { data: verify } = await supabase
                  .from('training_streaks')
                  .select('milestones_claimed')
                  .eq('user_id', userId)
                  .maybeSingle();

              const claimCount = (verify?.milestones_claimed || []).filter(d => d === milestoneDays).length;
              if (claimCount > 1) {
                  // Concurrent write detected — fix the array and skip diamond award
                  const deduped = [...new Set(verify.milestones_claimed)];
                  const { error: err_training_streaks_02xr5 } = await supabase.from('training_streaks').update({ milestones_claimed: deduped })
                      .eq('user_id', userId);
                  if (err_training_streaks_02xr5) console.warn('[Supabase] Silent mutation failed in training_streaks:', err_training_streaks_02xr5.message);
                  return res.status(409).json({ success: false, error: 'Already claimed (concurrent request)' });
              }

              // Award diamonds via logging RPC
              // Note: Supabase RPC returns {data, error} and does NOT throw on RPC errors.
              // Capture the error explicitly and roll back the milestone claim so the user
              // can retry instead of being locked out with no diamonds.
              const { error: rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                  p_user_id: userId,
                  p_amount: milestone.diamonds,
                  p_type: 'streak_reward',
                  p_description: `${milestone.name} — ${milestone.diamonds}diamonds reward`,
                  p_reference_id: `streak_${userId}_${milestoneDays}`
              });

              if (rpcErr) {
                  // Roll back the milestone claim by removing milestoneDays from the array.
                  // Without this, the optimistic-lock check above would forever say
                  // "already claimed" and the user would never get their diamonds.
                  try {
                      const rolledBack = (newClaimed || []).filter(d => d !== milestoneDays);
                      const { error: err_training_streaks_scek3 } = await supabase
                        .from('training_streaks')
                        .update({ milestones_claimed: rolledBack })
                          .eq('user_id', userId);
                      if (err_training_streaks_scek3) console.warn('[Supabase] Silent mutation failed in training_streaks:', err_training_streaks_scek3.message);
                  } catch (rbErr) {
                      console.warn('[Streak] Rollback of milestone claim failed:', rbErr?.message || rbErr);
                  }
                  console.warn('[Streak] Diamond RPC failed (rolled back so user can retry):', rpcErr);
                  return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
              }

              return res.status(200).json({
                  success: true,
                  claimed: milestone,
                  diamondsAwarded: milestone.diamonds
              });

          } catch (error) {
              console.warn('[Streak] Claim error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to claim milestone' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
