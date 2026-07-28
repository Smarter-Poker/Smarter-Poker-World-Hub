/**
 * VenueReviews — Premium 5-Star Category Rating & Review System
 * ═══════════════════════════════════════════════════════════════════
 * Full 5-category star ratings (Dealers, Atmosphere, Food & Drinks,
 * Waitlist Speed, Game Selection) with Verified Player badges,
 * helpful/unhelpful voting, sort controls, and animated rating
 * distribution bars. Wired to /api/poker/reviews CRUD endpoint.
 * ═══════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ────────────────────────────────────────
// Design Tokens
// ────────────────────────────────────────
const T = {
    bg: '#0a0a0a',
    card: '#111318',
    cardBorder: 'rgba(255,255,255,0.06)',
    text: '#E4E6EB',
    textSec: '#8B949E',
    textMuted: '#5a6270',
    star: '#d4a853',
    starEmpty: 'rgba(255,255,255,0.12)',
    accent: '#00D4FF',
    accentDim: 'rgba(0,212,255,0.12)',
    green: '#22c55e',
    greenDim: 'rgba(34,197,94,0.12)',
    red: '#ef4444',
    border: 'rgba(255,255,255,0.08)',
    gradient: 'linear-gradient(135deg, #00D4FF, #00f2fe)',
};

const CATEGORIES = [
    { key: 'dealers', label: 'Dealers', icon: '♠' },
    { key: 'atmosphere', label: 'Atmosphere', icon: '♦' },
    { key: 'food_drinks', label: 'Food & Drinks', icon: '♣' },
    { key: 'waitlist_speed', label: 'Waitlist Speed', icon: '♥' },
    { key: 'game_selection', label: 'Game Selection', icon: '★' },
];

const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest' },
    { value: 'highest', label: 'Highest Rated' },
    { value: 'lowest', label: 'Lowest Rated' },
    { value: 'helpful', label: 'Most Helpful' },
    { value: 'verified', label: 'Verified Only' },
];

// ────────────────────────────────────────
// Helpers
// ────────────────────────────────────────
function getAccessToken() {
    if (typeof window === 'undefined') return null;
    try {
        // Primary: smarter-poker-auth (storageKey set in supabase.ts)
        const primary = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        if (primary?.access_token) return primary.access_token;
        // Legacy fallback: sb-*-auth-token
        const keys = Object.keys(localStorage || {}).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (keys.length > 0) {
            const data = JSON.parse(localStorage.getItem(keys[0]) || '{}');
            return data?.access_token || null;
        }
    } catch { return null; }
    return null;
}

function getCurrentUser() {
    if (typeof window === 'undefined') return null;
    try {
        // Primary: smarter-poker-auth
        const primary = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        if (primary?.user) return primary.user;
        // Legacy fallback: sb-*-auth-token
        const keys = Object.keys(localStorage || {}).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (keys.length > 0) {
            const data = JSON.parse(localStorage.getItem(keys[0]) || '{}');
            return data?.user || null;
        }
        return null;
    } catch { return null; }
}


function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

// ────────────────────────────────────────
// Sub-Components
// ────────────────────────────────────────

/** Interactive star rating with hover preview */
function StarRating({ rating, onRate, interactive = false, size = 20, color = T.star }) {
    const [hovered, setHovered] = useState(0);
    return (
        <div style={{ display: 'inline-flex', gap: 2, cursor: interactive ? 'pointer' : 'default' }}>
            {[1, 2, 3, 4, 5].map(star => {
                const display = interactive ? (hovered || rating) : rating;
                const filled = display >= star;
                const halfFilled = !filled && display >= star - 0.5;
                return (
                    <svg
                        key={star}
                        width={size}
                        height={size}
                        viewBox="0 0 24 24"
                        fill={filled ? color : halfFilled ? color : T.starEmpty}
                        stroke={filled || halfFilled ? color : 'rgba(255,255,255,0.15)'}
                        strokeWidth="1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        onClick={() => interactive && onRate?.(star)}
                        onMouseEnter={() => interactive && setHovered(star)}
                        onMouseLeave={() => interactive && setHovered(0)}
                        style={{
                            transition: 'all 0.15s',
                            transform: interactive && hovered === star ? 'scale(1.2)' : 'scale(1)',
                            opacity: halfFilled ? 0.6 : 1,
                            filter: filled ? `drop-shadow(0 0 3px ${color}44)` : 'none',
                        }}
                    >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                );
            })}
        </div>
    );
}

