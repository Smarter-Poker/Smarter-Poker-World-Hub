/**
 * Bankroll Manager - Export Data
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function BankrollExport() {
    const router = useRouter();

    const handleExport = (format) => {
        // TODO: Implement export logic
        alert(`Exporting data as ${format.toUpperCase()}...`);
    };

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
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                color: '#10b981',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Bankroll Manager
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '12px' }}>
                            📥 Export Data
                        </h1>
                        <p style={{ color: '#9ca3af', marginBottom: '40px' }}>
                            Download your bankroll data in various formats
                        </p>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            <div
                                onClick={() => handleExport('csv')}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    padding: '24px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                            📊 CSV Format
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            Compatible with Excel and Google Sheets
                                        </div>
                                    </div>
                                    <button style={{
                                        background: '#10b981',
                                        border: 'none',
                                        color: '#fff',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}>
                                        Export
                                    </button>
                                </div>
                            </div>

                            <div
                                onClick={() => handleExport('json')}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    padding: '24px',
                                    cursor: 'pointer'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                            📄 JSON Format
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            For developers and data analysis
                                        </div>
                                    </div>
                                    <button style={{
                                        background: '#10b981',
                                        border: 'none',
                                        color: '#fff',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}>
                                        Export
                                    </button>
                                </div>
                            </div>

                            <div
                                onClick={() => handleExport('pdf')}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    padding: '24px',
                                    cursor: 'pointer'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                            📑 PDF Report
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            Formatted report with charts and graphs
                                        </div>
                                    </div>
                                    <button style={{
                                        background: '#10b981',
                                        border: 'none',
                                        color: '#fff',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}>
                                        Export
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
