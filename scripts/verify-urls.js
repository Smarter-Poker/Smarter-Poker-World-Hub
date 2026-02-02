#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

const lines = fs.readFileSync('/tmp/venues_to_verify.txt', 'utf8').split('\n').filter(l => l.trim());

console.log(`Verifying ${lines.length} venues...`);

const results = [];
let verified = 0;
let invalid = 0;
let noUrl = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split('\t');
    const venue = parts[0].trim();
    const url = parts[1] ? parts[1].trim() : '';

    if (!url || url === 'Not available') {
        results.push({ venue, url: '', status: 'no_url' });
        noUrl++;
        continue;
    }

    // Check URL with curl
    try {
        const result = execSync(
            `curl -s -o /dev/null -w "%{http_code}" -A "Mozilla/5.0" --max-time 8 "${url}"`,
            { encoding: 'utf8', timeout: 12000 }
        ).trim();

        if (result === '200' || result === '301' || result === '302') {
            results.push({ venue, url, status: 'valid' });
            verified++;
            console.log(`[${i+1}] ✓ ${venue}`);
        } else if (result === '404') {
            results.push({ venue, url: '', status: 'invalid_404' });
            invalid++;
            console.log(`[${i+1}] ✗ ${venue} - 404`);
        } else {
            // Other codes (403 cloudflare, etc) - keep URL as it might still be valid
            results.push({ venue, url, status: 'code_' + result });
            verified++;
            console.log(`[${i+1}] ? ${venue} - ${result}`);
        }
    } catch (e) {
        // Timeout or error - keep URL
        results.push({ venue, url, status: 'error' });
        verified++;
        console.log(`[${i+1}] ! ${venue} - timeout/error`);
    }
}

// Output results
console.log('\n=== RESULTS ===');
console.log(`Verified/Kept: ${verified}`);
console.log(`Invalid (404): ${invalid}`);
console.log(`No URL: ${noUrl}`);

// Write output file
const output = results.map(r => `${r.venue}\t${r.url}`).join('\n');
fs.writeFileSync('/tmp/verified_venues.txt', 'VENUE\tPokerAtlasURL\n' + output);
console.log('\nOutput written to /tmp/verified_venues.txt');
