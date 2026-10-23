import fs from 'node:fs';
import { execSync } from 'node:child_process';

let exitCode = 0;
const error = (msg) => { console.error(`::error::${msg}`); exitCode = 1; };

console.log('Verifying no operational pages to the owner...');

// 1. Check for web-push, Twilio, FCM, or Expo send calls outside allowlist
const grepSenders = `git grep -lE 'sendNotification|twilio.*messages\\.create|firebase-admin.*messaging|expo-server-sdk' || true`;
const senders = execSync(grepSenders, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);

let allowedSenders = [];
try {
  allowedSenders = fs.readFileSync('scripts/ci/approved-senders.txt', 'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
} catch (e) {
  error('Missing scripts/ci/approved-senders.txt');
}

for (const file of senders) {
  // Allowlist applies to specific paths
  if (!allowedSenders.includes(file) && !file.includes('.test.') && !file.includes('BUILD_PLAN') && !file.includes('.md')) {
    error(`Unauthorized sender found in ${file}. Add to scripts/ci/approved-senders.txt if legitimate.`);
  }
}

// 2. Check that the guard is intact in push-gate.js
if (fs.existsSync('src/lib/push/push-gate.js')) {
    const pushGate = fs.readFileSync('src/lib/push/push-gate.js', 'utf8');
    if (!pushGate.includes("opts.recipient === '47965354-0e56-43ef-931c-ddaab82af765'")) {
        error("The push gate owner guard ID has been weakened or removed.");
    }
    if (!pushGate.includes("'accounting_invoice', 'page_completion_nudge', 'financial_attestation'")) {
        error("The push gate owner allowlist has been modified without approval.");
    }
}

// 3. No function or trigger turning alerts into notifications/pushes
const grepTriggers = `git grep -lE 'fn_raise_notification|INSERT INTO public.notifications|INSERT INTO public.push_outbox|net.http_post' || true`;
const triggers = execSync(grepTriggers, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
for (const file of triggers) {
  // Disallow if they are new trigger files adding this pattern
  if (file.includes('supabase/migrations') && !file.includes('20260916111614_owner_operational_notification_destination.sql')) {
     const contents = fs.readFileSync(file, 'utf8');
     if (contents.match(/AFTER INSERT ON (public\.operational_alert_events|public\.financial_alerts|public\.engine_alerts|public\.ca_drift_incidents|public\.operational_notification_destinations)/) && contents.match(/(fn_raise_notification|INSERT INTO (public\.)?(notifications|push_outbox))/)) {
         error(`Trigger turning alert into notification/push found in ${file}.`);
     }
  }
}

process.exit(exitCode);
