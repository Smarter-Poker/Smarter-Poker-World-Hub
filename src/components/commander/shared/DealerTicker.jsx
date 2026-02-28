/**
 * DealerTicker — Shared scrolling ticker for dealer push & break info
 * 
 * Drop into any display page (waitlist desk, tournament clock, etc.)
 * Fetches dealer rotation data and renders a scrolling marquee showing:
 *   - Dealers at tables with time elapsed and push status
 *   - Dealers on break with time elapsed
 *   - Next push due (countdown)
 * 
 * Props:
 *   accentColor: string (hex) — ticker text color (default: #D4AF37 gold)
 *   bgColor: string (hex) — background color (default: transparent)
 *   fontSize: number — font size in px (default: 18)
 *   borderColor: string — top border color (default: #333)
 *   speed: number — scroll speed in seconds (default: 25)
 *   showBorder: boolean — show top border (default: true)
 */
import { useState, useEffect, useCallback } from 'react';

const PUSH_THRESHOLD = 30; // minutes

function minutesSince(dateStr) {
    if (!dateStr) return 0;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

export default function DealerTicker({
    accentColor = '#D4AF37',
    bgColor = 'transparent',
    fontSize = 18,
    borderColor = '#333',
    speed = 25,
    showBorder = true,
}) {
    const [dealers, setDealers] = useState([]);
    const [rotations, setRotations] = useState([]);

    const fetchDealerData = useCallback(async () => {
        try {
            const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
            const venueId = staff.venue_id || '';
            if (!venueId) return;
            const headers = {
                Authorization: `Bearer ${staff.token || ''}`,
                'x-staff-session': localStorage.getItem('commander_staff') || ''
            };
            const [dRes, rRes] = await Promise.all([
                fetch(`/api/commander/dealers?venue_id=${venueId}`, { headers }).then(r => r.json()).catch(() => ({})),
                fetch(`/api/commander/dealers/rotations?venue_id=${venueId}`, { headers }).then(r => r.json()).catch(() => ({}))
            ]);
            const dealersArr = dRes.data?.dealers || (Array.isArray(dRes.data) ? dRes.data : []);
            setDealers(dealersArr.filter(d => d.is_active !== false));
            const rotationsArr = rRes.data?.rotations || (Array.isArray(rRes.data) ? rRes.data : []);
            setRotations(rotationsArr.filter(r => !r.ended_at));
        } catch (err) { /* silent */ }
    }, []);

    useEffect(() => {
        fetchDealerData();
        const poll = setInterval(fetchDealerData, 15000);
        return () => clearInterval(poll);
    }, [fetchDealerData]);

    // Build ticker message parts
    const parts = [];

    // Dealers at tables
    const dealingParts = [];
    rotations.forEach(r => {
        const dealer = r.commander_dealers || dealers.find(d => d.id === r.dealer_id);
        const name = dealer?.display_name || dealer?.name || r.dealer_name || 'Dealer';
        const tableNum = r.commander_tables?.table_number || r.table_number || '?';
        const mins = minutesSince(r.started_at);
        const pushFlag = mins >= PUSH_THRESHOLD ? ' ⚠ PUSH' : mins >= 25 ? ' ⏱' : '';
        dealingParts.push(`${name} → T${tableNum} (${mins}m${pushFlag})`);
    });
    if (dealingParts.length > 0) {
        parts.push(`🃏 DEALING: ${dealingParts.join('  •  ')}`);
    }

    // Dealers on break
    const breakDealers = dealers.filter(d => d.current_status === 'on_break');
    if (breakDealers.length > 0) {
        const breakParts = breakDealers.map(d => {
            const name = d.display_name || d.name;
            const mins = d.break_started_at ? minutesSince(d.break_started_at) : 0;
            return `${name} (${mins}m)`;
        });
        parts.push(`☕ BREAK: ${breakParts.join('  •  ')}`);
    }

    // Next push due
    if (rotations.length > 0) {
        const oldest = rotations.reduce((max, r) => {
            const mins = minutesSince(r.started_at);
            return mins > max.mins ? { mins, r } : max;
        }, { mins: 0, r: null });
        if (oldest.r && oldest.mins < PUSH_THRESHOLD) {
            const remaining = PUSH_THRESHOLD - oldest.mins;
            parts.push(`⏱ Next push in ${remaining}m`);
        } else if (oldest.r) {
            parts.push(`⚠ PUSH OVERDUE`);
        }
    }

    // If no data, don't render
    if (parts.length === 0) return null;

    const message = parts.join('   \u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0   ');

    return (
        <>
            <div style={{
                padding: '8px 0',
                borderTop: showBorder ? `2px solid ${borderColor}55` : 'none',
                background: bgColor,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                position: 'relative',
            }}>
                <div style={{
                    display: 'inline-flex',
                    animation: `dealerTickerScroll ${speed}s linear infinite`,
                }}>
                    <span style={{
                        fontSize: `${fontSize}px`,
                        color: accentColor,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        paddingRight: '120px',
                        whiteSpace: 'nowrap',
                    }}>{message}</span>
                    <span style={{
                        fontSize: `${fontSize}px`,
                        color: accentColor,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        paddingRight: '120px',
                        whiteSpace: 'nowrap',
                    }}>{message}</span>
                </div>
            </div>
            <style jsx>{`
        @keyframes dealerTickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
        </>
    );
}
