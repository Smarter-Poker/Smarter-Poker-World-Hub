/**
 * VenueReviews.jsx — Feature #9: Poker Room Reviews & Photos
 * Full Yelp-style review system with ratings, photos, and sub-categories.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const CATEGORIES = [
    { key: 'dealers', label: 'Dealers', icon: '🃏' },
    { key: 'game_quality', label: 'Game Quality', icon: '⭐' },
    { key: 'rake', label: 'Rake', icon: '💰' },
    { key: 'food', label: 'Food & Drinks', icon: '🍔' },
    { key: 'atmosphere', label: 'Atmosphere', icon: '🎭' },
];

const SORT_OPTIONS = [
    { key: 'newest', label: 'Newest First' },
    { key: 'highest', label: 'Highest Rated' },
    { key: 'lowest', label: 'Lowest Rated' },
    { key: 'helpful', label: 'Most Helpful' },
];

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

function StarRating({ rating, size = 16, interactive = false, onChange }) {
    return (
        <div style={{ display: 'flex', gap: 2 }}>
            {[1, 2, 3, 4, 5].map(star => (
                <svg
                    key={star}
                    width={size}
                    height={size}
                    viewBox="0 0 24 24"
                    fill={star <= rating ? '#d4a853' : 'rgba(255,255,255,0.1)'}
                    stroke={star <= rating ? '#d4a853' : 'rgba(255,255,255,0.2)'}
                    strokeWidth="1"
                    style={{ cursor: interactive ? 'pointer' : 'default', transition: 'all 0.15s' }}
                    onClick={() => interactive && onChange && onChange(star)}
                >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
            ))}
        </div>
    );
}

function RatingBar({ count, total, stars }) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    return (
        <div className="vr-rating-bar-row">
            <span className="vr-bar-label">{stars}★</span>
            <div className="vr-bar-track">
                <div className="vr-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="vr-bar-count">{count}</span>
        </div>
    );
}

export default function VenueReviews({ venueId, venueName, userId, userName, authToken, isOpen, onClose }) {
    const [reviews, setReviews] = useState([]);
    const [avgRating, setAvgRating] = useState(0);
    const [totalReviews, setTotalReviews] = useState(0);
    const [distribution, setDistribution] = useState({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
    const [loading, setLoading] = useState(false);
    const [sortBy, setSortBy] = useState('newest');
    const [showWriteReview, setShowWriteReview] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // New review form state
    const [newRating, setNewRating] = useState(0);
    const [newText, setNewText] = useState('');
    const [categoryRatings, setCategoryRatings] = useState({});
    const [photos, setPhotos] = useState([]);
    const fileInputRef = useRef(null);

    // Fetch reviews
    const fetchReviews = useCallback(async () => {
        if (!venueId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/poker/reviews?venue_id=${venueId}&limit=50`);
            const data = await res.json();
            if (data.success) {
                setReviews(data.reviews || []);
                setAvgRating(data.avg_rating || 0);
                setTotalReviews(data.total_reviews || 0);
                setDistribution(data.rating_distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
            }
        } catch (err) {
            console.error('Failed to fetch reviews:', err);
        } finally {
            setLoading(false);
        }
    }, [venueId]);

    useEffect(() => {
        if (isOpen && venueId) fetchReviews();
    }, [isOpen, venueId, fetchReviews]);

    // Sort reviews
    const sortedReviews = [...reviews].sort((a, b) => {
        switch (sortBy) {
            case 'highest': return (b.rating || 0) - (a.rating || 0);
            case 'lowest': return (a.rating || 0) - (b.rating || 0);
            case 'helpful': return (b.helpful_count || 0) - (a.helpful_count || 0);
            default: return new Date(b.created_at) - new Date(a.created_at);
        }
    });

    // Handle photo upload
    const handlePhotoUpload = (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setPhotos(prev => [...prev, { data: ev.target.result, name: file.name }].slice(0, 5));
            };
            reader.readAsDataURL(file);
        });
    };

    // Submit review
    const submitReview = async () => {
        if (!newRating || !newText.trim() || !userId) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/poker/reviews', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    venue_id: venueId,
                    rating: newRating,
                    review_text: newText.trim(),
                    reviewer_name: userName || 'Anonymous',
                    category_ratings: categoryRatings,
                    photos: photos.map(p => p.data).slice(0, 3),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setNewRating(0);
                setNewText('');
                setCategoryRatings({});
                setPhotos([]);
                setShowWriteReview(false);
                fetchReviews();
            }
        } catch (err) {
            console.error('Failed to submit review:', err);
        } finally {
            setSubmitting(false);
        }
    };

    // Vote helpful
    const voteHelpful = async (reviewId) => {
        // Optimistic update
        setReviews(prev => prev.map(r =>
            r.id === reviewId ? { ...r, helpful_count: (r.helpful_count || 0) + 1, voted: true } : r
        ));
        // Persist to API
        try {
            const resp = await fetch('/api/poker/reviews', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
                body: JSON.stringify({ review_id: reviewId, action: 'helpful' }),
            });
            if (!resp.ok) throw new Error('API error');
        } catch {
            // Rollback on failure
            setReviews(prev => prev.map(r =>
                r.id === reviewId ? { ...r, helpful_count: Math.max((r.helpful_count || 1) - 1, 0), voted: false } : r
            ));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="vr-overlay" onClick={onClose}>
            <div className="vr-panel" onClick={e => e.stopPropagation()}>
                <div className="vr-header">
                    <div>
                        <h2>Reviews</h2>
                        <p className="vr-venue-name">{venueName}</p>
                    </div>
                    <button className="vr-close" onClick={onClose}>×</button>
                </div>

                {/* Rating summary */}
                <div className="vr-summary">
                    <div className="vr-score-box">
                        <div className="vr-score">{avgRating.toFixed(1)}</div>
                        <StarRating rating={Math.round(avgRating)} size={14} />
                        <div className="vr-total">{totalReviews} review{totalReviews !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="vr-distribution">
                        {[5, 4, 3, 2, 1].map(s => (
                            <RatingBar key={s} stars={s} count={distribution[s] || 0} total={totalReviews} />
                        ))}
                    </div>
                </div>

                {/* Write review button */}
                {userId && (
                    <button className="vr-write-btn" onClick={() => setShowWriteReview(!showWriteReview)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Write a Review
                    </button>
                )}

                {/* Write review form */}
                {showWriteReview && (
                    <div className="vr-write-form">
                        <div className="vr-form-group">
                            <label>Overall Rating *</label>
                            <StarRating rating={newRating} size={28} interactive onChange={setNewRating} />
                        </div>

                        <div className="vr-form-group">
                            <label>Category Ratings (optional)</label>
                            <div className="vr-category-ratings">
                                {CATEGORIES.map(cat => (
                                    <div key={cat.key} className="vr-cat-row">
                                        <span className="vr-cat-label">{cat.icon} {cat.label}</span>
                                        <StarRating
                                            rating={categoryRatings[cat.key] || 0}
                                            size={16}
                                            interactive
                                            onChange={val => setCategoryRatings(prev => ({ ...prev, [cat.key]: val }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="vr-form-group">
                            <label>Your Review *</label>
                            <textarea
                                value={newText}
                                onChange={e => setNewText(e.target.value)}
                                placeholder="Tell other players about your experience..."
                                className="vr-textarea"
                                rows={4}
                            />
                        </div>

                        <div className="vr-form-group">
                            <label>Photos (up to 5)</label>
                            <div className="vr-photo-row">
                                {photos.map((p, i) => (
                                    <div key={i} className="vr-photo-thumb">
                                        <img src={p.data} alt="" />
                                        <button className="vr-photo-remove" onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}>×</button>
                                    </div>
                                ))}
                                {photos.length < 5 && (
                                    <button className="vr-photo-add" onClick={() => fileInputRef.current?.click()}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                            <polyline points="21 15 16 10 5 21" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoUpload} style={{ display: 'none' }} />
                        </div>

                        <button className="vr-submit-btn" onClick={submitReview} disabled={!newRating || !newText.trim() || submitting}>
                            {submitting ? 'Submitting...' : 'Submit Review'}
                        </button>
                    </div>
                )}

                {/* Sort */}
                <div className="vr-sort-row">
                    {SORT_OPTIONS.map(opt => (
                        <button key={opt.key} className={'vr-sort-chip' + (sortBy === opt.key ? ' active' : '')} onClick={() => setSortBy(opt.key)}>
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Reviews list */}
                <div className="vr-list">
                    {loading && <div className="vr-loading"><div className="vr-spinner" /><span>Loading reviews...</span></div>}
                    {!loading && sortedReviews.length === 0 && (
                        <div className="vr-empty">
                            <p>No reviews yet. Be the first!</p>
                        </div>
                    )}
                    {sortedReviews.map((r, i) => (
                        <div key={r.id || i} className="vr-review-card">
                            <div className="vr-review-header">
                                <div className="vr-reviewer-avatar" style={{ background: `hsl(${Math.abs((r.reviewer_name || '').charCodeAt(0) * 37) % 360}, 55%, 50%)` }}>
                                    {(r.reviewer_name || '?')[0].toUpperCase()}
                                </div>
                                <div className="vr-reviewer-info">
                                    <span className="vr-reviewer-name">{r.reviewer_name}</span>
                                    <span className="vr-review-date">{timeAgo(r.created_at)}</span>
                                </div>
                                <StarRating rating={r.rating} size={12} />
                            </div>
                            <p className="vr-review-text">{r.review_text}</p>
                            {r.photos && r.photos.length > 0 && (
                                <div className="vr-review-photos">
                                    {r.photos.map((p, pi) => <img key={pi} src={p} alt="" className="vr-review-photo" />)}
                                </div>
                            )}
                            <div className="vr-review-actions">
                                <button className={'vr-helpful-btn' + (r.voted ? ' voted' : '')} onClick={() => !r.voted && voteHelpful(r.id)}>
                                    👍 Helpful {r.helpful_count > 0 ? `(${r.helpful_count})` : ''}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

            </div>

            <style jsx>{`
        .vr-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.75); display: flex; justify-content: flex-end; }
        .vr-panel { width: 100%; max-width: 500px; background: #0f172a; border-left: 1px solid rgba(255,255,255,0.1); overflow-y: auto; padding: 24px; animation: slideInRight 0.3s ease-out; }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .vr-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .vr-header h2 { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
        .vr-venue-name { font-size: 13px; color: rgba(255,255,255,0.4); margin: 4px 0 0; }
        .vr-close { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 28px; cursor: pointer; padding: 0; line-height: 1; }
        .vr-summary { display: flex; gap: 20px; margin-bottom: 20px; padding: 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; }
        .vr-score-box { text-align: center; min-width: 80px; }
        .vr-score { font-size: 36px; font-weight: 700; color: #d4a853; line-height: 1; }
        .vr-total { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px; }
        .vr-distribution { flex: 1; display: flex; flex-direction: column; gap: 4px; justify-content: center; }
        .vr-rating-bar-row { display: flex; align-items: center; gap: 6px; }
        .vr-bar-label { font-size: 11px; color: rgba(255,255,255,0.5); width: 20px; text-align: right; }
        .vr-bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
        .vr-bar-fill { height: 100%; background: #d4a853; border-radius: 3px; transition: width 0.3s; }
        .vr-bar-count { font-size: 11px; color: rgba(255,255,255,0.4); width: 20px; }
        .vr-write-btn { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px; background: linear-gradient(135deg, #d4a853, #b8860b); border: none; border-radius: 10px; color: #000; font-size: 14px; font-weight: 600; cursor: pointer; justify-content: center; margin-bottom: 16px; }
        .vr-write-form { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
        .vr-form-group { margin-bottom: 16px; }
        .vr-form-group:last-child { margin-bottom: 0; }
        .vr-form-group label { display: block; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .vr-category-ratings { display: flex; flex-direction: column; gap: 8px; }
        .vr-cat-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
        .vr-cat-label { font-size: 13px; color: rgba(255,255,255,0.7); }
        .vr-textarea { width: 100%; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #fff; font-size: 14px; font-family: inherit; resize: vertical; min-height: 100px; }
        .vr-textarea:focus { outline: none; border-color: rgba(212,168,83,0.4); }
        .vr-textarea::placeholder { color: rgba(255,255,255,0.25); }
        .vr-photo-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .vr-photo-thumb { position: relative; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; }
        .vr-photo-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .vr-photo-remove { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(239,68,68,0.9); border: none; color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .vr-photo-add { width: 60px; height: 60px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 2px dashed rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; cursor: pointer; color: rgba(255,255,255,0.3); }
        .vr-submit-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #d4a853, #b8860b); border: none; border-radius: 10px; color: #000; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; }
        .vr-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .vr-sort-row { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 16px; }
        .vr-sort-chip { padding: 6px 12px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 12px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
        .vr-sort-chip.active { background: rgba(212,168,83,0.15); border-color: rgba(212,168,83,0.4); color: #d4a853; }
        .vr-list { display: flex; flex-direction: column; gap: 12px; }
        .vr-loading { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; gap: 10px; }
        .vr-spinner { width: 28px; height: 28px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #d4a853; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .vr-loading span { color: rgba(255,255,255,0.4); font-size: 13px; }
        .vr-empty { text-align: center; padding: 40px 20px; }
        .vr-empty p { color: rgba(255,255,255,0.4); }
        .vr-review-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; }
        .vr-review-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .vr-reviewer-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .vr-reviewer-info { flex: 1; }
        .vr-reviewer-name { font-size: 14px; font-weight: 600; color: #fff; display: block; }
        .vr-review-date { font-size: 11px; color: rgba(255,255,255,0.3); }
        .vr-review-text { font-size: 14px; color: rgba(255,255,255,0.7); line-height: 1.5; margin: 0; }
        .vr-review-photos { display: flex; gap: 6px; margin-top: 10px; overflow-x: auto; }
        .vr-review-photo { width: 80px; height: 60px; border-radius: 6px; object-fit: cover; }
        .vr-review-actions { margin-top: 10px; }
        .vr-helpful-btn { padding: 6px 12px; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); font-size: 12px; cursor: pointer; transition: all 0.2s; }
        .vr-helpful-btn:hover { background: rgba(255,255,255,0.08); }
        .vr-helpful-btn.voted { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); color: #3b82f6; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
