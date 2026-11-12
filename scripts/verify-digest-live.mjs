import { pathToFileURL } from 'node:url';
import { signViewToken } from '../src/lib/dailyDigest/delivery.mjs';

/** One explicit read against the owning production route; never sends mail. */
export async function verifyDigestLive({ day, expectedSha, fetchImpl = fetch }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || Number.isNaN(Date.parse(`${day}T12:00:00Z`))) throw new Error('Invalid report day');
    if (!/^[0-9a-f]{40}$/.test(expectedSha || '')) throw new Error('Expected a full protected revision');
    if (!process.env.CRON_SECRET?.trim()) throw new Error('CRON_SECRET is not configured');
    const health = await fetchImpl('https://smarter.poker/api/health', { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!health.ok) throw new Error(`Production health returned ${health.status}`);
    const identity = await health.json();
    if (identity.version !== expectedSha) throw new Error('Production revision differs from the requested witness');
    const token = signViewToken(day, 1);
    let response;
    try {
        response = await fetchImpl(`https://smarter.poker/api/digest/view?t=${encodeURIComponent(token)}`, {
            signal: AbortSignal.timeout(270000), cache: 'no-store', redirect: 'error',
        });
    } catch { throw new Error('Production digest request failed'); }
    if (!response.ok) throw new Error(`Production digest returned ${response.status}`);
    const html = await response.text();
    if (!/text\/html/.test(response.headers.get('content-type') || '')) throw new Error('Digest did not return HTML');
    if (!/no-store/.test(response.headers.get('cache-control') || '')) throw new Error('Digest response can be cached');
    for (const section of ['Daily Update', 'Weekly Update', 'Monthly Update', 'Real Player Totals', 'Diamond Spins', 'Free Buy And Guarantee Funding']) {
        if (!html.includes(section)) throw new Error(`Missing ${section}`);
    }
    if (!(html.indexOf('Daily Update') < html.indexOf('Weekly Update') && html.indexOf('Weekly Update') < html.indexOf('Monthly Update'))) {
        throw new Error('Top update cards out of order');
    }
    const failure = /Player totals could not be built|Report Unavailable|canceling statement|statement timeout/i.exec(html);
    if (failure) {
        // Report only a maintained heading and error category, never HTML,
        // player data, the signed URL or the server's raw error message.
        const sections = ['Real Player Totals', 'Diamond Spins', 'Free Buy And Guarantee Funding'];
        const section = sections.map(name => ({ name, at: html.lastIndexOf(name, failure.index) }))
            .filter(({ at }) => at >= 0).sort((a, b) => b.at - a.at)[0]?.name || 'Unknown section';
        const category = /timeout|canceling statement/i.test(failure[0]) ? 'Statement timeout'
            : /Player totals/i.test(failure[0]) ? 'Player totals unavailable' : 'Report unavailable';
        throw new Error(`A live report section failed: ${section} (${category})`);
    }
    for (const label of ['Horse Cash Result (Chips)', 'Horse Tournament Result (Chips)', 'Human Cash Result (Chips)', 'Human Tournament Result (Chips)', 'Kingfish Result (Included In Human Totals)', 'Daily Chip Reconciliation', 'Chip Supply Verification']) {
        if (!html.includes(label)) throw new Error(`Missing daily result row: ${label}`);
    }
    if (/UNVERIFIED/.test(html)) throw new Error('Daily chip reconciliation is unverified');
    const at = html.indexOf('Daily Chip Reconciliation');
    const reconciliationRow = html.slice(at, html.indexOf('</tr>', at));
    const chipReconciliation = reconciliationRow.includes('BALANCED: 0') ? 'balanced' : reconciliationRow.includes('DISCREPANCY:') ? 'discrepancy' : 'unknown';
    if (chipReconciliation === 'unknown') throw new Error('Daily chip reconciliation outcome missing');
    const alertFixes = [...html.matchAll(/>([A-Za-z][A-Za-z0-9_.-]*): ([\d,]+) of ([\d,]+) verified fixed(?:[^<]*)</g)]
        .map(([, alertname, verified, total]) => ({ alertname, verified: Number(verified.replaceAll(',', '')), total: Number(total.replaceAll(',', '')) }));
    return { day, revision: identity.version, deploymentId: identity.deploymentId, reportBytes: Buffer.byteLength(html), playerTotals: 'rendered', dailyResults: 'rendered', kingfishIncluded: true, chipReconciliation, spins: 'rendered', freeBuyFunding: 'rendered', alertFixes, observedAt: new Date().toISOString() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try { console.log(JSON.stringify(await verifyDigestLive({ day: process.env.DIGEST_DAY, expectedSha: process.env.DIGEST_EXPECTED_SHA }))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
