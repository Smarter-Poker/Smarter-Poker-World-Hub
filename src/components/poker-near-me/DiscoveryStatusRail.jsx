import React from 'react';

function formatAge(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 1) return 'Just updated';
  if (minutes < 60) return `${Math.round(minutes)}m old`;
  return `${Math.round(minutes / 60)}h old`;
}

function liveFeedLabel(mode) {
  if (mode === 'live') return { label: 'Live observations', tone: 'live' };
  if (mode === 'mixed') return { label: 'Observed + modeled', tone: 'modeled' };
  if (mode === 'estimated') return { label: 'Modeled coverage', tone: 'modeled' };
  if (mode === 'none') return { label: 'Feed offline', tone: 'offline' };
  return { label: 'Connecting', tone: 'pending' };
}

export default function DiscoveryStatusRail({
  venueCount = 0,
  mappedVenueCount = 0,
  liveTableCount = 0,
  liveDataMode = null,
  liveDataAgeMinutes = null,
  tournamentCount = 0,
  tournamentDay = null,
}) {
  const feed = liveFeedLabel(liveDataMode);
  const age = formatAge(liveDataAgeMinutes);

  return (
    <dl className="pnm-status-rail" aria-label="Discovery data status" aria-live="polite">
      <div className="pnm-status-rail__item">
        <dt>Public Directory</dt>
        <dd>{venueCount > 0 ? `${venueCount.toLocaleString()} playable` : 'Loading'}</dd>
      </div>
      <div className="pnm-status-rail__item">
        <dt>Map Coverage</dt>
        <dd>{mappedVenueCount > 0 ? `${mappedVenueCount.toLocaleString()} mapped` : 'Loading'}</dd>
      </div>
      <div className={`pnm-status-rail__item pnm-status-rail__item--${feed.tone}`}>
        <dt>Table Feed</dt>
        <dd><span className="pnm-status-rail__signal" aria-hidden="true" />{feed.label}</dd>
      </div>
      <div className="pnm-status-rail__item">
        <dt>Tables</dt>
        <dd>
          {liveDataMode == null
            ? 'Pending'
            : liveDataMode === 'none'
              ? 'Unavailable'
              : liveTableCount.toLocaleString()}
        </dd>
      </div>
      <div className="pnm-status-rail__item">
        <dt>Schedule</dt>
        <dd>
          {tournamentCount > 0
            ? `${tournamentCount.toLocaleString()} ${tournamentDay || 'today'}`
            : 'No events reported'}
        </dd>
      </div>
      {age && (
        <div className="pnm-status-rail__item pnm-status-rail__item--age">
          <dt>Freshness</dt>
          <dd>{age}</dd>
        </div>
      )}
    </dl>
  );
}

export { formatAge, liveFeedLabel };
