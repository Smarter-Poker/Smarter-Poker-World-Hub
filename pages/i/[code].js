/**
 * /i/[code] - a player's Share & Invite link (Dan 2026-10-15)
 * ═══════════════════════════════════════════════════════════════════════════
 * One short code per player per club, so the person who sends the link is the
 * person credited. This page:
 *   - is server-rendered, so iMessage, WhatsApp, Discord, Telegram and the rest
 *     draw a preview card ("KingFish Invited You To Club JAQK", the club's
 *     logo, members and players playing) instead of a bare URL;
 *   - sets the first-party attribution cookie on the response (30 days, first
 *     link wins) and mirrors it to localStorage on the client;
 *   - shows who invited them and to which club, with Create Account first;
 *   - sends a player who is already signed in straight to the club's join page.
 *
 * Preview crawlers are not counted as opens.
 */
import { useEffect, useState } from 'react';
import Head from 'next/head';
import {
    CLUB_INVITE_COOKIE,
    CLUB_INVITE_TTL_MS,
    inviteCookieValue,
    isInviteFresh,
    isLinkPreviewBot,
    normalizeInviteCode,
    parseInviteCookieValue,
    readCookie,
    rememberInvite,
    resolveInviteServer,
    safeClubArenaPath,
} from '../../src/lib/clubInvite';
import { getSessionToken } from '../../src/lib/authUtils';

const ORIGIN = 'https://smarter.poker';

export async function getServerSideProps({ params, req, res }) {
    const code = normalizeInviteCode(String(params?.code || ''));
    if (!code) return { props: { invite: null, code: null } };

    const bot = isLinkPreviewBot(req.headers['user-agent']);
    const existing = parseInviteCookieValue(readCookie(req.headers.cookie, CLUB_INVITE_COOKIE));
    // One click per person: a preview crawler, or a browser already carrying
    // this same code (a reload, a second tap), is not a new open.
    const countClick = !bot && existing?.code !== code;
    let invite = null;
    try {
        invite = await resolveInviteServer(code, { countClick });
    } catch (err) {
        console.warn('[club-invite] resolve failed:', err?.message || err);
    }
    if (!invite?.found) {
        res.setHeader('Cache-Control', 'no-store');
        return { props: { invite: null, code } };
    }

    // First link wins: only set the cookie when there is no live one already.
    if (!bot && !isInviteFresh(existing)) {
        res.setHeader(
            'Set-Cookie',
            `${CLUB_INVITE_COOKIE}=${encodeURIComponent(inviteCookieValue(code, Date.now()))}; Max-Age=${Math.floor(
                CLUB_INVITE_TTL_MS / 1000
            )}; Path=/; SameSite=Lax; Secure`
        );
    }
    res.setHeader('Cache-Control', 'private, no-store');

    return {
        props: {
            code,
            invite: {
                code: invite.code,
                joinPath: safeClubArenaPath(invite.join_path) || '/hub/club-arena/clubs-list',
                club: {
                    name: invite.club?.name || 'A Smarter.Poker Club',
                    clubNumber: invite.club?.club_id ?? null,
                    description: invite.club?.description || null,
                    logoUrl: invite.club?.logo_url || null,
                    memberCount: Number(invite.club?.member_count || 0),
                    playersPlaying: invite.club?.players_playing == null ? null : Number(invite.club.players_playing),
                },
                inviter: {
                    alias: invite.inviter?.alias || 'A Club Member',
                    playerNumber: invite.inviter?.player_number || null,
                },
            },
        },
    };
}

const C = {
    bg: '#04060b',
    glass: 'rgba(10,14,22,0.92)',
    steel: 'linear-gradient(160deg,#5b6472 0%,#2a2f38 35%,#8a93a1 55%,#23272e 100%)',
    neon: '#2f8cff',
    gold: '#f5c542',
    text: '#e7ebf2',
    sub: '#9aa4b2',
};