/** Verified Player badge */
function VerifiedBadge({ size = 14 }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: T.greenDim, color: T.green,
            border: '1px solid rgba(34,197,94,0.25)',
            letterSpacing: '0.3px', textTransform: 'uppercase',
        }}>
            <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
            </svg>
            Verified Player
        </span>
    );
}

/** Category rating bar */
function CategoryBar({ label, icon, value, maxValue = 5 }) {
    const pct = value ? (value / maxValue) * 100 : 0;
    const barColor = value >= 4 ? T.green : value >= 3 ? T.star : value >= 2 ? '#f59e0b' : T.red;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 110, fontSize: 12, color: T.textSec, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ opacity: 0.5, fontSize: 11 }}>{icon}</span> {label}
            </span>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 3,
                    background: `linear-gradient(90deg, ${barColor}, ${barColor}88)`,
                    transition: 'width 0.6s ease',
                }} />
            </div>
            <span style={{ width: 24, fontSize: 12, fontWeight: 700, color: value ? barColor : T.textMuted, textAlign: 'right' }}>
                {value ? value.toFixed(1) : '—'}
            </span>
        </div>
    );
}

/** Rating distribution row (5 stars to 1 star) */
function DistributionRow({ starCount, count, total }) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, fontSize: 12, fontWeight: 600, color: T.textSec, textAlign: 'right' }}>{starCount}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={T.star} stroke={T.star} strokeWidth="1">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 3,
                    background: `linear-gradient(90deg, ${T.star}, ${T.star}88)`,
                    transition: 'width 0.5s ease',
                }} />
            </div>
            <span style={{ width: 20, fontSize: 11, color: T.textMuted, textAlign: 'right' }}>{count}</span>
        </div>
    );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════
