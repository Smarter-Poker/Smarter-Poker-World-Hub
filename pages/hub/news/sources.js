/**
 * News - Sources
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function NewsSources() {
    const router = useRouter();

    const sources = [
        { id: 1, name: 'PokerNews', enabled: true, articles: 1247 },
        { id: 2, name: 'CardPlayer', enabled: true, articles: 892 },
        { id: 3, name: 'PokerStrategy', enabled: false, articles: 654 },
    ];

    return (
        <>
            <Head>
                <title>News Sources | News Hub</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/news')}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: '20px' }}
                        >
                            <img src="/images/btn-back.png" alt="Back" style={{ height: 32 }} />
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '12px' }}>
                            📰 News Sources
                        </h1>
                        <p style={{ color: '#9ca3af', marginBottom: '40px' }}>
                            Manage which news sources appear in your feed
                        </p>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {sources.map(source => (
                                <div
                                    key={source.id}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '20px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                            {source.name}
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            {source.articles} articles
                                        </div>
                                    </div>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={source.enabled}
                                            onChange={() => { }}
                                            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                        />
                                        <span style={{ color: source.enabled ? '#10b981' : '#9ca3af' }}>
                                            {source.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
