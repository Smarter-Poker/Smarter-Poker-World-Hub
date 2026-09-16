/**
 *  TRAINING STREAK API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Track daily training streaks and award milestone rewards
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import {
    isTrainingPersistenceUnavailable,
    runTrainingPersistenceQuery,
    trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';

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

      // ●● Auth: verify JWT identity (patched server client — local HMAC fast-path, GoTrue fallback) ●●
      const { user, error: authErr } = await getServerUserWithFallback(req, supabase);
      if (!user) {
          if (authErr === 'No token') return res.status(401).json({ success: false, error: 'Auth required' });
          return res.status(401).json({ success: false, error: 'Invalid token' });
      }
      const userId = user.id; // From JWT, not request

      // GET: Fetch user streak
      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
          res.setHeader('Vary', 'Authorization');

          try {
              const [streakResult, claimsResult, trainingDaysResult] = await Promise.all([
                  runTrainingPersistenceQuery(
                      () => supabase
                          .from('training_streaks')
                          .select('authority_current_streak, authority_longest_streak, authority_last_training_date, authority_streak_start_date, authority_milestones_claimed')
                          .eq('user_id', userId)
                          .maybeSingle(),
                      { label: 'Streak:get-authority' },
                  ),
                  runTrainingPersistenceQuery(
                      () => supabase
                          .from('training_streak_milestone_claims')
                          .select('milestone_days, diamonds_awarded, entitlement_diamonds, reward_multiplier, claim_count, completed_at, updated_at')
                          .eq('user_id', userId),
                      { label: 'Streak:get-claims' },
                  ),
                  runTrainingPersistenceQuery(
                      () => supabase
                          .from('training_level_history')
                          .select('completed_at')
                          .eq('user_id', userId)
                          .not('attempt_id', 'is', null)
                          .eq('practice_only', false)
                          .order('completed_at', { ascending: false })
                          .limit(90),
                      { label: 'Streak:get-training-days' },
                  ),
              ]);

              if (streakResult.error || claimsResult.error || trainingDaysResult.error) {
                  console.warn('[Streak] Authority read failed:',
                      streakResult.error?.message
                      || claimsResult.error?.message
                      || trainingDaysResult.error?.message);
                  return res.status(503).json(trainingPersistenceUnavailableBody());
              }
              const streak = streakResult.data;
              const claimRows = Array.isArray(claimsResult.data) ? claimsResult.data : [];
              const trainingDays = [...new Set(
                  (Array.isArray(trainingDaysResult.data) ? trainingDaysResult.data : [])
                      .map((row) => typeof row?.completed_at === 'string'
                          ? row.completed_at.slice(0, 10)
                          : null)
                      .filter(Boolean),
              )];
              const claimsByDay = new Map(claimRows.map((claim) => [Number(claim.milestone_days), claim]));

              if (!streak) {
                  return res.status(200).json({
                      success: true,
                      streak: {
                          currentStreak: 0,
                          longestStreak: 0,
                          lastTrainingDate: null,
                          nextMilestone: STREAK_MILESTONES[0],
                          claimableMilestones: [],
                          allMilestones: STREAK_MILESTONES.map((milestone) => ({
                              ...milestone,
                              achieved: false,
                              claimed: false,
                              settlementStatus: 'locked',
                              diamondsAwardedTotal: 0,
                              entitlementDiamonds: null,
                              diamondsRemaining: null,
                              rewardMultiplier: null,
                              retryable: false,
                              retryWindow: null,
                          })),
                      },
                      trainingDays,
                  });
              }

              // Find next milestone
              const claimedDays = Array.isArray(streak.authority_milestones_claimed)
                  ? streak.authority_milestones_claimed
                  : [];
              const achievedStreak = Math.max(
                  Number(streak.authority_current_streak) || 0,
                  Number(streak.authority_longest_streak) || 0,
              );
              const nextMilestone = STREAK_MILESTONES.find(m =>
                  m.days > achievedStreak
              );

              const allMilestones = STREAK_MILESTONES.map((milestone) => {
                  const claim = claimsByDay.get(milestone.days);
                  const paid = Math.max(0, Number(claim?.diamonds_awarded) || 0);
                  const entitlement = Number.isInteger(Number(claim?.entitlement_diamonds))
                      && Number(claim?.entitlement_diamonds) > 0
                      ? Number(claim.entitlement_diamonds)
                      : null;
                  const completed = claimedDays.includes(milestone.days)
                      || Boolean(claim?.completed_at)
                      || (entitlement !== null && paid >= entitlement);
                  const achieved = milestone.days <= achievedStreak;
                  const remaining = entitlement === null ? null : Math.max(entitlement - paid, 0);
                  const settlementStarted = entitlement !== null && !completed;
                  const historicalCreditPending = paid > 0 && entitlement === null && !completed;
                  const settlementStatus = completed
                      ? 'completed'
                      : historicalCreditPending
                          ? 'historical_credit_pending_verification'
                          : settlementStarted
                              ? 'partial'
                              : achieved
                                  ? 'claimable'
                                  : 'locked';
                  return {
                      ...milestone,
                      achieved,
                      claimed: completed,
                      settlementStatus,
                      diamondsAwardedTotal: paid,
                      entitlementDiamonds: entitlement,
                      diamondsRemaining: remaining,
                      rewardMultiplier: entitlement === null
                          ? null
                          : Number(claim?.reward_multiplier) || 1,
                      retryable: achieved && !completed,
                      retryWindow: settlementStatus === 'partial' ? 'next_month' : null,
                  };
              });
              const claimable = allMilestones.filter((milestone) =>
                  milestone.achieved && !milestone.claimed
              );

              return res.status(200).json({
                  success: true,
                  streak: {
                      currentStreak: streak.authority_current_streak,
                      longestStreak: streak.authority_longest_streak,
                      lastTrainingDate: streak.authority_last_training_date,
                      streakStartDate: streak.authority_streak_start_date,
                      nextMilestone,
                      claimableMilestones: claimable,
                      allMilestones,
                  },
                  trainingDays,
              });

          } catch (error) {
              if (isTrainingPersistenceUnavailable(error)) {
                  return res.status(503).json(trainingPersistenceUnavailableBody());
              }
              console.warn('[Streak] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to fetch streak' });
          }
      }

      // Streak movement is part of fn_complete_training_attempt_v2's atomic
      // completion transaction. An authenticated browser must not be able to
      // manufacture a Training day by calling this legacy route directly.
      if (req.method === 'POST') {
          return res.status(410).json({
              success: false,
              code: 'TRAINING_STREAK_COMPLETION_REQUIRED',
              error: 'Training streaks update only after a verified attempt completes.',
          });
      }

      // PUT: Claim a milestone through one row-locking database transaction.
      // The browser supplies only the milestone identity; eligibility, the
      // claim marker, idempotency reference, and actual award are server-owned.
      if (req.method === 'PUT') {
          const body = req.body;
          const bodyKeys = body && typeof body === 'object' && !Array.isArray(body)
              ? Object.keys(body)
              : [];
          const milestoneDays = Number(body?.milestoneDays);
          if (
              bodyKeys.length !== 1
              || bodyKeys[0] !== 'milestoneDays'
              || !Number.isInteger(milestoneDays)
              || !STREAK_MILESTONES.some((milestone) => milestone.days === milestoneDays)
          ) {
              return res.status(400).json({ success: false, error: 'A valid milestoneDays value is required.' });
          }

          let claimResult;
          try {
              claimResult = await runTrainingPersistenceQuery(
                  () => supabase.rpc('fn_claim_training_streak_milestone_v2', {
                      p_user_id: userId,
                      p_milestone_days: milestoneDays,
                  }),
                  { label: 'Streak:claim-milestone' },
              );
          } catch (error) {
              if (isTrainingPersistenceUnavailable(error)) {
                  return res.status(503).json(trainingPersistenceUnavailableBody());
              }
              throw error;
          }

          if (claimResult.error) {
              console.warn('[Streak] Claim RPC failed:', claimResult.error.message);
              return res.status(503).json(trainingPersistenceUnavailableBody());
          }
          const result = claimResult.data;
          if (!result || typeof result !== 'object' || Array.isArray(result)) {
              return res.status(502).json({
                  success: false,
                  code: 'TRAINING_STREAK_CLAIM_INVALID_RESPONSE',
                  error: 'The streak claim could not be verified.',
              });
          }
          if (result.success !== true) {
              const status = Number(result.status);
              const responseStatus = result.code === 'TRAINING_STREAK_AWARD_INVALID_RESPONSE'
                  ? 502
                  : Number.isInteger(status) && status >= 400 && status <= 499
                      ? status
                      : 409;
              return res.status(responseStatus)
                  .json({
                      ...result,
                      success: false,
                      ...(responseStatus >= 500 ? { retryable: true } : {}),
                      ...(result.code === 'TRAINING_STREAK_AWARD_NOT_APPLIED'
                          ? { retryable: true, retryWindow: 'next_month' }
                          : {}),
                  });
          }

          const milestone = STREAK_MILESTONES.find((item) => item.days === milestoneDays);
          const diamondsAwarded = Number(result.diamondsAwarded);
          const diamondsAwardedTotal = Number(result.diamondsAwardedTotal);
          const diamondsRemaining = Number(result.diamondsRemaining);
          const entitlementDiamonds = Number(result.entitlementDiamonds);
          const rewardMultiplier = Number(result.rewardMultiplier);
          const milestoneCompleted = result.milestoneCompleted === true;
          const awardApplied = result.awardApplied === true;
          if (
              Number(result.milestoneDays) !== milestoneDays
              || !Number.isInteger(diamondsAwarded)
              || diamondsAwarded < 0
              || diamondsAwarded > milestone.diamonds * 10
              || !Number.isInteger(diamondsAwardedTotal)
              || diamondsAwardedTotal < 0
              || !Number.isInteger(diamondsRemaining)
              || diamondsRemaining < 0
              || !Number.isInteger(entitlementDiamonds)
              || entitlementDiamonds < milestone.diamonds
              || entitlementDiamonds > milestone.diamonds * 10
              || !Number.isFinite(rewardMultiplier)
              || rewardMultiplier <= 0
              || rewardMultiplier > 10
              || entitlementDiamonds !== Math.round(milestone.diamonds * rewardMultiplier)
              || diamondsAwardedTotal > entitlementDiamonds
              || diamondsAwardedTotal + diamondsRemaining !== entitlementDiamonds
              || milestoneCompleted !== (diamondsRemaining === 0)
          ) {
              return res.status(502).json({
                  success: false,
                  code: 'TRAINING_STREAK_CLAIM_INVALID_RESPONSE',
                  error: 'The streak claim could not be verified.',
              });
          }
          return res.status(200).json({
              success: true,
              claimed: milestoneCompleted ? milestone : null,
              milestone,
              milestoneCompleted,
              awardApplied,
              diamondsAwarded,
              diamondsAwardedTotal,
              diamondsRemaining,
              entitlementDiamonds,
              rewardMultiplier,
              idempotentReplay: !awardApplied && result.newClaim === false,
          });
      }

      res.setHeader('Allow', 'GET, PUT');
      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
