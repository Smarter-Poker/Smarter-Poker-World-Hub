import { useEffect, useState } from 'react';
import Link from 'next/link';

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
  primaryHref = '/auth/signup',
  secondaryLabel = 'Sign In',
  secondaryHref = '/auth/login',
  highlights = ['100% Free Forever', '107 GTO Drills', '715+ Live Rooms'],
  compact = false,
}) {
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

  const safeHighlights = Array.isArray(highlights)
    ? highlights.filter((item) => typeof item === 'string' && item.trim().length > 0)
    : [];

  return (
    <section
      className={`sd-conv-cta${compact ? ' sd-conv-cta--compact' : ''}`}
      aria-label={eyebrow || 'Free Smarter.Poker Account'}
    >
      <div className="sd-conv-cta__inner">
        <div className="sd-conv-cta__copy">
          {eyebrow ? <div className="sd-conv-cta__eyebrow">{eyebrow}</div> : null}
          {title ? <h2 className="sd-conv-cta__title">{title}</h2> : null}
          {description ? <p className="sd-conv-cta__desc">{description}</p> : null}
          {safeHighlights.length > 0 ? (
            <ul className="sd-conv-cta__highlights" aria-label="Account Highlights">
              {safeHighlights.map((item) => (
                <li key={item} className="sd-conv-cta__chip">
                  <span className="sd-conv-cta__dot" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="sd-conv-cta__actions">
          {primaryLabel && primaryHref ? (
            <Link href={primaryHref} className="sd-conv-cta__primary">
              {primaryLabel}
            </Link>
          ) : null}
          {secondaryLabel && secondaryHref ? (
            <Link href={secondaryHref} className="sd-conv-cta__secondary">
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .sd-conv-cta {
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          margin: 24px 0;
          padding: 22px 24px;
          border-radius: 12px;
          border: 1px solid rgba(148, 184, 224, 0.28);
          background: linear-gradient(155deg, #0c1a30 0%, #081121 58%, #060d1a 100%);
          color: #ffffff;
          font-family: var(--font-inter, Inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-variant-numeric: tabular-nums;
          box-shadow: 0 12px 32px rgba(2, 6, 16, 0.42);
        }

        .sd-conv-cta--compact {
          margin: 14px 0;
          padding: 14px 16px;
          border-radius: 10px;
        }

        .sd-conv-cta__inner {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }

        .sd-conv-cta__copy {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }

        .sd-conv-cta__eyebrow {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #38bdf8;
          line-height: 1.25;
        }

        .sd-conv-cta__title {
          margin: 0;
          font-family: var(--font-rajdhani, 'Arial Narrow'), var(--font-inter, Inter), sans-serif;
          font-size: clamp(1.3rem, 3.2vw, 1.75rem);
          font-weight: 700;
          line-height: 1.18;
          letter-spacing: 0.01em;
          color: #ffffff;
          overflow-wrap: break-word;
        }

        .sd-conv-cta--compact .sd-conv-cta__title {
          font-size: clamp(1.1rem, 2.6vw, 1.35rem);
        }

        .sd-conv-cta__desc {
          margin: 0;
          font-size: 14px;
          line-height: 1.55;
          color: #cbd5e1;
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
          gap: 8px;
          margin: 4px 0 0;
          padding: 0;
          list-style: none;
        }

        .sd-conv-cta__chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 184, 224, 0.28);
          background: #060d1a;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
          max-width: 100%;
        }

        .sd-conv-cta__dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #38bdf8;
          flex: 0 0 auto;
        }

        .sd-conv-cta__actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .sd-conv-cta :global(.sd-conv-cta__primary),
        .sd-conv-cta :global(.sd-conv-cta__secondary) {
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.2;
          text-decoration: none;
          text-align: center;
          white-space: normal;
          max-width: 100%;
          transition: background-color 140ms ease, border-color 140ms ease, filter 140ms ease;
        }

        .sd-conv-cta :global(.sd-conv-cta__primary) {
          background: linear-gradient(180deg, #0284c7 0%, #1d4ed8 100%);
          border: 1px solid rgba(56, 189, 248, 0.5);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.32);
        }

        .sd-conv-cta :global(.sd-conv-cta__primary:hover) {
          filter: brightness(1.08);
        }

        .sd-conv-cta :global(.sd-conv-cta__secondary) {
          background: #060d1a;
          border: 1px solid rgba(148, 184, 224, 0.28);
          color: #38bdf8;
        }

        .sd-conv-cta :global(.sd-conv-cta__secondary:hover) {
          border-color: rgba(56, 189, 248, 0.65);
          background: #081121;
        }

        .sd-conv-cta :global(.sd-conv-cta__primary:focus-visible),
        .sd-conv-cta :global(.sd-conv-cta__secondary:focus-visible) {
          outline: 2px solid #38bdf8;
          outline-offset: 2px;
        }

        @media (min-width: 720px) {
          .sd-conv-cta__inner {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
          }

          .sd-conv-cta__actions {
            flex-shrink: 0;
            justify-content: flex-end;
          }
        }

        @media (max-width: 480px) {
          .sd-conv-cta {
            padding: 16px 14px;
          }

          .sd-conv-cta--compact {
            padding: 12px 12px;
          }

          .sd-conv-cta__actions {
            width: 100%;
          }

          .sd-conv-cta :global(.sd-conv-cta__primary),
          .sd-conv-cta :global(.sd-conv-cta__secondary) {
            flex: 1 1 130px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sd-conv-cta :global(.sd-conv-cta__primary),
          .sd-conv-cta :global(.sd-conv-cta__secondary) {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}
