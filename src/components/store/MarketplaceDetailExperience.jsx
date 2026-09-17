import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import UniversalHeader from '../ui/UniversalHeader';
import PageTransition from '../transitions/PageTransition';
import MarketplaceCommerceNav from './MarketplaceCommerceNav';
import styles from './MarketplaceDetailExperience.module.css';
import { marketplaceCopy, marketplaceStructuredData } from '../../lib/store/marketplaceCopy';

const DEFAULT_MARKETPLACE_IMAGE = '/images/store-v3/diamond-vault-hero.webp';

function resolveMarketplaceImage(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = value.trim();
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch (_) {
    return null;
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
  imageCropPosition = null,
  imageCropGrid = '4x3',
  imageCropShape = 'square',
  galleryImages = [],
  imageAlt,
  breadcrumbs,
  price,
  diamondPrice,
  cardLabel = 'Card Settlement',
  diamondLabel = 'Diamond Settlement',
  inventoryLabel = 'Inventory Signal',
  securityCopy = 'Card checkout is handled by Stripe. Diamond settlement uses your verified Smarter.Poker wallet.',
  status = 'Available',
  actions,
  structuredData,
  noindex = false,
  commerceActive = 'store',
  openGraphType = 'website',
  presentation = 'record',
  children,
}) {
  const safeImage = resolveMarketplaceImage(image);
  const media = useMemo(
    () =>
      [
        ...new Set([
          safeImage,
          ...(Array.isArray(galleryImages) ? galleryImages : []).map(resolveMarketplaceImage),
        ]),
      ]
        .filter(Boolean)
        .slice(0, 8),
    [safeImage, galleryImages]
  );
  const [selectedMedia, setSelectedMedia] = useState(0);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const mediaDialogId = useId();
  const inspectButtonRef = useRef(null);
  const closeMediaRef = useRef(null);
  const canonicalUrl = absoluteMarketplaceUrl(canonical);
  const safePresentation = ['product', 'reward', 'membership', 'record'].includes(presentation)
    ? presentation
    : 'record';
  const socialImage =
    safeImage && !imageCropPosition
      ? absoluteMarketplaceUrl(safeImage)
      : safePresentation === 'product'
        ? null
        : absoluteMarketplaceUrl(DEFAULT_MARKETPLACE_IMAGE);
  const copyTitle = marketplaceCopy(title);
  const copyDescription = marketplaceCopy(description);
  const copyEyebrow = marketplaceCopy(eyebrow);
  const copyImageAlt = marketplaceCopy(imageAlt || title);
  const copyCardLabel = marketplaceCopy(cardLabel);
  const copyDiamondLabel = marketplaceCopy(diamondLabel);
  const copyInventoryLabel = marketplaceCopy(inventoryLabel);
  const copyStatus = marketplaceCopy(status);
  const copySecurity = marketplaceCopy(securityCopy);
  const hasProductMedia = safePresentation === 'product' && media.length > 0;
  const cropBackgroundSize = imageCropGrid === '4x1' ? '400% 100%' : '400% 300%';
  const cropShapeClass = imageCropShape === 'portrait' ? styles.spriteMediaPortrait : '';
  const presentationClass = {
    product: styles.heroProduct,
    reward: styles.heroReward,
    membership: styles.heroMembership,
    record: styles.heroRecord,
  }[safePresentation];

  useEffect(() => {
    if (selectedMedia >= media.length) setSelectedMedia(0);
  }, [media.length, selectedMedia]);

  useEffect(() => {
    if (!hasProductMedia || !mediaExpanded) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // React's autoFocus can race the dialog paint in some desktop Chromium
    // runs. Move focus after commit so the keyboard trap always begins on the
    // visible close control.
    const focusFrame = requestAnimationFrame(() => closeMediaRef.current?.focus());
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
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', containMediaFocus);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [hasProductMedia, mediaExpanded]);

  const closeMedia = () => {
    setMediaExpanded(false);
    requestAnimationFrame(() => inspectButtonRef.current?.focus());
  };

  return (
    <>
      <Head>
        <title>{`${copyTitle}: Smarter.Poker Marketplace`}</title>
        <meta name="description" content={copyDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content={openGraphType} />
        <meta property="og:title" content={`${copyTitle}: Smarter.Poker Marketplace`} />
        <meta property="og:description" content={copyDescription} />
        {socialImage && <meta property="og:image" content={socialImage} />}
        <meta property="og:url" content={canonicalUrl} />
        <meta name="twitter:card" content={socialImage ? 'summary_large_image' : 'summary'} />
        {noindex && <meta name="robots" content="noindex,nofollow" />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeStructuredData(marketplaceStructuredData(structuredData)),
          }}
        />
      </Head>

      <UniversalHeader pageDepth={2} />
      <PageTransition disableInitialAnimation>
        <main
          className={styles.page}
          data-marketplace-route={canonical}
          data-title-case-strategy="normalized"
        >
          <MarketplaceCommerceNav active={commerceActive} />

          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.href}>
                <Link
                  href={crumb.href}
                  aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
                >
                  {marketplaceCopy(crumb.label)}
                </Link>
                {index < breadcrumbs.length - 1 && <span aria-hidden="true">/</span>}
              </span>
            ))}
          </nav>

          <article
            className={`${styles.hero} ${presentationClass}`}
            data-presentation={safePresentation}
          >
            {hasProductMedia && (
              <div className={styles.mediaFrame}>
                <div className={styles.mediaStage}>
                  {selectedMedia === 0 && imageCropPosition ? (
                    <div
                      className={`${styles.spriteMedia} ${cropShapeClass}`}
                      role="img"
                      aria-label={copyImageAlt}
                      style={{
                        backgroundImage: `url(${media[0]})`,
                        backgroundPosition: imageCropPosition,
                        backgroundSize: cropBackgroundSize,
                      }}
                    />
                  ) : (
                    <img
                      src={media[selectedMedia]}
                      alt={
                        selectedMedia === 0
                          ? copyImageAlt
                          : `${copyImageAlt} Detail ${selectedMedia + 1}`
                      }
                      width={1200}
                      height={900}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                  )}
                  <button
                    type="button"
                    ref={inspectButtonRef}
                    className={styles.inspectButton}
                    aria-label={`Inspect ${copyTitle} Image Full Screen`}
                    aria-controls={mediaDialogId}
                    aria-expanded={mediaExpanded}
                    onClick={() => setMediaExpanded(true)}
                  >
                    Inspect
                  </button>
                </div>
                {media.length > 1 && (
                  <div
                    className={styles.mediaRail}
                    role="group"
                    aria-label={`${copyTitle} Image Gallery`}
                  >
                    {media.map((source, index) => (
                      <button
                        type="button"
                        key={source}
                        aria-label={`Show ${copyTitle} Image ${index + 1}`}
                        aria-pressed={selectedMedia === index}
                        onClick={() => setSelectedMedia(index)}
                      >
                        {index === 0 && imageCropPosition ? (
                          <span
                            className={`${styles.mediaRailCrop} ${cropShapeClass}`}
                            role="img"
                            aria-label={copyImageAlt}
                            style={{
                              backgroundImage: `url(${source})`,
                              backgroundPosition: imageCropPosition,
                              backgroundSize: cropBackgroundSize,
                            }}
                          />
                        ) : (
                          <img
                            src={source}
                            alt=""
                            loading={index === 0 ? 'eager' : 'lazy'}
                            decoding="async"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {mediaExpanded && (
                  <div
                    className={styles.mediaDialog}
                    id={mediaDialogId}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${copyTitle} Image Inspection`}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) closeMedia();
                    }}
                  >
                    <button
                      type="button"
                      ref={closeMediaRef}
                      className={styles.closeMedia}
                      aria-label="Close Image Inspection"
                      autoFocus
                      onClick={closeMedia}
                    >
                      Close
                    </button>
                    {selectedMedia === 0 && imageCropPosition ? (
                      <div
                        className={`${styles.spriteMediaExpanded} ${cropShapeClass}`}
                        role="img"
                        aria-label={copyImageAlt}
                        style={{
                          backgroundImage: `url(${media[0]})`,
                          backgroundPosition: imageCropPosition,
                          backgroundSize: cropBackgroundSize,
                        }}
                      />
                    ) : (
                      <img src={media[selectedMedia]} alt={copyImageAlt} />
                    )}
                  </div>
                )}
              </div>
            )}

            <div
              className={`${styles.commandPanel} ${hasProductMedia ? '' : styles.commandPanelWide}`}
            >
              <span className={styles.eyebrow}>{copyEyebrow}</span>
              <h1>{copyTitle}</h1>
              <p className={styles.description}>{copyDescription}</p>

              <div className={styles.readoutGrid}>
                {price != null && (
                  <div>
                    <small>{copyCardLabel}</small>
                    <strong>${Number(price).toFixed(2)}</strong>
                  </div>
                )}
                {diamondPrice != null && (
                  <div>
                    <small>{copyDiamondLabel}</small>
                    <strong>{Number(diamondPrice).toLocaleString()} Diamonds</strong>
                  </div>
                )}
                <div>
                  <small>{copyInventoryLabel}</small>
                  <strong>{copyStatus}</strong>
                </div>
              </div>

              <div className={styles.actions}>{actions}</div>
              {copySecurity && <p className={styles.securityCopy}>{copySecurity}</p>}
            </div>
          </article>

          <section className={styles.detailDeck}>{children}</section>
        </main>
      </PageTransition>
    </>
  );
}
