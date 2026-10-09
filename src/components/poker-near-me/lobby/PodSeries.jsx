import React from 'react';
import SeriesCard from '../SeriesCard';
import LobbyPodConsole, {
  LobbyPodCardList,
  LobbyPodControlPanel,
  LobbyPodField,
  LobbyPodResultsBar,
  LobbyPodState,
  PNM_US_STATE_CODES,
} from './LobbyPodConsole';

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
    <LobbyPodConsole className="pnm-lobby-pod--series">
      <LobbyPodControlPanel
        title="Poker Series Directory"
        description="Search Multi-Event Poker Series By Name, City, Or State."
        icon="event-ticket"
      >
        <div className="pnm-lobby-pod__field-row">
          <LobbyPodField label="Series Search" icon="search">
            <input
              type="text"
              aria-label="Search Poker Series"
              placeholder="Search Series..."
              value={seriesSearch}
              autoComplete="off"
              onChange={(e) => setFilters(prev => ({ ...prev, seriesSearch: e.target.value }))}
            />
          </LobbyPodField>
          <LobbyPodField label="State" icon="filter">
            <select
              aria-label="Filter Poker Series By State"
              value={seriesState}
              onChange={(e) => setFilters(prev => ({ ...prev, seriesState: e.target.value }))}
            >
              <option value="all">All States</option>
              {PNM_US_STATE_CODES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </LobbyPodField>
        </div>
      </LobbyPodControlPanel>

      <LobbyPodResultsBar>
        <strong>{filteredSeries.length}</strong> Series
      </LobbyPodResultsBar>

      {!seriesLoaded && filteredSeries.length === 0 ? (
        <LobbyPodState kind="loading" title="Loading Poker Series">
          <p>Connecting To The National Series Directory.</p>
        </LobbyPodState>
      ) : null}

      {filteredSeries.length > 0 ? (
        <LobbyPodCardList>
          {filteredSeries.map((s, i) => (
            <SeriesCard
              key={s.series_code || s.id || `series-${i}`}
              series={s}
              isFavorited={!!favorites['series-' + s.id]}
              onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(s.id, s, 'series'); }}
              onNavigate={(path) => router.push(path)}
            />
          ))}
        </LobbyPodCardList>
      ) : null}

      {seriesLoaded && filteredSeries.length === 0 && (
        <LobbyPodState kind="empty" title="No Matching Series">
          <p>{seriesSearch || seriesState !== 'all' ? 'Try Adjusting Your Filters.' : 'Check Back Soon For Poker Series Schedules.'}</p>
        </LobbyPodState>
      )}
    </LobbyPodConsole>
  );
}
