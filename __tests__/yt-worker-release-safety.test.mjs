import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const workflow = read('../.github/workflows/deploy-yt-worker.yml');
const diagnosticsWorkflow = read('../.github/workflows/yt-worker-diag.yml');
const service = read('../scripts/yt-transcode-worker/sp-yt-transcode.service');
const deployGuide = read('../scripts/yt-transcode-worker/DEPLOY.md');
const legacyDeploy = read('../scripts/deploy-workers.sh');
const workerPackage = JSON.parse(read('../scripts/yt-transcode-worker/package.json'));
const workerLock = JSON.parse(read('../scripts/yt-transcode-worker/package-lock.json'));
const ytDlpVersion = read('../scripts/yt-transcode-worker/yt-dlp.version').trim();
const ytDlpRequirements = read('../scripts/yt-transcode-worker/yt-dlp.requirements.txt');

test('the production workflow is serialized, least-privileged, and strict after host discovery', () => {
  assert.match(workflow, /concurrency:\s*[\s\S]*?group: deploy-yt-worker[\s\S]*?cancel-in-progress: false/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /webfactory\/ssh-agent@[0-9a-f]{40}/);
  assert.match(workflow, /ssh-keyscan -T 10 -t ed25519 -H[^\n]+2>\/dev\/null/);
  assert.match(workflow, /StrictHostKeyChecking yes/);
  assert.doesNotMatch(workflow, /HETZNER_SSH_KNOWN_HOSTS/);
  for (const source of [workflow, diagnosticsWorkflow]) {
    assert.match(source, /Hetzner server 128782737/);
    assert.match(
      source,
      /EXPECTED_ED25519_FINGERPRINT: SHA256:sZTpafVw76Jpgu\+pwgp5X3nuaSfEnedVuZd\/eWWiG\+4/,
    );
    assert.doesNotMatch(source, /SHA256:vBM49cqODqlsNSufComdeay1X5WrZV8PaOxLBdWr1u8/);
    assert.match(source, /ssh-keyscan[^\n]+2>\/dev\/null/);
  }
  for (const source of [deployGuide, service]) {
    assert.match(source, /reels-transcode-worker/);
    assert.match(source, /128782737/);
  }
  assert.doesNotMatch(deployGuide, /learns the host's ed25519 key\s+at first contact/);
  assert.doesNotMatch(service, /alongside sp-transcode\.service/);
});

test('each release contains locked dependencies and is verified before atomic promotion', () => {
  assert.match(ytDlpVersion, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.match(workflow, /scripts\/yt-transcode-worker\/yt-dlp\.version/);
  assert.match(ytDlpRequirements, new RegExp(`yt-dlp==${ytDlpVersion.replaceAll('.', '\\.')}\\s`));
  assert.match(ytDlpRequirements, /--hash=sha256:[0-9a-f]{64}/);
  assert.match(workflow, /npm ci --omit=dev --ignore-scripts/);
  const payload = workflow.match(/for leaf in ([^;]+); do/)?.[1].trim().split(/\s+/);
  assert.deepEqual(payload, ['index.js', 'package.json', 'package-lock.json', 'yt-dlp.version', 'yt-dlp.requirements.txt']);
  assert.match(workflow, /"yt-dlp==\$ytdlp_version"/);
  assert.match(workflow, /--require-hashes/);
  assert.doesNotMatch(workflow, /pip(?:3|\s+-m\s+pip)?\s+install[^\n]*--upgrade/);
  assert.match(workflow, /release-manifest\.sha256/);
  assert.match(workflow, /chown -R root:root "\$stage"/);
  assert.match(workflow, /chmod -R u=rwX,go=rX "\$stage"/);

  const candidatePreflight = workflow.indexOf('/usr/bin/node index.js --preflight-only');
  const promotion = workflow.indexOf('sudo mv -Tf "$next_link" "$live"');
  assert.ok(candidatePreflight >= 0);
  assert.ok(promotion > candidatePreflight);
  assert.match(workflow, /trap rollback ERR/);
  assert.match(workflow, /Startup preflight: schema and RPC behavior contract verified/);
  assert.match(workflow, /_SYSTEMD_INVOCATION_ID=\$first_invocation/);
});

test('deployment isolates retained legacy cookie plumbing without activating or deleting it', () => {
  assert.doesNotMatch(workflow, /systemctl (?:enable|disable)|pip uninstall|npm uninstall|rm -rf[^\n]*camoufox/);
  for (const retainedWorkflow of [
    '../.github/workflows/deploy-yt-cookies.yml',
    '../.github/workflows/refresh-yt-cookies.yml',
  ]) assert.equal(existsSync(new URL(retainedWorkflow, import.meta.url)), true);
  const worker = read('../scripts/yt-transcode-worker/index.js');
  assert.match(worker, /'--ignore-config'/);
  assert.match(worker, /'--no-plugin-dirs'/);
  assert.match(worker, /PYTHONPATH: VENDORED_YT_DLP_ROOT/);
  assert.doesNotMatch(worker, /['"]--cookies(?:-from-browser)?['"]/);
  assert.doesNotMatch(legacyDeploy, /REELS_WORKER_IP|REMOTE_YT_PATH|systemctl restart sp-yt-transcode/);
});

test('systemd gates startup on preflight and owns the entire subprocess group', () => {
  assert.match(service, /^UnsetEnvironment=.*NODE_OPTIONS.*LD_PRELOAD.*PYTHONPATH$/m);
  assert.match(service, /^ExecStartPre=\/usr\/bin\/sha256sum --quiet -c release-manifest\.sha256$/m);
  assert.match(service, /^ExecStartPre=.*--preflight-only$/m);
  assert.match(service, /^ExecStart=\/usr\/bin\/node index\.js$/m);
  assert.match(service, /^TimeoutStartSec=150$/m);
  assert.match(service, /^TimeoutStopSec=30$/m);
  assert.match(service, /^KillMode=control-group$/m);
  assert.match(service, /^SendSIGKILL=yes$/m);
});

test('the worker dependency graph is lockfile-pinned with registry integrity', () => {
  assert.equal(workerPackage.dependencies['@supabase/supabase-js'], '2.50.0');
  assert.equal(workerLock.packages['node_modules/@supabase/supabase-js'].version, '2.50.0');
  for (const [path, metadata] of Object.entries(workerLock.packages)) {
    if (!path.startsWith('node_modules/')) continue;
    assert.match(metadata.integrity || '', /^sha512-/i, path + ' must have an integrity hash');
  }
});


test('worker payload is built locally and a paused service preserves active and enabled states', () => {
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(diagnosticsWorkflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /self-hosted|smarter-local-publish|sudo (?:apt-get|pip|npm)/);
  assert.doesNotMatch(diagnosticsWorkflow, /self-hosted|smarter-local-publish/);
  assert.doesNotMatch(diagnosticsWorkflow, /journalctl -u sp-yt-transcode -n "\$TAIL_LINES" --no-pager\n/);
  assert.match(diagnosticsWorkflow, /journalctl -u sp-yt-transcode -n "\$tail_lines" --no-pager \\\n\s+\| grep -Eiv 'secret/);
  assert.match(workflow, /docker run --rm --pull=never[\s\S]*--platform linux\/amd64/);
  const transfer = workflow.indexOf('scp "$archive"');
  const selection = workflow.match(/# Accept only immutable registry digests[\s\S]*?(?=          local_stage=)/)?.[0];
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
  assert.match(workflow, /--entrypoint \/bin\/sh "\$image_id"/);

  // Owner policy 2.9 (17 Sep 2026): restored routes are GitHub-hosted, so the
  // build image has to be pulled by immutable digest before selection.
  assert.match(workflow, /docker pull --quiet --platform linux\/amd64 "\$BUILD_IMAGE"/);
  assert.ok(workflow.indexOf('docker pull --quiet') < workflow.indexOf('# Accept only immutable registry digests'));
  // A failed start must never publish the service journal wholesale, and must
  // fail through the ERR trap (an explicit exit would skip rollback).
  assert.doesNotMatch(workflow, /journalctl "_SYSTEMD_INVOCATION_ID=\$[a-z_]+" --no-pager\n\s+exit 1/);
  const journalFilter = workflow.match(/\| grep -Eiv 'secret[\s\S]*?\| tail -n 60 \|\| true\n[\s\S]*?\n\s+false\n/)?.[0];
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

  for (const command of ['npm ci --omit=dev --ignore-scripts', 'python3 -m pip install']) {
    assert.ok(workflow.indexOf(command) > 0 && workflow.indexOf(command) < transfer);
    assert.equal(workflow.indexOf(command, transfer), -1);
  }
  const body = workflow.match(/# BEGIN preserve-active-state([\s\S]*?)# END preserve-active-state/)?.[1];
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
  assert.deepEqual(result.stderr.split('\n').filter(line => line.startsWith('CALL:')), ['CALL:systemctl show sp-yt-transcode -p ActiveState --value']);
  assert.match(workflow, /test "\$\(sudo systemctl is-enabled sp-yt-transcode[^\n]+" = "\$enabled_before"/);
});
