import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { safeAward } from '../../../../src/lib/rewards/awardGuard';
import { buildCoachingSnapshot } from '../../../../src/lib/personal-assistant/coachingIntelligence.mjs';
import { normalizeUserLeakRow } from '../../../../src/lib/personal-assistant/leakRecord';

const CLUB_HAND_PREFIX = 'club-arena:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HAND_TIME_CHUNK = 150;
const HAND_TIME_MAX_IDS = 1800;
const COOLDOWN_MS = 5 * 60 * 1000;

function handUuid(externalId) {
  const raw = String(externalId || '');
  const id = raw.startsWith(CLUB_HAND_PREFIX) ? raw.slice(CLUB_HAND_PREFIX.length) : raw;
  return UUID_RE.test(id) ? id : null;
}

let _supabase = null;
let _checkAccess = null;
export function _setSupabaseForTesting(client) {
  _supabase = client;
}
export function _setCheckAccessForTesting(fn) {
  _checkAccess = fn;
}

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return _supabase;
}

async function evaluateLivePlayAccess(supabase, userId) {
  if (typeof _checkAccess === 'function') {
    return _checkAccess(supabase, userId);
  }
  if (!userId) {
    return { allowed: false, contextState: 'education_only', accessLevel: 'general_theory' };
  }
  const cooldownCutoffIso = new Date(Date.now() - COOLDOWN_MS).toISOString();
  const cooldownCutoffMs = Date.parse(cooldownCutoffIso);
  try {
    // 1. Check poker_sessions (supports both full PostgREST builders and minimal .eq().limit() test stubs)
    const psBase = supabase.from('poker_sessions').select('id, started_at, ended_at').eq('user_id', userId);
    if (typeof psBase?.is === 'function') {
      const activeRes = await psBase.is('ended_at', null).order('started_at', { ascending: false }).limit(1);
      if (activeRes?.error) {
        return { allowed: false, contextState: 'session_active_unknown', accessLevel: 'hard_block', message: 'We detected an active session. Please end your session first.' };
      }
      if (Array.isArray(activeRes?.data) && activeRes.data.length > 0) {
        return { allowed: false, contextState: 'live_play', accessLevel: 'hard_block', message: 'Live-fix claim is unavailable during live play. Finish your session first.' };
      }
      const recentBase = supabase.from('poker_sessions').select('id, ended_at').eq('user_id', userId);
      const recentRes = await recentBase.not('ended_at', 'is', null).gte('ended_at', cooldownCutoffIso).limit(1);
      if (recentRes?.error) {
        return { allowed: false, contextState: 'session_active_unknown', accessLevel: 'hard_block', message: 'We detected an active session. Please end your session first.' };
      }
      if (Array.isArray(recentRes?.data) && recentRes.data.length > 0) {
        return { allowed: true, contextState: 'session_ended_verified', accessLevel: 'limited_review', message: 'Post-session cooldown active. Wait 5 minutes after leaving the table.' };
      }
    } else if (typeof psBase?.limit === 'function') {
      const psRes = await psBase.limit(20);
      if (psRes?.error) {
        return { allowed: false, contextState: 'session_active_unknown', accessLevel: 'hard_block', message: 'We detected an active session. Please end your session first.' };
      }
      const psRows = Array.isArray(psRes?.data) ? psRes.data : [];
      if (psRows.some(r => r && (r.ended_at === null || r.ended_at === undefined))) {
        return { allowed: false, contextState: 'live_play', accessLevel: 'hard_block', message: 'Live-fix claim is unavailable during live play. Finish your session first.' };
      }
      if (psRows.some(r => r?.ended_at && Date.parse(r.ended_at) >= cooldownCutoffMs)) {
        return { allowed: true, contextState: 'session_ended_verified', accessLevel: 'limited_review', message: 'Post-session cooldown active. Wait 5 minutes after leaving the table.' };
      }
    }

    // 2. Check table_seats (Club Arena live seating + 5m post-seat cooldown)
    const tsBase = supabase.from('table_seats').select('id, table_id, left_at').eq('user_id', userId);
    if (typeof tsBase?.is === 'function') {
      const activeSeatsRes = await tsBase.is('left_at', null).limit(1);
      if (activeSeatsRes?.error) {
        if (String(activeSeatsRes.error?.code || '') !== '42P01') {
          return { allowed: false, contextState: 'session_active_unknown', accessLevel: 'hard_block', message: 'We detected an active session. Please end your session first.' };
        }
      } else if (Array.isArray(activeSeatsRes?.data) && activeSeatsRes.data.length > 0) {
        return { allowed: false, contextState: 'live_play', accessLevel: 'hard_block', message: 'Live-fix claim is unavailable while seated at a live Club Arena table.' };
      }
      const recentSeatsBase = supabase.from('table_seats').select('id, left_at').eq('user_id', userId);
      const recentSeatsRes = await recentSeatsBase.not('left_at', 'is', null).gte('left_at', cooldownCutoffIso).limit(1);
      if (recentSeatsRes?.error) {
        if (String(recentSeatsRes.error?.code || '') !== '42P01') {
          return { allowed: false, contextState: 'session_active_unknown', accessLevel: 'hard_block', message: 'We detected an active session. Please end your session first.' };
        }
      } else if (Array.isArray(recentSeatsRes?.data) && recentSeatsRes.data.length > 0) {
        return { allowed: true, contextState: 'session_ended_verified', accessLevel: 'limited_review', message: 'Post-session cooldown active. Wait 5 minutes after leaving the table.' };
      }
    } else if (typeof tsBase?.limit === 'function') {
      const tsRes = await tsBase.limit(20);
      if (tsRes?.error) {
        if (String(tsRes.error?.code || '') !== '42P01') {
          return { allowed: false, contextState: 'session_active_unknown', accessLevel: 'hard_block', message: 'We detected an active session. Please end your session first.' };
        }
      } else {
        const tsRows = Array.isArray(tsRes?.data) ? tsRes.data : [];
        if (tsRows.some(r => r && (r.left_at === null || r.left_at === undefined))) {
          return { allowed: false, contextState: 'live_play', accessLevel: 'hard_block', message: 'Live-fix claim is unavailable while seated at a live Club Arena table.' };
        }
        if (tsRows.some(r => r?.left_at && Date.parse(r.left_at) >= cooldownCutoffMs)) {
          return { allowed: true, contextState: 'session_ended_verified', accessLevel: 'limited_review', message: 'Post-session cooldown active. Wait 5 minutes after leaving the table.' };
        }
      }
    }

    return { allowed: true, contextState: 'training_mode', accessLevel: 'full_access', message: null };
  } catch (err) {
    console.warn('[claim-live-fix] live play context check failed closed:', err?.message || err);
    return { allowed: false, contextState: 'session_active_unknown', accessLevel: 'hard_block', message: 'Session context could not be verified.' };
  }
}

