import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { buildSignupUrl, openQuickSignup } from './SmarterQuickSignupSheet';
import styles from './SmarterSeoKit.module.css';

function hasStoredAuthSession() {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    if (!storage) return false;
    const explicit = storage.getItem('smarter-poker-auth');
    if (explicit) {
      try {
        const parsed = JSON.parse(explicit);
        if (parsed && (parsed.access_token || parsed.user)) return true;
      } catch (_) {
        if (explicit.length > 10) return true;
      }
    }
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        const raw = storage.getItem(key);
        if (raw && raw !== '{}' && raw !== 'null') return true;
      }
    }
  } catch (_) {
    return false;
  }
  return false;
}

export default function SmarterConversionCta({
  eyebrow = 'Free Smarter.Poker Account',
  title = 'Unlock Free GTO Tools And Live Poker Data',
  description = 'Save Your Study Progress, Track Bankroll Sessions, And Explore 715+ Live Poker Rooms With One Free Account.',
  primaryLabel = 'Create Free Account',
  ctaLabel,
  primaryHref,
  secondaryLabel = 'Sign In',
  secondaryHref,
  highlights = ['100% Free Forever', '107 GTO Drills', '715+ Live Rooms'],
  compact = false,
  context = 'smarter-conversion-cta',
  redirectPath,
}) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const syncAuth = () => {
      setSignedIn(hasStoredAuthSession());
    };
    syncAuth();
    window.addEventListener('storage', syncAuth);
    return () => {
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  if (signedIn) return null;

  const resolvedPath =
    redirectPath ||
    (router?.asPath ? String(router.asPath).split('#')[0] : '/hub');
  const resolvedPrimaryLabel = ctaLabel || primaryLabel || 'Create Free Account';
  const resolvedPrimaryHref =
    primaryHref ||
    buildSignupUrl({
      redirectPath: resolvedPath,
      unlockKey: context,
      source: context,
    });
  const resolvedSecondaryHref =
    secondaryHref || `/auth/login?redirect=${encodeURIComponent(resolvedPath)}`;

  const safeHighlights = Array.isArray(highlights)
    ? highlights.filter((item) => typeof item === 'string' && item.trim().length > 0)
    : [];

  const handlePrimaryClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!String(resolvedPrimaryHref).startsWith('/auth/signup')) return;
    e.preventDefault();
    openQuickSignup({
      unlockKey: context,
      eyebrow,
      title,
      subtitle: description,
      benefits: safeHighlights.length > 0 ? safeHighlights : undefined,
      redirectPath: resolvedPath,
      source: context,
    });
  };

  return (
    <section
      className={`${styles.kit} ${styles.frameActive} sd-conv-cta${compact ? ' sd-conv-cta--compact' : ''}`}
      aria-label={eyebrow || 'Free Smarter.Poker Account'}
      data-smarter-conversion-cta={context}
    >
      <div className="sd-conv-cta__inner">
        <div className="sd-conv-cta__copy">
          {eyebrow ? <span className={styles.eyebrowTag}>{eyebrow}</span> : null}
          {title ? <h2 className="sd-conv-cta__title">{title}</h2> : null}
          {description ? <p className="sd-conv-cta__desc">{description}</p> : null}
          {safeHighlights.length > 0 ? (
            <ul className="sd-conv-cta__highlights" aria-label="Account Highlights">
              {safeHighlights.map((item) => (
                <li key={item} className="sd-conv-cta__chip">
                  <span className="sd-conv-cta__marker" aria-hidden="true">▸</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="sd-conv-cta__actions">
          {resolvedPrimaryLabel && resolvedPrimaryHref ? (
            <a
              href={resolvedPrimaryHref}
              onClick={handlePrimaryClick}
              className={`${styles.ctaPrimary} sd-conv-cta__primary`}
            >
              <span>{resolvedPrimaryLabel}</span>
            </a>
          ) : null}
          {secondaryLabel && resolvedSecondaryHref ? (
            <Link
              href={resolvedSecondaryHref}
              className={`${styles.ctaSecondary} sd-conv-cta__secondary`}
            >
              <span>{secondaryLabel}</span>
            </Link>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .sd-conv-cta {
          width: 100%;
          max-width: 100%;
          margin: 24px 0;
          padding: 20px 22px;
        }

        .sd-conv-cta--compact {
          margin: 14px 0;
          padding: 14px 16px;
        }

        .sd-conv-cta__inner {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }

        .sd-conv-cta__copy {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          min-width: 0;
        }

        .sd-conv-cta__title {
          margin: 0;
          font-family: var(--font-roboto-condensed, 'Arial Narrow'), Arial, sans-serif;
          font-size: clamp(1.25rem, 3vw, 1.7rem);
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: 0.01em;
          color: #f2f7ff;
          overflow-wrap: break-word;
        }

        .sd-conv-cta--compact .sd-conv-cta__title {
          font-size: clamp(1.08rem, 2.5vw, 1.32rem);
        }

        .sd-conv-cta__desc {
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
          color: #bdd0e2;
          max-width: 64ch;
          overflow-wrap: break-word;
        }

        .sd-conv-cta--compact .sd-conv-cta__desc {
          font-size: 13px;
          line-height: 1.45;
        }

        .sd-conv-cta__highlights {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 2px 0 0;
          padding: 0;
          list-style: none;
        }

        .sd-conv-cta__chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 0;
          border: 1px solid #304d6b;
          background: linear-gradient(180deg, #0d2136 0%, #071321 100%);
          color: #bdd0e2;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
          max-width: 100%;
        }

        .sd-conv-cta__marker {
          color: #86daff;
          font-weight: 800;
          flex: 0 0 auto;
        }

        .sd-conv-cta__actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        @media (min-width: 720px) {
          .sd-conv-cta__inner {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 22px;
          }

          .sd-conv-cta__actions {
            flex-shrink: 0;
            justify-content: flex-end;
          }
        }

        @media (max-width: 480px) {
          .sd-conv-cta {
            padding: 14px 12px;
          }

          .sd-conv-cta__actions {
            width: 100%;
          }

          .sd-conv-cta :global(.sd-conv-cta__primary),
          .sd-conv-cta :global(.sd-conv-cta__secondary) {
            flex: 1 1 130px;
          }
        }
      `}</style>
    </section>
  );
}
