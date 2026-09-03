/**
 * /api/test-e2e-seed — TOMBSTONED 2026-09-02
 *
 * This route had NO auth, NO rate limit and NO environment guard, and it
 * reached the same `GameController` singleton production uses: it created a
 * real table ("Deep Sweep Table"), seated two players with 1000 chips each and
 * started a hand. On error it returned `err.stack` to the caller. Anyone who
 * knew the path could spawn tables on the live engine.
 *
 * Eight sibling seed and debug routes were tombstoned to 410 in an earlier
 * sweep. This one was missed, and the reason is worth recording: NOTHING in
 * the repository references it — no import, no link, no test — so it never
 * appeared in a caller search. Unreferenced is not the same as unreachable.
 *
 * E2E seeding belongs in the Playwright fixtures under `e2e/`, which drive the
 * app through its real authenticated surfaces instead of reaching behind them.
 *
 * Left as a 410 rather than deleted so the shape of the hole stays documented:
 * an agent who finds this file learns why it may not come back, instead of
 * finding nothing and re-adding the same convenience route.
 */
export default function handler(req, res) {
  return res.status(410).json({
    error: 'This endpoint has been removed for security reasons.',
    message:
      'It mutated the live poker engine without authentication. Use the Playwright fixtures in e2e/ instead.',
  });
}
