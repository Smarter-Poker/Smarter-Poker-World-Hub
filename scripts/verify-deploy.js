#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// verify-deploy.js — Post-Deploy Production Verification
// ═══════════════════════════════════════════════════════════════════════════════
//
// USAGE:
//   node scripts/verify-deploy.js                           # one-shot check
//   node scripts/verify-deploy.js --wait 60                 # wait N seconds before first check
//   node scripts/verify-deploy.js --match-sha abc1234       # loop until production SHA matches
//   node scripts/verify-deploy.js --match-sha abc1234 --timeout 300  # with max wait
//   node scripts/verify-deploy.js --url https://custom.url
//
// CHECKS:
//   1. Health endpoint returns 200
//   2. Commit SHA matches local HEAD (or --match-sha if provided)
//   3. Database connectivity is "ok"
//
// EXIT CODES:
//   0 = verified (SHA matched if --match-sha was provided)
//   1 = verification failed (health down, DB error, or SHA never matched)
// ═══════════════════════════════════════════════════════════════════════════════

const { execSync } = require('child_process');

const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 && args[i + 1] ? args[i + 1] : null; };

const BASE_URL = getArg('--url') || 'https://smarter.poker';
const WAIT_SECONDS = parseInt(getArg('--wait') || '0');
const MATCH_SHA = getArg('--match-sha');
const TIMEOUT = parseInt(getArg('--timeout') || '300'); // 5 min default
const POLL_INTERVAL = 15; // seconds between SHA checks

