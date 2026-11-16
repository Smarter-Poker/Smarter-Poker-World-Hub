/**
 * OG Club Arena Tournament Card
 * GET /api/og/club-tournament?id=<tournament uuid>
 *
 * The 1200x630 preview image a messaging app shows for smarter.poker/t/<id>:
 * the event's name, its club, the game, buy-in, guarantee and start time.
 * Reads fn_ca_tournament_share_preview by id, so the card shows only what the
 * lobby shows and nobody can put their own words on a smarter.poker image.
 * A private, VIP-only or non-public-club event draws the plain card, exactly
 * like a missing one. Amounts are chips, with no currency sign (Club Arena
 * rule). Every element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import {
    buyInWords,
    gameLine,
    guaranteeWords,
    normalizeTournamentId,
    readSharedTournament,
    startWords,
    statusWords,
} from '../../../src/lib/sharedTournamentLink';

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
            <div style={{ display: 'flex', fontSize: 38, fontWeight: 900, marginTop: 6 }}>{value}</div>
        </div>
    );
}

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const id = normalizeTournamentId(searchParams.get('id') || '');
    let preview = null;
    if (id) {
        try {
            const shared = await readSharedTournament(id);
            if (shared.status === 'found') preview = shared.preview;
        } catch {
            preview = null;
        }
    }
    const now = Date.now();
    const title = preview ? preview.name || 'Tournament' : 'Club Arena Tournaments';
    const sub = preview
        ? [gameLine(preview), preview.club].filter(Boolean).join('  |  ')
        : 'Private Poker Clubs On Smarter.Poker';
    const status = preview ? statusWords(preview, now) : '';
    const facts = preview
        ? [
              { label: 'BUY-IN', value: buyInWords(preview).replace(/^Buy-In /, '') },
              guaranteeWords(preview) ? { label: 'GUARANTEE', value: guaranteeWords(preview).replace(/ GTD$/, '') } : null,
              status === 'Registration Open' && startWords(preview.startTime)
                  ? { label: 'STARTS', value: startWords(preview.startTime) }
                  : { label: 'STATUS', value: status },
          ].filter(Boolean)
        : [];
    const cta = preview && (status === 'Registration Open' || status === 'Running, Late Registration Open')
        ? 'Tap To Register'
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
                    SMARTER.POKER  |  CLUB ARENA
                </div>
                <div style={{ display: 'flex', fontSize: 66, fontWeight: 900, marginTop: 18, lineHeight: 1.05 }}>
                    {title.length > 44 ? `${title.slice(0, 43)}...` : title}
                </div>
                <div style={{ display: 'flex', fontSize: 32, color: '#9aa4b2', marginTop: 14 }}>{sub}</div>
                <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 22, marginTop: 24 }}>
                    {facts.length ? (
                        facts.map(f => <Fact key={f.label} label={f.label} value={f.value} />)
                    ) : (
                        <div style={{ display: 'flex', fontSize: 34, color: '#9aa4b2' }}>MTTs, Spins And Sit & Gos</div>
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
