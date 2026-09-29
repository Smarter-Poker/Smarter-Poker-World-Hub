import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  // Owner decision (23 Sep 2026): official images only. Only the official
  // Docker Hub python repository pinned by digest is accepted; a bare local
  // image ID, a tag or any other repository is refused.
  for (const [reference, observedId, platform, accepted] of [
    ['python@' + digest, digest, 'linux/amd64', true],
    ['library/python@' + digest, digest, 'linux/amd64', true],
    ['docker.io/library/python@' + digest, 'sha256:' + 'b'.repeat(64), 'linux/amd64', true],
    [digest, digest, 'linux/amd64', false],
    ['python:latest', digest, 'linux/amd64', false],
    ['python:3.12-slim-bookworm', digest, 'linux/amd64', false],
    ['python:3.12-slim-bookworm@' + digest, digest, 'linux/amd64', false],
    ['sha256:abcd', digest, 'linux/amd64', false],
    ['python@sha256:abcd', digest, 'linux/amd64', false],
    ['someone/python@' + digest, digest, 'linux/amd64', false],
    ['docker.io/someone/python@' + digest, digest, 'linux/amd64', false],
    ['ghcr.io/library/python@' + digest, digest, 'linux/amd64', false],
    ['python-nodejs@' + digest, digest, 'linux/amd64', false],
    ['python@' + digest, digest, 'linux/arm64', false],
    ['python@' + digest, '', 'linux/amd64', false],
    ['python@' + digest, 'not-an-image-id', 'linux/amd64', false],
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
  // Nothing but the official python repository is ever pulled.
  const prePull = workflow.match(/# GitHub-hosted runners hold no pre-seeded build image\.[\s\S]*?(?=          # Accept only immutable registry digests)/)?.[0];
  assert.ok(prePull && prePull.includes('docker pull --quiet'));
  for (const [reference, pulled] of [
    ['python@' + digest, true],
    ['docker.io/library/python@' + digest, true],
    [digest, false],
    ['python:3.12-slim-bookworm', false],
    ['someone/python@' + digest, false],
  ]) {
    const pull = spawnSync('bash', ['-euo', 'pipefail', '-c', `
      timeout() { printf 'CALL:%s\\n' "$*" >&2; }
      ${prePull}
    `], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', BUILD_IMAGE: reference } });
    assert.equal(pull.status === 0, pulled, `${reference}: ${pull.stderr}`);
    assert.equal(/CALL:.*docker pull/.test(pull.stderr), pulled, `${reference} pull call`);
  }
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


test('the host env boundary accepts legacy JWT and sb_secret_ service keys without printing them', () => {
  const step = workflow.match(/- name: Validate host-managed configuration boundary[\s\S]*?<<'EOSSH'\n([\s\S]*?)\n\s+EOSSH\n/)?.[1];
  assert.ok(step, 'host configuration validation block is missing');
  const dir = mkdtempSync(join(tmpdir(), 'yt-worker-env-'));
  const envPath = join(dir, 'sp-yt-transcode.env');
  const body = step.split('\n').map(line => line.replace(/^ {10}/, '')).join('\n')
    .replaceAll('/etc/sp-yt-transcode.env', envPath);
  assert.ok(!body.includes('/etc/sp-yt-transcode.env'));
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.SIGNATUREVALUE_-123';
  const secretKey = 'sb_secret_SECRETKEYVALUE0123456789_-ab';
  const check = serviceKeyLine => {
    writeFileSync(envPath, [
      '# host managed',
      'NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co',
      serviceKeyLine,
      'WORKER_ID=reels-transcode-worker',
      'MAX_CONCURRENT_YT=2',
    ].join('\n') + '\n', { mode: 0o600 });
    const result = spawnSync('bash', ['-c', `
      sudo() { "$@"; }
      stat() { printf 'root:root 600\\n'; }
      ${body}
    `], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin' } });
    const output = result.stdout + result.stderr;
    assert.ok(!output.includes('SIGNATUREVALUE') && !output.includes('SECRETKEYVALUE'), 'values must never be printed');
    return result.status;
  };
  try {
    assert.equal(check(`SUPABASE_SERVICE_ROLE_KEY=${jwt}`), 0, 'legacy service_role JWT');
    assert.equal(check(`SUPABASE_SERVICE_ROLE_KEY=${secretKey}`), 0, 'sb_secret_ secret API key');
    for (const refused of [
      'SUPABASE_SERVICE_ROLE_KEY=',
      `SUPABASE_SERVICE_ROLE_KEY="${secretKey}"`,
      `SUPABASE_SERVICE_ROLE_KEY='${jwt}'`,
      `SUPABASE_SERVICE_ROLE_KEY=${secretKey} `,
      `SUPABASE_SERVICE_ROLE_KEY= ${jwt}`,
      'SUPABASE_SERVICE_ROLE_KEY=sb_secret_short',
      'SUPABASE_SERVICE_ROLE_KEY=sb_publishable_PUBLISHABLEVALUE0123456789',
      'SUPABASE_SERVICE_ROLE_KEY=eyJnotajwt',
      `SUPABASE_SERVICE_ROLE_KEY=${secretKey}\\nextra`,
    ]) {
      assert.notEqual(check(refused), 0, `must refuse ${refused.slice(0, 40)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


const NODE_TARBALL = 'node-v20.20.2-linux-x64.tar.xz';
const NODE_DIST = 'https://nodejs.org/dist/v20.20.2/';

test('the build toolchain comes only from the official python image and an official, hash-pinned Node.js tarball', () => {
  // Official sources only: no community/third-party image anywhere.
  const thirdParty = new RegExp(['nikol' + 'aik', 'python-node' + 'js', 'circleci/', 'bitnami/'].join('|'), 'i');
  for (const source of [workflow, deployGuide]) assert.doesNotMatch(source, thirdParty);
  assert.match(workflow, /BUILD_IMAGE: \$\{\{ vars\.VIDEO_YT_BUILD_IMAGE \}\}/);
  assert.match(workflow, /official Docker Hub python:3\.12-slim-bookworm image, pinned by its\s+# linux\/amd64 manifest digest/);
  assert.equal(workflow.split('[[ "$BUILD_IMAGE" =~ ^(docker\\.io/)?(library/)?python@sha256:[0-9a-f]{64}$ ]] || exit 1').length - 1, 2);
  assert.match(deployGuide, /official Docker Hub\s+`python:3\.12-slim-bookworm` image pinned by its `linux\/amd64` manifest digest/);
  assert.match(deployGuide, /`python@sha256:<64 hex>`/);

  // The Node.js tarball and its checksum list come from nodejs.org, and the
  // expected sha256 is pinned literally in the workflow and the guide.
  const pin = workflow.match(/^ {12}PINNED_SHA256 = '([0-9a-f]{64})'$/m)?.[1];
  assert.ok(pin, 'literal Node.js tarball sha256 pin');
  assert.ok(workflow.includes(`TARBALL_URL = '${NODE_DIST}${NODE_TARBALL}'`));
  assert.ok(workflow.includes(`SHASUMS_URL = '${NODE_DIST}SHASUMS256.txt'`));
  for (const expected of [NODE_DIST + NODE_TARBALL, NODE_DIST + 'SHASUMS256.txt', pin]) {
    assert.ok(deployGuide.includes(expected), `DEPLOY.md documents ${expected}`);
  }
  assert.match(deployGuide, /fails the\s+deploy closed before the archive is opened/);

  // Inside the build container: bookworm python, verified toolchain first,
  // exact Node version, then the unchanged locked installs. No package manager.
  const script = workflow.match(/--entrypoint \/bin\/sh "\$image_id" -eu -c '\n([\s\S]*?)\n\s+'\n/)?.[1];
  assert.ok(script, 'build container script');
  const order = [
    'python3 -c "import sys,platform; assert sys.version_info[:2] == (3,12)',
    'grep -qx "VERSION_CODENAME=bookworm" /etc/os-release',
    'python3 -I -c "$NODE_TOOLCHAIN_PY" /tmp/node-download /opt/node-toolchain',
    'PATH="/opt/node-toolchain/node-v20.20.2-linux-x64/bin:$PATH"',
    'test "$(command -v node)" = /opt/node-toolchain/node-v20.20.2-linux-x64/bin/node',
    'test "$(node -v)" = v20.20.2',
    'test "$(command -v npm)" = /opt/node-toolchain/node-v20.20.2-linux-x64/bin/npm',
    'npm ci --omit=dev --ignore-scripts --no-audit --no-fund',
    'python3 -m pip install --disable-pip-version-check --no-cache-dir --no-deps',
  ].map(needle => script.indexOf(needle));
  assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])), `ordered build script: ${order}`);
  assert.equal(script.slice(0, order[5]).match(/\bnode\s+-/g), null, 'no node invocation before the verified toolchain');
  assert.doesNotMatch(script, /\bapt(?:-get)?\b|\bxz\b|\bcurl\b|\bwget\b|\bdpkg\b/);
  assert.match(workflow, /--tmpfs \/opt\/node-toolchain:rw,exec,nosuid,nodev,size=256m/);
  assert.match(workflow, /--env HOME=\/tmp --env NODE_TOOLCHAIN_PY/);
  assert.match(workflow, /--memory=1g --memory-swap=1g --pids-limit=256 --read-only/);
  assert.match(workflow, /--user "\$\(id -u\):\$\(id -g\)"/);
  // The release does not carry the build toolchain; the host keeps /usr/bin/node.
  assert.equal(workflow.indexOf('/opt/node-toolchain', workflow.indexOf('scp "$archive"')), -1);
  assert.match(workflow, /test -x \/usr\/bin\/node/);
  assert.match(workflow, /test "\$node_major" -ge 18/);
  assert.match(service, /^ExecStart=\/usr\/bin\/node index\.js$/m);
});

test('the Node.js toolchain step fails closed on any checksum disagreement before opening the archive', () => {
  const block = workflow.match(/^ {10}NODE_TOOLCHAIN_PY: \|\n((?:(?: {12}.*)?\n)+)/m)?.[1];
  assert.ok(block, 'NODE_TOOLCHAIN_PY block');
  const program = block.split('\n').map(line => line.replace(/^ {12}/, '')).join('\n');
  const pin = program.match(/^PINNED_SHA256 = '([0-9a-f]{64})'$/m)?.[1];
  assert.ok(pin);
  assert.equal(program.split(NODE_DIST).length - 1, 3);
  const opened = program.indexOf('tarfile.open(');
  for (const check of ['if len(listed) != 1:', 'if listed[0] != PINNED_SHA256:', 'if actual != PINNED_SHA256 or actual != listed[0]:']) {
    const at = program.indexOf(check);
    assert.ok(at >= 0 && at < opened, `${check} runs before the archive is opened`);
  }
  assert.match(program, /archive\.extractall\(toolchain_dir, filter='data'\)/);

  const python = 'python3';
  const probe = spawnSync(python, ['-c', 'import sys, tarfile, lzma; sys.exit(0 if hasattr(tarfile, "data_filter") else 3)'], { encoding: 'utf8', timeout: 10000 });
  assert.ok(probe.status === 0 || probe.status === 3, `python3 with lzma is required: ${probe.stderr || probe.error}`);
  const hasDataFilter = probe.status === 0;
  const dir = mkdtempSync(join(tmpdir(), 'yt-node-toolchain-'));
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const makeArchive = (name, members) => {
    const out = join(dir, name);
    const made = spawnSync(python, ['-c', [
      'import io, sys, tarfile',
      'with tarfile.open(sys.argv[1], "w:xz") as archive:',
      '    for name in sys.argv[2:]:',
      '        data = b"#!/bin/sh\\necho v20.20.2\\n"',
      '        info = tarfile.TarInfo(name)',
      '        info.size = len(data)',
      '        info.mode = 0o755',
      '        archive.addfile(info, io.BytesIO(data))',
    ].join('\n'), out, ...members], { encoding: 'utf8', timeout: 10000 });
    assert.equal(made.status, 0, made.stderr);
    return readFileSync(out);
  };
  const good = makeArchive('good.tar.xz', ['node-v20.20.2-linux-x64/bin/node', 'node-v20.20.2-linux-x64/bin/npm']);
  const escaping = makeArchive('escaping.tar.xz', ['node-v20.20.2-linux-x64/bin/node', '../escaped-from-toolchain']);
  const corrupted = Buffer.from(good);
  corrupted[corrupted.length >> 1] ^= 0x01;
  const line = (hash, name = NODE_TARBALL) => `${hash}  ${name}\n`;
  const other = line('c'.repeat(64), 'node-v20.20.2-linux-arm64.tar.xz');
  let caseNumber = 0;
  const run = ({ tarball, shasums, pinned }) => {
    const root = join(dir, `case-${caseNumber += 1}`);
    const mirror = join(root, 'mirror');
    mkdirSync(mirror, { recursive: true });
    writeFileSync(join(mirror, NODE_TARBALL), tarball);
    writeFileSync(join(mirror, 'SHASUMS256.txt'), shasums);
    const source = program
      .replaceAll(NODE_DIST, pathToFileURL(mirror).href + '/')
      .replace(`PINNED_SHA256 = '${pin}'`, `PINNED_SHA256 = '${pinned}'`);
    const toolchain = join(root, 'toolchain');
    const result = spawnSync(python, ['-I', '-c', source, join(root, 'download'), toolchain], { encoding: 'utf8', timeout: 20000 });
    return { ...result, root, toolchain };
  };
  try {
    const accepted = run({ tarball: good, shasums: other + line(sha256(good)), pinned: sha256(good) });
    if (hasDataFilter) {
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.match(accepted.stdout, /matches the pin and SHASUMS256\.txt/);
      assert.equal(existsSync(join(accepted.toolchain, 'node-v20.20.2-linux-x64/bin/node')), true);
      assert.equal(existsSync(join(accepted.root, 'download', NODE_TARBALL)), false);
    } else {
      // An interpreter without extraction filters must refuse, never extract unfiltered.
      assert.notEqual(accepted.status, 0);
      assert.match(accepted.stderr, /lacks tarfile extraction filters/);
      assert.equal(existsSync(accepted.toolchain), false);
    }
    for (const [label, input, reason] of [
      ['corrupted byte', { tarball: corrupted, shasums: line(sha256(good)), pinned: sha256(good) }, /does not match the pinned and published sha256/],
      ['published list agrees with a corrupted tarball', { tarball: corrupted, shasums: line(sha256(corrupted)), pinned: sha256(good) }, /entry does not match the pinned sha256/],
      ['pin disagrees with a matching published list', { tarball: good, shasums: line(sha256(good)), pinned: 'd'.repeat(64) }, /entry does not match the pinned sha256/],
      ['missing SHASUMS line', { tarball: good, shasums: other, pinned: sha256(good) }, /exactly once/],
      ['only a look-alike filename', { tarball: good, shasums: line(sha256(good), './' + NODE_TARBALL) + line(sha256(good), NODE_TARBALL + '.bak'), pinned: sha256(good) }, /exactly once/],
      ['duplicated SHASUMS line', { tarball: good, shasums: line(sha256(good)) + line(sha256(good)), pinned: sha256(good) }, /exactly once/],
      ['archive member outside the release', { tarball: escaping, shasums: line(sha256(escaping)), pinned: sha256(escaping) }, hasDataFilter ? /unexpected archive member/ : /lacks tarfile extraction filters/],
    ]) {
      const refused = run(input);
      assert.notEqual(refused.status, 0, `${label} must fail closed`);
      assert.match(refused.stderr, reason, label);
      assert.equal(existsSync(join(refused.toolchain, 'node-v20.20.2-linux-x64')), false, `${label} must not extract`);
      assert.equal(existsSync(join(refused.root, 'escaped-from-toolchain')), false, `${label} must not escape`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
