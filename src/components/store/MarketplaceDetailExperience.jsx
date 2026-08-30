import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ChevronRight, Gem, ShieldCheck, Sparkles, X, ZoomIn } from 'lucide-react';

import UniversalHeader from '../ui/UniversalHeader';
import BottomNavBar from '../ui/BottomNavBar';
import PageTransition from '../transitions/PageTransition';
import MarketplaceCommerceNav from './MarketplaceCommerceNav';
import styles from './MarketplaceDetailExperience.module.css';

const DEFAULT_MARKETPLACE_IMAGE = '/images/store-v3/diamond-vault-hero.webp';

function resolveMarketplaceImage(value) {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_MARKETPLACE_IMAGE;
  const candidate = value.trim();
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString() : DEFAULT_MARKETPLACE_IMAGE;
  } catch (_) {
    return DEFAULT_MARKETPLACE_IMAGE;
  }
}

function absoluteMarketplaceUrl(value) {
  if (typeof value === 'string' && /^https:\/\//i.test(value)) return value;
  return `https://smarter.poker${value}`;
}

// JSON.stringify alone leaves `</script>` intact. Catalog and club inventory
// fields can originate in the database, so escape every character with HTML
// significance before placing JSON-LD inside a script element.
function serializeStructuredData(value) {
  return JSON.stringify(value ?? {})
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export default function MarketplaceDetailExperience({
  canonical,
  title,
  description,
  eyebrow,
  image,
  galleryImages = [],
  imageAlt,
  breadcrumbs,
  price,
  diamondPrice,
  status = 'Available',
  actions,
  structuredData,
  noindex = false,
  commerceActive = 'store',
  openGraphType = 'website',
  children,
}) {
  const safeImage = resolveMarketplaceImage(image);
  const media = useMemo(() => [...new Set([
    safeImage,
    ...(Array.isArray(galleryImages) ? galleryImages : []).map(resolveMarketplaceImage),
  ])].slice(0, 8), [safeImage, galleryImages]);
  const [selectedMedia, setSelectedMedia] = useState(0);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const inspectButtonRef = useRef(null);
  const closeMediaRef = useRef(null);
  const canonicalUrl = absoluteMarketplaceUrl(canonical);
  const socialImage = absoluteMarketplaceUrl(safeImage);

  useEffect(() => {
    if (selectedMedia >= media.length) setSelectedMedia(0);
  }, [media.length, selectedMedia]);

  useEffect(() => {
    if (!mediaExpanded) return undefined;
    const containMediaFocus = (event) => {
      if (event.key === 'Escape') {
        setMediaExpanded(false);
        requestAnimationFrame(() => inspectButtonRef.current?.focus());
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeMediaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', containMediaFocus);
    return () => window.removeEventListener('keydown', containMediaFocus);
  }, [mediaExpanded]);

  const closeMedia = () => {
    setMediaExpanded(false);
    requestAnimationFrame(() => inspectButtonRef.current?.focus());
  };

  return (
    <>
      <Head>
        <title>{`${title} — Smarter.Poker Marketplace`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content={openGraphType} />
        <meta property="og:title" content={`${title} — Smarter.Poker Marketplace`} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={socialImage} />
        <meta property="og:url" content={canonicalUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        {noindex && <meta name="robots" content="noindex,nofollow" />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
        />
      </Head>

      <UniversalHeader pageDepth={2} />
      <PageTransition disableInitialAnimation>
        <main className={styles.page}>
          <MarketplaceCommerceNav active={commerceActive} />

          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.href}>
                <Link href={crumb.href} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>
                  {crumb.label}
                </Link>
                {index < breadcrumbs.length - 1 && <ChevronRight size={13} aria-hidden="true" />}
              </span>
            ))}
          </nav>

          <article className={styles.hero}>
            <div className={styles.mediaFrame}>
              <div className={styles.mediaStage}>
                <img
                  src={media[selectedMedia]}
                  alt={selectedMedia === 0 ? imageAlt || '' : `${imageAlt || title} detail ${selectedMedia + 1}`}
                  width={1200}
                  height={900}
                  loading="eager"
                  decoding="async"
                  fetchpriority="high"
                />
                <button
                  type="button"
                  ref={inspectButtonRef}
                  className={styles.inspectButton}
                  aria-label={`Inspect ${title} image full screen`}
                  onClick={() => setMediaExpanded(true)}
                >
                  <ZoomIn size={17} aria-hidden="true" /> Inspect
                </button>
              </div>
              {media.length > 1 && (
                <div className={styles.mediaRail} role="group" aria-label={`${title} image gallery`}>
                  {media.map((source, index) => (
                    <button
                      type="button"
                      key={source}
                      aria-label={`Show ${title} image ${index + 1}`}
                      aria-pressed={selectedMedia === index}
                      onClick={() => setSelectedMedia(index)}
                    >
                      <img src={source} alt="" loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
                    </button>
                  ))}
                </div>
              )}
              <span className={styles.scanLine} aria-hidden="true" />
              <div className={styles.mediaBadge}>
                <ShieldCheck size={15} aria-hidden="true" />
                Secure Marketplace Item
              </div>
              {mediaExpanded && (
                <div
                  className={styles.mediaDialog}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${title} image inspection`}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeMedia();
                  }}
                >
                  <button
                    type="button"
                    ref={closeMediaRef}
                    className={styles.closeMedia}
                    aria-label="Close image inspection"
                    autoFocus
                    onClick={closeMedia}
                  >
                    <X size={22} aria-hidden="true" /> Close
                  </button>
                  <img src={media[selectedMedia]} alt={imageAlt || title} />
                </div>
              )}
            </div>

            <div className={styles.commandPanel}>
              <span className={styles.eyebrow}>{eyebrow}</span>
              <h1>{title}</h1>
              <p className={styles.description}>{description}</p>

              <div className={styles.readoutGrid}>
                {price != null && (
                  <div>
                    <small>Card Settlement</small>
                    <strong>${Number(price).toFixed(2)}</strong>
                  </div>
                )}
                {diamondPrice != null && (
                  <div>
                    <small>Diamond Settlement</small>
                    <strong><Gem size={17} aria-hidden="true" /> {Number(diamondPrice).toLocaleString()}</strong>
                  </div>
                )}
                <div>
                  <small>Inventory Signal</small>
                  <strong>{status}</strong>
                </div>
              </div>

              <div className={styles.actions}>{actions}</div>
              <p className={styles.securityCopy}>
                <Sparkles size={14} aria-hidden="true" /> Card checkout is handled by Stripe. Diamond settlement uses your verified Smarter.Poker wallet.
              </p>
            </div>
          </article>

          <section className={styles.detailDeck}>{children}</section>
        </main>
      </PageTransition>
      <BottomNavBar />
    </>
  );
}
