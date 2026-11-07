/**
 * OG Club Arena Hand Card
 * GET /api/og/club-hand?token=AbCd2345
 *
 * The 1200x630 preview image a messaging app shows for smarter.poker/h/<token>:
 * who shared it, the table, the board and the pot. Reads the stored preview
 * facts through fn_ca_shared_hand_open with p_count=false (never a view), so
 * the card shows only what the sender's link carries and nobody can put their
 * own words on a smarter.poker image. Never a player's hole cards. Amounts are
 * chips, with no currency sign (Club Arena rule). Without a readable token it
 * draws the plain Club Arena card.
 * Every element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import { boardCards, handPreviewText, normalizeHandToken, readSharedHand } from '../../../src/lib/sharedHandLink';

export const config = { runtime: 'edge' };

// Suits are drawn, not typed: the image renderer has no text font for
// U+2660-2666 and falls back to emoji artwork, which ignores the colour (a
// grey club and spade on a dark card, a red diamond beside a blue rank).
const SUIT_PATH = {
    h: 'M12 21.6 10.6 20.3C5.4 15.6 2 12.5 2 8.6 2 5.5 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.5 22 8.6c0 3.9-3.4 7-8.6 11.7z',
    d: 'M12 2 20.5 12 12 22 3.5 12z',
    c: 'M12 2.5a4.6 4.6 0 0 1 4.3 6.2A4.6 4.6 0 1 1 13.2 16.6c.3 1.9 1 3.4 2.3 4.9H8.5c1.3-1.5 2-3 2.3-4.9a4.6 4.6 0 1 1-3.1-7.9A4.6 4.6 0 0 1 12 2.5z',
    s: 'M12 2c3.6 4.3 8.5 7.3 8.5 11.3a4.2 4.2 0 0 1-7.2 3c.3 1.9 1 3.3 2.2 4.7H8.5c1.2-1.4 1.9-2.8 2.2-4.7a4.2 4.2 0 0 1-7.2-3C3.5 9.3 8.4 6.3 12 2z',
};
// The four-colour deck Club Arena deals with by default.
const SUIT_COLOR = { h: '#e5484d', d: '#3b82f6', c: '#22c55e', s: '#f1f5f9' };

function Card({ rank, suit }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: 112,
                height: 156,
                borderRadius: 14,
                background: '#0d151e',
                border: '2px solid rgba(139,215,255,0.35)',
            }}
        >
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 900, color: SUIT_COLOR[suit], lineHeight: 1 }}>
                {rank === 'T' ? '10' : rank}
            </div>
            <svg width="44" height="44" viewBox="0 0 24 24" style={{ marginTop: 6 }}>
                <path d={SUIT_PATH[suit]} fill={SUIT_COLOR[suit]} />
            </svg>
        </div>
    );
}

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const token = normalizeHandToken(searchParams.get('token') || '');
    let preview = null;
    if (token) {
        try {
            const shared = await readSharedHand(token);
            if (shared.status === 'found') preview = shared.preview;
        } catch {
            preview = null;
        }
    }
    const { headline } = preview ? handPreviewText(preview) : { headline: 'Club Arena' };
    const sub = preview
        ? [preview.tableName || preview.stakes, preview.pot ? `Pot ${preview.pot} Chips` : null].filter(Boolean).join('  |  ')
        : 'Private Poker Clubs On Smarter.Poker';
    const cards = preview ? boardCards(preview.board) : [];

    return new ImageResponse(
        (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    height: '100%',
                    padding: '56px 64px',
                    background: 'linear-gradient(155deg, #263541 0%, #0d151e 22%, #04080d 66%, #101c28 100%)',
                    color: '#e7ebf2',
                    fontFamily: 'sans-serif',
                }}
            >
                <div style={{ display: 'flex', fontSize: 26, letterSpacing: 4, color: '#8bd7ff', fontWeight: 700 }}>
                    SMARTER.POKER  |  CLUB ARENA
                </div>
                <div style={{ display: 'flex', fontSize: 64, fontWeight: 900, marginTop: 18, lineHeight: 1.05 }}>
                    {headline}
                </div>
                <div style={{ display: 'flex', fontSize: 32, color: '#9aa4b2', marginTop: 14 }}>{sub}</div>
                <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 22, marginTop: 24 }}>
                    {cards.length ? (
                        cards.map((c, i) => <Card key={i} rank={c.rank} suit={c.suit} />)
                    ) : (
                        <div style={{ display: 'flex', fontSize: 34, color: '#9aa4b2' }}>
                            {preview ? 'Decided Before The Flop' : 'Watch The Replay'}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', fontSize: 28, color: '#8bd7ff', fontWeight: 700 }}>Tap To Watch The Replay</div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
            headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
        }
    );
}
