import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBankrollExport } from '../src/lib/bankroll/exportDownload.mjs';

test('the printable report downloads the authenticated PDF bytes', async () => {
    const pdf = Uint8Array.of(37, 80, 68, 70);
    const evening = new Date(2026, 10, 27, 23, 30);
    const { blob, filename } = await fetchBankrollExport('pdf', 'test-token', (url, init) => {
        assert.equal(url, '/api/bankroll/export-pdf?today=2026-11-27');
        assert.deepEqual(init, { method: 'GET', headers: { Authorization: 'Bearer test-token' } });
        return new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } });
    }, evening);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), pdf);
    assert.equal(filename, 'bankroll-report-2026-11-27.pdf', 'the file is named with the local day, not the UTC day');
});

for (const format of ['csv', 'json']) {
    test(`${format} uses the authenticated ledger export and retains the response data`, async () => {
        const fixtures = { content: 'Date,Net P/L\n', data: [{ net_pl: 10 }], summary: { sessions: 1 } };
        const { blob, filename } = await fetchBankrollExport(format, 'test-token', (url, init) => {
            assert.equal(url, '/api/bankroll/export');
            assert.equal(init.method, 'POST');
            assert.equal(init.headers.Authorization, 'Bearer test-token');
            assert.deepEqual(JSON.parse(init.body), { format, today: '2026-11-27' });
            return Response.json({ success: true, ...fixtures, filename: `report.${format}` });
        }, new Date(2026, 10, 27, 23, 30));
        assert.equal(filename, `report.${format}`);
        if (format === 'csv') assert.equal(await blob.text(), fixtures.content);
        else assert.deepEqual(JSON.parse(await blob.text()), { entries: fixtures.data, summary: fixtures.summary });
    });
}

test('denied access and empty ledger responses cannot create a download', async () => {
    await assert.rejects(fetchBankrollExport('pdf', 'test-token', () => new Response(null, { status: 403 })), /Access Is Required/);
    await assert.rejects(fetchBankrollExport('csv', 'test-token', () => Response.json({ success: false, message: 'No entries to export' })), /No entries to export/);
});
