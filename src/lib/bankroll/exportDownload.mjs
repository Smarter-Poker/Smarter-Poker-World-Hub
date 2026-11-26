// The PDF endpoint streams a document. CSV and JSON return file data and a suggested filename.
export async function fetchBankrollExport(format, token, fetcher = fetch) {
    const pdf = format === 'pdf';
    if (!pdf && format !== 'json' && format !== 'csv') throw new Error('Unknown Export Format');
    const authorization = { Authorization: `Bearer ${token}` };
    const response = pdf
        ? await fetcher('/api/bankroll/export-pdf', { method: 'GET', headers: authorization })
        : await fetcher('/api/bankroll/export', {
            method: 'POST',
            headers: { ...authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({ format }),
        });
    if (!response.ok) {
        if (response.status === 403) throw new Error('Bankroll Pro Or VIP Access Is Required');
        if (response.status === 401) throw new Error('Please Sign In To Export Your Bankroll');
        throw new Error(`${format.toUpperCase()} Export Failed`);
    }
    const date = new Date().toISOString().slice(0, 10);
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
