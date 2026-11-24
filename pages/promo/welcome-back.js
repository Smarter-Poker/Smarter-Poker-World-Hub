import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { getFreshAccessToken } from '../../src/lib/authUtils';
import {
    KINGS_CLUB_CODE,
    WELCOME_BACK_STORAGE_KEY,
    cleanWelcomeBackTokenShape,
} from '../../src/lib/promoCampaigns/welcomeBackOffer.mjs';

export default function WelcomeBackOfferPage() {
    const router = useRouter();
    const [offerToken, setOfferToken] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [authChecked, setAuthChecked] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [accepting, setAccepting] = useState(false);
    const [statusInfo, setStatusInfo] = useState(null);
    const [claimedReward, setClaimedReward] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!router.isReady) return;
        const fromQuery = typeof router.query.wb === 'string' ? cleanWelcomeBackTokenShape(router.query.wb) : null;
        if (fromQuery) {
            setOfferToken(fromQuery);
            try {
                window.sessionStorage.setItem(WELCOME_BACK_STORAGE_KEY, fromQuery);
            } catch {
                /* ignore storage restrictions */
            }
            return;
        }
        try {
            const saved = cleanWelcomeBackTokenShape(window.sessionStorage.getItem(WELCOME_BACK_STORAGE_KEY));
            if (saved) setOfferToken(saved);
        } catch {
            /* ignore */
        }
    }, [router.isReady, router.query.wb]);

    const loadStatus = useCallback(async (jwt, wb) => {
        if (!jwt || !wb) return;
        setCheckingStatus(true);
        setErrorMessage('');
        try {
            const response = await fetch(`/api/promo/accept-welcome-back?wb=${encodeURIComponent(wb)}`, {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            const body = await response.json().catch(() => ({}));
            if (response.ok && body?.success) {
                setStatusInfo(body);
                if (body.alreadyClaimed && body.reward) {
                    setClaimedReward(body.reward);
                }
            } else if (body?.error) {
                setErrorMessage(body.error);
            }
        } catch (err) {
            setErrorMessage(err?.message || 'Unable To Check Offer Eligibility Right Now.');
        } finally {
            setCheckingStatus(false);
        }
    }, []);

    useEffect(() => {
        if (!router.isReady) return;
        let active = true;
        getFreshAccessToken().then((jwt) => {
            if (!active) return;
            setAccessToken(jwt || '');
            setAuthChecked(true);
        });
        return () => {
            active = false;
        };
    }, [router.isReady]);

    useEffect(() => {
        if (authChecked && accessToken && offerToken) {
            loadStatus(accessToken, offerToken);
        }
    }, [authChecked, accessToken, offerToken, loadStatus]);

    const handleAcceptOffer = async () => {
        if (!accessToken || !offerToken || accepting) return;
        setAccepting(true);
        setErrorMessage('');
        try {
            const response = await fetch('/api/promo/accept-welcome-back', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ wb: offerToken }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || !body?.success) {
                throw new Error(body?.error || 'Unable To Accept Welcome-Back Offer.');
            }
            setClaimedReward(body);
            setStatusInfo((prev) => ({ ...(prev || {}), eligible: true, alreadyClaimed: true, reward: body }));
        } catch (err) {
            setErrorMessage(err?.message || 'Unable To Accept Welcome-Back Offer.');
        } finally {
            setAccepting(false);
        }
    };

    const returnTarget = offerToken
        ? `/promo/welcome-back?wb=${encodeURIComponent(offerToken)}`
        : '/promo/welcome-back';
    const signInHref = `/auth/login?redirect=${encodeURIComponent(returnTarget)}`;
    const clubHref = `/hub/club-arena/?join=${KINGS_CLUB_CODE}&welcome=chips`;

    return (
        <>
            <Head>
                <title>Welcome-Back Offer | Smarter.Poker</title>
                <meta name="robots" content="noindex,nofollow" />
            </Head>
            <main
                style={{
                    minHeight: '100vh',
                    background: 'radial-gradient(circle at top, #0f202c 0%, #05070a 62%)',
                    color: '#e7edf3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '32px 16px',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                <section
                    style={{
                        width: '100%',
                        maxWidth: '580px',
                        background: '#0b1118',
                        border: '1px solid #1b2c3d',
                        borderRadius: '18px',
                        padding: '36px 28px',
                        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
                    }}
                >
                    <div
                        style={{
                            color: '#4fc1b3',
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '3px',
                            textTransform: 'uppercase',
                        }}
                    >
                        Smarter.Poker Exclusive Invitation
                    </div>

                    <h1
                        style={{
                            margin: '14px 0 12px 0',
                            color: '#ffffff',
                            fontSize: '28px',
                            lineHeight: 1.2,
                            fontWeight: 800,
                        }}
                    >
                        Welcome Back To The Tables
                    </h1>

                    <p style={{ margin: '0 0 24px 0', color: '#b7cadc', fontSize: '15px', lineHeight: 1.6 }}>
                        Accept Your Exclusive Returning-Player Package Below To Unlock Instant Rewards Across Club Arena And Smarter.Poker.
                    </p>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: '12px',
                            marginBottom: '26px',
                        }}
                    >
                        <div style={{ background: '#101a24', border: '1px solid #1f3347', borderRadius: '12px', padding: '16px 14px' }}>
                            <div style={{ color: '#4fc1b3', fontSize: '22px', fontWeight: 800 }}>25 Free Chips</div>
                            <div style={{ color: '#8fa6bc', fontSize: '12.5px', marginTop: '4px' }}>In Kings Club (Code 25450)</div>
                        </div>
                        <div style={{ background: '#101a24', border: '1px solid #1f3347', borderRadius: '12px', padding: '16px 14px' }}>
                            <div style={{ color: '#60a5fa', fontSize: '22px', fontWeight: 800 }}>500 Diamonds</div>
                            <div style={{ color: '#8fa6bc', fontSize: '12.5px', marginTop: '4px' }}>Instant Wallet Credit</div>
                        </div>
                        <div style={{ background: '#101a24', border: '1px solid #1f3347', borderRadius: '12px', padding: '16px 14px' }}>
                            <div style={{ color: '#fbbf24', fontSize: '22px', fontWeight: 800 }}>1-Month VIP</div>
                            <div style={{ color: '#8fa6bc', fontSize: '12.5px', marginTop: '4px' }}>30 Days Full VIP Access</div>
                        </div>
                    </div>

                    {errorMessage && (
                        <div
                            role="alert"
                            style={{
                                background: 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                color: '#fca5a5',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                fontSize: '14px',
                                marginBottom: '18px',
                            }}
                        >
                            {errorMessage}
                        </div>
                    )}

                    {!offerToken ? (
                        <div
                            style={{
                                background: '#111b26',
                                border: '1px solid #243649',
                                borderRadius: '12px',
                                padding: '18px',
                                color: '#c4d5e5',
                                fontSize: '14px',
                                lineHeight: 1.55,
                            }}
                        >
                            Open The Official Link From Your Smarter.Poker Welcome-Back Email Or SMS Text Message To Unlock And Accept Your Offer.
                        </div>
                    ) : !authChecked || checkingStatus ? (
                        <div style={{ color: '#9fb3c8', fontSize: '14px', padding: '12px 0' }}>
                            Verifying Your Welcome-Back Invitation...
                        </div>
                    ) : !accessToken ? (
                        <div>
                            <p style={{ margin: '0 0 16px 0', color: '#c4d5e5', fontSize: '14px', lineHeight: 1.55 }}>
                                Sign In To Your Existing Smarter.Poker Account To Accept This Offer And Credit All Three Rewards Immediately.
                            </p>
                            <Link
                                href={signInHref}
                                style={{
                                    display: 'inline-block',
                                    width: '100%',
                                    textAlign: 'center',
                                    background: '#4fc1b3',
                                    color: '#041e1b',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '16px',
                                    padding: '15px 24px',
                                    borderRadius: '10px',
                                    boxSizing: 'border-box',
                                }}
                            >
                                Sign In To Accept Offer
                            </Link>
                        </div>
                    ) : claimedReward ? (
                        <div
                            role="status"
                            style={{
                                background: 'rgba(79, 193, 179, 0.12)',
                                border: '1px solid rgba(79, 193, 179, 0.45)',
                                borderRadius: '12px',
                                padding: '20px',
                            }}
                        >
                            <div style={{ color: '#4fc1b3', fontWeight: 800, fontSize: '17px', marginBottom: '8px' }}>
                                Offer Accepted - Your Rewards Are Live
                            </div>
                            <p style={{ margin: '0 0 18px 0', color: '#d6e3f0', fontSize: '14px', lineHeight: 1.55 }}>
                                25 Free Chips In Kings Club, 500 Free Diamonds, And 30 Days Of Free VIP Access Have Been Credited To Your Account.
                            </p>
                            <Link
                                href={clubHref}
                                style={{
                                    display: 'inline-block',
                                    width: '100%',
                                    textAlign: 'center',
                                    background: '#4fc1b3',
                                    color: '#041e1b',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '16px',
                                    padding: '14px 24px',
                                    borderRadius: '10px',
                                    boxSizing: 'border-box',
                                }}
                            >
                                Enter Kings Club Now
                            </Link>
                        </div>
                    ) : statusInfo && statusInfo.eligible === false ? (
                        <div
                            style={{
                                background: '#111b26',
                                border: '1px solid #243649',
                                borderRadius: '12px',
                                padding: '18px',
                            }}
                        >
                            <p style={{ margin: '0 0 16px 0', color: '#d6e3f0', fontSize: '14px', lineHeight: 1.55 }}>
                                {statusInfo.message || 'This Account Is Not Eligible For The 3-Week Welcome-Back Offer.'}
                            </p>
                            <Link
                                href="/hub/club-arena/"
                                style={{
                                    display: 'inline-block',
                                    background: '#1c2d3f',
                                    color: '#e7edf3',
                                    textDecoration: 'none',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    padding: '12px 20px',
                                    borderRadius: '8px',
                                }}
                            >
                                Open Club Arena
                            </Link>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleAcceptOffer}
                            disabled={accepting}
                            style={{
                                display: 'block',
                                width: '100%',
                                background: '#4fc1b3',
                                color: '#041e1b',
                                border: 'none',
                                fontWeight: 800,
                                fontSize: '16px',
                                padding: '15px 24px',
                                borderRadius: '10px',
                                cursor: accepting ? 'wait' : 'pointer',
                                opacity: accepting ? 0.75 : 1,
                            }}
                        >
                            {accepting ? 'Activating Your Rewards...' : 'Accept Offer And Claim Rewards'}
                        </button>
                    )}
                </section>
            </main>
        </>
    );
}