export default function VenueReviews({ venueId, venueName }) {
    const [reviews, setReviews] = useState([]);
    const [summary, setSummary] = useState({
        avg_rating: 0, total_reviews: 0,
        rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        category_averages: {},
        verified_count: 0,
    });
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('newest');
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const formRef = useRef(null);

    // Form state
    const [formRating, setFormRating] = useState(0);
    const [formText, setFormText] = useState('');
    const [formCategories, setFormCategories] = useState({});

    // Helpful votes tracking (local storage to prevent double-voting)
    const [votedReviews, setVotedReviews] = useState({});

    const currentUser = typeof window !== 'undefined' ? getCurrentUser() : null;

    // Load voted reviews from localStorage
    useEffect(() => {
        try {
            const voted = JSON.parse(localStorage.getItem('sp-review-votes') || '{}');
            setVotedReviews(voted);
        } catch { /* ignore */ }
    }, []);

    // ────────── Data Fetch ──────────
    const fetchReviews = useCallback(async (sort) => {
        if (!venueId) return;
        try {
            const res = await fetch(`/api/poker/reviews?venue_id=${venueId}&limit=50&sort=${sort || sortBy}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setReviews(data.reviews || []);
                    setSummary({
                        avg_rating: data.avg_rating || 0,
                        total_reviews: data.total_reviews || 0,
                        rating_distribution: data.rating_distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
                        category_averages: data.category_averages || {},
                        verified_count: data.verified_count || 0,
                    });
                }
            }
        } catch (err) {
            console.warn('[VenueReviews] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [venueId, sortBy]);

    useEffect(() => { fetchReviews(); }, [fetchReviews]);

    // ────────── Handlers ──────────
    const handleSortChange = (newSort) => {
        setSortBy(newSort);
        setLoading(true);
        fetchReviews(newSort);
    };

    const handleSubmitReview = async (e) => {
        e.preventDefault();
        if (formRating === 0) { setError('Please select an overall star rating'); return; }
        setSubmitting(true);
        setError('');
        setSuccessMsg('');

        try {
            const token = getAccessToken();
            if (!token) {
                setError('Please sign in to leave a review');
                setSubmitting(false);
                return;
            }

            const body = {
                venue_id: venueId,
                rating: formRating,
                review_text: formText.trim(),
                reviewer_name: currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.username || 'Anonymous',
            };

            // Only include categories that were rated
            const filledCategories = {};
            for (const [key, val] of Object.entries(formCategories || {})) {
                if (val && val >= 1 && val <= 5) filledCategories[key] = val;
            }
            if (Object.keys(filledCategories || {}).length > 0) {
                body.category_ratings = filledCategories;
            }

            const res = await fetch('/api/poker/reviews', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                setFormRating(0);
                setFormText('');
                setFormCategories({});
                setShowForm(false);
                setSuccessMsg('Review submitted successfully!');
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchReviews();
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Failed to submit review');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleVote = async (reviewId, action) => {
        if (votedReviews[reviewId]) return; // Already voted
        const updated = { ...votedReviews, [reviewId]: action };
        setVotedReviews(updated);
        try { localStorage.setItem('sp-review-votes', JSON.stringify(updated)); } catch { /* ignore */ }

        // Optimistic update
        setReviews(prev => prev.map(r => {
            if (r.id === reviewId) {
                return action === 'helpful'
                    ? { ...r, helpful_count: (r.helpful_count || 0) + 1 }
                    : { ...r, unhelpful_count: (r.unhelpful_count || 0) + 1 };
            }
            return r;
        }));

        try {
            await fetch('/api/poker/reviews', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ review_id: reviewId, action }),
            });
        } catch { /* best-effort */ }
    };

    const handleDeleteReview = async (reviewId) => {
        if (!confirm('Delete this review?')) return;
        const token = getAccessToken();
        if (!token) return;
        try {
            const res = await fetch(`/api/poker/reviews?review_id=${reviewId}&venue_id=${venueId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) fetchReviews();
        } catch { /* ignore */ }
    };

    // ────────── Render ──────────
    if (loading) {
        return (
            <div style={{ padding: '20px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{ height: 60, background: 'rgba(255,255,255,0.03)', borderRadius: 10, animation: 'pulse 1.5s ease infinite' }} />
                    ))}
                </div>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.15; } }`}</style>
            </div>
        );
    }

    const hasCategoryData = Object.values(summary.category_averages || {}).some(v => v != null);

    return (
        <div className="vr-root">
            {/* ═══════════════════════════════════════ */}
            {/* SECTION HEADER                          */}
            {/* ═══════════════════════════════════════ */}
            <div className="vr-section-header">
                <h2 className="vr-section-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.star} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Player Reviews & Ratings
                </h2>
                {currentUser && (
                    <button
                        className={`vr-write-btn ${showForm ? 'cancel' : ''}`}
                        onClick={() => { setShowForm(!showForm); setError(''); }}
                    >
                        {showForm ? 'Cancel' : 'Write A Review'}
                    </button>
                )}
            </div>

            {/* Success message */}
            {successMsg && (
                <div className="vr-success-toast">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {successMsg}
                </div>
            )}

            {/* ═══════════════════════════════════════ */}
            {/* RATING SUMMARY PANEL                    */}
            {/* ═══════════════════════════════════════ */}
            <div className="vr-summary-panel">
                <div className="vr-summary-left">
                    <div className="vr-big-rating">{summary.avg_rating > 0 ? summary.avg_rating.toFixed(1) : '—'}</div>
                    <StarRating rating={Math.round(summary.avg_rating)} size={18} />
                    <div className="vr-total-count">
                        {summary.total_reviews} {summary.total_reviews === 1 ? 'Review' : 'Reviews'}
                        {summary.verified_count > 0 && (
                            <span className="vr-verified-count">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                </svg>
                                {summary.verified_count} Verified
                            </span>
                        )}
                    </div>
                </div>
                <div className="vr-summary-right">
                    {/* Rating Distribution */}
                    <div className="vr-distribution">
                        {[5, 4, 3, 2, 1].map(star => (
                            <DistributionRow
                                key={star}
                                starCount={star}
                                count={summary.rating_distribution[star] || 0}
                                total={summary.total_reviews}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════ */}
            {/* CATEGORY AVERAGES                       */}
            {/* ═══════════════════════════════════════ */}
            {hasCategoryData && (
                <div className="vr-category-panel">
                    <h4 className="vr-category-title">Category Breakdown</h4>
                    {CATEGORIES.map(cat => (
                        <CategoryBar
                            key={cat.key}
                            label={cat.label}
                            icon={cat.icon}
                            value={summary.category_averages[cat.key]}
                        />
                    ))}
                </div>
            )}

            {/* ═══════════════════════════════════════ */}
            {/* WRITE REVIEW FORM                       */}
            {/* ═══════════════════════════════════════ */}
            {showForm && (
                <form ref={formRef} onSubmit={handleSubmitReview} className="vr-form">
                    <h3 className="vr-form-title">Rate {venueName || 'This Venue'}</h3>

                    {/* Overall Rating */}
                    <div className="vr-form-group">
                        <label className="vr-form-label">Overall Rating <span style={{ color: T.red }}>*</span></label>
                        <StarRating rating={formRating} onRate={setFormRating} interactive size={32} />
                    </div>

                    {/* Category Ratings */}
                    <div className="vr-form-categories">
                        <label className="vr-form-label" style={{ marginBottom: 8 }}>Category Ratings (Optional)</label>
                        {CATEGORIES.map(cat => (
                            <div key={cat.key} className="vr-form-cat-row">
                                <span className="vr-form-cat-label">
                                    <span style={{ opacity: 0.5 }}>{cat.icon}</span> {cat.label}
                                </span>
                                <StarRating
                                    rating={formCategories[cat.key] || 0}
                                    onRate={(val) => setFormCategories(prev => ({ ...prev, [cat.key]: val }))}
                                    interactive
                                    size={18}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Review Text */}
                    <div className="vr-form-group">
                        <label className="vr-form-label">Your Review (Optional)</label>
                        <textarea
                            className="vr-form-textarea"
                            placeholder="Tell other players about your experience — dealers, games, food, atmosphere..."
                            value={formText}
                            onChange={e => setFormText(e.target.value)}
                            maxLength={2000}
                            rows={4}
                        />
                        <div className="vr-form-char-count">{formText.length}/2000</div>
                    </div>

                    {error && <div className="vr-error">{error}</div>}

                    <button type="submit" className="vr-submit-btn" disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Submit Review'}
                    </button>
                </form>
            )}

            {/* ═══════════════════════════════════════ */}
            {/* SORT CONTROLS                           */}
            {/* ═══════════════════════════════════════ */}
            {summary.total_reviews > 0 && (
                <div className="vr-sort-bar">
                    {SORT_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            className={`vr-sort-pill ${sortBy === opt.value ? 'active' : ''}`}
                            onClick={() => handleSortChange(opt.value)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}

            {/* ═══════════════════════════════════════ */}
            {/* REVIEW CARDS                            */}
            {/* ═══════════════════════════════════════ */}
            {reviews.length === 0 ? (
                <div className="vr-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <p>No Reviews Yet</p>
                    <span>Be the first to review {venueName || 'this venue'}!</span>
                </div>
            ) : (
                <div className="vr-reviews-list">
                    {reviews.map((review, idx) => {
                        const profile = review.profile || {};
                        const displayName = review.reviewer_name || profile.username || 'Anonymous';
                        const avatarUrl = profile.avatar_url;
                        const initial = (displayName || 'A').charAt(0).toUpperCase();
                        const isOwn = currentUser?.id === review.user_id;
                        const hasVoted = votedReviews[review.id];
                        const hasCats = CATEGORIES.some(c => review[c.key + '_rating']);

                        return (
                            <div key={review.id || idx} className="vr-review-card" style={{ animationDelay: `${idx * 0.05}s` }}>
                                {/* Header Row */}
                                <div className="vr-review-header">
                                    <div className="vr-review-avatar-area">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="" className="vr-review-avatar" />
                                        ) : (
                                            <div className="vr-review-avatar vr-avatar-fallback">{initial}</div>
                                        )}
                                    </div>
                                    <div className="vr-review-meta">
                                        <div className="vr-review-name-row">
                                            <span className="vr-review-name">{displayName}</span>
                                            {profile.username && (
                                                <span className="vr-review-username">@{profile.username}</span>
                                            )}
                                        </div>
                                        <div className="vr-review-sub-row">
                                            <StarRating rating={review.rating} size={14} />
                                            <span className="vr-review-time">{timeAgo(review.created_at)}</span>
                                        </div>
                                    </div>
                                    <div className="vr-review-badges">
                                        {review.is_verified_player && <VerifiedBadge />}
                                    </div>
                                </div>

                                {/* Review Text */}
                                {review.review_text && (
                                    <p className="vr-review-text">{review.review_text}</p>
                                )}

                                {/* Category Chips */}
                                {hasCats && (
                                    <div className="vr-review-cats">
                                        {CATEGORIES.map(cat => {
                                            const val = review[cat.key + '_rating'];
                                            if (!val) return null;
                                            const chipColor = val >= 4 ? T.green : val >= 3 ? T.star : T.red;
                                            return (
                                                <span key={cat.key} className="vr-cat-chip" style={{
                                                    background: `${chipColor}15`,
                                                    borderColor: `${chipColor}30`,
                                                    color: chipColor,
                                                }}>
                                                    {cat.icon} {cat.label}: {val}/5
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Footer Actions */}
                                <div className="vr-review-footer">
                                    <div className="vr-vote-group">
                                        <button
                                            className={`vr-vote-btn ${hasVoted === 'helpful' ? 'voted' : ''}`}
                                            onClick={() => handleVote(review.id, 'helpful')}
                                            disabled={!!hasVoted}
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                                            </svg>
                                            Helpful{review.helpful_count > 0 ? ` (${review.helpful_count})` : ''}
                                        </button>
                                        <button
                                            className={`vr-vote-btn ${hasVoted === 'unhelpful' ? 'voted' : ''}`}
                                            onClick={() => handleVote(review.id, 'unhelpful')}
                                            disabled={!!hasVoted}
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}>
                                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                                            </svg>
                                            Not Helpful
                                        </button>
                                    </div>
                                    {isOwn && (
                                        <button className="vr-delete-btn" onClick={() => handleDeleteReview(review.id)}>
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══════════════════════════════════════ */}
            {/* STYLES                                  */}
            {/* ═══════════════════════════════════════ */}
            <style>{`
                .vr-root { margin-top: 0; }

                /* Section Header */
                .vr-section-header {
                    display: flex; align-items: center; justify-content: space-between;
                    margin-bottom: 16px; flex-wrap: wrap; gap: 8px;
                }
                .vr-section-title {
                    font-size: 18px; font-weight: 700; color: #fff;
                    display: flex; align-items: center; gap: 8px; margin: 0;
                }
                .vr-write-btn {
                    padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
                    cursor: pointer; transition: all 0.2s; border: 1px solid;
                    background: ${T.accentDim}; color: ${T.accent}; border-color: rgba(0,212,255,0.25);
                }
                .vr-write-btn:hover { background: rgba(0,212,255,0.2); box-shadow: 0 0 12px rgba(0,212,255,0.15); }
                .vr-write-btn.cancel { background: rgba(255,255,255,0.05); color: ${T.textSec}; border-color: ${T.border}; }

                /* Success Toast */
                .vr-success-toast {
                    display: flex; align-items: center; gap: 8px; padding: 10px 14px;
                    background: ${T.greenDim}; border: 1px solid rgba(34,197,94,0.3);
                    border-radius: 8px; color: ${T.green}; font-size: 13px; font-weight: 600;
                    margin-bottom: 16px; animation: slideIn 0.3s ease;
                }

                /* Summary Panel */
                .vr-summary-panel {
                    display: flex; gap: 24px; padding: 20px;
                    background: rgba(255,255,255,0.02); border: 1px solid ${T.border};
                    border-radius: 12px; margin-bottom: 12px;
                }
                .vr-summary-left {
                    display: flex; flex-direction: column; align-items: center;
                    gap: 6px; min-width: 100px;
                }
                .vr-big-rating {
                    font-size: 40px; font-weight: 800; color: ${T.star}; line-height: 1;
                    text-shadow: 0 0 20px rgba(212,168,83,0.2);
                }
                .vr-total-count {
                    font-size: 12px; color: ${T.textMuted}; text-align: center;
                    display: flex; flex-direction: column; align-items: center; gap: 4px;
                }
                .vr-verified-count {
                    display: inline-flex; align-items: center; gap: 3px;
                    color: ${T.green}; font-size: 11px; font-weight: 600;
                }
                .vr-summary-right { flex: 1; display: flex; flex-direction: column; gap: 4px; }
                .vr-distribution { display: flex; flex-direction: column; gap: 4px; }

                /* Category Panel */
                .vr-category-panel {
                    padding: 16px; background: rgba(255,255,255,0.02);
                    border: 1px solid ${T.border}; border-radius: 10px; margin-bottom: 12px;
                }
                .vr-category-title {
                    margin: 0 0 10px; font-size: 14px; font-weight: 700; color: ${T.text};
                }

                /* Form */
                .vr-form {
                    padding: 20px; background: rgba(0,212,255,0.03);
                    border: 1px solid rgba(0,212,255,0.12); border-radius: 12px;
                    margin-bottom: 16px; animation: slideIn 0.3s ease;
                }
                .vr-form-title {
                    margin: 0 0 16px; font-size: 16px; font-weight: 700; color: ${T.text};
                }
                .vr-form-group { margin-bottom: 14px; }
                .vr-form-label {
                    display: block; font-size: 12px; font-weight: 600;
                    color: ${T.textSec}; margin-bottom: 6px; text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                .vr-form-textarea {
                    width: 100%; padding: 12px; border-radius: 8px;
                    background: rgba(0,0,0,0.3); border: 1px solid ${T.border};
                    color: ${T.text}; font-size: 14px; resize: vertical;
                    outline: none; box-sizing: border-box; font-family: inherit;
                    transition: border-color 0.2s;
                }
                .vr-form-textarea:focus { border-color: rgba(0,212,255,0.3); }
                .vr-form-char-count {
                    text-align: right; font-size: 11px; color: ${T.textMuted}; margin-top: 4px;
                }
                .vr-form-categories {
                    margin-bottom: 16px; padding: 12px;
                    background: rgba(0,0,0,0.15); border-radius: 8px;
                    border: 1px solid ${T.border};
                }
                .vr-form-cat-row {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 6px 0; gap: 8px;
                }
                .vr-form-cat-label {
                    font-size: 13px; color: ${T.textSec}; font-weight: 500;
                    display: flex; align-items: center; gap: 5px;
                }
                .vr-error {
                    color: ${T.red}; font-size: 13px; padding: 8px 12px;
                    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
                    border-radius: 6px; margin-bottom: 12px;
                }
                .vr-submit-btn {
                    width: 100%; padding: 12px; border-radius: 10px;
                    background: ${T.gradient}; border: none; color: #000;
                    font-weight: 800; font-size: 15px; cursor: pointer;
                    transition: all 0.2s; letter-spacing: 0.3px;
                }
                .vr-submit-btn:hover { box-shadow: 0 0 20px rgba(0,212,255,0.3); transform: translateY(-1px); }
                .vr-submit-btn:disabled { opacity: 0.5; cursor: wait; transform: none; }

                /* Sort Bar */
                .vr-sort-bar {
                    display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;
                    padding-bottom: 12px; border-bottom: 1px solid ${T.border};
                }
                .vr-sort-pill {
                    padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
                    cursor: pointer; transition: all 0.2s; border: 1px solid ${T.border};
                    background: rgba(255,255,255,0.03); color: ${T.textSec};
                }
                .vr-sort-pill:hover { background: rgba(255,255,255,0.06); color: ${T.text}; }
                .vr-sort-pill.active {
                    background: ${T.accentDim}; color: ${T.accent};
                    border-color: rgba(0,212,255,0.25);
                }

                /* Empty State */
                .vr-empty {
                    text-align: center; padding: 40px 20px;
                    background: rgba(255,255,255,0.02); border: 1px solid ${T.border};
                    border-radius: 12px;
                }
                .vr-empty p { color: ${T.text}; font-size: 15px; font-weight: 600; margin: 12px 0 4px; }
                .vr-empty span { color: ${T.textMuted}; font-size: 13px; }

                /* Review Cards */
                .vr-reviews-list { display: flex; flex-direction: column; gap: 10px; }
                .vr-review-card {
                    padding: 16px; background: rgba(255,255,255,0.02);
                    border: 1px solid ${T.border}; border-radius: 10px;
                    transition: border-color 0.2s; animation: fadeIn 0.3s ease both;
                }
                .vr-review-card:hover { border-color: rgba(255,255,255,0.12); }
                .vr-review-header {
                    display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px;
                }
                .vr-review-avatar-area { flex-shrink: 0; }
                .vr-review-avatar {
                    width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
                    border: 1.5px solid rgba(255,255,255,0.1);
                }
                .vr-avatar-fallback {
                    display: flex; align-items: center; justify-content: center;
                    background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,242,254,0.1));
                    font-size: 15px; font-weight: 800; color: ${T.accent};
                }
                .vr-review-meta { flex: 1; min-width: 0; }
                .vr-review-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
                .vr-review-name { font-size: 14px; font-weight: 700; color: ${T.text}; }
                .vr-review-username { font-size: 12px; color: ${T.textMuted}; }
                .vr-review-sub-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
                .vr-review-time { font-size: 11px; color: ${T.textMuted}; }
                .vr-review-badges { flex-shrink: 0; }
                .vr-review-text {
                    font-size: 14px; color: ${T.textSec}; line-height: 1.6;
                    margin: 0 0 10px; white-space: pre-wrap; word-break: break-word;
                }

                /* Category Chips */
                .vr-review-cats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
                .vr-cat-chip {
                    padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600;
                    border: 1px solid; letter-spacing: 0.2px;
                }

                /* Footer Actions */
                .vr-review-footer {
                    display: flex; align-items: center; justify-content: space-between;
                    padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04);
                }
                .vr-vote-group { display: flex; gap: 8px; }
                .vr-vote-btn {
                    display: inline-flex; align-items: center; gap: 4px;
                    padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
                    cursor: pointer; transition: all 0.2s; border: 1px solid ${T.border};
                    background: rgba(255,255,255,0.03); color: ${T.textMuted};
                }
                .vr-vote-btn:hover:not(:disabled) { background: rgba(255,255,255,0.06); color: ${T.textSec}; }
                .vr-vote-btn.voted { background: rgba(34,197,94,0.1); color: ${T.green}; border-color: rgba(34,197,94,0.2); cursor: default; }
                .vr-vote-btn:disabled { opacity: 0.5; cursor: default; }
                .vr-delete-btn {
                    padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
                    cursor: pointer; border: 1px solid rgba(239,68,68,0.2);
                    background: rgba(239,68,68,0.08); color: ${T.red}; transition: all 0.2s;
                }
                .vr-delete-btn:hover { background: rgba(239,68,68,0.15); }

                /* Animations */
                @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

                /* Mobile */
                @media (max-width: 600px) {
                    .vr-summary-panel { flex-direction: column; gap: 16px; }
                    .vr-summary-left { flex-direction: row; align-items: center; gap: 12px; }
                    .vr-big-rating { font-size: 32px; }
                    .vr-sort-bar { gap: 4px; }
                    .vr-sort-pill { padding: 4px 8px; font-size: 11px; }
                    .vr-form-cat-row { flex-direction: column; align-items: flex-start; gap: 4px; }
                }
            `}</style>
        </div>
    );
}
