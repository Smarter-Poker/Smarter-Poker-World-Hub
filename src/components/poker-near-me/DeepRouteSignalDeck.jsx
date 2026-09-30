import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PokerNearMeConsole from './PokerNearMeConsole';
import { safeImageUrl } from '../../lib/security/imageHosts.js';

const FALLBACKS = {
  location: '/images/pnm-phase-4/location-command-grid-v1.webp',
  venue: '/images/pnm-phase-4/venue-signal-fallback-v1.webp',
  home_game: '/images/pnm-phase-4/venue-signal-fallback-v1.webp',
  dashboard: '/images/pnm-phase-4/venue-signal-fallback-v1.webp',
};

const CRESTS = {
  location: 'locator',
  venue: 'flat',
  home_game: 'club',
  dashboard: 'diamond',
};

function normalizeMetrics(metrics) {
  return (Array.isArray(metrics) ? metrics : [])
    .filter((metric) => metric && metric.label && metric.value !== undefined && metric.value !== null)
    .slice(0, 5);
}

/**
 * The painted answer for a deep route that has nothing true to show: a code,
 * id or place that does not exist, or a catalog the server could not reach.
 * It never invents a name. The chassis, crest and rails are the approved
 * master art; the copy and the recovery links are live DOM.
 */
export function DeepRouteNotice({
  eyebrow = 'Poker Near Me Network',
  title,
  titleId = 'pnm-deep-notice-title',
  pill = 'Not Found',
  pillInk = 'red',
  crest = 'locator',
  body,
  detail = null,
  links = [],
  className = '',
}) {
  return (
    <PokerNearMeConsole
      as="section"
      titleAs="h1"
      titleId={titleId}
      eyebrow={eyebrow}
      title={title}
      pill={pill}
      pillInk={pillInk}
      crest={crest}
      foot="foot"
      className={`pnm-deep-notice${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
    >
      <p className="pnc-copy pnm-deep-notice__copy">{body}</p>
      {detail ? <p className="pnc-copy pnm-deep-notice__detail">{detail}</p> : null}
      {links.length > 0 ? (
        <ul className="pnm-deep-notice__links">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="pnm-deep-notice__link">{link.label}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </PokerNearMeConsole>
  );
}

export default function DeepRouteSignalDeck({
  kind = 'venue',
  eyebrow = 'Poker Near Me Network',
  title,
  // A PAINTED BAND IS NOT A SENTENCE (2026-09-29). The chassis title zone is
  // 47% of the master's width, so at 390px it is 171px of glass. "Poker
  // Rooms In Austin, Texas" fitted to 9.8px in it and was still unreadable.
  // A route whose heading is a phrase passes the SHORT subject here; the
  // phrase itself then prints as the page's h1 on the stage below, where it
  // has room, and nothing is lost to a reader or a crawler.
  headTitle = null,
  description,
  subtitle = null,
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
  // The stage image arrives from venue and club rows whose photo columns hold
  // whatever a scraper or a page owner put there. An unmirrored host falls
  // through to the approved painted plate below rather than being requested.
  const stageHeading = Boolean(headTitle && String(headTitle).trim() && headTitle !== title);
  const safeImage = safeImageUrl(image) || '';
  const [visual, setVisual] = useState(safeImage || fallback);
  const safeMetrics = useMemo(() => normalizeMetrics(metrics), [metrics]);

  useEffect(() => {
    setVisual(safeImage || fallback);
  }, [fallback, safeImage]);

  return (
    <PokerNearMeConsole
      as="section"
      titleAs={stageHeading ? 'p' : 'h1'}
      titleId={stageHeading ? 'pnm-deep-route-plate' : 'pnm-deep-route-title'}
      eyebrow={eyebrow}
      title={stageHeading ? headTitle : title}
      subtitle={subtitle}
      pill={statusTone === 'modeled' ? 'Estimated' : statusTone === 'offline' ? 'Offline' : 'Verified'}
      pillInk={statusTone === 'modeled' ? 'gold' : statusTone === 'offline' ? 'red' : 'green'}
      crest={CRESTS[kind] || 'locator'}
      className={`pnm-deep-deck${compact ? ' pnm-deep-deck--compact' : ''}`}
      aria-labelledby="pnm-deep-route-title"
    >
      <div className="pnm-deep-deck__stage">
        <div className="pnm-deep-deck__visual" aria-hidden="true">
          <img
            src={visual}
            alt=""
            loading={compact ? 'lazy' : 'eager'}
            fetchpriority={compact ? 'auto' : 'high'}
            onError={() => {
              if (visual !== fallback) setVisual(fallback);
            }}
            onLoad={(event) => {
              if (visual === fallback) return;
              const { naturalWidth, naturalHeight } = event.currentTarget;
              const cinematicEnough = naturalWidth >= 640
                && naturalHeight >= 320
                && naturalWidth / Math.max(1, naturalHeight) >= 1.2;
              if (!cinematicEnough) setVisual(fallback);
            }}
          />
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

        {stageHeading && <h1 id="pnm-deep-route-title" className="pnm-deep-deck__heading">{title}</h1>}

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
      </div>
      <span className="pnm-deep-deck__alt sr-only">{imageAlt}</span>
    </PokerNearMeConsole>
  );
}
