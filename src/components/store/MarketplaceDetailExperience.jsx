import Head from 'next/head';
import Link from 'next/link';
import { ChevronRight, Gem, ShieldCheck, Sparkles } from 'lucide-react';

import UniversalHeader from '../ui/UniversalHeader';
import BottomNavBar from '../ui/BottomNavBar';
import PageTransition from '../transitions/PageTransition';
import MarketplaceCommerceNav from './MarketplaceCommerceNav';
import styles from './MarketplaceDetailExperience.module.css';

export default function MarketplaceDetailExperience({
  canonical,
  title,
  description,
  eyebrow,
  image,
  imageAlt,
  breadcrumbs,
  price,
  diamondPrice,
  status = 'Available',
  actions,
  structuredData,
  noindex = false,
  children,
}) {
  return (
    <>
      <Head>
        <title>{title} — Smarter.Poker Marketplace</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`https://smarter.poker${canonical}`} />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={`${title} — Smarter.Poker Marketplace`} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={`https://smarter.poker${image}`} />
        <meta property="og:url" content={`https://smarter.poker${canonical}`} />
        <meta name="twitter:card" content="summary_large_image" />
        {noindex && <meta name="robots" content="noindex,nofollow" />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </Head>

      <UniversalHeader pageDepth={2} />
      <PageTransition disableInitialAnimation>
        <main className={styles.page}>
          <MarketplaceCommerceNav active="store" />

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
              <img src={image} alt={imageAlt} width={1200} height={900} loading="eager" />
              <span className={styles.scanLine} aria-hidden="true" />
              <div className={styles.mediaBadge}>
                <ShieldCheck size={15} aria-hidden="true" />
                Secure Marketplace Item
              </div>
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
