import fs from 'node:fs';
import { execSync } from 'node:child_process';

let exitCode = 0;
const error = (msg) => { console.error(`::error::${msg}`); exitCode = 1; };

console.log('Verifying no operational pages to the owner...');

// 1. Check for web-push, Twilio, FCM, or Expo send calls outside allowlist
const grepSenders = `git grep -E 'web-push.*sendNotification|twilio.*messages\.create|firebase-admin.*messaging|expo-server-sdk' || true`;
const senders = execSync(grepSenders, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);

// We need an explicit allowlist of approved senders in a file.
let allowedSenders = [];
try {
  allowedSenders = fs.readFileSync('scripts/ci/approved-senders.txt', 'utf8').split('\n').filter(Boolean);
} catch (e) {
  error('Missing scripts/ci/approved-senders.txt');
}

for (const line of senders) {
  // line format: "path:line:code"
  const file = line.split(':')[0];
  if (!allowedSenders.includes(file)) {
    error(`Unauthorized sender found in ${file}. Add to scripts/ci/approved-senders.txt if legitimate.`);
  }
}

// 2. Check that the guard is intact in push-gate.js
if (fs.existsSync('src/lib/push/push-gate.js')) {
    const pushGate = fs.readFileSync('src/lib/push/push-gate.js', 'utf8');
    if (!pushGate.includes("opts.recipient === '47965354-0e56-43ef-931c-ddaab82af765'") || !pushGate.includes("'accounting_invoice', 'page_completion_nudge', 'financial_attestation'")) {
        error("The push gate owner allowlist has been weakened or removed.");
    }
}

process.exit(exitCode);
