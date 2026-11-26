import { useRef, useState } from 'react';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';
import { getFreshAccessToken } from '../../lib/authUtils';
import toast from '../../stores/toastStore';
import { fetchBankrollExport } from '../../lib/bankroll/exportDownload.mjs';
import layout from '../../../styles/BankrollManager.module.css';

const FORMATS = [
    { id: 'csv', label: 'CSV', description: 'Session Rows For Excel Or Google Sheets' },
    { id: 'json', label: 'JSON', description: 'Structured Ledger Entries And Summary' },
    { id: 'pdf', label: 'PDF', description: 'Printable Bankroll Report' },
];

export default function BankrollExportFormats() {
    const busy = useRef(false);
    const [exporting, setExporting] = useState(null);

    async function download(format) {
        if (busy.current || !requireOnlineNow(toast)) return;
        busy.current = true;
        setExporting(format);
        try {
            const token = await getFreshAccessToken();
            if (!token) throw new Error('Please Sign In To Export Your Bankroll');
            const { blob, filename } = await fetchBankrollExport(format, token);
            const href = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = href;
            link.download = filename;
            document.body.appendChild(link);
            try {
                link.click();
            } finally {
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(href), 1000);
            }
            toast.success(`${format.toUpperCase()} Report Downloaded`);
        } catch (error) {
            toast.error(error.message || 'Export Failed');
        } finally {
            busy.current = false;
            setExporting(null);
        }
    }

    return (
        <ul className={layout.exportList} aria-label="Export Formats">
            {FORMATS.map(format => (
                <li className={layout.exportRow} key={format.id}>
                    <div>
                        <h2>{format.label}</h2>
                        <p>{format.description}</p>
                    </div>
                    <button type="button" className="sd-button sd-primary" disabled={!!exporting}
                        aria-label={`Export ${format.label}`} onClick={() => download(format.id)}>
                        {exporting === format.id ? 'Exporting…' : 'Export'}
                    </button>
                </li>
            ))}
        </ul>
    );
}
