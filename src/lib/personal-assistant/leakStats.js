function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function finiteLoss(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isNonNegativeNumeric(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function isNonNegativeInteger(value) {
  if (!isNonNegativeNumeric(value)) return false;
  return Number.isSafeInteger(Number(value));
}

/**
 * Read the one authoritative aggregate used by Leak Finder, its dashboard
 * counters, and the deterministic audit. Keeping this in one RPC prevents
 * row limits and slightly different filters from making those surfaces
 * disagree about the same account.
 */
export async function readLeakStatsAggregate(db, userId) {
  if (!db || !userId) {
    return { data: null, error: new Error('Leak statistics require a database and user id') };
  }

  let result;
  try {
    result = await db.rpc('get_personal_assistant_leak_stats', {
      p_user_id: userId,
    });
  } catch (error) {
    return { data: null, error };
  }
  const { data, error } = result || {};
  if (error) return { data: null, error };

  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  const countsValid = payload
    && [payload.active_leaks, payload.resolved_leaks, payload.measured_leak_count]
      .every(isNonNegativeInteger);
  const lossValid = payload && isNonNegativeNumeric(payload.avg_ev_loss);
  if (!payload || payload.success !== true || !countsValid || !lossValid) {
    return { data: null, error: new Error(payload?.error || 'Leak statistics are unavailable') };
  }

  return {
    data: {
      activeLeaks: finiteCount(payload.active_leaks),
      resolvedLeaks: finiteCount(payload.resolved_leaks),
      avgEvLoss: finiteLoss(payload.avg_ev_loss),
      measuredLeakCount: finiteCount(payload.measured_leak_count),
    },
    error: null,
  };
}

export default { readLeakStatsAggregate };
