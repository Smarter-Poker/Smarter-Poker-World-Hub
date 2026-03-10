#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// OVERLORD WATCH — GitHub & SQL Gate Keeper Daemon v1.0
// ═══════════════════════════════════════════════════════════════════════════════
//
// Continuously monitors:
//   1. GitHub Actions workflow runs (gh run list)
//   2. Vercel deployment status (vercel ls)
//   3. Git working tree cleanliness (uncommitted/unpushed changes)
//   4. Supabase SQL migration ledger (pending vs applied)
//
// USAGE:
//   node scripts/overlord-watch.js              # Default 60s interval
//   node scripts/overlord-watch.js --interval 30  # Custom interval in seconds
//   node scripts/overlord-watch.js --once        # Run once and exit
//
// ═══════════════════════════════════════════════════════════════════════════════

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Parse CLI ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const intervalIdx = args.indexOf('--interval');
const INTERVAL_SEC = intervalIdx !== -1 ? parseInt(args[intervalIdx + 1], 10) : 60;
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── ANSI Colors ─────────────────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
};

function timestamp() {
    return new Date().toLocaleString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
}

function exec(cmd) {
    try {
        return execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (e) {
        return `ERROR: ${e.message.split('\n')[0]}`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 1: GitHub Actions
// ═══════════════════════════════════════════════════════════════════════════════
function checkGitHubActions() {
    const raw = exec('gh run list -L 10 --json status,conclusion,name,headBranch,createdAt,databaseId 2>/dev/null');
    if (raw.startsWith('ERROR')) return { status: 'WARN', message: `gh CLI unavailable: ${raw}`, failed: [], pending: [] };

    try {
        const runs = JSON.parse(raw);
        const failed = runs.filter(r => r.conclusion === 'failure');
        const pending = runs.filter(r => r.status === 'in_progress' || r.status === 'queued');

        if (failed.length > 0) {
            return {
                status: 'FAIL',
                message: `${failed.length} FAILED run(s)`,
                failed: failed.map(r => `  ❌ ${r.name} [${r.headBranch}] — ID: ${r.databaseId}`),
                pending: pending.map(r => `  ⏳ ${r.name} [${r.headBranch}]`),
            };
        }
        if (pending.length > 0) {
            return {
                status: 'PENDING',
                message: `${pending.length} in-progress run(s)`,
                failed: [],
                pending: pending.map(r => `  ⏳ ${r.name} [${r.headBranch}]`),
            };
        }
        return { status: 'OK', message: `All ${runs.length} recent runs passed`, failed: [], pending: [] };
    } catch {
        return { status: 'WARN', message: 'Could not parse gh output', failed: [], pending: [] };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 2: Vercel Deployments
// ═══════════════════════════════════════════════════════════════════════════════
function checkVercel() {
    const raw = exec('npx -y vercel ls --yes 2>/dev/null');
    if (raw.startsWith('ERROR')) return { status: 'WARN', message: `Vercel CLI unavailable`, errors: [], building: [] };

    const lines = raw.split('\n');
    const deployLines = lines.filter(l => l.includes('vercel.app'));

    const errors = deployLines.filter(l => /● Error/i.test(l));
    const building = deployLines.filter(l => /Building|Queued/i.test(l));
    const canceled = deployLines.filter(l => /Canceled/i.test(l));
    const ready = deployLines.filter(l => /● Ready/i.test(l));

    // Only flag errors on the LATEST deployment
    const latestLine = deployLines[0] || '';
    const latestIsError = /● Error/i.test(latestLine);
    const latestIsBuilding = /Building|Queued/i.test(latestLine);

    if (latestIsError) {
        return {
            status: 'FAIL',
            message: `LATEST deployment FAILED`,
            errors: [`  ❌ ${latestLine.trim()}`],
            building: [],
        };
    }
    if (latestIsBuilding) {
        return {
            status: 'PENDING',
            message: `LATEST deployment still building`,
            errors: [],
            building: [`  🔨 ${latestLine.trim()}`],
        };
    }
    return {
        status: 'OK',
        message: `Latest: Ready | ${ready.length} ready, ${canceled.length} canceled, ${errors.length} old errors`,
        errors: [],
        building: [],
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 3: Git Working Tree
// ═══════════════════════════════════════════════════════════════════════════════
function checkGit() {
    const status = exec('git status --porcelain');
    const unpushed = exec('git log origin/main..HEAD --oneline');

    const dirty = status.length > 0;
    const hasUnpushed = unpushed.length > 0;

    if (dirty && hasUnpushed) {
        return { status: 'FAIL', message: `Uncommitted changes AND unpushed commits`, details: status.split('\n').slice(0, 5) };
    }
    if (dirty) {
        const fileCount = status.split('\n').filter(Boolean).length;
        return { status: 'WARN', message: `${fileCount} uncommitted change(s)`, details: status.split('\n').slice(0, 5) };
    }
    if (hasUnpushed) {
        return { status: 'WARN', message: `Unpushed commits: ${unpushed.split('\n').length}`, details: unpushed.split('\n').slice(0, 3) };
    }
    return { status: 'OK', message: 'Clean tree, fully synced with origin/main', details: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 4: SQL Migration Ledger
// ═══════════════════════════════════════════════════════════════════════════════
function checkSQL() {
    const raw = exec('node scripts/antigravity_sql_push.js --status supabase/migrations/ 2>/dev/null');
    if (raw.startsWith('ERROR')) return { status: 'WARN', message: 'Could not query migration ledger', pending: 0, applied: 0 };

    const totalMatch = raw.match(/Total:\s*(\d+)\s*\|\s*Applied:\s*(\d+)\s*\|\s*Pending:\s*(\d+)/);
    if (!totalMatch) return { status: 'WARN', message: 'Could not parse migration status', pending: 0, applied: 0 };

    const total = parseInt(totalMatch[1], 10);
    const applied = parseInt(totalMatch[2], 10);
    const pending = parseInt(totalMatch[3], 10);

    if (pending > 0) {
        return { status: 'WARN', message: `${pending} pending migration(s) of ${total} total`, pending, applied };
    }
    return { status: 'OK', message: `All ${applied} migrations applied`, pending: 0, applied };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════════════
function statusIcon(s) {
    switch (s) {
        case 'OK': return `${C.green}✅ PASS${C.reset}`;
        case 'WARN': return `${C.yellow}⚠️  WARN${C.reset}`;
        case 'PENDING': return `${C.yellow}⏳ PEND${C.reset}`;
        case 'FAIL': return `${C.red}${C.bold}❌ FAIL${C.reset}`;
        default: return `${C.dim}? UNKN${C.reset}`;
    }
}

function renderReport(gh, vercel, git, sql) {
    const allOk = [gh.status, vercel.status, git.status, sql.status].every(s => s === 'OK');
    const hasFail = [gh.status, vercel.status, git.status, sql.status].some(s => s === 'FAIL');

    console.log(`\n${C.cyan}${C.bold}${'═'.repeat(65)}${C.reset}`);
    if (allOk) {
        console.log(`${C.green}${C.bold}  🛡️  OVERLORD WATCH — ALL SYSTEMS GREEN  [${timestamp()}]${C.reset}`);
    } else if (hasFail) {
        console.log(`${C.red}${C.bold}  🚨 OVERLORD WATCH — FAILURE DETECTED     [${timestamp()}]${C.reset}`);
    } else {
        console.log(`${C.yellow}${C.bold}  ⚠️  OVERLORD WATCH — ATTENTION REQUIRED  [${timestamp()}]${C.reset}`);
    }
    console.log(`${C.cyan}${C.bold}${'═'.repeat(65)}${C.reset}`);

    // GitHub Actions
    console.log(`\n  ${statusIcon(gh.status)}  ${C.bold}GitHub Actions${C.reset}: ${gh.message}`);
    if (gh.failed.length) gh.failed.forEach(l => console.log(`       ${C.red}${l}${C.reset}`));
    if (gh.pending.length) gh.pending.forEach(l => console.log(`       ${C.yellow}${l}${C.reset}`));

    // Vercel
    console.log(`  ${statusIcon(vercel.status)}  ${C.bold}Vercel Deploy${C.reset}:  ${vercel.message}`);
    if (vercel.errors.length) vercel.errors.forEach(l => console.log(`       ${C.red}${l}${C.reset}`));
    if (vercel.building.length) vercel.building.forEach(l => console.log(`       ${C.yellow}${l}${C.reset}`));

    // Git
    console.log(`  ${statusIcon(git.status)}  ${C.bold}Git Tree${C.reset}:       ${git.message}`);
    if (git.details && git.details.length) git.details.forEach(l => console.log(`       ${C.dim}${l}${C.reset}`));

    // SQL
    console.log(`  ${statusIcon(sql.status)}  ${C.bold}SQL Migrations${C.reset}: ${sql.message}`);

    console.log(`\n${C.cyan}${C.bold}${'═'.repeat(65)}${C.reset}`);
    if (!ONCE) console.log(`${C.dim}  Next scan in ${INTERVAL_SEC}s... (Ctrl+C to stop)${C.reset}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════════════
async function scan() {
    const gh = checkGitHubActions();
    const vercel = checkVercel();
    const git = checkGit();
    const sql = checkSQL();
    renderReport(gh, vercel, git, sql);
}

async function main() {
    console.log(`${C.cyan}${C.bold}`);
    console.log(`  ╔═══════════════════════════════════════════════════════════╗`);
    console.log(`  ║   🛡️  OVERLORD WATCH v1.0 — GitHub & SQL Gate Keeper    ║`);
    console.log(`  ║   Monitoring: GitHub Actions | Vercel | Git | SQL       ║`);
    console.log(`  ║   Interval: ${ONCE ? 'SINGLE SCAN' : `${INTERVAL_SEC}s`}                                       ║`);
    console.log(`  ╚═══════════════════════════════════════════════════════════╝`);
    console.log(`${C.reset}`);

    await scan();

    if (!ONCE) {
        setInterval(scan, INTERVAL_SEC * 1000);
    }
}

main();
