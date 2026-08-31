import React from 'react';
import TourCard from '../TourCard';

export default function PodTours({
  filters, setFilters,
  tours, toursLoaded,
  favorites, handleToggleFavorite,
  router
}) {
  const tourSearch = filters.tourSearch || '';
  const tourState = filters.tourState || 'all';
  let filteredTours = tours;
  if (tourSearch) {
    const lower = tourSearch.toLowerCase();
    filteredTours = filteredTours.filter(t => {
      if ((t.tour_name || t.name || '').toLowerCase().includes(lower) || (t.tour_code || '').toLowerCase().includes(lower) || (t.headquarters || '').toLowerCase().includes(lower)) return true;
      const allStops = [...(t.upcoming_series || []), ...(t.stops_2026 || []), ...(t.series_2026 || [])];
      return allStops.some(s => (s.name || s.venue || s.location || s.city || '').toLowerCase().includes(lower));
    });
  }
  if (tourState !== 'all') {
    filteredTours = filteredTours.filter(t => {
      if ((t.headquarters || '').includes(tourState) || (t.state === tourState)) return true;
      const allStops = [...(t.upcoming_series || []), ...(t.stops_2026 || []), ...(t.series_2026 || [])];
      return allStops.some(s => (s.location || s.state || '').includes(tourState));
    });
  }
  
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search Tours..." value={tourSearch} autoComplete="off"
          onChange={(e) => setFilters(prev => ({ ...prev, tourSearch: e.target.value }))}
          style={{ flex: 1, minWidth: 120, padding: '8px 14px', borderRadius: 8, border: '1.5px solid rgba(148,163,184,0.15)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
        <select value={tourState}
          onChange={(e) => setFilters(prev => ({ ...prev, tourState: e.target.value }))}
          style={{ background: 'rgba(13,17,23,0.7)', border: '1.5px solid rgba(148,163,184,0.15)', borderRadius: 8, padding: '8px 14px', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 110, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
          <option value="all" style={{ background: '#0d1117' }}>All States</option>
          {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
            <option key={st} value={st} style={{ background: '#0d1117' }}>{st}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)' }}>
          <span style={{ color: '#d4a853', fontWeight: 700 }}>{filteredTours.length}</span> tour{filteredTours.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {filteredTours.map((t, i) => <TourCard key={t.tour_code || t.id || `tour-${i}`} tour={t} isFavorited={!!favorites['tour-' + (t.id || t.tour_code)]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(t.id || t.tour_code, t, 'tour'); }} onNavigate={(path) => router.push(path)} />)}
      </div>
      {!toursLoaded && tours.length === 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1,2,3,4].map(n => <div key={n} style={{ height: 90, borderRadius: 12, background: 'linear-gradient(90deg, rgba(30,40,55,0.5) 25%, rgba(50,60,80,0.5) 50%, rgba(30,40,55,0.5) 75%)', backgroundSize: '200% 100%', animation: 'pnm-shimmer 1.5s ease-in-out infinite', border: '1px solid rgba(148,163,184,0.08)' }} />)}
        </div>
      )}
      {toursLoaded && filteredTours.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>No Tours Found</p>
          <p style={{ fontSize: 12 }}>Try Adjusting Your Search Criteria</p>
        </div>
      )}
    </div>
  );
}
