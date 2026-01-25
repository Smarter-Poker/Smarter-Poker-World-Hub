#!/usr/bin/env node
/**
 * Pre-Deploy Health Check: Header Stats API
 * 
 * Run this before every production deploy:
 *   node scripts/check-header-health.js
 * 
 * Exit codes:
 *   0 = Header API is working, safe to deploy
 *   1 = Header API is broken, DO NOT DEPLOY
 */

const https = require('https');

// Known test user with data
const TEST_USER_ID = '47965354-d826-4f4b-8f16-fe0cefaf7563'; // KingFish account
const BASE_URL = process.env.CHECK_URL || 'https://smarter.poker';

async function checkHeaderHealth() {
    console.log('🔍 Checking header stats API health...\n');

    const url = `${BASE_URL}/api/user/get-header-stats`;

    return new Promise((resolve) => {
        const postData = JSON.stringify({ userId: TEST_USER_ID });

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);

                    console.log('📊 API Response:');
                    console.log(`   Status: ${res.statusCode}`);
                    console.log(`   Success: ${result.success}`);

                    if (result.profile) {
                        console.log(`   Diamonds: ${result.profile.diamonds}`);
                        console.log(`   XP: ${result.profile.xp}`);
                        console.log(`   Level: ${result.profile.level}`);
                    }

                    // Validate response
                    if (res.statusCode !== 200) {
                        console.error('\n❌ FAILED: API returned non-200 status');
                        resolve(false);
                        return;
                    }

                    if (!result.success) {
                        console.error('\n❌ FAILED: API returned success=false');
                        console.error(`   Error: ${result.error}`);
                        resolve(false);
                        return;
                    }

                    if (!result.profile || result.profile.diamonds === undefined) {
                        console.error('\n❌ FAILED: API returned invalid profile data');
                        resolve(false);
                        return;
                    }

                    console.log('\n✅ PASSED: Header stats API is healthy');
                    resolve(true);

                } catch (e) {
                    console.error('\n❌ FAILED: Could not parse API response');
                    console.error(`   Error: ${e.message}`);
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            console.error('\n❌ FAILED: Network error');
            console.error(`   Error: ${e.message}`);
            resolve(false);
        });

        req.write(postData);
        req.end();
    });
}

// Run check
checkHeaderHealth().then(healthy => {
    if (healthy) {
        console.log('\n🚀 Safe to deploy!\n');
        process.exit(0);
    } else {
        console.error('\n🛑 DO NOT DEPLOY - Header is broken!\n');
        process.exit(1);
    }
});
