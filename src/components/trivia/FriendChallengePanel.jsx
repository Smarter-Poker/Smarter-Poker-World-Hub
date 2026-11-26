import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { TriviaGlassAction } from './console/TriviaConsole';
import { authedFetch } from '../../lib/authUtils';
import { VALID_CHALLENGE_STAKES } from '../../lib/trivia/socialGrowthHelpers.mjs';

export default function FriendChallengePanel({
    signedIn = false,
    onSignIn,
    initialCode = '',
    shareBasePath = '/hub/trivia/pvp',
    onChallengeLoaded = null,
    onChallengeAccepted = null,
}) {
    const router = useRouter();
    const [stake, setStake] = useState(25);
    const [incoming, setIncoming] = useState(null);
    const [myChallenges, setMyChallenges] = useState([]);
    const [created, setCreated] = useState(null);
    const [busy, setBusy] = useState('');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');

    const codeFromQuery = typeof router.query?.challenge === 'string'
        ? router.query.challenge.trim().toUpperCase()
        : String(initialCode || '').trim().toUpperCase();

    const loadIncoming = useCallback(async (code) => {
        if (!code) return;
        try {
            const response = await authedFetch(`/api/trivia/challenges?code=${encodeURIComponent(code)}`, { method: 'GET' });
            const payload = await response.json().catch(() => ({}));
            if (response.ok && payload?.success && payload.challenge) {
                setIncoming(payload.challenge);
                setError('');
                if (typeof onChallengeLoaded === 'function') {
                    onChallengeLoaded({
                        challenge: payload.challenge,
                        pvpHandoff: payload.pvpHandoff || null,
                    });
                }
            } else {
                setIncoming(null);
                if (payload?.error) setError('That Friend Challenge Link Is Expired Or Unavailable.');
            }
        } catch {
            setIncoming(null);
        }
    }, [onChallengeLoaded]);

    const loadMyChallenges = useCallback(async () => {
        if (!signedIn) {
            setMyChallenges([]);
            return;
        }
        try {
            const response = await authedFetch('/api/trivia/challenges?limit=10', { method: 'GET' });
            const payload = await response.json().catch(() => ({}));
            if (response.ok && payload?.success && Array.isArray(payload.items)) {
                setMyChallenges(payload.items);
            }
        } catch {
            // Non-blocking secondary list
        }
    }, [signedIn]);

    useEffect(() => {
        if (codeFromQuery) void loadIncoming(codeFromQuery);
    }, [codeFromQuery, loadIncoming]);

    useEffect(() => {
        void loadMyChallenges();
    }, [loadMyChallenges]);

    const challengeShareUrl = (challengeCode) => {
        const origin = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://smarter.poker';
        const basePath = shareBasePath && shareBasePath.startsWith('/') ? shareBasePath : '/hub/trivia/pvp';
        return `${origin}${basePath}?challenge=${encodeURIComponent(challengeCode)}`;
    };

    const handleCopyLink = async (challengeCode) => {
        const link = challengeShareUrl(challengeCode);
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(link);
                setNotice(`Challenge Link Copied: ${challengeCode}`);
                return;
            } catch {
                // Fall through to display link
            }
        }
        setNotice(`Share Code: ${challengeCode}`);
    };

    const handleShareLink = async (challenge) => {
        const link = challengeShareUrl(challenge.challengeCode);
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share({
                    title: 'Smarter.Poker 1v1 Trivia Challenge',
                    text: `Play Me In A ${challenge.stakeAmount} Diamond Poker Trivia Duel On Smarter.Poker`,
                    url: link,
                });
                setNotice('Challenge Invite Shared.');
                return;
            } catch (err) {
                if (err?.name === 'AbortError') return;
            }
        }
        await handleCopyLink(challenge.challengeCode);
    };

    const handleCreate = async () => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        setBusy('create');
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/challenges', {
                method: 'POST',
                body: JSON.stringify({ action: 'create', stakeAmount: stake, expiresMinutes: 30 }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(payload?.error || 'Could Not Create Challenge.');
            }
            setCreated(payload.challenge);
            setNotice(`Duel Invite ${payload.challenge.challengeCode} Created For ${payload.challenge.stakeAmount} Diamonds.`);
            void loadMyChallenges();
        } catch (err) {
            setError(err?.message === 'too_many_open_challenges'
                ? 'You Already Have 5 Open Challenges. Cancel One Before Creating Another.'
                : 'Could Not Create Friend Challenge Right Now.');
        } finally {
            setBusy('');
        }
    };

    const handleAccept = async (challengeCode) => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        setBusy(`accept:${challengeCode}`);
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/challenges', {
                method: 'POST',
                body: JSON.stringify({ action: 'accept', challengeCode }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(payload?.error || 'Could Not Accept Challenge.');
            }
            setIncoming(payload.challenge);
            const matchedStake = payload.stakeAmount ?? payload.pvpHandoff?.stakeAmount ?? payload.challenge?.stakeAmount ?? null;
            const resolvedCode = payload.challengeCode ?? payload.challenge?.challengeCode ?? challengeCode;
            const targetRoute = payload.pvpHandoff?.route
                || `/hub/trivia/pvp?challenge=${encodeURIComponent(resolvedCode)}${matchedStake ? `&stake=${matchedStake}` : ''}`;
            const resolvedMatchId = payload.matchId ?? payload.pvpHandoff?.matchId ?? payload.challenge?.matchId ?? null;
            const isPaired = Boolean(payload.pvpHandoff?.paired || resolvedMatchId);
            if (typeof onChallengeAccepted === 'function') {
                onChallengeAccepted({
                    challenge: payload.challenge,
                    pvpHandoff: payload.pvpHandoff || null,
                    stakeAmount: matchedStake,
                    challengeCode: resolvedCode,
                    matchId: resolvedMatchId,
                });
            }
            if (router.pathname === '/hub/trivia/pvp') {
                setNotice(
                    isPaired
                        ? 'Match Paired: Entering Live Duel...'
                        : matchedStake
                            ? `Challenge Accepted. ${matchedStake} Diamond Stake Selected. Confirm Server Quote To Join.`
                            : 'Challenge Accepted. Confirm Your Server Quote Below To Join.',
                );
                void router.replace(targetRoute, undefined, { shallow: true });
            } else {
                setNotice(isPaired ? 'Match Paired: Entering Live Duel...' : 'Challenge Accepted. Opening 1v1 PvP Desk...');
                void router.push(targetRoute);
            }
        } catch (err) {
            const code = err?.message || '';
            setError(
                code === 'cannot_accept_own_challenge'
                    ? 'You Cannot Accept Your Own Challenge Link.'
                    : code === 'challenge_expired'
                        ? 'That Challenge Link Has Expired.'
                        : 'That Challenge Is No Longer Open.',
            );
        } finally {
            setBusy('');
        }
    };

    const handleCancel = async (challengeCode) => {
        setBusy(`cancel:${challengeCode}`);
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/challenges', {
                method: 'POST',
                body: JSON.stringify({ action: 'cancel', challengeCode }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(payload?.error || 'Could Not Cancel Challenge.');
            }
            if (created?.challengeCode === challengeCode) setCreated(null);
            setNotice(`Challenge ${challengeCode} Cancelled.`);
            void loadMyChallenges();
        } catch {
            setError('Could Not Cancel That Challenge.');
        } finally {
            setBusy('');
        }
    };

    const openOwnChallenges = myChallenges.filter((item) => item.isOwner && item.status === 'open');

    return (
        <section className="tt-section" aria-labelledby="trivia-friend-challenge-title" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="tt-section-head">
                <h2 id="trivia-friend-challenge-title" className="tc-label">Direct Friend Challenge</h2>
                <span className="tc-ink--blue">1v1 Duel Invite</span>
            </div>

            {incoming ? (
                <div style={{ border: '1px solid #86daff', background: '#0a1829', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <strong className="tc-ink--blue">
                        Challenge From {incoming.challengerDisplayName} ({incoming.stakeAmount} Diamonds)
                    </strong>
                    <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0 }}>
                        Code {incoming.challengeCode} | Status: {incoming.status}
                    </p>
                    {incoming.canAccept ? (
                        <TriviaGlassAction
                            label={busy === `accept:${incoming.challengeCode}` ? 'Accepting' : signedIn ? 'Accept Challenge And Enter PvP' : 'Sign In To Accept'}
                            ink="green"
                            disabled={Boolean(busy)}
                            onClick={() => handleAccept(incoming.challengeCode)}
                        />
                    ) : null}
                </div>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }} role="radiogroup" aria-label="Challenge Stake Amount">
                {VALID_CHALLENGE_STAKES.map((amount) => (
                    <button
                        key={amount}
                        type="button"
                        role="radio"
                        aria-checked={stake === amount}
                        className={`tc-word ${stake === amount ? 'tc-ink--blue' : 'tc-ink--silver'}`}
                        style={{
                            minHeight: '44px',
                            padding: '6px 12px',
                            border: stake === amount ? '1px solid #86daff' : '1px solid #445e77',
                            background: stake === amount ? '#0c55c0' : '#0a1829',
                            color: stake === amount ? '#f2f7ff' : '#bdd0e2',
                        }}
                        onClick={() => setStake(amount)}
                    >
                        {amount} Diamonds
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <TriviaGlassAction
                    label={busy === 'create' ? 'Creating' : signedIn ? `Create ${stake} Diamond Duel Link` : 'Sign In To Challenge A Friend'}
                    ink="blue"
                    disabled={Boolean(busy)}
                    onClick={handleCreate}
                />
            </div>

            {created ? (
                <div style={{ border: '1px solid #86daff', background: '#0a1829', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <strong className="tc-ink--blue">Invite Ready: {created.challengeCode}</strong>
                    <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0, wordBreak: 'break-all' }}>
                        {challengeShareUrl(created.challengeCode)}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        <TriviaGlassAction label="Copy Duel Link" ink="blue" onClick={() => handleCopyLink(created.challengeCode)} />
                        <TriviaGlassAction label="Share Invite" ink="green" onClick={() => handleShareLink(created)} />
                    </div>
                </div>
            ) : null}

            {notice ? <p className="trivia-console-copy tc-ink--green" role="status" style={{ margin: 0 }}>{notice}</p> : null}
            {error ? <p className="trivia-console-copy tc-ink--red" role="alert" style={{ margin: 0 }}>{error}</p> : null}

            {openOwnChallenges.length > 0 ? (
                <ul className="tc-rows" aria-label="Your Open Friend Challenges">
                    {openOwnChallenges.map((item) => (
                        <li key={item.id} className="tc-row">
                            <span className="tc-row__label">
                                {item.challengeCode} ({item.stakeAmount} Diamonds)
                            </span>
                            <span className="tc-row__value" style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="tc-word tc-ink--blue"
                                    style={{ minHeight: '44px', padding: '6px 10px' }}
                                    onClick={() => handleCopyLink(item.challengeCode)}
                                >
                                    Copy
                                </button>
                                <button
                                    type="button"
                                    className="tc-word tc-ink--red"
                                    style={{ minHeight: '44px', padding: '6px 10px' }}
                                    disabled={busy === `cancel:${item.challengeCode}`}
                                    onClick={() => handleCancel(item.challengeCode)}
                                >
                                    Cancel
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
