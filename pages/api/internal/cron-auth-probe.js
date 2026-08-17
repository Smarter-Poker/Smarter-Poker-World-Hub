/**
 * /api/internal/cron-auth-probe — does the caller's CRON_SECRET still work?
 *
 * Added 2026-08-17.
 *
 * WHY THIS EXISTS
 * ---------------
 * The auth-drift watchdog on the Open Claw dispatcher has to prove that the
 * CRON_SECRET *that host holds* is still the one production accepts. The first
 * version of that watchdog probed /api/health — which is PUBLIC. Measured
 * before shipping:
 *
 *     no auth header       -> HTTP 200
 *     Bearer totally-wrong -> HTTP 200
 *
 * It would have reported "healthy" straight through the outage it was written
 * to catch. That is the same failure mode as the rest of this incident: a
 * guard that runs but validates nothing.
 *
 * Every other CRON_SECRET-gated route in this repo authenticates correctly,
 * but each does real work on success — drains a transcode queue, mails a
 * digest, sweeps uploads, signs up a synthetic user. None is safe to call
 * every five minutes purely to test a credential. The existing *-probe.js
 * routes are synthetic flow probes (7, 8 and 3 write/auth calls respectively),
 * not credential checks.
 *
 * So this supplies the one missing thing: a real authentication boundary with
 * zero side effects.
 *
 * DELIBERATELY NOT UNDER pages/api/cron/
 * --------------------------------------
 * CLAUDE.md 11.5 CHECK 6 fails the build when pages/api/cron/ grows, and it is
 * right to — this is not a scheduled job, it is a probe target.
 *
 * WHAT IT MUST NEVER BECOME
 * -------------------------
 * No database reads, no writes, no outbound calls, and never echo the secret.
 * The status code is the entire signal. Anything richer turns a health probe
 * into an oracle for guessing the credential.
 */

export default function handler(req, res) {
  // Byte-identical to pages/api/mlb/statsapi-relay.ts:24-26 and pages/api/cron/*.
  // Kept identical on purpose: if this probe accepted a secret the real routes
  // rejected, the watchdog would be worse than having no watchdog at all.
  const auth = req.headers.authorization || '';
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Report whether THIS deployment's own copy is malformed. Vercel refuses to
  // build when CRON_SECRET carries surrounding whitespace, and its error names
  // the variable but not the host — on 2026-08-16 that sent the fix to the
  // wrong place while every production build stayed red.
  const malformed = secret !== secret.trim();

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    probe: 'cron-auth',
    secretMalformed: malformed,
  });
}
