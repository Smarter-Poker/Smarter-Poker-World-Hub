import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import OperatorGlyph from '../../src/components/admin/OperatorGlyph';
import { getFreshAccessToken } from '../../src/lib/authUtils';
import styles from '../../src/components/admin/NewsletterOperations.module.css';

const INITIAL_PROMO_DRAFT = {
    subject: 'Claim 25 Free Chips, 30-Day Free VIP & 500 Free Diamonds on Smarter.Poker',
    headline: '25 Free Chips + 30-Day Free VIP + 500 Free Diamonds',
    body: 'Train with GTO poker tools, discover live poker games near you, and take a seat in Club Arena on Smarter.Poker.\n\nCreate your free account through this exclusive promotion and verify your phone number to instantly receive 25 Free Chips in Kings Club (Club Code 25450), a 30-Day Free VIP Card, and 500 Free Diamonds.',
    ctaLabel: 'Claim Your Free Rewards',
    ctaUrl: 'https://smarter.poker/auth/signup?redirect=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450',
    smsBody: 'Smarter.Poker: Claim 25 Free Chips + 30-Day Free VIP + 500 Free Diamonds in Kings Club (Code 25450): https://smarter.poker/go/promo Reply STOP to opt out.',
    postalAddress: 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453',
    channels: 'both',
    scope: 'non_accounts',
};

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
    const [notice, setNotice] = useState('');
    // `error` is the banner channel: every action on this page writes to it. The
    // counters must NOT read it. A failed subscriber PATCH or a failed digest run
    // says nothing about whether the counters were read, and blanking good numbers
    // on an unrelated failure is the same guessing this page exists to stop.
    // `loadError` belongs to the counter read and to nothing else.
    const [loadError, setLoadError] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [days, setDays] = useState(7);
    const [articleLimit, setArticleLimit] = useState(8);
    const [preview, setPreview] = useState(null);
    const [running, setRunning] = useState('');

    // Promotional campaign & bulk lead import state
    const [promoMeta, setPromoMeta] = useState(null);
    const [promoDraft, setPromoDraft] = useState(INITIAL_PROMO_DRAFT);
    const [promoTouched, setPromoTouched] = useState(false);
    const [promoPreview, setPromoPreview] = useState(null);
    const [promoInlineNotice, setPromoInlineNotice] = useState('');
    const [promoInlineError, setPromoInlineError] = useState('');
    const [testEmail, setTestEmail] = useState('');
    const [testPhone, setTestPhone] = useState('');
    const [leadInput, setLeadInput] = useState('');
    const [importResult, setImportResult] = useState(null);

    // A counter that reads the same when it is loading, when the request failed and
    // when the answer is genuinely zero is not reporting, it is guessing on the operator's
    // behalf. Loading, failed and read-but-empty are three different facts and are shown
    // as three different strings.
    const statValue = (value) => {
        // DEFECT 4: a counter that was read successfully keeps reporting its number.
        // Only the absence of a successful counter read is 'Unavailable', and only
        // loadError (not the page-wide banner) decides that.
        if (data) return value ?? '-';
        if (loading) return 'Reading';
        return loadError ? 'Unavailable' : 'Not Read';
    };

    // DEFECT 5: Last Dispatch has four states, not one dash. Still reading, the read
    // failed, the read succeeded and nothing has ever been dispatched, and an actual
    // timestamp are four different facts and are shown as four different strings.
    const lastDispatchValue = () => {
        if (!data) {
            if (loading) return 'Reading';
            return loadError ? 'Unavailable' : 'Not Read';
        }
        const raw = data?.stats?.last_sent_at;
        if (!raw) return 'Never Dispatched';
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? 'Unreadable Date' : parsed.toLocaleString();
    };

    const load = useCallback(async (sessionToken = token, nextPage = page, term = search) => {
        if (!sessionToken) return;
        setLoading(true);
        setError('');
        setLoadError('');
        try {
            const params = new URLSearchParams({ page: String(nextPage), pageSize: '25' });
            if (term.trim()) params.set('search', term.trim());
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            let body;
            try {
                const response = await fetch(`/api/admin/newsletter?${params}`, {
                    headers: { Authorization: `Bearer ${sessionToken}` },
                    signal: controller.signal,
                });
                // DEFECT 3: the body read stays INSIDE the armed abort window.
                body = await response.json();
                if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load newsletter operations');
            } finally {
                clearTimeout(timer);
            }
            setData(body);
        } catch (err) {
            // DEFECT 6: err may not be an Error.
            const message = err?.name === 'AbortError'
                ? 'The newsletter service did not respond within 15 seconds. The counters below are unread, not zero.'
                : err?.message || 'Unable to load newsletter operations';
            setError(message);
            setLoadError(message);
        } finally {
            setLoading(false);
        }
    }, [page, search, token]);

    const loadPromoConfig = useCallback(async (sessionToken) => {
        if (!sessionToken) return;
        try {
            const response = await fetch('/api/news/promo-campaign', {
                headers: { Authorization: `Bearer ${sessionToken}` },
            });
            const body = await response.json();
            if (response.ok && body?.success) {
                setPromoMeta(body);
                if (body.defaultDraft) {
                    setPromoDraft((prev) => (promoTouched ? prev : { ...prev, ...body.defaultDraft }));
                }
                if (body.viewerEmail) {
                    setTestEmail((prev) => (prev.trim() ? prev : body.viewerEmail));
                }
                if (body.viewerPhone) {
                    setTestPhone((prev) => (prev.trim() ? prev : body.viewerPhone));
                }
            }
        } catch (_err) {
            // Non-blocking metadata load; individual actions report their own errors.
        }
    }, [promoTouched]);

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
            loadPromoConfig(sessionToken);
        });
        return () => { active = false; };
        // Initial auth bootstrap only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updatePromoField = (field, value) => {
        setPromoTouched(true);
        setPromoDraft((prev) => ({ ...prev, [field]: value }));
        setPromoPreview(null);
    };

    const runPromoAction = async (action) => {
        if (!token) {
            setPromoInlineError('Sign In With An Administrator Account To Continue.');
            return;
        }
        if (action === 'test' && !testEmail.trim() && !testPhone.trim()) {
            setPromoInlineError('Enter A Test Email Address Or US Mobile Number Above First.');
            return;
        }
        if (action === 'send') {
            const count = promoPreview?.recipients || 0;
            if (!count) return;
            if (!window.confirm(`Send this Smarter.Poker promotion to ${promoPreview.emailRecipients || 0} email address(es) and ${promoPreview.smsRecipients || 0} phone number(s) now? This cannot be undone.`)) {
                return;
            }
        }
        setRunning(`promo-${action}`);
        setError('');
        setNotice('');
        setPromoInlineError('');
        setPromoInlineNotice('');
        try {
            const response = await fetch('/api/news/promo-campaign', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    ...promoDraft,
                    testEmail,
                    testPhone,
                }),
            });
            const body = await response.json();
            if (!response.ok || body.error) {
                throw new Error(body.error || 'Promotional campaign action failed');
            }
            if (action === 'preview') {
                setPromoPreview(body);
                setPromoInlineNotice(`Preview Ready: ${body.emailRecipients || 0} Deliverable Emails And ${body.smsRecipients || 0} Mobile Numbers.`);
            } else if (action === 'test') {
                const parts = [];
                if (body.emailSent) parts.push(`Email Sent To ${body.targetEmail || testEmail.trim()}`);
                if (body.smsSent) parts.push(`SMS Sent To ${body.targetPhone || testPhone.trim()}`);
                if (body.errors?.length) throw new Error(body.errors.join(' | '));
                const msg = `Test Message Sent (${parts.join(' + ') || 'Verified'}).`;
                setNotice(msg);
                setPromoInlineNotice(msg);
            } else if (action === 'send') {
                setPromoPreview(null);
                const msg = `Promotion Dispatched: ${body.emailSent || 0} Emails Sent, ${body.smsSent || 0} Texts Sent${body.failed ? `, ${body.failed} Failed` : ''}.`;
                setNotice(msg);
                setPromoInlineNotice(msg);
                await load(token, 1, search);
            }
        } catch (err) {
            const msg = err?.message || 'Promotional campaign operation failed';
            setError(msg);
            setPromoInlineError(msg);
        } finally {
            setRunning('');
        }
    };

    const importLeads = async (event) => {
        event.preventDefault();
        if (!token || !leadInput.trim()) return;
        setRunning('import-leads');
        setError('');
        setNotice('');
        try {
            const response = await fetch('/api/news/promo-campaign', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'import',
                    rawText: leadInput,
                    source: 'admin_import',
                }),
            });
            const body = await response.json();
            if (!response.ok || !body.success) {
                throw new Error(body.error || 'Contact import failed');
            }
            setImportResult(body);
            setPromoPreview(null);
            setNotice(`Imported ${body.importedEmails || 0} new email(s) and ${body.importedPhones || 0} new phone number(s).`);
            await load(token, 1, search);
        } catch (err) {
            setError(err?.message || 'Contact import failed');
        } finally {
            setRunning('');
        }
    };

    const runDigest = async (dryRun) => {
        if (!token) return;
        if (!dryRun && !window.confirm(`Send this newsletter to ${preview?.recipients ?? data?.stats?.active ?? 0} active subscribers now? This cannot be undone.`)) return;
        setRunning(dryRun ? 'preview' : 'send');
        setError('');
        setNotice('');
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
            setError(err?.message || 'Newsletter operation failed');
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
            setError(err?.message || 'Subscriber update failed');
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
                        <Link href="/hub/news" className={styles.back}><OperatorGlyph kind="back" size={15} /> News Hub</Link>
                        <p className={styles.eyebrow}><OperatorGlyph kind="radio" size={13} /> Live Intelligence Wire</p>
                        <h1>Newsletter Operations</h1>
                        <p className={styles.subtitle}>Import Leads, Dispatch Smarter.Poker Email And SMS Promotions, Run Weekly News Digests, And Retain A Complete Audit Trail.</p>
                    </div>
                    <button className={styles.refresh} onClick={() => load()} disabled={loading || !token}>
                        <OperatorGlyph kind="refresh" size={15} className={loading ? styles.spin : ''} /> Refresh
                    </button>
                </header>

                {error && <div className={styles.error} role="alert"><OperatorGlyph kind="alert" size={16} /> {error}</div>}
                {notice && <div className={styles.notice} role="status"><OperatorGlyph kind="check" size={16} /> {notice}</div>}

                <section className={styles.signalGrid} aria-label="Newsletter Health">
                    <article><OperatorGlyph kind="users" size={17} /><span>Active Audience</span><strong>{statValue(data?.stats?.active)}</strong></article>
                    <article><OperatorGlyph kind="mail" size={17} /><span>Opted Out</span><strong>{statValue(data?.stats?.inactive)}</strong></article>
                    <article><OperatorGlyph kind="send" size={17} /><span>Recorded Campaigns</span><strong>{statValue(data?.stats?.campaigns)}</strong></article>
                    <article><OperatorGlyph kind="clock" size={17} /><span>Last Dispatch</span><strong className={styles.dateValue}>{lastDispatchValue()}</strong></article>
                </section>

                <section className={styles.dispatch}>
                    <div className={styles.sectionHeading}>
                        <div>
                            <p className={styles.eyebrow}>Promotional Broadcast</p>
                            <h2>Smarter.Poker Email And SMS Campaign</h2>
                        </div>
                        <OperatorGlyph kind="spark" size={22} />
                    </div>
                    <div className={styles.promoGrid}>
                        <div className={styles.promoForm}>
                            <div className={styles.fieldRow}>
                                <label>
                                    Delivery Channels
                                    <select value={promoDraft.channels} onChange={(e) => updatePromoField('channels', e.target.value)}>
                                        <option value="both">Email And SMS</option>
                                        <option value="email">Email Only</option>
                                        <option value="sms">SMS Only</option>
                                    </select>
                                </label>
                                <label>
                                    Target Audience
                                    <select value={promoDraft.scope} onChange={(e) => updatePromoField('scope', e.target.value)}>
                                        <option value="non_accounts">New Leads Only (No Existing Account Or Club Arena)</option>
                                        <option value="subscribers_only">Imported And Subscribed List Only</option>
                                        <option value="all">Full Database Plus Imported List</option>
                                    </select>
                                </label>
                            </div>
                            <label>
                                Email Subject
                                <input value={promoDraft.subject} onChange={(e) => updatePromoField('subject', e.target.value)} placeholder="Campaign Subject Line" />
                            </label>
                            <label>
                                Email Headline
                                <input value={promoDraft.headline} onChange={(e) => updatePromoField('headline', e.target.value)} placeholder="Primary Offer Headline" />
                            </label>
                            <label>
                                Email Body Copy
                                <textarea rows={5} value={promoDraft.body} onChange={(e) => updatePromoField('body', e.target.value)} placeholder="Promotional Message Copy" />
                            </label>
                            <div className={styles.fieldRow}>
                                <label>
                                    Button Label
                                    <input value={promoDraft.ctaLabel} onChange={(e) => updatePromoField('ctaLabel', e.target.value)} placeholder="Claim Your Free Rewards" />
                                </label>
                                <label>
                                    Destination URL
                                    <input value={promoDraft.ctaUrl} onChange={(e) => updatePromoField('ctaUrl', e.target.value)} placeholder="https://smarter.poker/auth/signup" />
                                </label>
                            </div>
                            <label>
                                Postal Address Footer (CAN-SPAM)
                                <input value={promoDraft.postalAddress} onChange={(e) => updatePromoField('postalAddress', e.target.value)} placeholder="PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453" />
                            </label>
                            <label>
                                SMS Message Copy (Includes Reply STOP To Opt Out)
                                <textarea rows={3} value={promoDraft.smsBody} onChange={(e) => updatePromoField('smsBody', e.target.value)} placeholder="Smarter.Poker SMS Copy" />
                            </label>

                            <div className={styles.actionRow}>
                                <button type="button" className={styles.previewButton} onClick={() => runPromoAction('preview')} disabled={Boolean(running) || !token}>
                                    {running === 'promo-preview' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="eye" size={15} />}
                                    Run Promo Preview
                                </button>
                                <button type="button" className={styles.sendButton} onClick={() => runPromoAction('send')} disabled={Boolean(running) || !promoPreview || promoPreview.recipients === 0}>
                                    {running === 'promo-send' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="send" size={15} />}
                                    Confirm And Send Promo
                                </button>
                            </div>

                            <div className={styles.testBox}>
                                <div className={styles.fieldRow}>
                                    <label>
                                        Test Email Recipient
                                        <input value={testEmail} onChange={(e) => { setTestEmail(e.target.value); setPromoInlineError(''); }} placeholder="you@example.com" />
                                    </label>
                                    <label>
                                        Test SMS Phone
                                        <input value={testPhone} onChange={(e) => { setTestPhone(e.target.value); setPromoInlineError(''); }} placeholder="+17085551234" />
                                    </label>
                                </div>
                                <div className={styles.actionRow}>
                                    <button type="button" className={styles.previewButton} onClick={() => runPromoAction('test')} disabled={Boolean(running)}>
                                        {running === 'promo-test' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="mail" size={15} />}
                                        {running === 'promo-test' ? 'Sending Test Message...' : 'Send Single Test Message'}
                                    </button>
                                </div>
                                {promoInlineError && (
                                    <div className={styles.inlineAlert} role="alert">
                                        <OperatorGlyph kind="alert" size={15} /> {promoInlineError}
                                    </div>
                                )}
                                {promoInlineNotice && (
                                    <div className={styles.inlineSuccess} role="status">
                                        <OperatorGlyph kind="check" size={15} /> {promoInlineNotice}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={styles.promoPreview}>
                            <p className={styles.previewLabel}>Audience And Provider Readiness</p>
                            <div className={styles.senderMeta}>
                                <div>Active From Address: <strong>{promoPreview?.from || promoMeta?.from || 'Smarter.Poker News <news@smarter.poker>'}</strong></div>
                                <div>Resend Email: <strong>{(promoPreview?.emailConfigured ?? promoMeta?.emailConfigured) ? 'Ready' : 'Not Configured'}</strong> | Twilio SMS: <strong>{(promoPreview?.smsConfigured ?? promoMeta?.smsConfigured) ? 'Ready' : 'Not Configured'}</strong></div>
                            </div>
                            {promoPreview ? (
                                <>
                                    <div className={styles.breakdownGrid}>
                                        <div className={styles.breakdownCard}><span>Deduplicated Emails</span><strong>{promoPreview.emailRecipients}</strong></div>
                                        <div className={styles.breakdownCard}><span>Deduplicated Phones</span><strong>{promoPreview.smsRecipients}</strong></div>
                                        <div className={styles.breakdownCard}><span>Imported Or Subscribed</span><strong>{(promoPreview.breakdown?.subscriberEmails || 0) + (promoPreview.breakdown?.subscriberPhones || 0)}</strong></div>
                                        <div className={styles.breakdownCard}><span>{promoDraft.scope === 'non_accounts' ? 'Excluded Existing Accounts' : 'Database Accounts And Leads'}</span><strong>{promoDraft.scope === 'non_accounts' ? (promoPreview.breakdown?.excludedExistingAccounts || 0) : (promoPreview.breakdown?.profileEmails || 0) + (promoPreview.breakdown?.profilePhones || 0) + (promoPreview.breakdown?.commanderEmails || 0) + (promoPreview.breakdown?.commanderPhones || 0)}</strong></div>
                                        <div className={styles.breakdownCard}><span>Suppressed Emails</span><strong>{promoPreview.breakdown?.suppressedEmails || 0}</strong></div>
                                        <div className={styles.breakdownCard}><span>Suppressed Phones</span><strong>{promoPreview.breakdown?.suppressedPhones || 0}</strong></div>
                                    </div>
                                    <p className={styles.senderMeta}>Preview Complete. No Email Or Text Was Sent During Preview.</p>
                                </>
                            ) : (
                                <p className={styles.senderMeta}>Click Run Promo Preview To Count Deduplicated Emails And Phones And Unlock Confirm And Send Promo.</p>
                            )}

                            {(promoDraft.channels === 'both' || promoDraft.channels === 'email') && (
                                <div>
                                    <p className={styles.previewLabel}>Live Email Preview</p>
                                    <div className={styles.senderMeta} style={{ marginBottom: 8 }}>
                                        <div>Subject: <strong>{promoDraft.subject}</strong></div>
                                    </div>
                                    <div className={styles.emailPreviewCard}>
                                        <div className={styles.emailPreviewBrand}>SMARTER.POKER</div>
                                        <div className={styles.emailPreviewHeadline}>{promoDraft.headline || promoDraft.subject}</div>
                                        <div className={styles.emailPreviewBody}>{promoDraft.body}</div>
                                        <span className={styles.emailPreviewButton}>{promoDraft.ctaLabel || 'Claim Your Free Rewards'}</span>
                                        <div className={styles.emailPreviewFooter}>
                                            <div>Smarter.Poker &middot; {promoDraft.postalAddress}</div>
                                            <div>Unsubscribe &middot; Visit Smarter.Poker</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(promoDraft.channels === 'both' || promoDraft.channels === 'sms') && (
                                <div>
                                    <p className={styles.previewLabel}>Live SMS Text Preview</p>
                                    <div className={styles.smsPreviewBox}>
                                        {promoPreview?.smsPreview || promoDraft.smsBody}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <section className={styles.panel}>
                    <div className={styles.sectionHeading}>
                        <div>
                            <p className={styles.eyebrow}>List Growth</p>
                            <h2>Bulk Import Emails And Phone Numbers</h2>
                        </div>
                        <OperatorGlyph kind="package-plus" size={22} />
                    </div>
                    <form onSubmit={importLeads} className={styles.importBody}>
                        <div>
                            <label>
                                Paste Emails Or US/E.164 Phone Numbers (One Per Line Or Comma Separated)
                                <textarea
                                    rows={5}
                                    value={leadInput}
                                    onChange={(e) => setLeadInput(e.target.value)}
                                    placeholder="Enter Emails Or Phone Numbers"
                                />
                            </label>
                            <div className={styles.actionRow}>
                                <button type="submit" className={styles.sendButton} disabled={Boolean(running) || !token || !leadInput.trim()}>
                                    {running === 'import-leads' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="package-plus" size={15} />}
                                    Import Contacts
                                </button>
                            </div>
                        </div>
                        <div className={styles.importSummary}>
                            <p className={styles.previewLabel}>Import Safeguards</p>
                            <p>Every Address And Phone Number Is Validated, Deduplicated, And Cross-Checked Against Existing Opt-Outs And Bounces. Previously Unsubscribed Contacts Stay Opted Out Automatically.</p>
                            {importResult && (
                                <p>
                                    Last Import: <strong>{importResult.importedEmails}</strong> New Emails, <strong>{importResult.importedPhones}</strong> New Phones, <strong>{(importResult.alreadyActiveEmails || 0) + (importResult.alreadyActivePhones || 0)}</strong> Already Active, <strong>{importResult.optedOutPreserved || 0}</strong> Opted-Out Preserved.
                                </p>
                            )}
                        </div>
                    </form>
                </section>

                <section className={styles.dispatch}>
                    <div className={styles.sectionHeading}>
                        <div>
                            <p className={styles.eyebrow}>Dispatch Circuit</p>
                            <h2>Build The Next Wire</h2>
                        </div>
                        <OperatorGlyph kind="shield" size={22} />
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
                                {running === 'preview' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="radio" size={15} />}
                                Run Safe Preview
                            </button>
                            <button className={styles.sendButton} onClick={() => runDigest(false)} disabled={Boolean(running) || !preview || preview.recipients === 0}>
                                {running === 'send' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="send" size={15} />}
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
                                    <OperatorGlyph kind="radio" size={28} />
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
                            <OperatorGlyph kind="search" size={15} />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Email Or Phone" aria-label="Search Subscriber Email" />
                            <button type="submit">Find</button>
                        </form>
                    </div>
                    <div className={styles.tableWrap}>
                        <table>
                            <thead><tr><th>Contact</th><th>Source</th><th>Status</th><th>Joined</th><th>Control</th></tr></thead>
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
