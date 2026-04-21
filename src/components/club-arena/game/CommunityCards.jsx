import React, { useEffect, useState } from 'react';
import { getCardImagePath } from '../../../lib/CardAssets';

/**
 * CommunityCards Component
 *
 * Displays the community cards (flop, turn, river) for a poker game.
 * Cards are dealt with a 3D flip animation, staggered by 100ms.
 * Winning cards can be highlighted with a gold glow effect.
 */
const CommunityCards = ({
  cards = [],
  winningCardIndices = [],
  isShowdown = false
}) => {
  const [visibleCards, setVisibleCards] = useState([]);

  useEffect(() => {
    // Animate cards appearing one by one with staggered timing
    setVisibleCards([]);

    cards.forEach((card, index) => {
      const timeout = setTimeout(() => {
        setVisibleCards(prev => [...prev, index]);
      }, index * 100);

      return () => clearTimeout(timeout);
    });
  }, [cards]);

  const isWinningCard = (index) => winningCardIndices.includes(index);
  const cardSize = 'w-12 h-16 sm:w-14 sm:h-20'; // 48-56px width

  return (
    <div className="flex justify-center gap-2 sm:gap-3 my-6">
      {cards.map((cardIndex, idx) => {
        const isVisible = visibleCards.includes(idx);
        const isWinning = isShowdown && isWinningCard(idx);

        return (
          <div
            key={idx}
            className={`relative transition-all duration-300 ${cardSize}`}
            style={{
              perspective: '1000px',
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'scale(1)' : 'scale(0.5)',
              transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Card with 3D flip effect */}
            <div
              className="relative w-full h-full"
              style={{
                transformStyle: 'preserve-3d',
                animation: isVisible ? 'dealFlip 0.6s ease-in-out forwards' : 'none',
                animationDelay: `${idx * 0.1}s`,
              }}
            >
              {/* Card face */}
              <div
                className={`absolute w-full h-full rounded-lg overflow-hidden shadow-lg ${
                  isWinning ? 'ring-2 ring-yellow-400 ring-offset-2' : ''
                }`}
                style={{
                  backgroundImage: `url(${getCardImagePath(cardIndex)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backfaceVisibility: 'hidden',
                }}
              >
                {/* Gold glow for winning cards */}
                {isWinning && (
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-yellow-300 via-transparent to-yellow-400 opacity-40 pointer-events-none"
                    style={{
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes dealFlip {
          0% {
            opacity: 0;
            transform: rotateY(90deg) rotateX(10deg) scale(0.8);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: rotateY(0deg) rotateX(0deg) scale(1);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
};

export default CommunityCards;
