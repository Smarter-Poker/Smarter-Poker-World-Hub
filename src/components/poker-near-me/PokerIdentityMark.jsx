import React, { useState } from 'react';

function initialsFor(name) {
  const words = String(name || 'Poker')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'SP';
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

/**
 * Compact venue/series identity artwork with a deterministic rendered fallback.
 * Remote logos fail independently; identity and layout remain intact.
 */
export default function PokerIdentityMark({
  src,
  name,
  size = 58,
  className = '',
  loading = 'lazy',
  priority = false,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(src) && !imageFailed;

  return (
    <span
      className={`pnm-identity-mark ${className}`.trim()}
      data-media-state={showImage ? 'image' : 'fallback'}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading={priority ? 'eager' : loading}
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="pnm-identity-mark__fallback">
          <span className="pnm-identity-mark__halo" />
          <span className="pnm-identity-mark__initials">{initialsFor(name)}</span>
        </span>
      )}

      <style jsx>{`
        .pnm-identity-mark {
          position: relative;
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          box-sizing: border-box;
          border: 1px solid rgba(178, 202, 224, 0.28);
          border-radius: 7px;
          background: #05080d;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.035),
            0 10px 26px rgba(0, 0, 0, 0.38);
          isolation: isolate;
        }
        .pnm-identity-mark::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-top: 1px solid rgba(225, 239, 249, 0.18);
          box-shadow: inset 0 -1px 0 rgba(0, 190, 255, 0.13);
        }
        .pnm-identity-mark img {
          display: block;
          width: 100%;
          height: 100%;
          padding: 5px;
          box-sizing: border-box;
          object-fit: contain;
          background: rgba(0, 0, 0, 0.24);
        }
        .pnm-identity-mark__fallback {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
          background:
            radial-gradient(circle at 52% 42%, rgba(0, 190, 255, 0.15), transparent 42%),
            linear-gradient(145deg, #111923, #030508 72%);
        }
        .pnm-identity-mark__halo {
          position: absolute;
          width: 54%;
          height: 54%;
          border: 1px solid rgba(105, 216, 255, 0.44);
          transform: rotate(45deg);
          box-shadow: 0 0 18px rgba(0, 190, 255, 0.2);
        }
        .pnm-identity-mark__initials {
          position: relative;
          z-index: 1;
          color: #eaf8ff;
          font-size: max(11px, calc(${size}px * 0.24));
          font-weight: 800;
          letter-spacing: 0.08em;
          text-shadow: 0 0 10px rgba(0, 190, 255, 0.45);
        }
      `}</style>
    </span>
  );
}
