import React, { useState } from 'react';
import { safeImageUrl } from '../../lib/security/imageHosts.js';

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
 *
 * #ClubArenaConsole: remote artwork prints bare at its own ratio and is never
 * enlarged past its own pixels; without artwork the initials are printed in
 * the painted utility well (the __halo layer). The drawn border, radius,
 * gradients and shadows are retired; the styles live in
 * src/styles/worlds/poker-near-me-console-cards.css.
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
  // THE MARK IS GUARDED HERE, NOT AT EACH CALLER (2026-09-30).
  //
  // Every caller handed this whatever URL its feed carried, and one of those
  // feeds launders an unmirrored casino URL into a field named logo_url, so
  // "the caller guards it" was never true. A host img-src cannot allow now
  // draws the initials this component already paints, which is a missing
  // picture rather than a blocked request.
  const safeSrc = safeImageUrl(src) || '';
  const showImage = Boolean(safeSrc) && !imageFailed;

  return (
    <span
      className={`pnm-identity-mark ${className}`.trim()}
      data-media-state={showImage ? 'image' : 'fallback'}
      style={{ width: size, height: size, '--pnm-identity-size': `${size}px` }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={safeSrc}
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
    </span>
  );
}
