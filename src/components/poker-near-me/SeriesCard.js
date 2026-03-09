/**
 * SeriesCard - Tournament series card for Poker Near Me page
 */
import { TourBadge, formatDate, formatMoney } from './TourCard';

export default function SeriesCard({ series: s, index, isFavorited, onFavorite, onNavigate }) {
    const detailUrl = s.series_code ? '/hub/series/' + s.series_code : '/hub/venues/' + (s.id || (index + 1));
    return (
        <div className="entity-card series-card" onClick={() => onNavigate && onNavigate(detailUrl)} style={{ cursor: 'pointer' }}>
            <button className={'fav-btn' + (isFavorited ? ' active' : '')} onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
            </button>
            <div className="card-header">
                <TourBadge tourCode={s.tour_code || s.short_name} size="small" />
                {s.series_type && <span className="badge series-type">{s.series_type}</span>}
            </div>
            <h4>{s.name}</h4>
            <p className="card-location">{s.location || (((s.city || s.venue || '') + (s.state ? ', ' + s.state : '')) || 'Location TBD')}</p>
            <p className="card-dates">{formatDate(s.start_date)} - {formatDate(s.end_date)}</p>
            <div className="card-tags">
                {s.total_events && <span className="tag events">{s.total_events} Events</span>}
                {s.main_event_buyin && <span className="tag buyin">{formatMoney(s.main_event_buyin)} Main</span>}
            </div>
            {s.main_event_guaranteed && (
                <p className="card-detail guaranteed">{formatMoney(s.main_event_guaranteed)}+ GTD</p>
            )}
            <div className="card-footer">
                <div className="card-actions">
                    <span className="action-btn primary">Details</span>
                    {s.source_url && (
                        <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Source</a>
                    )}
                </div>
            </div>
        </div>
    );
}
