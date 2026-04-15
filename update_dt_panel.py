import re

with open('src/components/poker-near-me/DailyTournamentsPanel.jsx', 'r') as f:
    content = f.read()

# ADD IMPORTS
if "import { getInitialsColor }" not in content:
    content = content.replace(
        "import React, { useState, useEffect, useMemo } from 'react';",
        "import React, { useState, useEffect, useMemo } from 'react';\nimport { getInitialsColor } from './pnm-utils';"
    )

# ADD SOURCE_COLORS and ICONS
icons = """
const SOURCE_COLORS = {
  daily:  { bg: 'rgba(0, 212, 255, 0.15)', border: 'rgba(0, 212, 255, 0.4)',  text: '#00D4FF', label: 'Daily' },
  series: { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)', text: '#A855F7', label: 'Series' },
  tour:   { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#F59E0B', label: 'Tour' },
};
function MapPinIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>; }
function ClockIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
"""
if "SOURCE_COLORS" not in content:
    content = content.replace(
        "const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];",
        icons + "\nconst DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];"
    )

# REPLACE renderTournamentCard
start_str = "const renderTournamentCard = (t, idx) => {"
end_str = "    );\n  };\n\n  return ("

new_render = """const renderTournamentCard = (t, idx) => {
    // Combine id (or venue+time fallback) with index prevents collisions across renders
    const cardId = t.id ? String(t.id) : `${t.venue_id || 'v'}-${t.start_time || 'notime'}-${idx}`;
    const isExpanded = !!expandedCards[cardId];
    
    const source = SOURCE_COLORS[t.source] || SOURCE_COLORS.daily;
    const dateIsToday = (t.day_of_week || '').toLowerCase() === DAYS[todayIndex].toLowerCase();
    
    // Generate initials fallback for venues without logos
    const initials = (t.venue_name || t.tournament_name || t.name || 'T')
      .split(/\\s+/)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();

    const handleCardClick = () => {
      if (t.is_clustered) {
          setExpandedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }));
      } else if (t.venue_id) {
          if (openVenueModal) openVenueModal(`/hub/venues/${t.venue_id}`);
          else window.location.href = `/hub/venues/${t.venue_id}`;
      }
    };

    return (
      <div key={cardId} className="ev-card" data-today={dateIsToday ? '1' : ''} onClick={handleCardClick} style={{ cursor: 'pointer' }}>
        {/* -- LEFT: Full-height logo (appears ONCE) -- */}
        <div className="ev-card-logo">
          {t.logo_url ? (
            <img
              src={t.logo_url}
              alt={t.venue_name || ''}
              className="ev-logo-img"
              loading="lazy"
            />
          ) : (
            <div className="ev-logo-fallback" style={{ background: `linear-gradient(135deg, ${getInitialsColor(t.venue_id)}40, rgba(15,23,42,0.9))` }}>
              {initials}
            </div>
          )}
        </div>

        {/* -- RIGHT: All tournament data -- */}
        <div className="ev-card-data" style={{ flex: 1, minWidth: 0, padding: '12px 16px' }}>
          
          {/* Countdown timer (if today and soon) */}
          {(() => {
            if (!t.start_time || !dateIsToday) return null;
            const match = (t.start_time || '').match(/(\\d{1,2}:\\d{2})\\s*(AM|PM)?/i);
            const timePart = match ? match[1] : null;
            const ampm = match ? match[2] : null;
            if (!timePart) return null;
            const [h, m] = timePart.split(':').map(Number);
            let hour24 = h;
            if (ampm) { if (ampm.toUpperCase() === 'PM' && h !== 12) hour24 += 12; if (ampm.toUpperCase() === 'AM' && h === 12) hour24 = 0; }
            const target = new Date(now); target.setHours(hour24, m, 0, 0);
            if (target <= now) target.setDate(target.getDate() + 1);
            const diffMin = Math.round((target - now) / 60000);
            if (diffMin <= 0 || diffMin > 1440) return null;
            const hrs = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            const isImminent = diffMin <= 60;
            return (
              <div style={{ float: 'right', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: isImminent ? 'rgba(239,68,68,0.15)' : 'rgba(110,231,239,0.08)', color: isImminent ? '#f87171' : '#6ee7ef', animation: isImminent ? 'lobby-badgePulse 1.5s ease-in-out infinite' : 'none' }}>
                {hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`}
              </div>
            );
          })()}

          {/* Top row: source badge + event name */}
          <div className="ev-data-top" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="ev-source" style={{ background: source.bg, borderColor: source.border, color: source.text }}>
                {source.label}
              </span>
              <h3 className="ev-name" style={{ margin: '6px 0 4px', fontSize: 15, fontWeight: 700, color: '#f8fafc', lineHeight: 1.3, textTransform: 'capitalize' }}>
                {t.tournament_name || t.name || `${formatGameType(t.game_type)} Tournament`}
              </h3>
            </div>

            {/* Buy-in and Guarantee */}
            <div className="ev-data-numbers" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {t.buy_in != null && t.buy_in > 0 ? (
                <div className="ev-buyin" style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
                  ${Number(t.buy_in).toLocaleString()}
                </div>
              ) : (
                <div className="ev-buyin" style={{ fontSize: 13, fontWeight: 700, color: 'rgba(148,163,184,0.6)', background: 'transparent', padding: '2px 4px' }}>TBD</div>
              )}
              {t.guaranteed != null && t.guaranteed > 0 && (
                <div className="ev-gtd" style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', padding: '2px 6px', borderRadius: 4 }}>
                  ${Number(t.guaranteed).toLocaleString()} GTD
                </div>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="ev-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', fontSize: 13, color: '#94a3b8', alignItems: 'center', marginTop: 4 }}>
            {t.venue_name && (
              <span className="ev-meta-item" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#e2e8f0', textTransform: 'capitalize' }}>
                <MapPinIcon />
                {t.venue_name}
              </span>
            )}
            {(t.venue_city || t.city || t.venue_state || t.state) && (
              <span className="ev-meta-item ev-location" style={{ opacity: 0.8, textTransform: 'capitalize' }}>
                &middot; {[t.venue_city || t.city, t.venue_state || t.state].filter(Boolean).join(', ')}
              </span>
            )}
            {t.start_time && (
              <span className="ev-meta-item" style={{ color: '#ec4899', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ClockIcon />
                {formatTime(t.start_time)} 
              </span>
            )}
            {t.game_type && t.game_type !== 'Unknown' && (
              <span className="ev-game-type" style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, color: '#cbd5e1' }}>
                {formatGameType(t.game_type)}
              </span>
            )}
            {t.is_clustered && (
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, color: '#cbd5e1' }}>
                {t.flights?.length || 0} Flights
              </span>
            )}
          </div>

          {/* Structural Data Row */}
          {(t.starting_stack || t.level_duration_minutes || t.late_registration) && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'rgba(148,163,184,0.6)', marginTop: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
              {t.starting_stack && <span><strong style={{ color: '#e2e8f0' }}>Stack:</strong> {t.starting_stack.toLocaleString?.() || t.starting_stack}</span>}
              {(t.level_duration_minutes || t.blind_levels) && <span><strong style={{ color: '#e2e8f0' }}>Blinds:</strong> {t.level_duration_minutes ? `${t.level_duration_minutes}m` : t.blind_levels}</span>}
              {t.late_registration && <span><strong style={{ color: '#e2e8f0' }}>Late Reg:</strong> {t.late_registration}</span>}
              {t.rebuy_addon && <span><strong style={{ color: '#e2e8f0' }}>Rules:</strong> {t.rebuy_addon}</span>}
            </div>
          )}

          {/* Structure Link */}
          {safeHref(t.structure_sheet_url) && (
            <a href={safeHref(t.structure_sheet_url)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800,
              background: 'linear-gradient(180deg, rgba(14,165,233,0.15), rgba(2,132,199,0.05))', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)',
              padding: '6px 12px', borderRadius: 6, marginTop: 10, textDecoration: 'none', letterSpacing: '0.05em'
            }}>
              VIEW STRUCTURE PDF
            </a>
          )}
          
          {/* Clustered Flights Dropdown */}
          {t.is_clustered && isExpanded && t.flights?.length > 1 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Included Flights</div>
                <div style={{ display: 'grid', gap: 6 }}>
                      {t.flights.map((f, idx) => (
                        <div key={f.id || `${f.start_time || ''}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 4, fontSize: 12, color: '#cbd5e1' }}>
                            <span>{f.day_of_week && f.day_of_week !== 'Daily' ? `${f.day_of_week} ` : ''}{formatTime(f.start_time)}</span>
                            {f.tournament_name && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{f.tournament_name}</span>}
                        </div>
                    ))}
                </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return ("""

