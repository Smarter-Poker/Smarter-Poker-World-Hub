/**
 * RETIRED TRAINING LEADERBOARD WRITE ROUTE
 *
 * Leaderboard totals are materialized only inside
 * fn_complete_training_attempt_v2 from immutable persisted decisions. The old
 * route accepted browser-authored totals and used the service role to perform
 * a racy read/modify/write, so keeping it callable would bypass the Phase 6
 * authority boundary even if no current component imports it.
 */
export default function handler(_req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Allow', '');
    return res.status(410).json({
        success: false,
        code: 'TRAINING_LEADERBOARD_COMPLETION_REQUIRED',
        error: 'Training leaderboards update only after a verified attempt completes.',
    });
}
