import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART } from '../../../src/config/triviaIntroArt.mjs';
import { authedFetch, getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useOnlineStatus from '../../../src/hooks/useOnlineStatus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import {
    ACHIEVEMENT_CONTRACT,
    ACHIEVEMENT_VERSION,
    normalizeAchievementItem,
    normalizeAchievementSnapshot,
} from '../../../src/lib/trivia/achievementAuthority.mjs';
import {
    createLatestRequestScope,
    createAccountOperationScope,
    shouldGateAccountOwnedRender,
} from '../../../src/lib/trivia/accountOperationScope.mjs';

const ERROR_COPY = Object.freeze({
    authentication_required: 'Sign In Again To Read Or Claim This Achievement.',
    invalid_achievement_id: 'This Achievement Identifier Is Invalid.',
    achievement_not_found: 'This Achievement Is No Longer Available.',
    not_eligible: 'The Server Has Not Verified This Achievement Yet.',
    award_failed: 'The Award Could Not Be Settled. The Same Claim Can Be Retried Safely.',
    internal_error: 'The Achievement Service Is Temporarily Unavailable.',
});

function printTitle(text) {
    return String(text ?? '')
        .replaceAll('_', ' ')
        .replace(/(^|[\s\-/(])(\p{Ll})/gu, (match, lead, letter) => lead + letter.toUpperCase());
}

function safeNormalizeItem(raw) {
    try { return normalizeAchievementItem(raw); }
    catch (error) {
        console.warn('[TriviaAchievements] Invalid Item:', error?.message || error);
        return null;
    }
}

function hasSettledReceipt(item) {
    return item?.state === 'awarded'
        && Number.isFinite(item.settledDiamonds)
        && Boolean(item.receiptId && item.journalId && item.transactionId);
}

async function readResponse(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
        const error = new Error(body?.error || `request_failed_${response.status}`);
        error.code = body?.error || 'internal_error';
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return body;
}

function validateRead(body) {
    return normalizeAchievementSnapshot(body).items;
}

function receiptCompleteState(item) {
    if (item.state !== 'awarded') return item.state;
    return hasSettledReceipt(item) ? 'credited' : 'error';
}

function AchievementItem({ item, claimState, claimError, online, onClaim }) {
    const renderedState = receiptCompleteState(item);
    const hasProgress = item.progressTarget !== null && item.progressTarget > 0 && item.progressCurrent !== null;
    const progress = hasProgress ? Math.min(item.progressCurrent, item.progressTarget) : null;
    const pending = claimState === 'pending';
    const errorCopy = claimError || (item.state === 'error' ? ERROR_COPY[item.errorCode] || 'The Server Could Not Verify This Achievement.' : '');
    return (
        <li className="trivia-progress-item" data-achievement-id={item.id} data-category={item.category} data-rarity={item.rarity} data-state={renderedState}>
            <h3 className="trivia-progress-item__title"><span>{printTitle(item.title)}</span><span className={renderedState === 'credited' ? 'tc-ink--green' : renderedState === 'eligible' ? 'tc-ink--blue' : renderedState === 'error' ? 'tc-ink--red' : 'tc-ink--muted'}>{pending ? 'Pending' : printTitle(renderedState)}</span></h3>
            <p className="trivia-progress-item__description">{item.description}</p>
            <p className="trivia-progress-item__meta">
                <span>{printTitle(item.category)}</span>
                <span>{printTitle(item.rarity)}</span>
                {hasProgress ? <span className="tc-ink--blue" aria-label={`${printTitle(item.title)} Progress ${progress} Of ${item.progressTarget}`}>{formatTriviaDisplayNumber(progress)} / {formatTriviaDisplayNumber(item.progressTarget)}</span> : null}
            </p>

            {renderedState === 'credited' ? (
                <dl className="trivia-progress-receipt">
                    <div><dt>Settled Award</dt><dd className="tc-ink--gold">{formatTriviaDisplayNumber(item.settledDiamonds)} Diamonds</dd></div>
                    <div><dt>Awarded At</dt><dd>{item.awardedAt ? new Date(item.awardedAt).toLocaleString() : 'Time Not Available'}</dd></div>
                    <div><dt>Receipt</dt><dd>{item.receiptId}</dd></div>
                    <div><dt>Journal</dt><dd>{item.journalId}</dd></div>
                    <div><dt>Transaction</dt><dd>{item.transactionId}</dd></div>
                </dl>
            ) : null}
            {item.state === 'awarded' && renderedState === 'error' ? <p className="trivia-progress-status tc-ink--red" role="alert">Award Record Incomplete. No Diamond Amount Is Displayed Without A Settled Receipt And Journal.</p> : null}
            {errorCopy ? <p className="trivia-progress-status tc-ink--red" role="alert">{errorCopy}</p> : null}
            {item.state === 'eligible' ? (
                <div className="trivia-progress-achievement-actions">
                    <button type="button" className="tc-word" disabled={pending || !online} onClick={() => onClaim(item.id)}>{pending ? 'Claim Pending' : claimState === 'error' ? 'Retry Same Claim' : 'Claim Verified Award'}</button>
                    {!online ? <span className="tc-ink--gold">Connect To Claim</span> : null}
                </div>
            ) : null}
        </li>
    );
}

export default function TriviaAchievements() {
    useTrainingBus('trivia-achievements');
    const router = useRouter();
    const online = useOnlineStatus();
    const { user: avatarUser, loading: avatarLoading } = useAvatar();
    const [userId, setUserId] = useState(null);
    const accountOperationScopeRef = useRef(null);
    if (!accountOperationScopeRef.current) {
        accountOperationScopeRef.current = createAccountOperationScope();
    }
    const requestScopeRef = useRef(null);
    if (!requestScopeRef.current) {
        requestScopeRef.current = createLatestRequestScope();
    }
    const requestIdentityRef = useRef(undefined);
    const resolvedAccountId = avatarLoading
        ? null
        : (avatarUser?.id || getAuthUser()?.id || null);
    accountOperationScopeRef.current.transition(resolvedAccountId);
    if (!avatarLoading && requestIdentityRef.current !== resolvedAccountId) {
        requestIdentityRef.current = resolvedAccountId;
        requestScopeRef.current.invalidate();
    }
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [claimState, setClaimState] = useState({});
    const [claimError, setClaimError] = useState({});
    const [loadedAt, setLoadedAt] = useState(null);
    const [refreshWarning, setRefreshWarning] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const hasAuthoritativeRead = useRef(false);
    const loadedUserId = useRef(null);

    useEffect(() => {
        if (avatarLoading) return undefined;
        const readRequest = requestScopeRef.current.begin();
        if (readRequest === null) return undefined;
        let cancelled = false;
        const user = avatarUser || getAuthUser();
        const operationScope = accountOperationScopeRef.current.capture();
        const isCurrent = () => !cancelled
            && accountOperationScopeRef.current.isCurrent(operationScope)
            && requestScopeRef.current.isCurrent(readRequest);
        if (!user) {
            if (!isCurrent()) return () => { cancelled = true; };
            loadedUserId.current = null;
            hasAuthoritativeRead.current = false;
            setUserId(null);
            setItems([]);
            setClaimState({});
            setClaimError({});
            setLoadedAt(null);
            setRefreshWarning('');
            setLoadError('');
            setIsLoading(false);
            return () => { cancelled = true; };
        }
        if (operationScope.identity !== user.id) return () => { cancelled = true; };
        if (loadedUserId.current !== user.id) {
            loadedUserId.current = user.id;
            hasAuthoritativeRead.current = false;
            setItems([]);
            setClaimState({});
            setClaimError({});
            setLoadedAt(null);
            setRefreshWarning('');
        }
        setUserId(user.id);
        if (!online) {
            setIsLoading(false);
            if (hasAuthoritativeRead.current) {
                setLoadError('');
                setRefreshWarning('Offline. The Last Authoritative Read Remains Visible, And Claims Are Paused.');
            } else {
                setLoadError('You Are Offline. Authoritative Achievements Need A Live Server Read.');
            }
            return () => { cancelled = true; };
        }
        setIsLoading(true);
        setLoadError('');
        async function load() {
            try {
                if (!online) throw new Error('offline');
                const body = await readResponse(await authedFetch('/api/trivia/achievements'));
                const next = validateRead(body);
                if (isCurrent()) {
                    setItems(next);
                    setLoadedAt(new Date());
                    setRefreshWarning('');
                    hasAuthoritativeRead.current = true;
                }
            } catch (error) {
                if (!isCurrent()) return;
                console.warn('[TriviaAchievements] Read Failed:', error?.message || error);
                if (isCurrent()) {
                    if (hasAuthoritativeRead.current) {
                        setLoadError('');
                        setRefreshWarning('The Latest Achievement Refresh Failed. The Last Authoritative Read Remains Visible.');
                    } else {
                        setLoadError('We Could Not Load Your Authoritative Achievements Right Now. Please Try Again.');
                    }
                }
            } finally {
                if (isCurrent()) setIsLoading(false);
            }
        }
        load();
        const onFocus = () => { if (online && isCurrent()) setReloadKey((key) => key + 1); };
        window.addEventListener('focus', onFocus);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', onFocus);
        };
    }, [avatarLoading, avatarUser?.id, online, reloadKey]);

    const summary = useMemo(() => {
        const credited = items.filter(hasSettledReceipt);
        return {
            credited: credited.length,
            eligible: items.filter((item) => item.state === 'eligible').length,
            errors: items.filter((item) => item.state === 'error' || (item.state === 'awarded' && !hasSettledReceipt(item))).length,
            settledDiamonds: credited.reduce((sum, item) => sum + item.settledDiamonds, 0),
        };
    }, [items]);

    const categories = useMemo(() => {
        const grouped = new Map();
        for (const item of items) {
            if (!grouped.has(item.category)) grouped.set(item.category, []);
            grouped.get(item.category).push(item);
        }
        return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
    }, [items]);

    const claim = async (achievementId) => {
        if (!online || claimState[achievementId] === 'pending') return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const mutation = requestScopeRef.current.beginMutation();
        if (mutation === null) return;
        const isCurrent = () => accountOperationScopeRef.current.isCurrent(operationScope)
            && requestScopeRef.current.isMutationCurrent(mutation);
        setClaimState((state) => ({ ...state, [achievementId]: 'pending' }));
        setClaimError((state) => ({ ...state, [achievementId]: '' }));
        try {
            const body = await readResponse(await authedFetch('/api/trivia/achievements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ achievementId }),
            }));
            if (!isCurrent()) return;
            if (body.contract !== ACHIEVEMENT_CONTRACT || body.version !== ACHIEVEMENT_VERSION) throw new Error('invalid_achievement_contract');
            const authoritative = safeNormalizeItem(body.item || body.achievement || body.result?.item || body.result);
            if (!authoritative || authoritative.id !== achievementId) throw new Error('invalid_achievement_contract');
            if (!isCurrent()) return;
            setItems((current) => current.map((item) => item.id === achievementId ? authoritative : item));
            setClaimState((state) => ({ ...state, [achievementId]: authoritative.state === 'error' ? 'error' : 'complete' }));
            setClaimError((state) => ({ ...state, [achievementId]: authoritative.state === 'error' ? ERROR_COPY[authoritative.errorCode] || 'The Award Was Not Settled.' : '' }));
        } catch (error) {
            if (!isCurrent()) return;
            console.warn('[TriviaAchievements] Claim Failed:', error?.message || error);
            const authoritative = safeNormalizeItem(error?.body?.item);
            if (authoritative?.id === achievementId) {
                setItems((current) => current.map((item) => item.id === achievementId ? authoritative : item));
            }
            setClaimState((state) => ({ ...state, [achievementId]: 'error' }));
            setClaimError((state) => ({ ...state, [achievementId]: ERROR_COPY[error?.code] || 'The Award Was Not Settled. Retry Uses The Same Server Claim.' }));
        } finally {
            requestScopeRef.current.endMutation(mutation);
        }
    };

    const accountBoundaryPending = shouldGateAccountOwnedRender({
        loading: avatarLoading,
        resolvedIdentity: resolvedAccountId,
        loadedIdentity: userId,
    });
    const renderLoading = isLoading || accountBoundaryPending;
    const signedOut = !renderLoading && !userId;
    const retry = () => {
        setIsLoading(true);
        setReloadKey((key) => key + 1);
    };

    return (
        <TriviaErrorBoundary pageName="Achievements">
            <>
                <SEOHead title="Trivia Achievements - Verified Awards" description="Track Server-Verified Poker Trivia Achievements And Settled Award Receipts." canonical="/hub/trivia/achievements" noindex />
                <PageTransition>
                    <div className="trivia-progress-page trivia-progress-page--achievements" data-trivia-family="progress" data-trivia-surface="achievements">
                        <UniversalHeader pageDepth={2} />
                        <main className="trivia-progress-shell" aria-labelledby="trivia-achievements-title">
                            <TriviaConsole
                                as="section"
                                eyebrow="Player Progress"
                                title="Achievements"
                                titleAs="h1"
                                titleId="trivia-achievements-title"
                                subtitle="Verified Criteria And Settled Receipts"
                                pill={renderLoading ? 'Loading' : loadError ? 'Error' : signedOut ? 'Guest' : `${formatTriviaDisplayNumber(summary.credited)} Credited`}
                                pillInk={loadError || summary.errors > 0 ? 'red' : summary.credited > 0 ? 'green' : 'blue'}
                                className="trivia-progress-console"
                                secondaryAction={{ label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }}
                                primaryAction={!renderLoading && loadError ? { label: 'Retry', onClick: retry } : signedOut ? { label: 'Sign In', onClick: () => router.push('/auth/login?redirect=/hub/trivia/achievements') } : undefined}
                            >
                                <ResponsiveModeArt art={TRIVIA_INTRO_ART.achievements} priority />
                                {renderLoading ? <p className="trivia-progress-state trivia-progress-state--loading" role="status">Loading Authoritative Achievements</p> : loadError ? <section className="trivia-progress-state trivia-progress-state--error" role="alert"><p>{loadError}</p></section> : signedOut ? (
                                    <section className="trivia-progress-empty"><p className="trivia-progress-empty-copy">Sign In To Read Your Server-Verified Achievement Progress. Guest Visits Never Appear As Locked Or Earned Awards.</p></section>
                                ) : (
                                    <div className="trivia-progress-content trivia-progress-content--achievements">
                                        {refreshWarning ? <section className="trivia-progress-notice trivia-progress-notice--warning" role="status"><p>{refreshWarning}</p>{online ? <button type="button" className="tc-word" onClick={retry}>Retry Refresh</button> : null}</section> : null}
                                        {summary.errors > 0 ? <section className="trivia-progress-notice trivia-progress-notice--warning" role="status"><p>Partial Achievement Data: {formatTriviaDisplayNumber(summary.errors)} {summary.errors === 1 ? 'Record Needs' : 'Records Need'} Attention.</p></section> : null}
                                        <section className="trivia-progress-section trivia-progress-achievement-ledger" aria-labelledby="trivia-achievement-summary">
                                            <h2 id="trivia-achievement-summary" className="trivia-progress-heading">Award Ledger</h2>
                                            <ul className="tc-rows trivia-progress-rows trivia-progress-rows--split" aria-label="Authoritative Achievement Summary">
                                                <li className="tc-row"><span className="tc-row__label">Definitions</span><span className="tc-row__value">{formatTriviaDisplayNumber(items.length)}</span></li>
                                                <li className="tc-row"><span className="tc-row__label">Eligible</span><span className="tc-row__value tc-ink--blue">{formatTriviaDisplayNumber(summary.eligible)}</span></li>
                                                <li className="tc-row"><span className="tc-row__label">Credited</span><span className="tc-row__value tc-ink--green">{formatTriviaDisplayNumber(summary.credited)}</span></li>
                                                <li className="tc-row"><span className="tc-row__label">Settled Diamonds</span><span className="tc-row__value tc-ink--gold">{formatTriviaDisplayNumber(summary.settledDiamonds)}</span></li>
                                            </ul>
                                        </section>
                                        {items.length === 0 ? <section className="trivia-progress-empty"><p className="trivia-progress-empty-copy">No Achievement Definitions Are Available From The Server.</p></section> : categories.map(([category, categoryItems]) => (
                                            <section className="trivia-progress-section trivia-progress-achievement-category" key={category} aria-labelledby={`trivia-achievement-${category}`}>
                                                <h2 id={`trivia-achievement-${category}`} className="trivia-progress-heading">{printTitle(category)}</h2>
                                                <ul className="trivia-progress-list">{categoryItems.map((item) => <AchievementItem key={`${item.id}:${item.version}`} item={item} claimState={claimState[item.id]} claimError={claimError[item.id]} online={online} onClaim={claim} />)}</ul>
                                            </section>
                                        ))}
                                        {loadedAt ? <p className="trivia-progress-read-time">Last Authoritative Read {loadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p> : null}
                                    </div>
                                )}
                            </TriviaConsole>
                        </main>
                    </div>
                </PageTransition>
            </>
        </TriviaErrorBoundary>
    );
}