async function checkHealth(localSha) {
    const healthUrl = `${BASE_URL}/api/health`;
    console.log(`   🌐 Hitting: ${healthUrl}`);

    const res = await fetch(healthUrl, {
        headers: { 'User-Agent': 'AntiGravity-Verify/1.0' },
        signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
        console.error(`   ❌ Health endpoint returned HTTP ${res.status}`);
        return { ok: false, sha: null };
    }

    const health = await res.json();
    console.log(`   ✅ HTTP ${res.status} — status: ${health.status}`);
    console.log(`   📊 DB: ${health.checks?.db?.status || 'N/A'}`);
    console.log(`   🕐 Response: ${health.responseMs}ms`);
    console.log(`   💾 Memory: ${health.checks?.memory?.heapUsedMB || '?'}MB heap`);
    console.log(`   🏷️  Remote SHA: ${health.version}`);
    console.log(`   🏷️  Local SHA:  ${localSha}`);

    // SHA match check
    const shaMatched = health.version && localSha && 
        (health.version === localSha || 
         localSha.startsWith(health.version) || 
         health.version.startsWith(localSha));

    if (shaMatched) {
        console.log('   ✅ Commit SHA matches — production is serving your commit!');
    } else if (health.version && localSha) {
        console.log('   ⚠️  SHA mismatch — deployment may still be propagating');
    }

    // DB check
    if (health.checks?.db?.status === 'error') {
        console.log('   ⚠️  Database connectivity issue detected');
    }

    return { 
        ok: health.status === 'ok', 
        sha: health.version, 
        shaMatched,
        dbOk: health.checks?.db?.status === 'ok',
        responseMs: health.responseMs 
    };
}

async function main() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🔍 Post-Deploy Verification');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   URL:  ${BASE_URL}`);
    if (WAIT_SECONDS > 0) console.log(`   Wait: ${WAIT_SECONDS}s`);
    if (MATCH_SHA) console.log(`   Match SHA: ${MATCH_SHA} (timeout: ${TIMEOUT}s)`);
    console.log('═══════════════════════════════════════════════════\n');

    // ── Initial wait ──
    if (WAIT_SECONDS > 0) {
        console.log(`   ⏳ Waiting ${WAIT_SECONDS}s for deployment to propagate...`);
        await new Promise(r => setTimeout(r, WAIT_SECONDS * 1000));
    }

    // Determine expected SHA
    let expectedSha = MATCH_SHA;
    if (!expectedSha) {
        try {
            expectedSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
        } catch (e) {
            expectedSha = 'unknown';
        }
    }

    // ── If --match-sha: loop until production serves our commit ──
    if (MATCH_SHA) {
        const startTime = Date.now();
        let attempt = 0;
        
        while (true) {
            attempt++;
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`\n   📡 Verification attempt ${attempt} (${elapsed}s elapsed)...`);

            try {
                const result = await checkHealth(expectedSha);

                if (result.ok && result.shaMatched) {
                    console.log('\n═══════════════════════════════════════════════════');
                    console.log('DEPLOY_VERIFIED:true');
                    console.log('SHA_MATCHED:true');
                    console.log(`COMMIT_SHA:${result.sha}`);
                    console.log(`RESPONSE_MS:${result.responseMs}`);
                    console.log(`VERIFICATION_TIME:${elapsed}s`);
                    console.log('═══════════════════════════════════════════════════');
                    process.exit(0);
                }

                if (elapsed >= TIMEOUT) {
                    console.log('\n═══════════════════════════════════════════════════');
                    console.log(`❌ TIMEOUT: Production SHA (${result.sha}) never matched expected (${expectedSha}) after ${TIMEOUT}s`);
                    console.log('DEPLOY_VERIFIED:false');
                    console.log('SHA_MATCHED:false');
                    console.log(`PRODUCTION_SHA:${result.sha}`);
                    console.log(`EXPECTED_SHA:${expectedSha}`);
                    console.log('═══════════════════════════════════════════════════');
                    process.exit(1);
                }

                // ── Vercel Fail-Fast Hook ──
                // Polling the actual CLI. If the latest build crashed, 
                // the SHA will never match, so we should abort instantly.
                try {
                    const vercelStatus = require('child_process').execSync('npx vercel ls 2>/dev/null', {encoding:'utf-8'});
                    const lines = vercelStatus.split('\n');
                    const latestDeploy = lines.find(line => line.includes('hub-vanguard') && (line.includes('Production') || line.includes('Preview')));
                    
                    if (latestDeploy && (latestDeploy.includes('● Error') || latestDeploy.includes('Canceled'))) {
                        console.log('\n   ❌ CRITICAL: Vercel rejected the deployment build loop!');
                        console.log('   Dumping error state to .agent/problems/vercel-deploy-crash.md');
                        
                        require('fs').mkdirSync('.agent/problems', { recursive: true });
                        require('fs').writeFileSync('.agent/problems/vercel-deploy-crash.md', 
                            `# Vercel Deployment Failed\n\n**Commit SHA:** ${expectedSha}\n**Status:** ${latestDeploy.trim()}\n\nCheck Vercel dashboard immediately.`);
                            
                        console.log('\n═══════════════════════════════════════════════════');
                        console.log('DEPLOY_VERIFIED:false');
                        console.log('REASON:vercel_build_crash');
                        console.log('═══════════════════════════════════════════════════');
                        process.exit(1);
                    }
                } catch (vercelErr) {
                    // ignore vercel CLI errors silently to not break polling
                }

                console.log(`   ⏳ SHA not matched yet. Retrying in ${POLL_INTERVAL}s...`);
                await new Promise(r => setTimeout(r, POLL_INTERVAL * 1000));
            } catch (e) {
                console.error(`   ❌ Health check failed: ${e.message}`);
                if (elapsed >= TIMEOUT) {
                    console.log('DEPLOY_VERIFIED:false');
                    process.exit(1);
                }
                console.log(`   ⏳ Retrying in ${POLL_INTERVAL}s...`);
                await new Promise(r => setTimeout(r, POLL_INTERVAL * 1000));
            }
        }
    }

    // ── One-shot mode (no --match-sha) ──
    try {
        const result = await checkHealth(expectedSha);

        console.log('\n═══════════════════════════════════════════════════');
        if (result.ok) {
            console.log('DEPLOY_VERIFIED:true');
            console.log(`COMMIT_SHA:${result.sha}`);
            console.log(`SHA_MATCHED:${result.shaMatched}`);
            console.log(`RESPONSE_MS:${result.responseMs}`);
            console.log('═══════════════════════════════════════════════════');
            process.exit(0);
        } else {
            console.log('DEPLOY_VERIFIED:false');
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
