import React, { useEffect, useState } from 'react';
import {
  clubArenaCardUrl,
  SUIT_SYMBOL,
  tokenizePokerText,
} from '../../lib/pokerCardMarkup';

const RANK_NAME = {
  '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven',
  '8': 'Eight', '9': 'Nine', T: 'Ten', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace',
};
const SUIT_NAME = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };

export function PokerCardImage({ rank, suit, size = 'inline', selected = false }) {
  const [fallback, setFallback] = useState(0);
  const webp = clubArenaCardUrl(rank, suit, 'webp');
  const png = clubArenaCardUrl(rank, suit, 'png');

  useEffect(() => setFallback(0), [rank, suit]);
  if (!webp) return null;

  const dimensions = size === 'picker'
    ? { width: 42, height: 59 }
    : size === 'preview'
      ? { width: 34, height: 48 }
      : { width: 27, height: 38 };
  const label = `${RANK_NAME[rank]} of ${SUIT_NAME[suit]}`;

  if (fallback >= 2) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        style={{
          ...dimensions,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          verticalAlign: 'middle',
          margin: '0 2px',
          borderRadius: 4,
          border: '1px solid #cbd5e1',
          background: '#fff',
          color: suit === 'h' || suit === 'd' ? '#dc2626' : '#111827',
          fontWeight: 800,
          fontSize: size === 'picker' ? 15 : 11,
        }}
      >
        {rank}{SUIT_SYMBOL[suit]}
      </span>
    );
  }

  return (
    <img
      src={fallback === 0 ? webp : png}
      alt={label}
      title={label}
      loading={size === 'picker' ? 'lazy' : 'eager'}
      onError={() => setFallback((step) => step + 1)}
      style={{
        ...dimensions,
        display: 'inline-block',
        objectFit: 'contain',
        verticalAlign: 'middle',
        margin: '0 2px',
        borderRadius: 4,
        boxShadow: selected
          ? '0 0 0 3px #f59e0b, 0 4px 12px rgba(0,0,0,0.35)'
          : '0 1px 3px rgba(0,0,0,0.24)',
      }}
    />
  );
}

export default function PokerCardText({ text, style = {}, className = '' }) {
  if (!text) return null;
  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap', ...style }}>
      {tokenizePokerText(text).map((token, index) => token.type === 'card' ? (
        <PokerCardImage
          key={`${token.value}-${index}`}
          rank={token.rank}
          suit={token.suit}
        />
      ) : (
        <React.Fragment key={`text-${index}`}>{token.value}</React.Fragment>
      ))}
    </span>
  );
}
