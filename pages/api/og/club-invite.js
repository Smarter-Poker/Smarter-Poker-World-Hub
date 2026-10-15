/**
 * OG Club Invite Card
 * GET /api/og/club-invite?code=ABC2345
 *
 * The 1200x630 preview image a messaging app shows for smarter.poker/i/<code>:
 * the club's logo and name, who sent the invite, members and players playing.
 * Reads fn_club_invite_resolve server-side (service role) with
 * p_count_click=false, so drawing a preview is never counted as an open.
 * Every element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import { resolveInviteServer } from '../../../src/lib/clubInvite';

export const config = { runtime: 'edge' };

const CODE_RE = /^[A-HJ-NP-Z2-9]{7}$/;

async function lookup(code) {
    // Server-side, with the service role; a preview is never counted as an open.
    const data = await resolveInviteServer(code, { countClick: false });
    return data?.found ? data : null;
}

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get('code') || '').trim().toUpperCase();
    let invite = null;
    if (CODE_RE.test(code)) {
        try {
            invite = await lookup(code);
        } catch {
            invite = null;
        }
    }

    const clubName = invite?.club?.name || 'Smarter.Poker Club Arena';
    const alias = invite?.inviter?.alias || 'A Friend';
    const members = Number(invite?.club?.member_count || 0);
    const playing = invite?.club?.players_playing;
    const logo = invite?.club?.logo_url || null;

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(160deg,#050810 0%,#0b1426 55%,#050810 100%)',
                    fontFamily: 'sans-serif',
                    padding: 48,
                }}
            >
                <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: '#f5c542', letterSpacing: 2 }}>
                    SMARTER.POKER CLUB ARENA
                </div>
                <div
                    style={{
                        display: 'flex',
                        width: 180,
                        height: 180,
                        marginTop: 28,
                        borderRadius: 90,
                        border: '5px solid #f5c542',
                        overflow: 'hidden',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#0b0f17',
                    }}
                >
                    {logo ? (
                        <img src={logo} width={180} height={180} style={{ objectFit: 'cover' }} />
                    ) : (
                        <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, color: '#f5c542' }}>
                            {clubName.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', marginTop: 26, fontSize: 30, color: '#9aa4b2' }}>
                    <span style={{ display: 'flex', color: '#f5c542', fontWeight: 800, marginRight: 10 }}>{alias}</span>
                    Invited You To Join
                </div>
                <div style={{ display: 'flex', marginTop: 8, fontSize: 64, fontWeight: 800, color: '#ffffff' }}>
                    {clubName.length > 28 ? `${clubName.slice(0, 27)}...` : clubName}
                </div>
                <div style={{ display: 'flex', marginTop: 22 }}>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 26,
                            fontWeight: 700,
                            color: '#f5c542',
                            border: '2px solid rgba(245,197,66,0.6)',
                            borderRadius: 999,
                            padding: '8px 22px',
                            marginRight: 14,
                        }}
                    >
                        {`${members.toLocaleString('en-US')} ${members === 1 ? 'Member' : 'Members'}`}
                    </div>
                    {playing != null ? (
                        <div
                            style={{
                                display: 'flex',
                                fontSize: 26,
                                fontWeight: 700,
                                color: '#7fd1ff',
                                border: '2px solid rgba(47,140,255,0.6)',
                                borderRadius: 999,
                                padding: '8px 22px',
                            }}
                        >
                            {`${Number(playing).toLocaleString('en-US')} Playing Now`}
                        </div>
                    ) : null}
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
            headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
        }
    );
}
