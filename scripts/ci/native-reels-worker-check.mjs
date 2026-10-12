#!/usr/bin/env node
// Explicit read-only inspection through the configured, fingerprint-pinned SSH route.
// Never reads environment, credentials, journals, media, or user records.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const REMOTE_INSPECTION = `set -u
active=$(timeout 5s systemctl is-active sp-transcode 2>/dev/null || true)
enabled=$(timeout 5s systemctl is-enabled sp-transcode 2>/dev/null || true)
pid=$(timeout 5s systemctl show sp-transcode --property=MainPID --value 2>/dev/null || true)
start=$(timeout 5s systemctl show sp-transcode --property=ExecStart --value 2>/dev/null || true)
cwd=$(timeout 5s systemctl show sp-transcode --property=WorkingDirectory --value 2>/dev/null || true)
case "$start" in *"argv[]=/usr/bin/node index.js ;"*) exec_match=yes;; *) exec_match=no;; esac
if [ "$cwd" = '/opt/smarter-poker/transcode-worker' ]; then cwd_match=yes; else cwd_match=no; fi
hash=$(timeout 5s sha256sum /opt/smarter-poker/transcode-worker/index.js 2>/dev/null | cut -d ' ' -f1)
printf 'active=%s\nenabled=%s\npid=%s\nexec_match=%s\ncwd_match=%s\nhash=%s\n' "$active" "$enabled" "$pid" "$exec_match" "$cwd_match" "$hash"
`;

export function validateWorkerInspection(output, expectedHash) {
  const fields = Object.fromEntries(String(output).trim().split('\n').map(line => {
    const boundary = line.indexOf('=');
    assert.ok(boundary > 0, 'Worker inspection returned an unclassified line');
    return [line.slice(0, boundary), line.slice(boundary + 1)];
  }));
  assert.deepEqual(Object.keys(fields).sort(), ['active','cwd_match','enabled','exec_match','hash','pid'].sort(), 'Worker inspection inventory mismatch');
  assert.equal(fields.active, 'active', 'Native worker is not active');
  assert.equal(fields.enabled, 'enabled', 'Native worker is not enabled');
  assert.match(fields.pid, /^[1-9]\d*$/, 'Native worker has no active process');
  assert.equal(fields.exec_match, 'yes', 'Native worker uses a different entrypoint');
  assert.equal(fields.cwd_match, 'yes', 'Native worker uses a different source directory');
  assert.match(expectedHash, /^[0-9a-f]{64}$/, 'Expected native source identity missing');
  assert.equal(fields.hash, expectedHash, 'Installed native worker source differs from reviewed source');
  return { active: true, enabled: true, mainPid: Number(fields.pid), canonicalEntrypoint: true,
    installedSourceSha256: fields.hash, loadedSourceBytesProven: false,
    freshNativeProcessingProven: false };
}

async function main() {
  const source = await readFile(new URL('../transcode-worker/index.js', import.meta.url), 'utf8');
  const expectedHash = createHash('sha256').update(source).digest('hex');
  assert.match(source, /from\('social_posts'\)[\s\S]*eq\('transcode_status', 'queued'\)/);
  assert.match(source, /original_media_url \|\| post\.media_urls/);
  const report = { status: 'failed', observedAt: new Date().toISOString(), expectedSourceSha256: expectedHash,
    rightsAuthority: 'Authenticated queue RPC validates owned user-authorized source before queuing',
    workerInternalRightsRecheck: /rights_status/.test(source), readonly: true };
  try {
    const target = process.argv[process.argv.indexOf('--ssh-target') + 1];
    assert.ok(process.argv.includes('--ssh-target') && target && /^[a-zA-Z0-9_.@:\[\]-]+$/.test(target) && !target.startsWith('-'), 'Configured SSH target unavailable');
    const output = execFileSync('ssh', ['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15',target,'bash -se'], {
      input: REMOTE_INSPECTION, encoding: 'utf8', timeout: 45000, maxBuffer: 4096,
      stdio: ['pipe','pipe','pipe'],
    });
    Object.assign(report, validateWorkerInspection(output, expectedHash));
    report.status = 'passed-readonly-inspection';
  } catch (error) {
    report.error = error instanceof assert.AssertionError ? error.message : 'Configured worker read-only inspection unavailable';
    process.exitCode = 1;
  }
  await mkdir('test-results/native-reels-worker', { recursive: true });
  await writeFile('test-results/native-reels-worker/result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
