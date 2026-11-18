/**
 * OG Club Invite Card
 * GET /api/og/club-invite?code=ABC2345
 *
 * The 1200x630 preview image a messaging app shows for smarter.poker/i/<code>:
 * the club's logo and name, who sent the invite, and the two figure lines
 * (club members, players on the floor it plays on) worded by the database.
 * Reads fn_club_invite_resolve server-side (service role) with
 * p_count_click=false, so drawing a preview is never counted as an open.
 * Every element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import { inviteFigureLines, resolveInviteServer } from '../../../src/lib/clubInvite';

export const config = { runtime: 'edge' };

const CODE_RE = /^[A-HJ-NP-Z2-9]{7}$/;

async function lookup(code) {
    // Server-side, with the service role; a preview is never counted as an open.
    const data = await resolveInviteServer(code, { countClick: false });
    return data?.found ? data : null;
}

// Satori renders png, jpeg and gif only, and a logo it cannot fetch throws the
// whole card into a 500. So the logo is fetched here first and embedded as a
// data URL; anything else falls back to the letter avatar.
const LOGO_TYPES = /^image\/(png|jpe?g|gif)\b/i;
const LOGO_MAX_BYTES = 2_000_000;

async function embeddableLogo(url) {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !LOGO_TYPES.test(type)) return null;
        const buf = await res.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > LOGO_MAX_BYTES) return null;
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return `data:${type.split(';')[0].trim()};base64,${btoa(bin)}`;
    } catch {
        return null;
    }
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
    const lines = inviteFigureLines(invite?.club);
    const logoSize = lines.length > 2 ? 110 : 180;
    const clubNumber = invite?.club?.club_id;
    const logo = await embeddableLogo(invite?.club?.logo_url);

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
                    padding: lines.length > 2 ? 32 : 48,
                }}
            >
                <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: '#f5c542', letterSpacing: 2 }}>
                    SMARTER.POKER CLUB ARENA
                </div>
                <div
                    style={{
                        display: 'flex',
                        width: logoSize,
                        height: logoSize,
                        marginTop: 28,
                        borderRadius: logoSize / 2,
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
                {clubNumber != null && String(clubNumber) !== '' ? (
                    <div style={{ display: 'flex', marginTop: 6, fontSize: 24, color: '#9aa4b2' }}>
                        {`Club ID: ${clubNumber}`}
                    </div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 22 }}>
                    {lines.map((line, i) => (
                        <div
                            key={line}
                            style={{
                                display: 'flex',
                                fontSize: 26,
                                fontWeight: 700,
                                color: i === 0 ? '#f5c542' : '#7fd1ff',
                                border: i === 0 ? '2px solid rgba(245,197,66,0.6)' : '2px solid rgba(47,140,255,0.6)',
                                borderRadius: 999,
                                padding: '8px 22px',
                                marginTop: i === 0 ? 0 : 12,
                            }}
                        >
                            {/* Never cut a figure line short: the Horse disclosure sits at its end. */}
                            {line}
                        </div>
                    ))}
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
