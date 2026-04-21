/**
 * OG Tournament Result Card Image Generator
 * GET /api/og/tournament-card?placement=3&event=Main Event&buyin=$500&prize=$5000&player=Dan&venue=Horseshoe
 *
 * Generates a shareable tournament result card image using @vercel/og
 * Every element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import { reportApiError } from '../../../src/lib/sentryWrap';

export const config = { runtime: 'edge' };

function getPlacementEmoji(p) {
    if (p === 1) return '🥇';
    if (p === 2) return '🥈';
    if (p === 3) return '🥉';
    return '🏆';
}

function getPlacementSuffix(p) {
    if (p === 1) return 'st';
    if (p === 2) return 'nd';
    if (p === 3) return 'rd';
    return 'th';
}

export default async function handler(req) {
    try {
        const { searchParams } = new URL(req.url);
        const placement = parseInt(searchParams.get('placement') || '1', 10);
        const event = searchParams.get('event') || 'Poker Tournament';
        const buyin = searchParams.get('buyin') || '$500';
        const prize = searchParams.get('prize') || '$0';
        const player = searchParams.get('player') || 'Smarter.Poker Player';
        const venue = searchParams.get('venue') || 'Live Poker';
        const entries = searchParams.get('entries') || '';
        const date = searchParams.get('date') || '';

        const isTop3 = placement <= 3;
        const accentColor = placement === 1 ? '#FFD700' : placement === 2 ? '#C0C0C0' : placement === 3 ? '#CD7F32' : '#4facfe';

        return new ImageResponse(
            (
                <div style={{
                    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                    background: 'linear-gradient(135deg, #0a0a1e 0%, #1a1a3e 40%, #0d0d2e 100%)',
                    padding: '48px', fontFamily: 'sans-serif', position: 'relative',
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#FFD700', letterSpacing: 1 }}>SMARTER.POKER</div>
                            <div style={{ display: 'flex', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Tournament Result Card</div>
                        </div>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 64, height: 64, borderRadius: 32,
                            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`,
                            fontSize: 32,
                        }}>
                            {getPlacementEmoji(placement)}
                        </div>
                    </div>

                    {/* Player + Placement */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 22,
                            background: `linear-gradient(135deg, ${accentColor}, #FFA500)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, fontWeight: 800, color: '#000', marginRight: 12,
                        }}>
                            {player.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: '#E4E6EB' }}>{player}</div>
                            <div style={{ display: 'flex', fontSize: 14, color: accentColor, fontWeight: 600 }}>
                                Finished {placement}{getPlacementSuffix(placement)} Place
                            </div>
                        </div>
                    </div>

                    {/* Event Name */}
                    <div style={{
                        display: 'flex', fontSize: 22, fontWeight: 800, color: '#E4E6EB',
                        marginBottom: '8px', lineHeight: 1.3,
                    }}>
                        {event}
                    </div>
                    <div style={{
                        display: 'flex', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: '24px',
                    }}>
                        {venue}{date ? ` — ${date}` : ''}
                    </div>

                    {/* Stats Row */}
                    <div style={{ display: 'flex', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', gap: '32px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Buy-In</div>
                            <div style={{ display: 'flex', fontSize: 22, fontWeight: 800, color: '#E4E6EB' }}>{buyin}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Prize Won</div>
                            <div style={{ display: 'flex', fontSize: 22, fontWeight: 800, color: '#2ECC71' }}>{prize}</div>
                        </div>
                        {entries && (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Field</div>
                                <div style={{ display: 'flex', fontSize: 22, fontWeight: 800, color: '#E4E6EB' }}>{entries}</div>
                            </div>
                        )}
                    </div>

                    {/* Branding */}
                    <div style={{ display: 'flex', position: 'absolute', bottom: 16, right: 48, fontSize: 12, color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
                        smarter.poker
                    </div>
                </div>
            ),
            { width: 800, height: 420 }
        );
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error('[OG Tournament Card] Error:', err);
        return new Response('Error generating image', { status: 500 });
    }
}
