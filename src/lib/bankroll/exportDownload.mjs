import { localDay } from './localDates.mjs';

// The PDF endpoint streams a document. CSV and JSON return file data and a suggested filename.
export async function fetchBankrollExport(format, token, fetcher = fetch, now = new Date()) {
    // File names carry the player's own calendar day, not the server's UTC day.
    const date = localDay(now);
    const pdf = format === 'pdf';
    if (!pdf && format !== 'json' && format !== 'csv') throw new Error('Unknown Export Format');
    const authorization = { Authorization: `Bearer ${token}` };
    const response = pdf
        ? await fetcher(`/api/bankroll/export-pdf?today=${date}`, { method: 'GET', headers: authorization })
        : await fetcher('/api/bankroll/export', {
            method: 'POST',
            headers: { ...authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({ format, today: date }),
        });
    if (!response.ok) {
        if (response.status === 403) throw new Error('Bankroll Pro Or VIP Access Is Required');
        if (response.status === 401) throw new Error('Please Sign In To Export Your Bankroll');
        throw new Error(`${format.toUpperCase()} Export Failed`);
    }
    if (pdf) {
        if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('PDF Export Failed');
        return { blob: await response.blob(), filename: `bankroll-report-${date}.pdf` };
    }
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'No Entries To Export');
    const csv = format === 'csv';
    if (csv ? typeof result.content !== 'string' : !Array.isArray(result.data)) throw new Error('Invalid Export File');
    const data = csv ? result.content : JSON.stringify({ entries: result.data, summary: result.summary }, null, 2);
    return {
        blob: new Blob([data], { type: csv ? 'text/csv' : 'application/json' }),
        filename: result.filename || `bankroll_export_${date}.${format}`,
    };
}