start_idx = content.find(start_str)
end_idx = content.find(end_str) + len(end_str)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_render + content[end_idx:]

CSS_BLOCK = """
      <style jsx>{`
        /* ───── Event Card CSS (Identical to Events Calendar) ───── */
        .ev-card {
          display: flex; align-items: stretch; gap: 0;
          background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
          transition: all 0.15s; overflow: hidden;
        }
        .ev-card:hover { background: rgba(15, 23, 42, 0.7); border-color: rgba(255,255,255,0.15); }
        .ev-card[data-today="1"] { border-color: rgba(0,212,255,0.3); }

        .ev-card-logo {
          width: 80px; min-height: 100%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.25);
          border-right: 1px solid rgba(255,255,255,0.06);
          padding: 8px;
        }
        .ev-logo-img {
          width: 56px; height: 56px; object-fit: contain; border-radius: 8px;
        }
        .ev-logo-fallback {
          width: 56px; height: 56px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.5); font-size: 18px; font-weight: 700;
        }
        .ev-source {
          display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
          text-transform: uppercase; padding: 2px 6px; border-radius: 4px; border: 1px solid;
        }

        @media (max-width: 640px) {
          .ev-card-logo { width: 64px; }
          .ev-logo-img { width: 44px; height: 44px; }
          .ev-logo-fallback { width: 44px; height: 44px; font-size: 15px; }
          .ev-data-top { flex-direction: column; gap: 4px; align-items: flex-start !important; }
          .ev-data-numbers { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px; }
        }
      `}</style>
    </div>
"""

# Append the CSS block before the closing </div> of the main return
if "ev-card-logo" not in content[content.rfind("return ("):]:
    content = content.replace(
        "    </div>\n  );\n}\n",
        CSS_BLOCK + "  );\n}\n"
    )

with open('src/components/poker-near-me/DailyTournamentsPanel.jsx', 'w') as f:
    f.write(content)
