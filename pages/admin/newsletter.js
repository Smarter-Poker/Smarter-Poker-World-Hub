import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
    ArrowLeft, CheckCircle2, Clock3, Mail, Radio, RefreshCw,
    Search, Send, ShieldCheck, Users, XCircle,
} from 'lucide-react';
import { getFreshAccessToken } from '../../src/lib/authUtils';
import styles from '../../src/components/admin/NewsletterOperations.module.css';

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function Status({ value }) {
    return <span className={`${styles.status} ${styles[`status_${value}`] || ''}`}>{value}</span>;
}

export default function NewsletterOperations() {
    const [token, setToken] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [days, setDays] = useState(7);
    const [articleLimit, setArticleLimit] = useState(8);
    const [preview, setPreview] = useState(null);
    const [running, setRunning] = useState('');

    const load = useCallback(async (sessionToken = token, nextPage = page, term = search) => {
        if (!sessionToken) return;
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ page: String(nextPage), pageSize: '25' });
            if (term.trim()) params.set('search', term.trim());
            const response = await fetch(`/api/admin/newsletter?${params}`, {
                headers: { Authorization: `Bearer ${sessionToken}` },
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load newsletter operations');
            setData(body);
        } catch (err) {
            setError(err.message || 'Unable to load newsletter operations');
        } finally {
            setLoading(false);
        }
    }, [page, search, token]);

    useEffect(() => {
        let active = true;
        getFreshAccessToken().then((sessionToken) => {
            if (!active) return;
            setToken(sessionToken || '');
            if (!sessionToken) {
                setError('Sign in with an administrator account to continue.');
                setLoading(false);
                return;
            }
            load(sessionToken, 1, '');
        });
        return () => { active = false; };
        // Initial auth bootstrap only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runDigest = async (dryRun) => {
        if (!token) return;
        if (!dryRun && !window.confirm(`Send this newsletter to ${preview?.recipients ?? data?.stats?.active ?? 0} active subscribers now? This cannot be undone.`)) return;
        setRunning(dryRun ? 'preview' : 'send');
        setError('');
        try {
            const params = new URLSearchParams({
                dryRun: dryRun ? '1' : '0',
                days: String(days),
                limit: String(articleLimit),
            });
            const response = await fetch(`/api/news/digest?${params}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Newsletter operation failed');
            if (dryRun) setPreview(body);
            else {
                setPreview(null);
                await load(token, 1, search);
            }
        } catch (err) {
            setError(err.message || 'Newsletter operation failed');
        } finally {
            setRunning('');
        }
    };

    const setSubscriberStatus = async (subscriber, isActive) => {
        setRunning(subscriber.id);
        setError('');
        try {
            const response = await fetch('/api/admin/newsletter', {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: subscriber.id, is_active: isActive }),
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Subscriber update failed');
            await load(token, page, search);
        } catch (err) {
            setError(err.message || 'Subscriber update failed');
        } finally {
            setRunning('');
        }
    };

    const searchSubscribers = (event) => {
        event.preventDefault();
        setPage(1);
        load(token, 1, search);
    };

    return (
        <>
            <Head>
                <title>Newsletter Operations | Smarter.Poker Admin</title>
                <meta name="robots" content="noindex,nofollow" />
            </Head>
            <main className={styles.page}>
                <header className={styles.header}>
                    <div>
                        <Link href="/hub/news" className={styles.back}><ArrowLeft size={15} /> News Hub</Link>
                        <p className={styles.eyebrow}><Radio size={13} /> Live Intelligence Wire</p>
                        <h1>Newsletter Operations</h1>
                        <p className={styles.subtitle}>Compose From Verified Stories, Inspect The Audience, Dispatch Once, And Retain An Audit Trail.</p>
                    </div>
                    <button className={styles.refresh} onClick={() => load()} disabled={loading || !token}>
                        <RefreshCw size={15} className={loading ? styles.spin : ''} /> Refresh
                    </button>
                </header>

                {error && <div className={styles.error} role="alert"><XCircle size={16} /> {error}</div>}

                <section className={styles.signalGrid} aria-label="Newsletter health">
                    <article><Users size={17} /><span>Active Audience</span><strong>{data?.stats?.active ?? '-'}</strong></article>
                    <article><Mail size={17} /><span>Opted Out</span><strong>{data?.stats?.inactive ?? '-'}</strong></article>
                    <article><Send size={17} /><span>Recorded Campaigns</span><strong>{data?.stats?.campaigns ?? '-'}</strong></article>
                    <article><Clock3 size={17} /><span>Last Dispatch</span><strong className={styles.dateValue}>{formatDate(data?.stats?.last_sent_at)}</strong></article>
                </section>

                <section className={styles.dispatch}>
                    <div className={styles.sectionHeading}>
                        <div>
                            <p className={styles.eyebrow}>Dispatch Circuit</p>
                            <h2>Build The Next Wire</h2>
                        </div>
                        <ShieldCheck size={22} />
                    </div>
                    <div className={styles.dispatchBody}>
                        <div className={styles.controls}>
                            <label>
                                Story Window
                                <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setPreview(null); }}>
                                    <option value={1}>Past 24 Hours</option>
                                    <option value={3}>Past 3 Days</option>
                                    <option value={7}>Past 7 Days</option>
                                    <option value={14}>Past 14 Days</option>
                                </select>
                            </label>
                            <label>
                                Story Count
                                <select value={articleLimit} onChange={(e) => { setArticleLimit(Number(e.target.value)); setPreview(null); }}>
                                    {[5, 6, 8, 10, 12].map((count) => <option key={count} value={count}>{count} Stories</option>)}
                                </select>
                            </label>
                            <button className={styles.previewButton} onClick={() => runDigest(true)} disabled={Boolean(running)}>
                                {running === 'preview' ? <RefreshCw size={15} className={styles.spin} /> : <Radio size={15} />}
                                Run Safe Preview
                            </button>
                            <button className={styles.sendButton} onClick={() => runDigest(false)} disabled={Boolean(running) || !preview || preview.recipients === 0}>
                                {running === 'send' ? <RefreshCw size={15} className={styles.spin} /> : <Send size={15} />}
                                Confirm And Send
                            </button>
                        </div>
                        <div className={styles.preview}>
                            {preview ? (
                                <>
                                    <p className={styles.previewLabel}>Validated Dispatch</p>
                                    <h3>{preview.subject || 'No publishable stories found'}</h3>
                                    <dl>
                                        <div><dt>Recipients</dt><dd>{preview.recipients}</dd></div>
                                        <div><dt>Stories</dt><dd>{preview.articles}</dd></div>
                                        <div><dt>Email Provider</dt><dd>{preview.emailConfigured ? 'Ready' : 'Not configured'}</dd></div>
                                    </dl>
                                    <p>No Email Was Sent During This Preview.</p>
                                </>
                            ) : (
                                <div className={styles.previewEmpty}>
                                    <Radio size={28} />
                                    <p>Run A Preview To Resolve The Real Subject, Current Stories, And Exact Active Audience Before Send Unlocks.</p>
                                </div>
                            )}
                        </div>
                        <aside className={styles.storyRail}>
                            <p className={styles.previewLabel}>Latest Eligible Signals</p>
                            {(data?.recentArticles || []).slice(0, 8).map((article, index) => (
                                <div key={article.id}>
                                    <span>{String(index + 1).padStart(2, '0')}</span>
                                    <p>{article.title}<small>{article.source_name} · {formatDate(article.published_at)}</small></p>
                                </div>
                            ))}
                        </aside>
                    </div>
                </section>

                <section className={styles.panel}>
                    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Audit Trail</p><h2>Campaign History</h2></div></div>
                    <div className={styles.tableWrap}>
                        <table>
                            <thead><tr><th>Subject</th><th>Status</th><th>Audience</th><th>Delivered</th><th>Started</th></tr></thead>
                            <tbody>
                                {(data?.campaigns || []).map((campaign) => (
                                    <tr key={campaign.id}>
                                        <td>{campaign.subject}</td>
                                        <td><Status value={campaign.status} /></td>
                                        <td>{campaign.recipient_count}</td>
                                        <td>{campaign.sent_count}{campaign.failed_count ? ` / ${campaign.failed_count} failed` : ''}</td>
                                        <td>{formatDate(campaign.started_at)}</td>
                                    </tr>
                                ))}
                                {!loading && !(data?.campaigns || []).length && <tr><td colSpan="5" className={styles.emptyCell}>No Campaign Has Been Sent Yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className={styles.panel}>
                    <div className={styles.subscriberHeader}>
                        <div><p className={styles.eyebrow}>Audience Control</p><h2>Subscribers</h2></div>
                        <form onSubmit={searchSubscribers} className={styles.search}>
                            <Search size={15} />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email" aria-label="Search subscriber email" />
                            <button type="submit">Find</button>
                        </form>
                    </div>
                    <div className={styles.tableWrap}>
                        <table>
                            <thead><tr><th>Email</th><th>Source</th><th>Status</th><th>Joined</th><th>Control</th></tr></thead>
                            <tbody>
                                {(data?.subscribers || []).map((subscriber) => (
                                    <tr key={subscriber.id}>
                                        <td>{subscriber.email}</td>
                                        <td>{subscriber.source || 'unknown'}</td>
                                        <td><Status value={subscriber.is_active === false ? 'inactive' : 'active'} /></td>
                                        <td>{formatDate(subscriber.subscribed_at || subscriber.created_at)}</td>
                                        <td>
                                            <button className={styles.rowAction} onClick={() => setSubscriberStatus(subscriber, subscriber.is_active === false)} disabled={running === subscriber.id}>
                                                {subscriber.is_active === false ? 'Reactivate' : 'Deactivate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!loading && !(data?.subscribers || []).length && <tr><td colSpan="5" className={styles.emptyCell}>No Subscribers Match This View.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div className={styles.pagination}>
                        <button disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); load(token, next, search); }}>Previous</button>
                        <span>Page {data?.subscriberPagination?.page || page} Of {data?.subscriberPagination?.pages || 1}</span>
                        <button disabled={page >= (data?.subscriberPagination?.pages || 1)} onClick={() => { const next = page + 1; setPage(next); load(token, next, search); }}>Next</button>
                    </div>
                </section>
            </main>
        </>
    );
}
