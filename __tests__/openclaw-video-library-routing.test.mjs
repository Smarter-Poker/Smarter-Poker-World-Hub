import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dispatcher = readFileSync(
  new URL('../scripts/openclaw-cron-dispatcher.py', import.meta.url),
  'utf8',
);
const deployScript = readFileSync(
  new URL('../scripts/deploy-openclaw.sh', import.meta.url),
  'utf8',
);
const deployWorkflow = readFileSync(
  new URL('../.github/workflows/deploy-openclaw.yml', import.meta.url),
  'utf8',
);
const scraperPath = fileURLToPath(
  new URL('../scripts/video_library_scraper.py', import.meta.url),
);
const scraper = readFileSync(scraperPath, 'utf8');
const publisher = readFileSync(
  new URL('../scripts/video_library_to_reels.py', import.meta.url),
  'utf8',
);
const service = readFileSync(
  new URL('../scripts/openclaw.service', import.meta.url),
  'utf8',
);
const dependencyLock = readFileSync(
  new URL('../scripts/openclaw-requirements.lock', import.meta.url),
  'utf8',
);
const recoveryRoute = readFileSync(
  new URL('../pages/api/cron/yt-pipeline-recovery.js', import.meta.url),
  'utf8',
);

const assignmentBlock = name => {
  const match = dispatcher.match(new RegExp(`${name} = \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${name} must remain a literal registry`);
  return match[1];
};

test('the Video Library Reel bridge always resolves to the deployed publisher script', () => {
  const scriptJobs = assignmentBlock('SCRIPT_JOBS');
  const scriptTargets = assignmentBlock('SCRIPT_JOB_SCRIPTS');
  const workerRoutes = assignmentBlock('WORKERS_PREFERRED');

  assert.match(scriptJobs, /'\/api\/cron\/video-library-reels':\s*\['--limit',\s*'500',\s*'--verify'\]/);
  assert.match(scriptTargets, /'\/api\/cron\/video-library-reels':\s*REELS_BRIDGE_PY/);
  assert.doesNotMatch(workerRoutes, /\/api\/cron\/video-library-reels/);
  // 2026-09-23 owner decision: the horse-authored workers bridge is never a
  // target for this job, under any path key.
  assert.doesNotMatch(workerRoutes, /'\/cron\/video-library-reels'/);
  assert.match(dispatcher, /^REELS_BRIDGE_PY = _resolve_script\('video_library_to_reels\.py'\)$/m);
  assert.match(dispatcher, /'\/api\/cron\/video-library-reels',\s*dict\(hour=7,\s*minute=0\)/);
  assert.match(publisher, /VERIFICATION_REFRESH_AGE = timedelta\(hours=12\)/);
  assert.match(publisher, /'verification_refresh_hours': int\(/);
  assert.doesNotMatch(publisher, /verification_refresh_days/);
  assert.match(dispatcher, /SCRIPT_WORKER_OVERLAP = sorted\(set\(SCRIPT_JOBS\)\.intersection\(WORKERS_PREFERRED\)\)/);
  assert.match(dispatcher, /if SCRIPT_WORKER_OVERLAP:\s*\n\s*raise RuntimeError/);
});

test('the publisher posts only as a verified non-horse official account behind its own kill switch', () => {
  const code = publisher.split('\n').map(line => line.split('#')[0]).join('\n');
  const section = (start, end) => {
    const from = code.indexOf(start);
    const to = code.indexOf(end, from + start.length);
    assert.ok(from > -1 && to > from, `${start} must precede ${end}`);
    return code.slice(from, to);
  };
  // 2026-09-23 owner decision: the fleet switch is not this publisher's gate.
  // (Docstrings explain why; no string literal may name the table or column.)
  assert.doesNotMatch(code, /['"]content_settings['"]|['"]engine_enabled['"]/);
  const author = section('def get_system_bot_id():', 'def read_publication_controls():');
  assert.match(author, /'video_reels_pipeline_config'/);
  assert.match(author, /'singleton_key': 'eq\.video_library'/);
  assert.match(author, /VIDEO_LIBRARY_BOT_PROFILE_ID/);
  assert.match(author, /'select': 'id,is_horse'/);
  assert.match(author, /\.get\('is_horse'\) is not False/);
  assert.match(author, /'content_authors'/);
  assert.doesNotMatch(author, /return None|order=|'order'/, 'no fallback author and no roster pick');
  // The official account 00000000-0000-0000-0000-000000000001 has no RFC 4122
  // version nibble; the identity check must still accept it.
  assert.match(code, /_UUID_RE = re\.compile\(\s*r'\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-/);
  const controls = section('def read_publication_controls():', 'def run_schema_preflight():');
  assert.match(controls, /'video_reels_pipeline_controls'/);
  assert.match(controls, /isinstance\(row\.get\('enabled'\), bool\)/);
  assert.match(publisher, /REQUIRED_PUBLICATION_CONTROLS = frozenset\(\s*\{'video_library_reel_creation', 'video_library_reel_publication'\}/);
  // Order inside a run: runtime self-check, publisher, controls, then any read of work.
  const run = section('def run_bridge(args):', 'def _write_evidence(');
  const order = ['ensure_ytdlp_runtime()', 'get_system_bot_id()', 'read_publication_controls()',
    "controls[key] is True for key in REQUIRED_PUBLICATION_CONTROLS", '_load_existing_publications()'];
  const at = order.map(needle => run.indexOf(needle));
  assert.ok(at.every(index => index > -1), JSON.stringify(at));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'the gates must run before any work');
  const preflight = section('def run_schema_preflight():', 'class YtDlpUnavailableError');
  assert.ok(preflight.indexOf('get_system_bot_id()') > -1
    && preflight.indexOf('get_system_bot_id()') < preflight.indexOf("_request('GET', relation"),
  'the preflight checks the publisher before any other read');
  assert.match(preflight, /read_publication_controls\(\)/);
});

test('poker clip supply routes remain wired to their real workers handlers', () => {
  const workerRoutes = assignmentBlock('WORKERS_PREFERRED');

  for (const [dispatcherPath, workerPath] of [
    ['/api/cron/scrape-poker-clips', '/cron/scrape-poker-clips'],
    ['/api/cron/revalidate-poker-clips', '/cron/revalidate-poker-clips'],
    ['/api/cron/content-supply-watchdog', '/cron/content-supply-watchdog'],
  ]) {
    assert.match(
      workerRoutes,
      new RegExp(`'${dispatcherPath}':\\s*'${workerPath}'`),
      `${dispatcherPath} must stay worker-routed`,
    );
  }
});

test('Video Library script jobs cannot be silently disabled by stale host flags', () => {
  assert.doesNotMatch(dispatcher, /SP_ENABLE_SCRIPT_JOBS/);
  assert.match(dispatcher, /required SCRIPT_JOB source is missing/);
  assert.match(dispatcher, /if not os\.path\.isfile\(script\)/);
  assert.doesNotMatch(dispatcher, /pip[\s\S]{0,80}install/);
});

test('manual Open Claw deploy can dispatch only the exact merged main workflow', () => {
  assert.match(deployScript, /DEPLOY_REF=main/);
  assert.match(deployScript, /branch --show-current\)" = main/);
  assert.match(deployScript, /local main does not match origin\/main/);
  assert.match(deployScript, /gh workflow run deploy-openclaw\.yml/);
  assert.doesNotMatch(deployScript, /\bssh\b|\bscp\b|pip3? install|StrictHostKeyChecking=accept-new/);
});

test('Open Claw workflow builds a hash-locked per-SHA release before atomic promotion', () => {
  assert.match(deployWorkflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(deployWorkflow, /webfactory\/ssh-agent@[0-9a-f]{40}/);
  assert.match(deployWorkflow, /ssh-keyscan[^\n]+2>\/dev\/null/);
  assert.match(
    deployWorkflow,
    /EXPECTED_ED25519_FINGERPRINT: SHA256:MnBhnIy9\+ocCKI8Dlg74XgqBIdMK\+M7TNFKMC9OeVyM/,
  );
  assert.match(deployWorkflow, /Hetzner server 127861894/);
  assert.match(deployWorkflow, /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(deployWorkflow, /Open Claw lock requires CPython 3\.10/);
  assert.match(deployWorkflow, /test "\$\(uname -s\)" = Linux/);
  assert.match(deployWorkflow, /test "\$\(uname -m\)" = x86_64/);
  assert.match(deployWorkflow, /Direct Open Claw requirements do not match hash lock/);
  assert.match(deployWorkflow, /\/opt\/openclaw\/releases\/\$\{release_sha\}/);
  assert.match(deployWorkflow, /--only-binary=:all:[\s\\]*--require-hashes/);
  assert.match(deployWorkflow, /release-manifest\.sha256/);
  assert.match(deployWorkflow, /trap rollback ERR/);
  assert.match(deployWorkflow, /"\$was_active" = true[^\n]*"\$had_unit" = true/);
  assert.doesNotMatch(deployWorkflow, /"\$was_active" = true[^\n]*"\$had_current" = true/);

  const publisherPreflight = deployWorkflow.indexOf('video_library_to_reels.py" --preflight-only');
  const promotion = deployWorkflow.indexOf('sudo mv -Tf "$next_link" "$current"');
  const unitVerification = deployWorkflow.indexOf('sudo systemd-analyze verify "$unit_upload"');
  assert.ok(publisherPreflight >= 0);
  assert.ok(promotion > publisherPreflight);
  assert.ok(unitVerification > promotion);
  assert.match(deployWorkflow, /invocation_two=".*InvocationID/);
  assert.match(deployWorkflow, /Registered: \$route/);
  assert.doesNotMatch(
    deployWorkflow,
    /(?:cp|mv|install|tee|printf)[^\n]*\/etc\/openclaw\.env/,
  );
});

test('Open Claw validates routing and database without changing operational inbox delivery', () => {
  for (const key of [
    'CRON_SECRET',
    'WORKERS_CRON_SECRET',
    'WORKERS_BASE_URL',
    'DISPATCHER_PRIVATE_IP',
    'DISPATCHER_ROLE',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    assert.match(deployWorkflow, new RegExp(key));
  }
  assert.doesNotMatch(dispatcher, /WORKERS_CRON_SECRET[^\n]*or CRON_SECRET/);
  assert.match(deployWorkflow, /api\/internal\/cron-auth-probe/);
  assert.match(deployWorkflow, /test "\$production_status" = 200/);
  assert.match(deployWorkflow, /cron\/__auth_probe_no_such_route__/);
  assert.match(deployWorkflow, /test "\$workers_status" = 404/);
  assert.match(dispatcher, /any\(character\.isspace\(\) for character in value\)/);
  assert.match(dispatcher, /unsafe quoting characters/);
  assert.match(deployWorkflow, /curl --disable --silent --show-error/);
  assert.match(dispatcher, /BASE_URL \+ '\/api\/internal\/operational-alert'/);
  assert.match(dispatcher, /resp\.json\(\)\.get\('recorded'\) is True/);
  assert.doesNotMatch(deployWorkflow, /TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN/);
  assert.doesNotMatch(dispatcher, /DISPATCHER_ROLE\s*=\s*os\.environ\.get\([^\n]+\.lower\(\)/);
  assert.match(dispatcher, /\('WORKERS_BASE_URL', _WORKERS_BASE_URL_RAW\)/);
});

test('Open Claw service verifies the immutable release and schema on every start', () => {
  assert.match(service, /^WorkingDirectory=\/opt\/openclaw\/current$/m);
  assert.match(service, /^EnvironmentFile=\/etc\/openclaw\.env$/m);
  assert.match(service, /^ExecStartPre=\/usr\/bin\/sha256sum --quiet -c release-manifest\.sha256$/m);
  assert.match(service, /^ExecStartPre=.*openclaw-cron-dispatcher\.py --preflight-only$/m);
  assert.match(service, /^ExecStartPre=.*video_library_scraper\.py --preflight-only$/m);
  assert.match(service, /^ExecStartPre=.*video_library_to_reels\.py --preflight-only$/m);
  assert.match(service, /^ExecStart=\/usr\/bin\/env -u PYTHONHOME -u PYTHONPATH PYTHONPATH=\/opt\/openclaw\/current\/vendor \/usr\/bin\/python3 -s .*openclaw-cron-dispatcher\.py$/m);
  assert.match(service, /^TimeoutStartSec=300$/m);
  assert.match(service, /^KillMode=control-group$/m);
});

test('dispatcher preflight cannot be bypassed by the live scheduler PID lock', () => {
  assert.match(dispatcher, /LOG_DIR\s*=\s*Path\(os\.environ\.get\('SP_LOG_DIR'\)/);
  const mainBody = dispatcher.slice(dispatcher.indexOf('def main():'));
  const preflightExit = mainBody.indexOf("if sys.argv[1:] == ['--preflight-only']:");
  const lockAcquire = mainBody.indexOf('_pid_lock_fh = _acquire_pid_lock()');
  assert.ok(preflightExit >= 0, 'dispatcher preflight branch is missing');
  assert.ok(lockAcquire > preflightExit, 'singleton lock must be acquired only after preflight returns');
  assert.doesNotMatch(dispatcher, /^_pid_lock_fh = _acquire_pid_lock\(\)$/m);
  assert.match(dispatcher, /open\(PID_FILE, 'a\+'\)[\s\S]{0,200}fcntl\.flock[\s\S]{0,200}fp\.truncate\(\)/);
});

test('Open Claw dependency closure is fully pinned and hashed', () => {
  const requirements = dependencyLock
    .split('\n')
    .filter(line => /^[a-z0-9][a-z0-9._-]*(?:\[[a-z0-9_,.-]+\])?==/i.test(line));
  const hashes = dependencyLock.match(/--hash=sha256:[0-9a-f]{64}/g) || [];
  assert.equal(requirements.length, 38);
  assert.equal(hashes.length, requirements.length);
  // supabase-auth requests this extra: its distribution must stay on the hash lock.
  assert.match(dependencyLock, /^pyjwt\[crypto\]==2\.13\.0 \\$/m);
  const installedPattern = deployWorkflow.match(/expected = dict\(re\.findall\(r'([^']+)'/)?.[1];
  assert.ok(installedPattern);
  const decoded = spawnSync('python3', ['-c',
    'import json,re,sys; print(json.dumps(dict(re.findall(sys.argv[1],sys.stdin.read(),re.M))))', installedPattern],
    { input: dependencyLock, encoding: 'utf8', timeout: 5000 });
  assert.equal(decoded.status, 0, decoded.stderr);
  const installed = JSON.parse(decoded.stdout);
  assert.equal(Object.keys(installed).length, 38);
  assert.equal(installed.pyjwt, '2.13.0');
  assert.match(dependencyLock, /^supabase==2\.31\.0 \\/m);
  assert.match(dependencyLock, /^yt-dlp==2026\.8\.19 \\/m);
});

test('publisher/scraper preflights are read-only and yt-dlp ignores host state', () => {
  assert.match(publisher, /def run_schema_preflight\(\):/);
  assert.match(publisher, /record_youtube_embed_failure_verdict/);
  assert.match(publisher, /publish_video_library_reel/);
  assert.match(publisher, /'22023'/);
  assert.match(publisher, /is_deleted,caption,created_at/);
  assert.match(scraper, /def run_schema_preflight\(\) -> None:/);
  assert.match(scraper, /availability_failure_reason,availability_source/);
  // Keep main's committed worker acknowledgement; preflight returns before any writer.
  assert.match(scraper, /def report_to_api\(summary: dict\)/);
  assert.match(scraper, /receipt\.get\('accepted'\) is not True/);
  assert.match(scraper, /receipt\.get\('audit_id'\) != summary\['run_id'\]/);
  assert.match(scraper, /if args\.preflight_only:[\s\S]*run_schema_preflight\(\)[\s\S]*elif args\.verify_sources:/);
  assert.doesNotMatch(scraper, /except Exception:\s*\n\s*pass/);
  assert.match(scraper, /AI analysis pre-warm failed/);
  assert.match(scraper, /AI tagging trigger failed/);
  assert.match(scraper, /summary\['errors'\]\.append\(f'Report commit unconfirmed:/);
  assert.doesNotMatch(scraper, /SLACK_WEBHOOK_URL|hooks\.slack\.com/);
  assert.doesNotMatch(dispatcher, /Twilio HTTP \{resp\.status_code\}: \{resp\.text/);

  for (const source of [publisher, scraper]) {
    assert.match(source, /sys\.executable,[\s\S]{0,80}'-m',[\s\S]{0,80}'yt_dlp'/);
    assert.match(source, /'--ignore-config'/);
    assert.match(source, /'--no-plugin-dirs'/);
    assert.match(source, /'--no-cache-dir'/);
    assert.doesNotMatch(source, /shutil\.which\('yt-dlp'\)|\['yt-dlp'/);
  }

  const controlHelper = scraper.slice(
    scraper.indexOf('def pipeline_control_enabled'),
    scraper.indexOf('def run_schema_preflight'),
  );
  assert.match(controlHelper, /\.execute\(\)/);
  assert.match(controlHelper, /return len\(rows\) == 1/);
});

test('recovery excludes terminal failures and disabled payload keys are unique', () => {
  assert.match(recoveryRoute, /TERMINAL_FAILURE_PATTERNS/);
  for (const marker of ['video unavailable', 'cookies', 'sign in to confirm', 'age-restricted']) {
    assert.match(recoveryRoute.toLowerCase(), new RegExp(marker));
  }
  assert.match(recoveryRoute, /eligibleReelIds\.has\(candidate\.reel_id\)/);
  assert.match(recoveryRoute, /!isTerminalFailure\(candidate\.error_message\)/);
  const disabledPayload = recoveryRoute.match(
    /if \(nativeControl\.state !== 'enabled'\) \{[\s\S]*?\n    \}/,
  )?.[0] || '';
  assert.equal((disabledPayload.match(/scanned:\s*0/g) || []).length, 1);
});

test('the scraper help preflight succeeds before production secrets are injected', () => {
  const isolatedDirectory = mkdtempSync(`${tmpdir()}/sp-scraper-help-`);
  const environment = {
    ...process.env,
    SP_LOG_DIR: `${isolatedDirectory}/logs`,
    SP_EVIDENCE_DIR: `${isolatedDirectory}/evidence`,
  };
  delete environment.NEXT_PUBLIC_SUPABASE_URL;
  delete environment.SUPABASE_SERVICE_ROLE_KEY;

  const result = spawnSync('python3', [scraperPath, '--help'], {
    encoding: 'utf8',
    env: environment,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Video Library Daily Scraper v3/);
  assert.doesNotMatch(result.stderr, /Missing SUPABASE credentials/);
});


test('Open Claw builds only locally and an inactive service is never started', () => {
  const requiredWorkflow = readFileSync(new URL('../.github/workflows/build-safety-gate.yml', import.meta.url), 'utf8');
  const guardRegistry = readFileSync(new URL('./_test-guards-exist.test.mjs', import.meta.url), 'utf8');
  assert.match(requiredWorkflow, /node --test[\s\S]*?__tests__\/_test-guards-exist\.test\.mjs/);
  assert.match(guardRegistry, /^import '\.\/openclaw-video-library-routing\.test\.mjs';$/m);
  assert.match(guardRegistry, /^import '\.\/yt-worker-release-safety\.test\.mjs';$/m);
  assert.match(deployWorkflow, /runs-on: ubuntu-latest/);
  assert.match(deployWorkflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(deployWorkflow, /self-hosted|smarter-local-publish|sudo (?:apt-get|pip|npm)|systemctl enable|systemctl disable/);
  assert.match(deployWorkflow, /docker run --rm --pull=never[\s\S]*--platform linux\/amd64/);
  assert.match(deployWorkflow, /--target vendor --requirement openclaw-requirements\.lock/);
  const build = deployWorkflow.indexOf('python3 -m pip install');
  const transfer = deployWorkflow.indexOf('scp "$archive"');
  const selection = deployWorkflow.match(/# Accept only immutable registry digests[\s\S]*?(?=          local_stage=)/)?.[0];
  assert.ok(selection);
  const digest = 'sha256:' + 'a'.repeat(64);
  for (const [reference, observedId, platform, accepted] of [
    [digest, digest, 'linux/amd64', true],
    ['python@' + digest, digest, 'linux/amd64', true],
    ['python:latest', digest, 'linux/amd64', false],
    ['sha256:abcd', digest, 'linux/amd64', false],
    [digest, 'sha256:' + 'b'.repeat(64), 'linux/amd64', false],
    [digest, digest, 'linux/arm64', false],
    [digest, '', 'linux/amd64', false],
  ]) {
    const selected = spawnSync('bash', ['-euc', `
      docker() {
        if [ "$4" = '{{.Id}}' ]; then printf '%s\\n' "$OBSERVED_ID";
        elif [ "$4" = '{{.Os}}/{{.Architecture}}' ]; then printf '%s\\n' "$PLATFORM";
        else return 1; fi
      }
      ${selection}
    `], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', BUILD_IMAGE: reference, OBSERVED_ID: observedId, PLATFORM: platform } });
    assert.equal(selected.status === 0, accepted, `${reference} / ${platform}: ${selected.stderr}`);
  }
  assert.match(deployWorkflow, /--entrypoint \/bin\/sh "\$image_id"/);

  // Owner policy 2.9 (17 Sep 2026): restored routes are GitHub-hosted, so the
  // build image has to be pulled by immutable digest before selection.
  assert.match(deployWorkflow, /docker pull --quiet --platform linux\/amd64 "\$BUILD_IMAGE"/);
  assert.ok(deployWorkflow.indexOf('docker pull --quiet') < deployWorkflow.indexOf('# Accept only immutable registry digests'));
  // A failed start must never publish the service journal wholesale, and must
  // fail through the ERR trap (an explicit exit would skip rollback).
  assert.doesNotMatch(deployWorkflow, /journalctl "_SYSTEMD_INVOCATION_ID=\$[a-z_]+" --no-pager\n\s+exit 1/);
  const journalFilter = deployWorkflow.match(/\| grep -Eiv 'secret[\s\S]*?\| tail -n 60 \|\| true\n[\s\S]*?\n\s+false\n/)?.[0];
  assert.ok(journalFilter, 'bounded, filtered journal excerpt followed by a trapped failure');
  const filterPipeline = journalFilter.slice(0, journalFilter.indexOf(' || true'));
  const filtered = spawnSync('bash', ['-euo', 'pipefail', '-c', `cat ${filterPipeline}`], {
    encoding: 'utf8',
    timeout: 5000,
    env: { PATH: '/usr/bin:/bin' },
    input: [
      'svc: Authorization: Bearer LEAKED-HEADER-VALUE',
      'svc: CRON_SECRET=LEAKED-ENV-VALUE',
      'svc: GET https://user:LEAKEDPW@example.com/x?sig=LEAKEDQUERY failed',
      'svc: jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJMRUFLRUQifQ.LEAKEDSIG rejected',
      'svc: opaque ' + 'L'.repeat(40) + ' rejected',
      'svc: Traceback (most recent call last):',
    ].join('\n') + '\n',
  });
  assert.equal(filtered.status, 0, filtered.stderr);
  assert.doesNotMatch(filtered.stdout, /LEAKED|L{32}/);
  assert.match(filtered.stdout, /Traceback \(most recent call last\):/);
  assert.match(filtered.stdout, /https:\/\/\[REDACTED\]@example\.com\/x\?\[REDACTED\] failed/);

  assert.ok(build > 0 && transfer > build);
  assert.match(deployWorkflow, /actual != \{normalize\(k\): v for k, v in expected\.items\(\)\}/);
  const body = deployWorkflow.match(/# BEGIN preserve-active-state([\s\S]*?)# END preserve-active-state/)?.[1];
  assert.ok(body);
  const result = spawnSync('bash', ['-euc', `
    was_active=false
    sudo() { printf 'CALL:%s\\n' "$*" >&2; printf 'inactive\\n'; }
    ${body}
  `], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /remains inactive/);
  for (const observation of ['active', 'failed', 'unknown', '']) {
    const refused = spawnSync('bash', ['-euc', `
      was_active=false
      sudo() { printf '%s\\n' \"$OBSERVATION\"; }
      ${body}
    `], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', OBSERVATION: observation } });
    assert.notEqual(refused.status, 0, `must refuse ${observation || 'empty'} service state`);
  }
  assert.deepEqual(result.stderr.split('\n').filter(line => line.startsWith('CALL:')), ['CALL:systemctl show openclaw.service -p ActiveState --value']);
  assert.match(deployWorkflow, /test "\$\(sudo systemctl is-enabled openclaw\.service[^\n]+" = "\$enabled_before"/);
});
