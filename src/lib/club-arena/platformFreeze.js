/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  platformFreeze — refuse money while the platform is frozen
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, CLAUDE.md 13: "THE ENTIRE PLATFORM NEEDS TO FREEZE FOR THE 5 MINUTES,
 * NO BUY INS, NO CHIP MOVEMENTS ... EVERYTHING JUST FREEZES, THEN PICKS BACK
 * UP EXACTLY AS IT WAS."
 *
 * WHY A ROUTE HAS TO ASK, WHEN THE DATABASE ALREADY GUARDS
 *
 * `zz_freeze_guard` sits on the seven money/seat tables and refuses writes
 * while `engine_maintenance_break` is open. That is the real authority, and it
 * is why the freeze survives the engine being dead for two of its five
 * minutes.
 *
 * But every route under pages/api/club-arena runs with the SERVICE KEY, and
 * the service role is EXEMPT from those triggers. So for these routes there is
 * no backstop at all: whatever they do during the break, the database will let
 * them. That is the entire reason CHECK 18 exists.
 *
 * FAILS CLOSED, DELIBERATELY.
 *
 * If the freeze cannot be read, this refuses the request. The usual instinct -
 * fail open so a blip does not break the feature - is wrong here precisely
 * BECAUSE there is no second line of defence: failing open moves chips during
 * a freeze, which is the thing being prevented. Failing closed delays a
 * cashout approval by at most the five-minute break, and every caller of this
 * is retryable and not time-critical. A player watching a countdown is not
 * harmed by being asked to try again when it ends; a ledger written during a
 * freeze that everyone was told was total is a much worse outcome.
 *
 * Engine bookkeeping for a hand that ALREADY completed is a different case and
 * must not use this - it carries `// freeze-exempt: <why>` instead, which
 * CHECK 18 accepts. See record-rake.js.
 */

/** Message a player sees. Title Case, no em dashes (Dan 2026-08-20). */
const FROZEN_MESSAGE =
  'The Platform Is Paused For Its Scheduled Maintenance Break. ' +
  'Nothing Is Lost. Please Try Again When The Break Ends.';

/**
 * Answer 503 and return true when the platform is frozen (or unreadable).
 * Returns false when it is safe to proceed.
 *
 *   if (await refuseWhileFrozen(supabase, res)) return;
 */
export async function refuseWhileFrozen(supabase, res, { route } = {}) {
  let frozen = null;
  try {
    const { data, error } = await supabase.rpc('fn_platform_frozen');
    if (error) throw error;
    frozen = data === true;
  } catch (err) {
    // Unreadable. See "FAILS CLOSED" above: with no trigger backstop for the
    // service key, guessing "not frozen" is the one guess that can do damage.
    console.error(
      `[platformFreeze] could not read fn_platform_frozen${route ? ` for ${route}` : ''} - ` +
        `refusing rather than assuming the platform is running.`,
      err?.message || err
    );
    res.status(503).json({
      success: false,
      error: 'freeze_unknown',
      message: FROZEN_MESSAGE,
      retryable: true,
    });
    return true;
  }

  if (frozen) {
    res.status(503).json({
      success: false,
      error: 'platform_frozen',
      message: FROZEN_MESSAGE,
      retryable: true,
    });
    return true;
  }
  return false;
}

export default refuseWhileFrozen;
