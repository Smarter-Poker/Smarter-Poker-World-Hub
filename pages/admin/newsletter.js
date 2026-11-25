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

const WELCOME_BACK_PROMO_DRAFT = {
    subject: 'We Miss You At The Tables: Accept 25 Free Chips, 500 Free Diamonds & 1-Month Free VIP',
    headline: '25 Free Chips + 500 Free Diamonds + 1-Month Free VIP',
    body: 'It has been a few weeks since we last saw you on Smarter.Poker, and your seat in Kings Club (Club Code 25450) is waiting.\n\nClick below to accept your exclusive Welcome-Back Offer and unlock 25 Free Chips, 500 Free Diamonds, and 1 Month of Free VIP Access.',
    ctaLabel: 'Accept Your Offer',
    ctaUrl: 'https://smarter.poker/promo/welcome-back',
    smsBody: 'Smarter.Poker: Accept your Welcome-Back Offer for 25 Free Chips, 500 Diamonds + 1-Month Free VIP: https://smarter.poker/go/welcome-back Reply STOP to opt out.',
    postalAddress: 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453',
    channels: 'both',
    scope: 'inactive_21d',
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
    const [articleLimit, setArticleLimit] = useState(5);
    const [digestAudience, setDigestAudience] = useState('opted_in_all');
    const [digestTestSegment, setDigestTestSegment] = useState('active_member');
    const [preview, setPreview] = useState(null);
    const [running, setRunning] = useState('');
    const [updateBadge, setUpdateBadge] = useState('Platform Upgrade');
    const [updateTitle, setUpdateTitle] = useState('');
    const [updateSummary, setUpdateSummary] = useState('');
    const [updateCtaUrl, setUpdateCtaUrl] = useState('https://smarter.poker/hub/club-arena/');

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
    const [lifecyclePreview, setLifecyclePreview] = useState(null);
    const [lifecycleTestTrigger, setLifecycleTestTrigger] = useState('unverified_48h');

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
                const response = await fetch(`/api/news/operations?${params}`, {
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

    const applyPromoPreset = (preset) => {
        setPromoTouched(true);
        setPromoPreview(null);
        setPromoInlineError('');
        setPromoInlineNotice('');
        if (preset === 'welcome_back') {
            setPromoDraft({ ...WELCOME_BACK_PROMO_DRAFT, ...(promoMeta?.welcomeBackDraft || {}) });
        } else {
            setPromoDraft({ ...INITIAL_PROMO_DRAFT, ...(promoMeta?.defaultDraft || {}) });
        }
    };

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
        if (!dryRun && !window.confirm(`Send Weekly Wire Edition #${preview?.editionNumber || ''} to ${preview?.recipients ?? data?.stats?.active ?? 0} opted-in recipients now? This cannot be undone.`)) return;
        setRunning(dryRun ? 'preview' : 'send');
        setError('');
        setNotice('');
        try {
            const params = new URLSearchParams({
                dryRun: dryRun ? '1' : '0',
                days: String(days),
                limit: String(articleLimit),
                audience: digestAudience,
            });
            const response = await fetch(`/api/news/digest?${params}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Newsletter operation failed');
            if (dryRun) {
                setPreview(body);
                setNotice(`Weekly Wire Preview Ready: ${body.recipients || 0} Opted-In Recipients, ${(body.platformUpdates || []).length} Upgrades, ${body.articles || 0} Deduplicated Stories.`);
            } else {
                setPreview(null);
                setNotice(`Weekly Wire Sent: ${body.sent || 0} Delivered.`);
                await load(token, 1, search);
            }
        } catch (err) {
            setError(err?.message || 'Newsletter operation failed');
        } finally {
            setRunning('');
        }
    };

    const sendTestDigest = async () => {
        if (!token) return;
        if (!testEmail.trim()) {
            setError('Enter A Test Email Recipient Above First.');
            return;
        }
        setRunning('digest-test');
        setError('');
        setNotice('');
        try {
            const response = await fetch('/api/news/digest', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'test',
                    testEmail: testEmail.trim(),
                    segment: digestTestSegment,
                    days,
                    limit: articleLimit,
                }),
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Test Weekly Wire send failed');
            setNotice(`Test Weekly Wire Sent To ${body.targetEmail || testEmail.trim()} (${body.segment} View).`);
        } catch (err) {
            setError(err?.message || 'Test Weekly Wire send failed');
        } finally {
            setRunning('');
        }
    };

    const queuePlatformUpdate = async (event) => {
        event.preventDefault();
        if (!token || !updateTitle.trim() || !updateSummary.trim()) return;
        setRunning('queue-update');
        setError('');
        setNotice('');
        try {
            const response = await fetch('/api/news/digest', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'queue_update',
                    badge: updateBadge,
                    title: updateTitle,
                    summary: updateSummary,
                    ctaUrl: updateCtaUrl,
                }),
            });
            const body = await response.json();
            if (!response.ok || !body.success) throw new Error(body.error || 'Unable to queue platform update');
            setUpdateTitle('');
            setUpdateSummary('');
            setPreview(null);
            setNotice('Platform Upgrade Queued For The Next Weekly Wire Edition (Single-Use Guaranteed).');
        } catch (err) {
            setError(err?.message || 'Unable to queue platform update');
        } finally {
            setRunning('');
        }
    };

    const runLifecycleAction = async (action) => {
        if (!token) return;
        if (action === 'test' && !testEmail.trim()) {
            setError('Enter A Test Email Recipient Above First.');
            return;
        }
        if (action === 'run') {
            const dueCount = lifecyclePreview?.dueTotal || 0;
            if (!dueCount) return;
            if (!window.confirm(`Dispatch ${dueCount} due lifecycle retention trigger(s) now and record permanent audit markers?`)) {
                return;
            }
        }
        setRunning(`lifecycle-${action}`);
        setError('');
        setNotice('');
        try {
            const response = await fetch('/api/news/lifecycle', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    trigger: lifecycleTestTrigger,
                    testEmail: testEmail.trim(),
                }),
            });
            const body = await response.json();
            if (!response.ok || body.error) {
                throw new Error(body.error || 'Lifecycle retention operation failed');
            }
            if (action === 'preview') {
                setLifecyclePreview(body);
                setNotice(`Lifecycle Queue Ready: ${body.dueTotal || 0} Due Trigger(s) Across Unverified, Dormant, And VIP Segments.`);
            } else if (action === 'test') {
                setNotice(`Test Lifecycle Email Sent To ${body.targetEmail || testEmail.trim()} (${body.trigger}).`);
            } else if (action === 'run') {
                setLifecyclePreview(null);
                setNotice(`Lifecycle Triggers Dispatched: ${body.emailSent || 0} Emails Sent, ${body.smsSent || 0} Texts Sent.`);
                await load(token, 1, search);
            }
        } catch (err) {
            setError(err?.message || 'Lifecycle retention operation failed');
        } finally {
            setRunning('');
        }
    };

    const setSubscriberStatus = async (subscriber, isActive) => {
        setRunning(subscriber.id);
        setError('');
        try {
            const response = await fetch('/api/news/operations', {
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
                            <div className={styles.actionRow}>
                                <button type="button" className={styles.previewButton} onClick={() => applyPromoPreset('signup')} disabled={Boolean(running)}>
                                    Load New-Signup Campaign
                                </button>
                                <button type="button" className={styles.previewButton} onClick={() => applyPromoPreset('welcome_back')} disabled={Boolean(running)}>
                                    Load 3-Week Welcome-Back Offer
                                </button>
                            </div>
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
                                        <option value="inactive_21d">Inactive Players (No Sign-In Or Play In Past 3 Weeks)</option>
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
                                        <div className={styles.breakdownCard}><span>{promoDraft.scope === 'inactive_21d' ? 'Inactive Eligible Accounts' : 'Imported Or Subscribed'}</span><strong>{promoDraft.scope === 'inactive_21d' ? (promoPreview.breakdown?.inactiveEligibleAccounts || 0) : (promoPreview.breakdown?.subscriberEmails || 0) + (promoPreview.breakdown?.subscriberPhones || 0)}</strong></div>
                                        <div className={styles.breakdownCard}><span>{promoDraft.scope === 'non_accounts' ? 'Excluded Existing Accounts' : promoDraft.scope === 'inactive_21d' ? 'Excluded Recent Active' : 'Database Accounts And Leads'}</span><strong>{promoDraft.scope === 'non_accounts' ? (promoPreview.breakdown?.excludedExistingAccounts || 0) : promoDraft.scope === 'inactive_21d' ? (promoPreview.breakdown?.excludedRecentActiveUsers || 0) : (promoPreview.breakdown?.profileEmails || 0) + (promoPreview.breakdown?.profilePhones || 0) + (promoPreview.breakdown?.commanderEmails || 0) + (promoPreview.breakdown?.commanderPhones || 0)}</strong></div>
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
                            <p className={styles.eyebrow}>Weekly Wire</p>
                            <h2>Smarter.Poker Upgrades, Segmented Promos And Poker News</h2>
                        </div>
                        <OperatorGlyph kind="shield" size={22} />
                    </div>
                    <div className={styles.dispatchBody}>
                        <div className={styles.controls}>
                            <label>
                                Audience Scope
                                <select value={digestAudience} onChange={(e) => { setDigestAudience(e.target.value); setPreview(null); }}>
                                    <option value="opted_in_all">All Opted-In Players And Subscribers</option>
                                    <option value="subscribers_only">Newsletter Subscribers Only</option>
                                </select>
                            </label>
                            <label>
                                Story Window
                                <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setPreview(null); }}>
                                    <option value={3}>Past 3 Days</option>
                                    <option value={7}>Past 7 Days</option>
                                    <option value={14}>Past 14 Days</option>
                                </select>
                            </label>
                            <label>
                                Poker Stories
                                <select value={articleLimit} onChange={(e) => { setArticleLimit(Number(e.target.value)); setPreview(null); }}>
                                    {[4, 5, 6, 8].map((count) => <option key={count} value={count}>{count} Stories</option>)}
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
                            <label>
                                Test Segment View
                                <select value={digestTestSegment} onChange={(e) => setDigestTestSegment(e.target.value)}>
                                    <option value="active_member">Active Member Spotlight</option>
                                    <option value="inactive_21d">3-Week Inactive Welcome-Back</option>
                                    <option value="non_account">New-Lead Signup Bonus</option>
                                </select>
                            </label>
                            <button type="button" className={styles.previewButton} onClick={sendTestDigest} disabled={Boolean(running)}>
                                {running === 'digest-test' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="mail" size={15} />}
                                Send Test Weekly Wire
                            </button>
                        </div>
                        <div className={styles.preview}>
                            {preview ? (
                                <>
                                    <p className={styles.previewLabel}>Edition #{preview.editionNumber || 1} Preview Ready</p>
                                    <h3>{preview.subject || 'No Publishable Stories Found'}</h3>
                                    <dl>
                                        <div><dt>Opted-In Total</dt><dd>{preview.recipients}</dd></div>
                                        <div><dt>Platform Upgrades</dt><dd>{(preview.platformUpdates || []).length}</dd></div>
                                        <div><dt>Deduped Stories</dt><dd>{preview.articles}</dd></div>
                                        <div><dt>New Leads / Inactive / Active</dt><dd>{preview.segmentCounts?.non_account || 0} / {preview.segmentCounts?.inactive_21d || 0} / {preview.segmentCounts?.active_member || 0}</dd></div>
                                        <div><dt>Spot Of The Week</dt><dd>{preview.spotOfTheWeek?.title || 'Ready'}</dd></div>
                                        <div><dt>Tool Spotlight</dt><dd>{preview.toolSpotlight?.title || 'None'}</dd></div>
                                        <div><dt>Duplicates Blocked</dt><dd>{(preview.diagnostics?.skippedPreviouslySent || 0) + (preview.diagnostics?.skippedStoryDuplicates || 0) + (preview.diagnostics?.skippedStubs || 0)}</dd></div>
                                    </dl>
                                    {(preview.platformUpdates || []).length > 0 && (
                                        <p>
                                            Upgrades In This Issue: <strong>{(preview.platformUpdates || []).map((u) => u.title).join(' | ')}</strong>
                                        </p>
                                    )}
                                    {(preview.articleItems || []).length > 0 && (
                                        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                                            {(preview.articleItems || []).map((item) => (
                                                <div
                                                    key={item.id}
                                                    style={{
                                                        display: 'flex',
                                                        gap: 12,
                                                        alignItems: 'center',
                                                        padding: '10px 12px',
                                                        background: '#08131d',
                                                        border: '1px solid #1f3548',
                                                        borderRadius: 10,
                                                    }}
                                                >
                                                    <img
                                                        src={item.email_image_url || '/api/news/email-image?fallback=1&m=thumb'}
                                                        alt={item.title || 'Weekly Wire Story'}
                                                        width={84}
                                                        height={58}
                                                        loading="lazy"
                                                        onError={(ev) => {
                                                            if (!ev.currentTarget.dataset.fb) {
                                                                ev.currentTarget.dataset.fb = '1';
                                                                ev.currentTarget.src = '/api/news/email-image?fallback=1&m=thumb';
                                                            }
                                                        }}
                                                        style={{
                                                            width: 84,
                                                            height: 58,
                                                            objectFit: 'cover',
                                                            borderRadius: 6,
                                                            border: '1px solid #234055',
                                                            background: '#0b1520',
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ color: '#4fc1b3', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                                                            {item.source_name || 'Poker Wire'}
                                                        </div>
                                                        <div style={{ color: '#ffffff', fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>
                                                            {item.title}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p style={{ marginTop: 10 }}>
                                        <Link href={`/hub/wire/${preview.editionNumber || 1}`} className={styles.back}>
                                            Open Web Edition #{preview.editionNumber || 1} Preview &rarr;
                                        </Link>
                                    </p>
                                    <p>No Email Was Sent During This Preview.</p>
                                </>
                            ) : (
                                <div className={styles.previewEmpty}>
                                    <OperatorGlyph kind="radio" size={28} />
                                    <p>Run Safe Preview To Curate Fresh Smarter.Poker Upgrades, Deduplicated Poker Stories, Tool Of The Week, And Segmented Recipient Counts.</p>
                                </div>
                            )}
                        </div>
                        <aside className={styles.storyRail}>
                            <p className={styles.previewLabel}>Queue Custom Platform Upgrade</p>
                            <form onSubmit={queuePlatformUpdate} style={{ display: 'grid', gap: 10 }}>
                                <input value={updateBadge} onChange={(e) => setUpdateBadge(e.target.value)} placeholder="Badge Label" />
                                <input value={updateTitle} onChange={(e) => setUpdateTitle(e.target.value)} placeholder="Upgrade Or Optimization Headline" />
                                <textarea rows={3} value={updateSummary} onChange={(e) => setUpdateSummary(e.target.value)} placeholder="Short Player-Facing Summary" />
                                <input value={updateCtaUrl} onChange={(e) => setUpdateCtaUrl(e.target.value)} placeholder="https://smarter.poker/hub" />
                                <button type="submit" className={styles.previewButton} disabled={Boolean(running) || !token || !updateTitle.trim() || !updateSummary.trim()}>
                                    Queue For Next Wire
                                </button>
                            </form>
                        </aside>
                    </div>
                </section>

                <section className={styles.dispatch}>
                    <div className={styles.sectionHeading}>
                        <div>
                            <p className={styles.eyebrow}>Automated Retention</p>
                            <h2>Lifecycle Retention Automation</h2>
                        </div>
                        <OperatorGlyph kind="clock" size={22} />
                    </div>
                    <div className={styles.dispatchBody}>
                        <div className={styles.controls}>
                            <button type="button" className={styles.previewButton} onClick={() => runLifecycleAction('preview')} disabled={Boolean(running) || !token}>
                                {running === 'lifecycle-preview' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="eye" size={15} />}
                                Preview Lifecycle Queue
                            </button>
                            <button type="button" className={styles.sendButton} onClick={() => runLifecycleAction('run')} disabled={Boolean(running) || !lifecyclePreview || !lifecyclePreview.dueTotal}>
                                {running === 'lifecycle-run' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="send" size={15} />}
                                Run Due Lifecycle Triggers
                            </button>
                            <label>
                                Test Trigger Template
                                <select value={lifecycleTestTrigger} onChange={(e) => setLifecycleTestTrigger(e.target.value)}>
                                    <option value="unverified_48h">48h Phone Verification</option>
                                    <option value="welcome_back_21d">22-30d Welcome-Back Offer</option>
                                    <option value="vip_diamond_nudge">VIP And Diamond Nudge</option>
                                </select>
                            </label>
                            <button type="button" className={styles.previewButton} onClick={() => runLifecycleAction('test')} disabled={Boolean(running) || !token}>
                                {running === 'lifecycle-test' ? <OperatorGlyph kind="refresh" size={15} className={styles.spin} /> : <OperatorGlyph kind="mail" size={15} />}
                                Send Test Lifecycle Email
                            </button>
                        </div>
                        <div className={styles.preview}>
                            {lifecyclePreview ? (
                                <>
                                    <p className={styles.previewLabel}>Lifecycle Retention Queue Ready</p>
                                    <h3>{lifecyclePreview.dueTotal || 0} Due Player Trigger{lifecyclePreview.dueTotal === 1 ? '' : 's'}</h3>
                                    <dl>
                                        <div><dt>48h Unverified</dt><dd>{lifecyclePreview.counts?.unverified_48h || 0}</dd></div>
                                        <div><dt>22-30d Welcome-Back</dt><dd>{lifecyclePreview.counts?.welcome_back_21d || 0}</dd></div>
                                        <div><dt>VIP And Diamonds</dt><dd>{lifecyclePreview.counts?.vip_diamond_nudge || 0}</dd></div>
                                        <div><dt>Eligible SMS</dt><dd>{lifecyclePreview.smsCandidates || 0}</dd></div>
                                        <div><dt>Suppressed Emails</dt><dd>{lifecyclePreview.suppressedEmails || 0}</dd></div>
                                        <div><dt>Daily Gate</dt><dd>{lifecyclePreview.alreadyRanToday ? 'Ran Today' : 'Open'}</dd></div>
                                    </dl>
                                    <p>No Email Or SMS Was Sent During Lifecycle Queue Preview.</p>
                                </>
                            ) : (
                                <div className={styles.previewEmpty}>
                                    <OperatorGlyph kind="clock" size={28} />
                                    <p>Preview Lifecycle Queue To Inspect Due 48-Hour Unverified Signups, Rolling 22-30 Day Welcome-Back Offers, And VIP Or Unclaimed Diamond Nudges.</p>
                                </div>
                            )}
                        </div>
                        <aside className={styles.storyRail}>
                            <p className={styles.previewLabel}>Inbox &amp; BIMI Readiness</p>
                            <div className={styles.senderMeta} style={{ display: 'grid', gap: 10 }}>
                                <div>
                                    Welcome-Back Redemptions: <strong>{statValue(data?.stats?.welcome_back_redemptions ?? data?.welcomeBackRedemptions ?? 0)}</strong>
                                </div>
                                <div>
                                    Weekly Wire Only Subscribers: <strong>{statValue(data?.stats?.wire_only ?? data?.wireOnlyCount ?? 0)}</strong>
                                </div>
                                <div>
                                    Preheader &amp; One-Click Unsubscribe: <strong>{(data?.deliverability?.preheaderEnabled ?? true) && (data?.deliverability?.oneClickUnsubscribe ?? true) ? 'Active' : 'Pending'}</strong>
                                </div>
                                <div>
                                    BIMI SVG Logo: <strong>{data?.deliverability?.bimiSvgPath || '/brand/bimi-logo.svg'}</strong>
                                </div>
                                <div>
                                    BIMI DNS TXT Record:
                                    <code style={{ display: 'block', marginTop: 6, padding: '8px 10px', background: '#07121c', border: '1px solid #254052', borderRadius: 6, color: '#4fc1b3', fontSize: 11, wordBreak: 'break-all' }}>
                                        {data?.deliverability?.bimiDnsRecord || 'v=BIMI1; l=https://smarter.poker/brand/bimi-logo.svg;'}
                                    </code>
                                </div>
                                <div style={{ paddingTop: 4 }}>
                                    <Link href="/hub/wire" className={styles.back}>
                                        <OperatorGlyph kind="archive" size={14} /> Open Weekly Wire Web Archive ({'/hub/wire'})
                                    </Link>
                                </div>
                            </div>
                        </aside>
                    </div>
                </section>

                <section className={styles.panel}>
                    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Audit Trail</p><h2>Campaign History</h2></div></div>
                    <div className={styles.tableWrap}>
                        <table>
                            <thead><tr><th>Subject</th><th>Status</th><th>Audience</th><th>Delivered</th><th>Opens / Clicks</th><th>Started</th></tr></thead>
                            <tbody>
                                {(data?.campaigns || []).map((campaign) => (
                                    <tr key={campaign.id}>
                                        <td>{campaign.subject}</td>
                                        <td><Status value={campaign.status} /></td>
                                        <td>{campaign.recipient_count}</td>
                                        <td>{campaign.sent_count}{campaign.failed_count ? ` / ${campaign.failed_count} failed` : ''}</td>
                                        <td>{campaign.opens || 0} / {campaign.clicks || 0}</td>
                                        <td>{formatDate(campaign.started_at || campaign.completed_at || campaign.created_at)}</td>
                                    </tr>
                                ))}
                                {!loading && !(data?.campaigns || []).length && <tr><td colSpan="6" className={styles.emptyCell}>No Campaign Has Been Sent Yet.</td></tr>}
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
