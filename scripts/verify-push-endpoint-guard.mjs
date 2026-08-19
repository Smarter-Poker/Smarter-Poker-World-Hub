/**
 * Verifies src/lib/push/push-endpoint.js — the allowlist that stops an
 * attacker-supplied endpoint turning web-push into a server-side request
 * primitive with response exfiltration.
 *
 * Run: node scripts/verify-push-endpoint-guard.mjs
 * Exits non-zero on any failure, so it is CI-safe.
 */
import { validatePushEndpoint, validatePushKeys, samePushService } from '../src/lib/push/push-endpoint.js';

let failures = 0;
function check(name, actual, expected) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name} -> ${actual} (expected ${expected})`);
}

console.log('ALLOWED push services:');
for (const url of [
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/xyz',
    'https://web.push.apple.com/QABC',
    'https://abc123.push.apple.com/QABC',
    'https://sin.notify.windows.com/w/?token=x',
]) {
    check(url, validatePushEndpoint(url).ok, true);
}

console.log('\nBLOCKED (SSRF / scanning / malformed):');
const blocked = [
    ['cloud metadata', 'https://169.254.169.254/latest/meta-data'],
    ['localhost', 'https://localhost/x'],
    ['internal host', 'https://10.0.0.3/health'],
    ['arbitrary host', 'https://evil.example.com/x'],
    ['explicit port (scan)', 'https://fcm.googleapis.com:8080/fcm/send/a'],
    ['plain http', 'http://fcm.googleapis.com/fcm/send/a'],
    ['embedded creds', 'https://u:p@fcm.googleapis.com/fcm/send/a'],
    ['lookalike suffix', 'https://fcm.googleapis.com.evil.com/x'],
    ['malformed', 'not-a-url'],
    ['empty', ''],
];
for (const [name, url] of blocked) {
    check(name, validatePushEndpoint(url).ok, false);
}

console.log('\nKEY SHAPE (65-byte p256dh, 16-byte auth):');
const goodP256 = 'B'.repeat(87); // 87 base64url chars -> 65 bytes
const goodAuth = 'A'.repeat(22); // 22 base64url chars -> 16 bytes
check('valid pair', validatePushKeys(goodP256, goodAuth).ok, true);
check('short p256dh', validatePushKeys('abc', goodAuth).ok, false);
check('short auth', validatePushKeys(goodP256, 'abc').ok, false);
check('non-base64url', validatePushKeys('!'.repeat(87), goodAuth).ok, false);
check('missing', validatePushKeys(null, null).ok, false);

console.log('\nSAME PUSH SERVICE (rotation must not jump providers):');
check('same host', samePushService('https://fcm.googleapis.com/a', 'https://fcm.googleapis.com/b'), true);
check('different host', samePushService('https://fcm.googleapis.com/a', 'https://web.push.apple.com/b'), false);

console.log(failures === 0 ? '\nPASS: all endpoint guard cases behave correctly' : `\nFAIL: ${failures} case(s)`);
process.exit(failures === 0 ? 0 : 1);
