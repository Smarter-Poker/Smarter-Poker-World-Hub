/**
 * e2e-port.mjs - give every runner its own preview port.
 *
 * WHY (2026-09-04). Ported from Club Arena the same day, for the same failure
 * an hour after the World Hub got twelve more runners: global-footer-e2e.yml
 * and e2e-tests.yml both start `next start -p 3000`. That was fine while the
 * World Hub had six runners and rarely two E2E jobs on one box. With six
 * runners per box two pull requests reaching that step together bind the
 * same port, and the second dies with
 *
 *   Error: listen EADDRINUSE: address already in use :::3000
 *
 * A shared port would also mean one pull request's specs could run against
 * ANOTHER pull request's server. The port has to be unique per runner.
 *
 * A self-hosted runner's RUNNER_NAME is unique per runner process and stable
 * for the life of the job, which is precisely the scope that needs to be
 * distinct. Offsets are multiples of 10, so two bases that differ by less than
 * 10 (5188 and 5189) can never be mapped onto each other.
 *
 * Locally, and on a GitHub-hosted runner, RUNNER_NAME is absent or the VM is
 * private, so the base port is returned unchanged and nothing about a
 * developer's `npx playwright test` changes.
 *
 * Usage:
 *   node scripts/ci/e2e-port.mjs 3000     # prints the port for this runner
 */

const SLOTS = 300; // 300 * 10 = a 3000-port window above the base

export function portFor(base) {
  // CA_E2E_PORT_OFFSET is the explicit override, for anyone who needs to pin
  // a port by hand (debugging a hung preview, say).
  const explicit = process.env.CA_E2E_PORT_OFFSET;
  if (explicit !== undefined && explicit !== '') {
    const n = Number(explicit);
    if (Number.isFinite(n)) return base + Math.trunc(n) * 10;
  }

  // Only self-hosted runners share a host. A GitHub-hosted runner has the VM
  // to itself, and `runner.environment` is not visible here, but its
  // RUNNER_NAME is a per-run throwaway anyway, so hashing it is harmless.
  const id = process.env.RUNNER_NAME || '';
  if (!id) return base;

  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return base + (h % SLOTS) * 10;
}

// CLI: `node scripts/ci/e2e-port.mjs 4173`
if (import.meta.url === `file://${process.argv[1]}`) {
  const base = Number(process.argv[2]);
  if (!Number.isFinite(base)) {
    console.error('usage: node scripts/ci/e2e-port.mjs <base-port>');
    process.exit(2);
  }
  process.stdout.write(String(portFor(base)));
}