async function attachHandTimes(supabase, decisions) {
  try {
    const wanted = new Map();
    for (const row of decisions) {
      if (row.solver_verified === true) {
        const id = handUuid(row.hand_external_id);
        if (id && !wanted.has(id)) wanted.set(id, null);
        if (wanted.size >= HAND_TIME_MAX_IDS) break;
      }
    }
    const ids = [...wanted.keys()];
    if (ids.length === 0) return decisions;

    const chunks = [];
    for (let i = 0; i < ids.length; i += HAND_TIME_CHUNK) {
      chunks.push(ids.slice(i, i + HAND_TIME_CHUNK));
    }
    const results = await Promise.all(
      chunks.map(chunk => supabase.from('hand_history').select('id, created_at').in('id', chunk))
    );
    for (const result of results) {
      if (result.error) continue;
      for (const row of result.data || []) {
        wanted.set(String(row.id), row.created_at);
      }
    }
    return decisions.map(row => {
      const id = handUuid(row.hand_external_id);
      const playedAt = id ? wanted.get(id) : null;
      return playedAt ? { ...row, hand_played_at: playedAt } : row;
    });
  } catch (err) {
    console.warn('[claim-live-fix] attachHandTimes error:', err?.message || err);
    return decisions;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!applyRateLimit(req, res, LIMITS.write)) return;

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Database service unavailable' });
    }

    const { user: authUser, status: authStatus } = await getServerUserWithFallback(req, supabase);
    if (authStatus === 503) {
      return res.status(503).json({ success: false, error: 'Session verification unavailable' });
    }
    if (!authUser) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userId = authUser.id;
    const leakId = String(req.body?.leakId || '').trim();
    if (!leakId) {
      return res.status(400).json({ success: false, error: 'leakId is required' });
    }

    const contextAccess = await evaluateLivePlayAccess(supabase, userId);
    if (!contextAccess?.allowed || contextAccess.accessLevel !== 'full_access') {
      return res.status(403).json({
        success: false,
        blocked: true,
        contextState: contextAccess?.contextState || 'session_active_unknown',
        accessLevel: contextAccess?.accessLevel || 'hard_block',
        error: contextAccess?.message || 'Live-fix claim is unavailable during live play or post-session cooldown.',
      });
    }

    // Load ONLY caller-owned rows
    const [leaksRes, reviewsRes, decisionsRes] = await Promise.all([
      supabase
        .from('user_leaks')
        .select('*')
        .eq('user_id', userId)
        .limit(500),
      supabase
        .from('leak_review_state')
        .select('leak_id, due_at, interval_days, reps, lapses, strong_streak, retired, last_score, history, last_outcome, schema_version, remediation_baseline_at, updated_at')
        .eq('user_id', userId)
        .limit(500),
      supabase
        .from('hand_audit_decisions')
        .select('hand_external_id, decision_key, question_id, game_id, street, hero_position, villain_position, spot_type, hero_hand, board_cards, player_action, solver_action, selected_frequency, optimal_frequency, classification, ev_loss, ev_loss_measured, solver_verified, solver_source, match_tier, stack_depth_bb, evidence_scope, audited_at')
        .eq('user_id', userId)
        .like('solver_source', '%hand-audit-v3%')
        .order('audited_at', { ascending: false })
        .limit(5000),
    ]);

    if (leaksRes.error) {
      return res.status(500).json({ success: false, error: 'Failed to load user leaks' });
    }
    if (reviewsRes.error) {
      return res.status(500).json({ success: false, error: 'Failed to load review state' });
    }
    if (decisionsRes.error) {
      return res.status(500).json({ success: false, error: 'Failed to load audit decisions' });
    }

    const rawLeaks = leaksRes.data || [];
    const rawReviews = reviewsRes.data || [];
    const rawDecisions = (decisionsRes.data || []).map(row => ({
      ...row,
      evidence_scope: row.evidence_scope || 'club_arena',
    }));

    const decisionsWithTimes = await attachHandTimes(supabase, rawDecisions);

    const snapshot = buildCoachingSnapshot({
      leaks: rawLeaks.map(normalizeUserLeakRow),
      decisions: decisionsWithTimes,
      reviews: rawReviews,
    });

    const targetLeak = (snapshot.leaks || []).find(l => l.id === leakId || l.leakId === leakId);
    const tableVerification = targetLeak?.tableVerification;

    if (!tableVerification || tableVerification.status !== 'confirmed_fixed_at_tables') {
      return res.status(409).json({
        success: false,
        code: 'LEAK_NOT_VERIFIED_LIVE',
        error: 'Leak is not confirmed fixed at live tables',
        status: tableVerification?.status || 'unverified',
      });
    }

    const milestone = tableVerification.verifiedLiveMilestone;
    if (!milestone || !milestone.idempotencyKey) {
      return res.status(409).json({
        success: false,
        code: 'LEAK_NOT_VERIFIED_LIVE',
        error: 'Milestone is not available for claim',
      });
    }

    // Settle reward server-side via safeAward
    const awardParams = {
      p_user_id: userId,
      p_action_key: 'pa_leak_verified_fixed',
      p_reference_id: milestone.idempotencyKey,
      p_target_id: null,
      p_metadata: {
        leakId,
        postSampleCount: milestone.postSampleCount,
        postMistakeRate: milestone.postMistakeRate,
      },
    };

    const awardResult = await safeAward(supabase, awardParams);

    if (!awardResult.ok) {
      if (awardResult.migrationMissing) {
        return res.status(200).json({
          success: false,
          code: 'REWARDS_UNAVAILABLE',
          error: 'Reward catalog is temporarily unavailable',
          milestone,
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Diamond award transaction failed',
      });
    }

    const r = awardResult.data || {};
    const isDuplicate = r.reason === 'duplicate' || (r.awarded === 0 && r.reason === 'duplicate');
    if (isDuplicate) {
      return res.status(200).json({
        success: true,
        awarded: false,
        alreadyAwarded: true,
        diamonds: 0,
        milestone,
      });
    }

    const diamonds = Number(r.awarded || 0);
    const awarded = r.success === true && diamonds > 0;
    if (!awarded) {
      return res.status(200).json({
        success: false,
        awarded: false,
        alreadyAwarded: false,
        diamonds: 0,
        code: 'REWARD_LIMIT_REACHED',
        reason: r.reason || 'limit_reached',
        error: 'Daily or monthly Diamond reward limit reached.',
        milestone,
      });
    }

    return res.status(200).json({
      success: true,
      awarded: true,
      alreadyAwarded: false,
      diamonds,
      milestone,
    });
  } catch (error) {
    console.error('[claim-live-fix] unexpected error:', error?.message || error);
    if (res.headersSent) return undefined;
    return res.status(500).json({ success: false, error: 'Failed to claim live-fix reward' });
  }
}
