#!/usr/bin/env node
/**
 * Verify all PokerAtlas URLs in the venue master list
 * Returns HTTP status for each URL
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'data', 'verified-venues-master.csv');
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.trim().split('\n');

console.log('═══════════════════════════════════════════════════════════');
console.log('🔍 VERIFYING ALL POKERATLAS URLS');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

const results = {
    valid: [],
    invalid: [],
    missing: [],
    errors: []
};

// Skip header
for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Parse CSV properly (handle commas in fields)
    const parts = line.match(/(".*?"|[^,]+)(?=,|$)/g) || [];

    if (parts.length < 9) continue;

    const venue = parts[0]?.replace(/"/g, '').trim();
    const url = parts[8]?.replace(/"/g, '').trim();

    if (!venue) continue;

    if (!url || url === '' || url === 'Not available' || url === '-') {
        results.missing.push({ venue, url: 'MISSING' });
        continue;
    }

    if (!url.startsWith('http')) {
        results.missing.push({ venue, url: 'INVALID FORMAT: ' + url });
        continue;
    }

    try {
        const cmd = `curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${url}"`;
        const status = execSync(cmd, { encoding: 'utf8' }).trim();

        if (status === '200' || status === '403') {
            // 403 = Cloudflare protection but page exists
            results.valid.push({ venue, url, status });
            process.stdout.write('.');
        } else if (status === '404') {
            results.invalid.push({ venue, url, status });
            process.stdout.write('X');
        } else {
            results.errors.push({ venue, url, status });
            process.stdout.write('?');
        }
    } catch (e) {
        results.errors.push({ venue, url, status: 'ERROR' });
        process.stdout.write('!');
    }
}

console.log('\n');
console.log('═══════════════════════════════════════════════════════════');
console.log('RESULTS SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
console.log(`✓ Valid URLs (200/403): ${results.valid.length}`);
console.log(`✗ Invalid URLs (404): ${results.invalid.length}`);
console.log(`- Missing URLs: ${results.missing.length}`);
console.log(`? Errors: ${results.errors.length}`);
console.log('');

if (results.invalid.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('INVALID URLs (404 - Need replacement):');
    console.log('═══════════════════════════════════════════════════════════');
    results.invalid.forEach(r => {
        console.log(`  ${r.venue}`);
        console.log(`    ${r.url}`);
    });
    console.log('');
}

if (results.missing.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('MISSING URLs (Need to find):');
    console.log('═══════════════════════════════════════════════════════════');
    results.missing.slice(0, 50).forEach(r => {
        console.log(`  ${r.venue}`);
    });
    if (results.missing.length > 50) {
        console.log(`  ... and ${results.missing.length - 50} more`);
    }
}

// Save results
fs.writeFileSync('/tmp/url-verification-results.json', JSON.stringify(results, null, 2));
console.log('\nFull results saved to /tmp/url-verification-results.json');
