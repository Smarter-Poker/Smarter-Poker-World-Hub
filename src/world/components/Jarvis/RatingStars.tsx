/* ═══════════════════════════════════════════════════════════════════════════
   RATING STARS — 5-star rating component for Jarvis answers
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface RatingStarsProps {
    rating: number;
    onRate: (rating: number) => void;
}

export function RatingStars({ rating, onRate }: RatingStarsProps) {
    const [hoverRating, setHoverRating] = useState(0);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px'
        }}>
            <span style={{
                fontSize: '10px',
                color: 'rgba(255, 215, 0, 0.5)',
                marginRight: '6px'
            }}>
                Rate:
            </span>
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    onClick={() => onRate(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px',
                        fontSize: '14px',
                        color: star <= (hoverRating || rating)
                            ? '#FFD700'
                            : 'rgba(255, 215, 0, 0.3)',
                        transition: 'color 0.15s ease, transform 0.15s ease',
                        transform: star <= hoverRating ? 'scale(1.2)' : 'scale(1)'
                    }}
                    title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                >
                    ★
                </button>
            ))}
            {rating > 0 && (
                <span style={{
                    fontSize: '10px',
                    color: 'rgba(100, 255, 100, 0.7)',
                    marginLeft: '4px'
                }}>
                    ✓
                </span>
            )}
        </div>
    );
}
