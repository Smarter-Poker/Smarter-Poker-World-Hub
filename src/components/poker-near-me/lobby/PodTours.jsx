import React from 'react';
import TourCard from '../TourCard';
import LobbyPodConsole, {
  LobbyPodCardList,
  LobbyPodControlPanel,
  LobbyPodField,
  LobbyPodResultsBar,
  LobbyPodState,
  PNM_US_STATE_CODES,
} from './LobbyPodConsole';

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
    <LobbyPodConsole className="pnm-lobby-pod--tours">
      <LobbyPodControlPanel
        title="Poker Tour Directory"
        description="Search Touring Poker Brands And Stops By Name Or State."
        icon="trophy"
      >
        <div className="pnm-lobby-pod__field-row">
          <LobbyPodField label="Tour Search" icon="search">
            <input
              type="text"
              aria-label="Search Tours"
              placeholder="Search Tours..."
              value={tourSearch}
              autoComplete="off"
              onChange={(e) => setFilters(prev => ({ ...prev, tourSearch: e.target.value }))}
            />
          </LobbyPodField>
          <LobbyPodField label="State" icon="filter">
            <select
              aria-label="Filter Tours By State"
              value={tourState}
              onChange={(e) => setFilters(prev => ({ ...prev, tourState: e.target.value }))}
            >
              <option value="all">All States</option>
              {PNM_US_STATE_CODES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </LobbyPodField>
        </div>
      </LobbyPodControlPanel>

      <LobbyPodResultsBar>
        <strong>{filteredTours.length}</strong> {filteredTours.length === 1 ? 'Tour' : 'Tours'}
      </LobbyPodResultsBar>

      {!toursLoaded && filteredTours.length === 0 ? (
        <LobbyPodState kind="loading" title="Loading Poker Tours">
          <p>Connecting To The National Tour Directory.</p>
        </LobbyPodState>
      ) : null}

      {filteredTours.length > 0 ? (
        <LobbyPodCardList>
          {filteredTours.map((t, i) => (
            <TourCard
              key={t.tour_code || t.id || `tour-${i}`}
              tour={t}
              isFavorited={!!favorites['tour-' + (t.id || t.tour_code)]}
              onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(t.id || t.tour_code, t, 'tour'); }}
              onNavigate={(path) => router.push(path)}
            />
          ))}
        </LobbyPodCardList>
      ) : null}

      {toursLoaded && filteredTours.length === 0 && (
        <LobbyPodState kind="empty" title="No Tours Found">
          <p>Try Adjusting Your Search Criteria.</p>
        </LobbyPodState>
      )}
    </LobbyPodConsole>
  );
}