function plural(n, one, many) {
    return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export default function ClubInviteLanding({ invite, code }) {
    const [signedIn, setSignedIn] = useState(false);

    useEffect(() => {
        if (!invite) return;
        rememberInvite(invite.code);
        // A stored session token, not the cached header user: a signed-out
        // visitor with a stale header cache must still see Create Account.
        if (getSessionToken()) {
            setSignedIn(true);
            // Already a Smarter.Poker player: the club join page claims the
            // invite and admits them. replace() keeps Back sensible.
            window.location.replace(invite.joinPath);
        }
    }, [invite]);

    if (!invite) {
        return (
            <main style={styles.page}>
                <Head>
                    <title>Invite Not Found | Smarter.Poker</title>
                    <meta name="robots" content="noindex" />
                </Head>
                <div style={styles.frame}>
                    <div style={styles.card}>
                        <h1 style={styles.title}>This Invite Did Not Work</h1>
                        <p style={styles.sub}>The Link May Be Mistyped Or The Club Is No Longer Available.</p>
                        <a href="/hub/club-arena/clubs-list" style={styles.primary}>Browse Clubs</a>
                    </div>
                </div>
            </main>
        );
    }

    const { club, inviter } = invite;
    const signupHref =
        `/auth/signup?invite=${encodeURIComponent(invite.code)}` +
        (inviter.playerNumber ? `&ref=${encodeURIComponent(inviter.playerNumber)}` : '') +
        `&redirect=${encodeURIComponent(invite.joinPath)}`;
    const loginHref = `/auth/login?redirect=${encodeURIComponent(invite.joinPath)}`;
    const pageUrl = `${ORIGIN}/i/${code}`;
    const ogImage = `${ORIGIN}/api/og/club-invite?code=${encodeURIComponent(code)}`;
    const headline = `${inviter.alias} Invited You To ${club.name}`;
    const stats = [plural(club.memberCount, 'Member', 'Members')];
    if (club.playersPlaying != null) stats.push(`${club.playersPlaying.toLocaleString('en-US')} Playing Now`);
    const description = `${stats.join(' | ')}. Create Your Free Smarter.Poker Account And Join The Club.`;

    return (
        <main style={styles.page}>
            <Head>
                <title>{`${headline} | Smarter.Poker`}</title>
                <meta name="description" content={description} />
                <meta name="robots" content="noindex" />
                <link rel="canonical" href={pageUrl} />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="Smarter.Poker" />
                <meta property="og:url" content={pageUrl} />
                <meta property="og:title" content={headline} />
                <meta property="og:description" content={description} />
                <meta property="og:image" content={ogImage} />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="630" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={headline} />
                <meta name="twitter:description" content={description} />
                <meta name="twitter:image" content={ogImage} />
            </Head>

            <div style={styles.frame}>
                <div style={styles.card}>
                    <div style={styles.logo}>
                        {club.logoUrl ? (
                            <img src={club.logoUrl} alt="" style={styles.logoImg} />
                        ) : (
                            <span style={styles.logoLetter}>{(club.name[0] || 'S').toUpperCase()}</span>
                        )}
                    </div>

                    <p style={styles.kicker}>
                        <span style={{ color: C.gold }}>{inviter.alias}</span> Invited You To Join
                    </p>
                    <h1 style={styles.title}>{club.name}</h1>
                    {club.description ? <p style={styles.desc}>{club.description}</p> : null}

                    <div style={styles.chips}>
                        <span style={styles.chip}>{plural(club.memberCount, 'Member', 'Members')}</span>
                        {club.playersPlaying != null ? (
                            <span style={{ ...styles.chip, color: '#7fd1ff', borderColor: 'rgba(47,140,255,0.55)' }}>
                                {club.playersPlaying.toLocaleString('en-US')} Playing Now
                            </span>
                        ) : null}
                        {club.clubNumber ? <span style={styles.chip}>Club ID {club.clubNumber}</span> : null}
                    </div>

                    <hr style={styles.rule} />

                    {signedIn ? (
                        <p style={styles.sub}>Taking You To The Club...</p>
                    ) : (
                        <>
                            <ol style={styles.steps}>
                                <li>Create Your Free Account</li>
                                <li>Verify Your Phone Number</li>
                                <li>Join {club.name} With One Tap</li>
                            </ol>
                            <a href={signupHref} style={styles.primary}>Create Account</a>
                            <a href={loginHref} style={styles.secondary}>I Already Have An Account</a>
                            {inviter.playerNumber ? (
                                <p style={styles.fine}>Referral Number {inviter.playerNumber} Is Saved For You.</p>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: `radial-gradient(1200px 600px at 50% -10%, rgba(47,140,255,0.18), transparent 60%), ${C.bg}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        color: C.text,
        boxSizing: 'border-box',
    },
    frame: {
        width: '100%',
        maxWidth: 420,
        padding: 6,
        borderRadius: 22,
        background: C.steel,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.06), 0 0 28px rgba(47,140,255,0.35)`,
    },
    card: {
        borderRadius: 17,
        background: C.glass,
        padding: '28px 20px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
    },
    logo: {
        width: 96,
        height: 96,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `2px solid ${C.gold}`,
        boxShadow: '0 0 18px rgba(245,197,66,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0f17',
        marginBottom: 16,
    },
    logoImg: { width: '100%', height: '100%', objectFit: 'cover' },
    logoLetter: { fontSize: 40, fontWeight: 800, color: C.gold },
    kicker: { margin: 0, fontSize: 15, color: C.sub, fontWeight: 600 },
    title: { margin: '6px 0 4px', fontSize: 26, lineHeight: 1.2, fontWeight: 800, color: '#fff' },
    desc: { margin: '6px 0 0', fontSize: 14, color: C.sub, lineHeight: 1.45 },
    chips: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 },
    chip: {
        fontSize: 13,
        fontWeight: 700,
        color: C.gold,
        border: '1px solid rgba(245,197,66,0.5)',
        borderRadius: 999,
        padding: '5px 12px',
    },
    rule: { width: '100%', border: 0, borderTop: '1px solid rgba(255,255,255,0.08)', margin: '20px 0 14px' },
    steps: {
        margin: '0 0 18px',
        padding: '0 0 0 20px',
        textAlign: 'left',
        alignSelf: 'stretch',
        color: C.text,
        fontSize: 14,
        lineHeight: 1.9,
    },
    primary: {
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'linear-gradient(180deg,#3d9bff,#1b6fe0)',
        color: '#fff',
        fontWeight: 800,
        fontSize: 16,
        textDecoration: 'none',
        boxShadow: '0 6px 18px rgba(47,140,255,0.35)',
    },
    secondary: {
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        marginTop: 10,
        padding: '13px 16px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.16)',
        color: C.text,
        fontWeight: 700,
        fontSize: 15,
        textDecoration: 'none',
    },
    sub: { margin: '4px 0 0', fontSize: 14, color: C.sub },
    fine: { margin: '12px 0 0', fontSize: 12, color: C.sub },
};
