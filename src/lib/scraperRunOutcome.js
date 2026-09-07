/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A SCRAPER RUN IS JUDGED ON WHAT IT PRODUCED, NOT ON WHETHER IT ERRORED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, no imports, so the rule can be tested by running it.
 *
 * Two scrapers on this platform got this exactly backwards, in opposite
 * directions, and both were invisible for months:
 *
 *   `/api/venue-scraper/trigger` returned `success: true` with HTTP 200 no
 *   matter what. On 2026-09-07 all forty Manus dispatches came back 401
 *   ("token is malformed") and the endpoint still answered success. The
 *   credential had been broken since 2026-08-03 - eleven consecutive failed
 *   scheduled runs across five weeks - and the only thing that noticed was a
 *   shell health gate inside a workflow that is not a required check.
 *
 *   `scripts/poker_series_scraper.py` exited 1 if ANY counter was non-zero,
 *   including third-party fetch failures. Poker sites are never all reachable
 *   at once, so that condition was unsatisfiable: the workflow has NEVER
 *   succeeded on main, five months of daily red and a daily SMS. An alarm
 *   that is always on is an alarm that gets muted (CLAUDE.md 10.83/10.84) -
 *   and it hid a real `42P10` defect behind the noise the whole time.
 *
 * The rule both now share: PARTIAL failure is a successful run with a problem
 * in it, and must stay visible without paging. TOTAL failure is not a run at
 * all and must be loud. The dividing line is whether anything was produced.
 */

/**
 * True when a run dispatched work and none of it was accepted.
 *
 * `attempted === 0` is NOT a failure: a run with nothing to do succeeded at
 * doing nothing, and treating an empty queue as an outage is how the previous
 * generation of these gates cried wolf.
 */
export function isTotalDispatchFailure(attempted, created) {
    const a = Number(attempted) || 0;
    const c = Number(created) || 0;
    return a > 0 && c === 0;
}

/**
 * The HTTP status a scraper trigger should answer with.
 *
 * 502, not 500: the failure is upstream (Manus refused every dispatch), not a
 * defect in this handler, and the distinction is what tells a responder which
 * runbook to open.
 */
export function scraperTriggerStatus(attempted, created) {
    return isTotalDispatchFailure(attempted, created) ? 502 : 200;
}
