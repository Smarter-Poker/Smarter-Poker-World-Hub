import React from 'react';
import { TourBadge, formatDate } from './TourCard';

// BUG FIX: Use local formatMoney so freerolls (amount=0) show 'Free' not '$0'
// TourCard's formatMoney(0) returns '$0' — this one is correct
function formatMoney(amount) {
    if (amount === null || amount === undefined || amount === '') return '';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '';
    if (num === 0) return 'Free'; // freerolls
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
    return '$' + num.toLocaleString();
}

// BUG FIX: Sanitize URLs to block javascript: protocol XSS vectors
function safeHref(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim().toLowerCase();
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) return null;
    return url;
}

/**
 * NewSeriesVenueCard - Premium Metal Series Card
 * Uses the Skeuomorphic Sci-Fi UI System
 */
export default function NewSeriesVenueCard({ series: s, index, isFavorited, onFavorite, onNavigate }) {
    if (!s) return null;
    
    const isVenueEntry = s.venue_type === 'series'; // Legacy compat
    
    // BUG FIX: detailUrl now uses series_uid (stable) or numeric id only.
    // NEVER use s.series_code — it can be a string slug like 'WSOP-2026' → /hub/series/WSOP-2026
    // which fails the API's parseInt guard and returns 400.
    // Fallback to (index + 1) only if index is a valid number.
    const numericId = Number.isInteger(s.id) ? s.id : null;
    const safeIndex = Number.isFinite(index) ? index + 1 : null;
    const detailId = numericId || safeIndex || '';
    const detailUrl = detailId ? '/hub/series/' + detailId : '/hub/poker-series';

    const shortCode = s.tour_code || s.tour || s.short_name || (s.name || '').replace(/[^A-Z]/g, '').slice(0, 4) || 'SER';
    const displayLocation = s.location || (((s.city || s.venue || '') + (s.state ? ', ' + s.state : '')) || 'Location TBD');
    const isNew = s.is_new || s.is_featured;

    // BUG FIX: sanitize source_url/website before using as href
    const externalUrl = safeHref(s.source_url || s.website);

    return (
        <div className="metal-series-card" onClick={() => onNavigate && onNavigate(detailUrl)}>
            <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
            <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
            <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
            <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
            <div className="neon-strip left" />
            <div className="neon-strip right" />
            
            <div className="series-header">
                <div>
                    <div className="series-tour">{shortCode}</div>
                    <h4 className="series-title">{s.name || s.series_name || 'Upcoming Series'}</h4>
                </div>
                <button 
                    className={'fav-btn' + (isFavorited ? ' active' : '')} 
                    onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}
                    style={{ position: 'relative', zIndex: 10, background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                </button>
            </div>
            
            <div className="series-body">
                <div className="series-location">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                    </svg>
                    {displayLocation}
                </div>
                
                {(s.start_date || s.end_date) && (
                    <div className="series-dates">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {formatDate(s.start_date)} - {formatDate(s.end_date)}
                    </div>
                )}
                
                <div className="series-tags">
                    {(s.events_count || s.total_events) > 0 && <span className="series-tag">{s.events_count || s.total_events} Events</span>}
                    {s.main_event_buyin != null && <span className="series-tag">{formatMoney(s.main_event_buyin)} Main</span>}
                    {(s.total_guaranteed || s.main_event_guaranteed) != null && <span className="series-tag" style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }}>{formatMoney(s.total_guaranteed || s.main_event_guaranteed)} GTD</span>}
                    {isNew && <span className="series-tag" style={{ color: '#00D4FF', borderColor: 'rgba(0,212,255,0.3)', background: 'rgba(0,212,255,0.1)' }}>NEW ADDITION</span>}
                </div>
            </div>
            
            <div className="series-footer">
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="hex-btn-small" onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }}>
                        View Events
                    </button>
                    {externalUrl && (
                        <a 
                            href={externalUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="hex-btn-small" 
                            style={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)', textDecoration: 'none' }}
                            onClick={e => e.stopPropagation()}
                        >
                            Source
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
