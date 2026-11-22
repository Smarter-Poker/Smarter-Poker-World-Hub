/**
 * OG Club Arena Table & Lightning Card
 * GET /api/og/club-game?kind=table|lightning&id=<uuid>
 *
 * The 1200x630 preview image a messaging app shows for smarter.poker/g/<id>
 * and smarter.poker/l/<id>: game name, club, variant, stakes, buy-in range
 * and seats/fast-fold format. Reads fn_ca_table_share_preview or
 * fn_ca_lightning_share_preview by id only, so nobody can inject arbitrary
 * text into a smarter.poker image. Private, missing, or unavailable RPC IDs
 * render the clean generic Poker Arena card. Amounts are chips/diamonds,
 * never a currency sign. Every JSX element MUST have display:'flex' for
 * Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import {
    buyInRangeWords,
    gameVariantWords,
    normalizeGameId,
    readSharedLightning,
    readSharedTable,
    seatsWords,
    stakesWords,
} from '../../../src/lib/sharedGameLink';

export const config = { runtime: 'edge' };

function Fact({ label, value }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '18px 24px',
                borderRadius: 16,
                background: '#0d151e',
                border: '2px solid rgba(139,215,255,0.30)',
                minWidth: 250,
            }}
        >
            <div style={{ display: 'flex', fontSize: 22, letterSpacing: 2, color: '#9aa4b2' }}>{label}</div>
            <div style={{ display: 'flex', fontSize: 36, fontWeight: 900, marginTop: 6 }}>{value}</div>
        </div>
    );
}

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind') === 'lightning' ? 'lightning' : 'table';
    const id = normalizeGameId(searchParams.get('id') || '');

    let preview = null;
    if (id) {
        try {
            const shared = kind === 'lightning' ? await readSharedLightning(id) : await readSharedTable(id);
            if (shared.status === 'found') preview = shared.preview;
        } catch {
            preview = null;
        }
    }

    const isLightning = kind === 'lightning';
    const eyebrow = isLightning ? 'SMARTER.POKER  |  LIGHTNING POKER' : 'SMARTER.POKER  |  CLUB ARENA';
    const title = preview
        ? preview.name || (isLightning ? 'Lightning Game' : 'Live Table')
        : isLightning
          ? 'Club Arena Lightning Poker'
          : 'Club Arena Cash Tables';
    const variant = preview ? gameVariantWords({ ...preview, kind }) : '';
    const sub = preview
        ? [variant, preview.club].filter(Boolean).join('  |  ') || 'Private Poker Clubs On Smarter.Poker'
        : isLightning
          ? 'Fast-Fold Poker On Smarter.Poker'
          : 'Private Poker Clubs On Smarter.Poker';

    const stakes = preview ? stakesWords(preview) : '';
    const buyIn = preview ? buyInRangeWords(preview) : '';
    const seats = preview ? seatsWords({ ...preview, kind }) : '';
    const facts = preview
        ? [
              stakes ? { label: 'STAKES', value: stakes } : null,
              buyIn ? { label: 'BUY-IN', value: buyIn } : null,
              seats ? { label: isLightning ? 'FORMAT' : 'SEATS', value: seats } : null,
          ].filter(Boolean)
        : [];

    const fallbackBody = isLightning
        ? 'Instant New Hand On Every Fold'
        : 'Live Hold\'em, PLO And Mixed Tables';
    const cta = preview
        ? isLightning
            ? 'Tap To Play Lightning'
            : 'Tap To Join Table'
        : 'Tap To Open Club Arena';

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
                    {eyebrow}
                </div>
                <div style={{ display: 'flex', fontSize: 66, fontWeight: 900, marginTop: 18, lineHeight: 1.05 }}>
                    {title.length > 44 ? `${title.slice(0, 43)}...` : title}
                </div>
                <div style={{ display: 'flex', fontSize: 32, color: '#9aa4b2', marginTop: 14 }}>{sub}</div>
                <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 22, marginTop: 24 }}>
                    {facts.length ? (
                        facts.map(f => <Fact key={f.label} label={f.label} value={f.value} />)
                    ) : (
                        <div style={{ display: 'flex', fontSize: 34, color: '#9aa4b2' }}>{fallbackBody}</div>
                    )}
                </div>
                <div style={{ display: 'flex', fontSize: 28, color: '#8bd7ff', fontWeight: 700 }}>{cta}</div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
            headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
        }
    );
}
