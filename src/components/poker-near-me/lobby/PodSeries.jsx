import React from 'react';
import SeriesCard from '../registry/SeriesCard';

export default function PodSeries({
  filters, setFilters,
  series, seriesLoaded,
  favorites, handleToggleFavorite,
  router
}) {
  const seriesSearch = filters.seriesSearch || '';
  const seriesState = filters.seriesState || 'all';
  let filteredSeries = series;
  if (seriesSearch) {
    const lower = seriesSearch.toLowerCase();
    filteredSeries = filteredSeries.filter(s => (s.name || '').toLowerCase().includes(lower) || (s.city || '').toLowerCase().includes(lower) || (s.state || '').toLowerCase().includes(lower));
  }
  if (seriesState !== 'all') {
    filteredSeries = filteredSeries.filter(s => s.state === seriesState);
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search Series..." value={seriesSearch} autoComplete="off"
          onChange={(e) => setFilters(prev => ({ ...prev, seriesSearch: e.target.value }))}
          style={{ flex: 1, minWidth: 120, padding: '8px 14px', borderRadius: 8, border: '1.5px solid rgba(148,163,184,0.15)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
        <select value={seriesState}
          onChange={(e) => setFilters(prev => ({ ...prev, seriesState: e.target.value }))}
          style={{ background: 'rgba(13,17,23,0.7)', border: '1.5px solid rgba(148,163,184,0.15)', borderRadius: 8, padding: '8px 14px', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 110, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
          <option value="all" style={{ background: '#0d1117' }}>All States</option>
          {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
            <option key={st} value={st} style={{ background: '#0d1117' }}>{st}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)' }}>
          <span style={{ color: '#d4a853', fontWeight: 700 }}>{filteredSeries.length}</span> series
        </span>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {filteredSeries.map((s, i) => <SeriesCard key={s.series_code || s.id || `series-${i}`} series={s} isFavorited={!!favorites['series-' + s.id]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(s.id, s, 'series'); }} onNavigate={(path) => router.push(path)} />)}
      </div>
      {!seriesLoaded && series.length === 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1,2,3,4].map(n => <div key={n} style={{ height: 90, borderRadius: 12, background: 'linear-gradient(90deg, rgba(30,40,55,0.5) 25%, rgba(50,60,80,0.5) 50%, rgba(30,40,55,0.5) 75%)', backgroundSize: '200% 100%', animation: 'pnm-shimmer 1.5s ease-in-out infinite', border: '1px solid rgba(148,163,184,0.08)' }} />)}
        </div>
      )}
      {seriesLoaded && filteredSeries.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.5)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Matching Series</div>
          <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.4)' }}>{seriesSearch || seriesState !== 'all' ? 'Try adjusting your filters.' : 'Check back soon for poker series schedules.'}</div>
        </div>
      )}
    </div>
  );
}
