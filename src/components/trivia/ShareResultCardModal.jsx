import { useEffect, useMemo, useRef, useState } from 'react';
import TriviaConsoleDialog from './console/TriviaConsoleDialog';
import { TriviaGlassAction } from './console/TriviaConsole';
import {
    buildWordleShareText,
    isValidTriviaUuid,
    normalizeGridString,
} from '../../lib/trivia/socialGrowthHelpers.mjs';

export default function ShareResultCardModal({
    open,
    onClose,
    mode = 'daily',
    score = 0,
    total = 10,
    diamonds = 0,
    streak = 0,
    player = 'Smarter.Poker Player',
    grid = '',
    shareUrl = 'https://smarter.poker/hub/trivia',
    sessionId = null,
    matchId = null,
}) {
    const [copyState, setCopyState] = useState('idle');
    const [linkCopyState, setLinkCopyState] = useState('idle');
    const [shareState, setShareState] = useState('idle');
    const resetTimerRef = useRef(null);

    useEffect(() => () => {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    }, []);

    const verifiedMatchId = isValidTriviaUuid(matchId) ? matchId.trim() : null;
    const verifiedSessionId = !verifiedMatchId && isValidTriviaUuid(sessionId) ? sessionId.trim() : null;
    const isVerifiedCard = Boolean(verifiedMatchId || verifiedSessionId);

    const normalizedGrid = useMemo(
        () => normalizeGridString(grid, score, total),
        [grid, score, total],
    );

    const cardUrl = useMemo(() => {
        if (verifiedMatchId) {
            return `/api/trivia/og-result-card?matchId=${encodeURIComponent(verifiedMatchId)}`;
        }
        if (verifiedSessionId) {
            return `/api/trivia/og-result-card?sessionId=${encodeURIComponent(verifiedSessionId)}`;
        }
        const params = new URLSearchParams({
            mode: String(mode || 'daily'),
            score: String(Math.max(0, Math.trunc(Number(score) || 0))),
            total: String(Math.max(0, Math.trunc(Number(total) || 0))),
            diamonds: String(Math.max(0, Math.trunc(Number(diamonds) || 0))),
            streak: String(Math.max(0, Math.trunc(Number(streak) || 0))),
            player: String(player || 'Smarter.Poker Player').slice(0, 36),
        });
        if (normalizedGrid) params.set('grid', normalizedGrid);
        return `/api/trivia/og-result-card?${params.toString()}`;
    }, [diamonds, mode, normalizedGrid, player, score, streak, total, verifiedMatchId, verifiedSessionId]);

    const absoluteCardUrl = useMemo(() => {
        if (typeof window !== 'undefined' && window.location?.origin) {
            return `${window.location.origin}${cardUrl}`;
        }
        return `https://smarter.poker${cardUrl}`;
    }, [cardUrl]);

    const shareText = useMemo(
        () => buildWordleShareText({
            mode,
            score,
            total,
            diamonds,
            streak,
            grid: normalizedGrid,
            url: isVerifiedCard ? absoluteCardUrl : shareUrl,
        }),
        [absoluteCardUrl, diamonds, isVerifiedCard, mode, normalizedGrid, score, shareUrl, streak, total],
    );

    const scheduleReset = (setter) => {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
            resetTimerRef.current = null;
            setter('idle');
        }, 2200);
    };

    const handleCopyGrid = async () => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            setCopyState('unavailable');
            scheduleReset(setCopyState);
            return;
        }
        try {
            await navigator.clipboard.writeText(shareText);
            setCopyState('copied');
            scheduleReset(setCopyState);
        } catch {
            setCopyState('failed');
            scheduleReset(setCopyState);
        }
    };

    const handleCopyCardLink = async () => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            setLinkCopyState('unavailable');
            scheduleReset(setLinkCopyState);
            return;
        }
        try {
            await navigator.clipboard.writeText(absoluteCardUrl);
            setLinkCopyState('copied');
            scheduleReset(setLinkCopyState);
        } catch {
            setLinkCopyState('failed');
            scheduleReset(setLinkCopyState);
        }
    };

    const handleNativeShare = async () => {
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share({
                    title: 'Smarter.Poker Trivia Result',
                    text: shareText,
                    url: isVerifiedCard ? absoluteCardUrl : shareUrl,
                });
                setShareState('shared');
                scheduleReset(setShareState);
                return;
            } catch (err) {
                if (err?.name === 'AbortError') return;
            }
        }
        await handleCopyGrid();
    };

    return (
        <TriviaConsoleDialog
            open={open}
            onClose={onClose}
            eyebrow={isVerifiedCard ? 'Verified Result Card' : 'Sample Preview Card'}
            title="Casino Realism Result Card"
            subtitle={isVerifiedCard
                ? 'Server-Verified Settled Result Card Ready To Share'
                : 'Preview Card Only (Unverified Without A Settled Session Record)'}
            pill={copyState === 'copied' || linkCopyState === 'copied'
                ? 'Copied'
                : shareState === 'shared'
                    ? 'Shared'
                    : isVerifiedCard ? 'Verified' : 'Preview'}
            pillInk={copyState === 'copied' || linkCopyState === 'copied' || shareState === 'shared' || isVerifiedCard ? 'green' : 'blue'}
            secondaryAction={{ label: 'Close', onClick: onClose }}
            primaryAction={{
                label: copyState === 'copied' ? 'Score Grid Copied' : 'Copy Score Grid',
                onClick: handleCopyGrid,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ border: '1px solid #6d747c', background: '#050607', padding: '6px' }}>
                    <img
                        src={cardUrl}
                        alt={isVerifiedCard ? 'Verified Trivia Result Card' : 'Trivia Result Card Sample Preview'}
                        style={{ display: 'block', width: '100%', height: 'auto' }}
                    />
                </div>
                <pre
                    aria-label="Copyable Trivia Score Grid"
                    style={{
                        margin: 0,
                        padding: '10px 12px',
                        background: '#050607',
                        border: '1px solid #6d747c',
                        color: '#e4e7ec',
                        fontSize: '12px',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
                >
                    {shareText}
                </pre>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                    <TriviaGlassAction
                        label={shareState === 'shared' ? 'Shared' : 'Share Via Device'}
                        ink="blue"
                        onClick={handleNativeShare}
                    />
                    <TriviaGlassAction
                        label={linkCopyState === 'copied' ? 'Card Link Copied' : 'Copy Card Link'}
                        ink="green"
                        onClick={handleCopyCardLink}
                    />
                    <a
                        href={cardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tc-word tc-ink--cyan"
                        style={{ padding: '10px 12px', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}
                    >
                        Open Card Image
                    </a>
                </div>
                {copyState === 'failed' || copyState === 'unavailable' || linkCopyState === 'failed' || linkCopyState === 'unavailable' ? (
                    <p className="trivia-console-copy tc-ink--red" role="status">
                        Clipboard Access Was Unavailable. Copy The Score Grid Above Manually.
                    </p>
                ) : null}
            </div>
        </TriviaConsoleDialog>
    );
}
