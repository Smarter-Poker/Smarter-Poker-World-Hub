/**
 * EVERY PINNED PYTHON REQUIREMENT MUST ACTUALLY EXIST ON PyPI.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * `scripts/requirements.txt` pinned `supabase-py==2.15.0`. There is no such
 * package. `supabase-py` is the GitHub REPOSITORY name; the thing published to
 * PyPI is plain `supabase`, and 2.15.0 is a real release of it. So the version
 * was right and the name never existed.
 *
 * pip's answer to that is
 *
 *     ERROR: Could not find a version that satisfies the requirement
 *            supabase-py==2.15.0 (from versions: none)
 *
 * which reads like a yanked release rather than a name that has never been on
 * the index - and it is buried under several hundred lines of Camoufox browser
 * download progress bars, at the very end.
 *
 * It broke two scheduled workflows, `Charity Scraper V5` and `Daily Poker
 * Series Auto-Pilot`, at Install Dependencies. Both had been failing on `main`
 * for seventeen hours. Neither is a required check, so nothing was blocked, and
 * they were found only when `scripts/ci/check-main-is-green.mjs` ran for the
 * first time.
 *
 * ── WHAT THIS DOES ───────────────────────────────────────────────────────────
 * Ask PyPI whether each `name==version` pin resolves. A name that 404s is
 * reported differently from a name that exists without that version, because
 * the two have completely different fixes and the pip error does not
 * distinguish them.
 *
 * FAILS OPEN on a network problem: a CI job that goes red because PyPI was
 * briefly unreachable teaches people to ignore it. Only a definite 404 or a
 * definite missing version fails the build.
 */
import { readFileSync, existsSync } from 'node:fs';
import process from 'node:process';

const FILES = process.argv.slice(2);
if (FILES.length === 0) FILES.push('scripts/requirements.txt');

const PIN = /^([A-Za-z0-9._-]+)\s*==\s*([\w.+-]+)\s*$/;

const pins = [];
for (const file of FILES) {
  if (!existsSync(file)) continue;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.split('#')[0].trim();
    const m = PIN.exec(line);
    if (m) pins.push({ file, name: m[1], version: m[2] });
  }
}

if (pins.length === 0) {
  console.log('No pinned requirements found; nothing to check.');
  process.exit(0);
}

const bad = [];
let unreachable = 0;

for (const pin of pins) {
  let data;
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pin.name)}/json`, {
      headers: { 'User-Agent': 'smarter-poker-requirements-check' },
    });
    if (res.status === 404) {
      bad.push({ ...pin, why: 'NO SUCH PACKAGE on PyPI (is this the GitHub repo name?)' });
      console.log(`  BAD  ${pin.name}==${pin.version}  - no such package`);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status}`);
    data = await res.json();
  } catch {
    unreachable++;
    console.log(`  ??   ${pin.name}==${pin.version}  - PyPI unreachable, skipped`);
    continue;
  }

  if (!Object.prototype.hasOwnProperty.call(data.releases || {}, pin.version)) {
    bad.push({
      ...pin,
      why: `version not published (latest is ${data.info?.version || 'unknown'})`,
    });
    console.log(`  BAD  ${pin.name}==${pin.version}  - version not published`);
  } else {
    console.log(`  OK   ${pin.name}==${pin.version}`);
  }
}

console.log('');
console.log(`${pins.length} pin(s) checked, ${bad.length} bad, ${unreachable} unreachable.`);

if (bad.length === 0) process.exit(0);

console.error('');
for (const b of bad) console.error(`  ${b.file}: ${b.name}==${b.version} - ${b.why}`);
console.error('');
console.error(
  `::error title=UNINSTALLABLE PYTHON PIN::${bad.length} pinned requirement(s) cannot be installed. Every job that pip installs them will fail at its dependency step, and pip's "from versions: none" does not say whether the NAME or the VERSION is wrong.`
);
process.exit(1);
