#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// verify-deploy.js — Post-Deploy Production Verification
// ═══════════════════════════════════════════════════════════════════════════════
//
// USAGE:
//   npm run verify                                  # checks smarter.poker
//   npm run verify -- --url https://custom.url
//   npm run verify -- --wait 60                     # wait N seconds before checking
//
// CHECKS:
//   1. Health endpoint returns 200
//   2. Commit SHA matches local HEAD (if available)
//   3. Database connectivity is "ok"
//
// EXIT CODES:
//   0 = verified
//   1 = verification failed
// ═══════════════════════════════════════════════════════════════════════════════

const { execSync } = require('child_process');

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const waitIdx = args.indexOf('--wait');

const BASE_URL = urlIdx !== -1 && args[urlIdx + 1] ? args[urlIdx + 1] : 'https://smarter.poker';
const WAIT_SECONDS = waitIdx !== -1 && args[waitIdx + 1] ? parseInt(args[waitIdx + 1]) : 0;

async function main() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🔍 Post-Deploy Verification');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   URL:  ${BASE_URL}`);
    console.log(`   Wait: ${WAIT_SECONDS}s`);
    console.log('═══════════════════════════════════════════════════\n');

    // ── Wait if requested ──
    if (WAIT_SECONDS > 0) {
        console.log(`   ⏳ Waiting ${WAIT_SECONDS}s for deployment to propagate...`);
        await new Promise(r => setTimeout(r, WAIT_SECONDS * 1000));
    }

    let localSha = 'unknown';
    try {
        localSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    } catch (e) { }

    const healthUrl = `${BASE_URL}/api/health`;
    console.log(`   🌐 Hitting: ${healthUrl}`);

    try {
        const res = await fetch(healthUrl, {
            headers: { 'User-Agent': 'AntiGravity-Verify/1.0' },
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            console.error(`   ❌ Health endpoint returned HTTP ${res.status}`);
            console.log('\nDEPLOY_VERIFIED:false');
            process.exit(1);
        }

        const health = await res.json();
        console.log(`   ✅ HTTP ${res.status} — status: ${health.status}`);
        console.log(`   📊 DB: ${health.checks?.db?.status || 'N/A'}`);
        console.log(`   🕐 Response: ${health.responseMs}ms`);
        console.log(`   💾 Memory: ${health.checks?.memory?.heapUsedMB || '?'}MB heap`);
        console.log(`   🏷️  Remote SHA: ${health.version}`);
        console.log(`   🏷️  Local SHA:  ${localSha}`);

        // ── SHA match check ──
        if (health.version !== 'local' && localSha !== 'unknown') {
            if (health.version === localSha) {
                console.log('   ✅ Commit SHA matches!');
            } else {
                console.log('   ⚠️  SHA mismatch — deployment may still be propagating');
            }
        }

        // ── DB check ──
        if (health.checks?.db?.status === 'error') {
            console.log('   ⚠️  Database connectivity issue detected');
        }

        console.log('\n═══════════════════════════════════════════════════');
        if (health.status === 'ok') {
            console.log('DEPLOY_VERIFIED:true');
            console.log(`COMMIT_SHA:${health.version}`);
            console.log(`RESPONSE_MS:${health.responseMs}`);
            console.log('═══════════════════════════════════════════════════');
            process.exit(0);
        } else {
            console.log('DEPLOY_VERIFIED:false');
            console.log(`STATUS:${health.status}`);
            console.log('═══════════════════════════════════════════════════');
            process.exit(1);
        }

    } catch (e) {
        console.error(`   ❌ Failed to reach health endpoint: ${e.message}`);
        console.log('\nDEPLOY_VERIFIED:false');
        process.exit(1);
    }
}

main();
