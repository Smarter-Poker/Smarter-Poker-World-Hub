#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// deploy-log.js — Persistent Deployment Audit Trail
// ═══════════════════════════════════════════════════════════════════════════════
//
// Called automatically by git-safe-push.sh and antigravity-deploy.sh after
// successful operations. Maintains a rolling JSON log of all deployments.
//
// USAGE:
//   node scripts/deploy-log.js --action push --sha abc1234 --branch main --duration 7 --msg "feat: new"
//   node scripts/deploy-log.js --action deploy --sha abc1234 --sql-ok true --vercel-ok true
//   node scripts/deploy-log.js --show                    # print recent entries
//   node scripts/deploy-log.js --show --count 5          # print last 5 entries
//
// LOG FILE: logs/deploy-history.json (auto-pruned to 100 entries)
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'deploy-history.json');
const MAX_ENTRIES = 100;

// ── Parse args ──
const args = process.argv.slice(2);
function getArg(name) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const showMode = args.includes('--show');

// ── Read existing log ──
function readLog() {
    if (!fs.existsSync(LOG_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    } catch (_) {
        return [];
    }
}

// ── Write log ──
function writeLog(entries) {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    // Prune to max entries
    const pruned = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;
    fs.writeFileSync(LOG_FILE, JSON.stringify(pruned, null, 2));
}

// ── Show mode ──
if (showMode) {
    const count = parseInt(getArg('count') || '10');
    const history = readLog();
    const recent = history.slice(-count);

    console.log(`\n📋 Deploy History (last ${recent.length} of ${history.length})\n`);
    console.log(`${'Timestamp'.padEnd(22)} ${'Action'.padEnd(8)} ${'SHA'.padEnd(10)} ${'Duration'.padEnd(10)} Message`);
    console.log(`${'─'.repeat(22)} ${'─'.repeat(8)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(30)}`);

    for (const entry of recent) {
        const ts = entry.timestamp ? entry.timestamp.substring(0, 19).replace('T', ' ') : 'N/A';
        const action = (entry.action || '?').padEnd(8);
        const sha = (entry.sha || 'N/A').padEnd(10);
        const dur = (entry.duration ? `${entry.duration}s` : 'N/A').padEnd(10);
        const msg = (entry.msg || '').substring(0, 50);
        console.log(`${ts.padEnd(22)} ${action} ${sha} ${dur} ${msg}`);
    }
    console.log('');
    process.exit(0);
}

// ── Append mode ──
const action = getArg('action');
if (!action) {
    console.error('Usage: node deploy-log.js --action <push|deploy|sql> [--sha X] [--branch X] ...');
    process.exit(1);
}

const entry = {
    timestamp: new Date().toISOString(),
    action,
    sha: getArg('sha') || null,
    branch: getArg('branch') || null,
    duration: getArg('duration') ? parseInt(getArg('duration')) : null,
    msg: getArg('msg') || null,
    sqlOk: getArg('sql-ok') || null,
    vercelOk: getArg('vercel-ok') || null,
    hostname: require('os').hostname(),
};

const history = readLog();
history.push(entry);
writeLog(history);

console.log(`   📋 Deploy log: ${action} recorded (${history.length} entries)`);
