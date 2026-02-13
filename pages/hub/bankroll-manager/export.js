/**
 * Bankroll Manager - Export Data (Fully wired)
 */

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import toast from '../../../src/stores/toastStore';

export default function BankrollExport() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const [exporting, setExporting] = useState(null); // 'csv' | 'json' | 'pdf' | null

    const handleExport = async (format) => {
        if (!userId) {
            toast.error('Please sign in to export data');
            return;
        }
        if (exporting) return; // prevent double-click

        setExporting(format);

        try {
            if (format === 'pdf') {
                // PDF uses a separate endpoint
                const res = await fetch('/api/bankroll/export-pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                });
                const data = await res.json();
                if (data.success && data.url) {
                    window.open(data.url, '_blank');
                    toast.success('PDF report generated');
                } else {
                    toast.error(data.message || data.error || 'PDF export failed');
                }
                setExporting(null);
                return;
            }

            const res = await fetch('/api/bankroll/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, format })
            });
            const data = await res.json();

            if (format === 'csv') {
                if (data.success && data.content) {
                    const blob = new Blob([data.content], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = data.filename || `bankroll_export_${new Date().toISOString().split('T')[0]}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success(`Exported ${data.summary?.sessions || 0} sessions to CSV`);
                } else {
                    toast.error(data.message || 'No entries to export');
                }
            } else if (format === 'json') {
                if (data.success && data.data) {
                    const exportPayload = { entries: data.data, summary: data.summary };
                    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = data.filename || `bankroll_export_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success(`Exported ${data.summary?.sessions || 0} sessions to JSON`);
                } else {
                    toast.error(data.message || 'No entries to export');
                }
            }
        } catch (err) {
            console.error(`[Export] ${format} failed:`, err);
            toast.error(`${format.toUpperCase()} export failed`);
        }

        setExporting(null);
    };

    const formats = [
        {
            id: 'csv',
            label: 'CSV Format',
            description: 'Compatible with Excel and Google Sheets',
            icon: '📊',
        },
        {
            id: 'json',
            label: 'JSON Format',
            description: 'For developers and data analysis',
            icon: '📄',
        },
        {
            id: 'pdf',
            label: 'PDF Report',
            description: 'Formatted report with charts and graphs',
            icon: '📑',
        },
    ];

    return (
        <>
            <Head>
                <title>Export Data | Bankroll Manager</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/bankroll-manager')}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            <img src="/images/btn-back.png" alt="Back" style={{ height: 32 }} />
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '12px' }}>
                            📥 Export Data
                        </h1>
                        <p style={{ color: '#9ca3af', marginBottom: '40px' }}>
                            Download your bankroll data in various formats
                        </p>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {formats.map((fmt) => (
                                <div
                                    key={fmt.id}
                                    onClick={() => handleExport(fmt.id)}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '24px',
                                        cursor: exporting ? 'wait' : 'pointer',
                                        transition: 'all 0.2s',
                                        opacity: exporting && exporting !== fmt.id ? 0.5 : 1,
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                                {fmt.icon} {fmt.label}
                                            </div>
                                            <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                                {fmt.description}
                                            </div>
                                        </div>
                                        <button
                                            disabled={!!exporting}
                                            style={{
                                                background: exporting === fmt.id ? '#065f46' : '#10b981',
                                                border: 'none',
                                                color: '#fff',
                                                padding: '10px 20px',
                                                borderRadius: '8px',
                                                cursor: exporting ? 'wait' : 'pointer',
                                                fontWeight: 'bold',
                                                minWidth: 90,
                                            }}
                                        >
                                            {exporting === fmt.id ? 'Exporting…' : 'Export'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
