import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const FALLBACKS = {
  location: '/images/pnm-phase-4/location-command-grid-v1.webp',
  venue: '/images/pnm-phase-4/venue-signal-fallback-v1.webp',
  home_game: '/images/pnm-phase-4/venue-signal-fallback-v1.webp',
  dashboard: '/images/pnm-phase-4/venue-signal-fallback-v1.webp',
};

function normalizeMetrics(metrics) {
  return (Array.isArray(metrics) ? metrics : [])
    .filter((metric) => metric && metric.label && metric.value !== undefined && metric.value !== null)
    .slice(0, 5);
}

export default function DeepRouteSignalDeck({
  kind = 'venue',
  eyebrow = 'Poker Near Me Network',
  title,
  description,
  image,
  imageAlt = '',
  breadcrumbs = [],
  metrics = [],
  status = 'Network ready',
  statusTone = 'live',
  freshness = null,
  actions = null,
  compact = false,
}) {
  const fallback = FALLBACKS[kind] || FALLBACKS.venue;
  const [visual, setVisual] = useState(image || fallback);
  const safeMetrics = useMemo(() => normalizeMetrics(metrics), [metrics]);

  useEffect(() => {
    setVisual(image || fallback);
  }, [fallback, image]);

  return (
    <section className={`pnm-deep-deck${compact ? ' pnm-deep-deck--compact' : ''}`} aria-labelledby="pnm-deep-route-title">
      <div className="pnm-deep-deck__visual" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={visual}
          alt=""
          loading={compact ? 'lazy' : 'eager'}
          fetchpriority={compact ? 'auto' : 'high'}
          onError={() => {
            if (visual !== fallback) setVisual(fallback);
          }}
        />
        <span className="pnm-deep-deck__scan" />
      </div>

      <div className="pnm-deep-deck__content">
        {breadcrumbs.length > 0 && (
          <nav className="pnm-deep-deck__breadcrumbs" aria-label="Breadcrumb">
            <ol>
              {breadcrumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`}>
                  {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <p className="pnm-deep-deck__eyebrow">{eyebrow}</p>
        <h1 id="pnm-deep-route-title">{title}</h1>
        {description && <p className="pnm-deep-deck__description">{description}</p>}

        <div className="pnm-deep-deck__status" data-tone={statusTone} role="status">
          <span aria-hidden="true" />
          {status}
        </div>
        {freshness?.label && (
          <p className="pnm-deep-deck__freshness">
            Data Signal: {freshness.dateTime
              ? <time dateTime={freshness.dateTime}>{freshness.label}</time>
              : freshness.label}
          </p>
        )}

        {safeMetrics.length > 0 && (
          <dl className="pnm-deep-deck__metrics">
            {safeMetrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {actions && <div className="pnm-deep-deck__actions">{actions}</div>}
      </div>
      <span className="pnm-deep-deck__alt sr-only">{imageAlt}</span>
    </section>
  );
}
