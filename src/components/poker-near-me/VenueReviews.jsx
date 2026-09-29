/**
 * VenueReviews.jsx — Feature #9: Poker Room Reviews & Photos
 * Full Yelp-style review system with ratings and sub-category scores.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';
import toast from '../../stores/toastStore';
import { acquireScrollLock } from '../../lib/scrollLock';
import PokerNearMeConsole, { PokerNearMeConsoleIcon } from './PokerNearMeConsole';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// WIRING FIX: these keys must match CATEGORY_KEYS in pages/api/poker/reviews.js
// ('dealers', 'atmosphere', 'food_drinks', 'waitlist_speed', 'game_selection').
// The old keys game_quality / rake / food matched no column, so the API dropped
// them from *_rating columns, from its category averages, and from the columns
// its GET selects — users' ratings for those three silently disappeared.
const CATEGORIES = [
    { key: 'dealers', label: 'Dealers' },
    { key: 'game_selection', label: 'Game Selection' },
    { key: 'waitlist_speed', label: 'Waitlist Speed' },
    { key: 'food_drinks', label: 'Food & Drinks' },
    { key: 'atmosphere', label: 'Atmosphere' },
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

/**
 * A11Y FIX: the interactive stars used to be bare <svg onClick> elements with no role,
 * no tabIndex and no key handler, so the rating input could not be set without a mouse.
 * Interactive mode renders real radio buttons inside a radiogroup; the read-only
 * mode prints the rating as text.
 *
 * #ClubArenaConsole: the flat SVG star family is retired. Each choice is a 44px
 * numeral printed in the painted utility well; the choices up to the current
 * rating are lit.
 */
function StarRating({ rating, interactive = false, onChange, label = 'Rating' }) {
    if (!interactive) {
        return (
            <span className="pnm-reviews__rating" role="img" aria-label={`${label}: ${rating || 0} out of 5`}>
                {rating || 0}/5
            </span>
        );
    }

    return (
        <div className="pnm-reviews__rating-input" role="radiogroup" aria-label={label}>
            {[1, 2, 3, 4, 5].map(star => (
                <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={star === rating}
                    aria-label={`${star} star${star !== 1 ? 's' : ''}`}
                    className="pnm-reviews__rating-choice"
                    data-lit={star <= (rating || 0) ? 'true' : 'false'}
                    onClick={() => onChange && onChange(star)}
                >
                    {star}
                </button>
            ))}
        </div>
    );
}

function RatingBar({ count, total, stars }) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    return (
        <div className="vr-rating-bar-row pnm-reviews__bar-row">
            <span className="vr-bar-label pnm-reviews__bar-label">{stars} Star</span>
            <div className="vr-bar-track pnm-reviews__bar-track">
                <div className="vr-bar-fill pnm-reviews__bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="vr-bar-count pnm-reviews__bar-count">{count}</span>
        </div>
    );
}

const PAGE_SIZE = 25;

// Category keys as the API returns them in `category_averages` (column name minus
// the _rating suffix), mapped to the label the review form uses.
const CATEGORY_AVG_LABELS = {
    dealers: 'Dealers',
    game_selection: 'Game Selection',
    waitlist_speed: 'Waitlist Speed',
    food_drinks: 'Food & Drinks',
    atmosphere: 'Atmosphere',
};

export default function VenueReviews({ venueId, venueName, userId, userName, authToken, isOpen, onClose }) {
    const [reviews, setReviews] = useState([]);
    const [avgRating, setAvgRating] = useState(0);
    const [totalReviews, setTotalReviews] = useState(0);
    const [distribution, setDistribution] = useState({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
    const [categoryAverages, setCategoryAverages] = useState(null);
    const [verifiedCount, setVerifiedCount] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sortBy, setSortBy] = useState('newest');
    const [showWriteReview, setShowWriteReview] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Mobile phase 3: the phone back gesture closes the panel instead of
    // leaving the page, and a drag that merely ends on the scrim does not.
    useModalHistory(!!isOpen, onClose);
    const scrim = useScrimDismiss(onClose);

    // New review form state
    const [newRating, setNewRating] = useState(0);
    const [newText, setNewText] = useState('');
    const [categoryRatings, setCategoryRatings] = useState({});
    const [submitError, setSubmitError] = useState('');

    // Fetch reviews.
    // BUG FIX: this used to request `limit=50` with no `sort` and no `offset`, then
    // re-sort that 50-row slice client-side — so for a venue with more than 50 reviews
    // "Highest Rated" showed the best of the 50 MOST RECENT, not the best overall,
    // while the header reported the full total_reviews count and reviews 51+ were
    // unreachable. The API already implements `sort` and `offset`; use them.
    const fetchReviews = useCallback(async () => {
        if (!venueId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/poker/reviews?venue_id=${venueId}&limit=${PAGE_SIZE}&offset=0&sort=${encodeURIComponent(sortBy)}`);
            const data = await res.json();
            if (data.success) {
                const list = data.reviews || [];
                setReviews(list);
                setAvgRating(data.avg_rating || 0);
                setTotalReviews(data.total_reviews || 0);
                setDistribution(data.rating_distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
                setCategoryAverages(data.category_averages || null);
                setVerifiedCount(data.verified_count || 0);
                setHasMore(list.length >= PAGE_SIZE);
            }
        } catch (err) {
            console.warn('Failed to fetch reviews:', err);
        } finally {
            setLoading(false);
        }
    }, [venueId, sortBy]);

    useEffect(() => {
        if (isOpen && venueId) fetchReviews();
    }, [isOpen, venueId, fetchReviews]);

    // A11Y FIX: the panel could only be dismissed by clicking the backdrop or the ×.
    // There was no dialog role, no Escape handler, no focus move on open, no focus
    // restore on close and no body scroll lock, so keyboard and screen-reader users
    // tabbed straight out into the page behind it.
    const panelRef = useRef(null);
    const openerRef = useRef(null);
    useEffect(() => {
        if (!isOpen) return undefined;
        if (typeof document === 'undefined') return undefined;
        openerRef.current = document.activeElement;
        if (panelRef.current) {
            try { panelRef.current.focus(); } catch { /* focus not supported */ }
        }
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                if (onClose) onClose();
                return;
            }
            // A11Y FIX: Tab now stays inside the dialog instead of walking out
            // into the page behind the scrim.
            if (e.key !== 'Tab') return;
            const root = panelRef.current;
            if (!root) return;
            const focusables = root.querySelectorAll(FOCUSABLE);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        // The shared registry lock instead of a captured body.style.overflow.
        const releaseScrollLock = acquireScrollLock('VenueReviewsDialog');
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            releaseScrollLock();
            const opener = openerRef.current;
            if (opener && typeof opener.focus === 'function') {
                try { opener.focus(); } catch { /* element gone */ }
            }
        };
    }, [isOpen, onClose]);

    const loadMoreReviews = async () => {
        if (loadingMore || !hasMore || !venueId) return;
        setLoadingMore(true);
        try {
            const offset = reviews.length;
            const res = await fetch(`/api/poker/reviews?venue_id=${venueId}&limit=${PAGE_SIZE}&offset=${offset}&sort=${encodeURIComponent(sortBy)}`);
            const data = await res.json();
            if (data.success) {
                const list = data.reviews || [];
                setReviews(prev => [...prev, ...list]);
                setHasMore(list.length >= PAGE_SIZE);
            } else {
                setHasMore(false);
            }
        } catch (err) {
            console.warn('Failed to load more reviews:', err);
        } finally {
            setLoadingMore(false);
        }
    };

    // Submit review
    const submitReview = async () => {
        if (!newRating || !newText.trim() || !userId) return;
        if (!requireOnlineNow(toast)) return;
        setSubmitting(true);
        setSubmitError('');
        try {
            const res = await fetch('/api/poker/reviews', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                // GAP FIX: `photos` used to be sent here (and a "Photos (up to 5)"
                // picker collected them), but pages/api/poker/reviews.js never reads
                // or stores a photos field and its GET select has no photos column —
                // every upload was silently discarded. The picker has been removed
                // rather than keep pretending the uploads go somewhere.
                body: JSON.stringify({
                    venue_id: venueId,
                    rating: newRating,
                    review_text: newText.trim(),
                    reviewer_name: userName || 'Anonymous',
                    category_ratings: categoryRatings,
                }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.success) {
                setNewRating(0);
                setNewText('');
                setCategoryRatings({});
                setShowWriteReview(false);
                fetchReviews();
                // Emit cross-page event so lobby pages can invalidate cached review stats
                try {
                    window.dispatchEvent(new CustomEvent('pnm:review-submitted', {
                        detail: { venueId, rating: newRating }
                    }));
                } catch { /* silent */ }
            } else {
                // Previously a rejected review (401/403/500) did nothing visible at all.
                setSubmitError(data?.error || `Could not submit review (${res.status}).`);
            }
        } catch (err) {
            console.warn('Failed to submit review:', err);
            setSubmitError('Could not reach the server. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Vote helpful/unhelpful
    const voteReview = async (reviewId, action) => {
        if (!requireOnlineNow(toast)) return;
        // Optimistic update
        setReviews(prev => prev.map(r =>
            r.id === reviewId ? {
                ...r,
                [action + '_count']: (r[action + '_count'] || 0) + 1,
                ['voted_' + action]: true
            } : r
        ));
        // Persist to API
        try {
            const resp = await fetch('/api/poker/reviews', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
                body: JSON.stringify({ review_id: reviewId, action }),
            });
            if (!resp.ok) throw new Error('API error');
        } catch {
            // Rollback on failure
            setReviews(prev => prev.map(r =>
                r.id === reviewId ? {
                    ...r,
                    [action + '_count']: Math.max((r[action + '_count'] || 1) - 1, 0),
                    ['voted_' + action]: false
                } : r
            ));
        }
    };

    if (!isOpen) return null;

    const writeFormOpen = !!(userId && showWriteReview);
    const canSubmit = !!newRating && !!newText.trim() && !submitting;

    return (
        <div
            className="pnm-console-dialog-overlay pnm-reviews-dialog-overlay"
            role="presentation"
            onPointerDown={scrim.onPointerDown}
            onClick={(e) => { e.stopPropagation(); scrim.onClick(e); }}
            style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
        >
            <section
                className="pnm-console-dialog-shell pnm-reviews-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pnm-venue-reviews-title"
                aria-describedby={venueName ? 'pnm-venue-reviews-venue' : undefined}
                aria-busy={loading || submitting}
                tabIndex={-1}
                ref={panelRef}
                onClick={e => e.stopPropagation()}
            >
                <PokerNearMeConsole
                    as="div"
                    className="pnm-console-dialog"
                    crest="flat"
                    eyebrow="Player Reviews"
                    title="Reviews"
                    titleId="pnm-venue-reviews-title"
                    foot={writeFormOpen ? 'plates' : 'foot'}
                    plates={writeFormOpen ? {
                        secondary: {
                            label: 'Cancel',
                            onClick: () => { setSubmitError(''); setShowWriteReview(false); },
                            disabled: submitting,
                            'aria-label': 'Cancel Review',
                        },
                        primary: {
                            label: submitting ? 'Submitting...' : 'Submit',
                            ink: 'white',
                            onClick: submitReview,
                            disabled: !canSubmit,
                            'aria-label': submitting ? 'Submitting Review' : 'Submit Review',
                        },
                    } : undefined}
                >
                    <div className="pnm-console-dialog__body pnm-reviews">
                        {venueName ? <p id="pnm-venue-reviews-venue" className="pnm-console-dialog__copy pnm-reviews__venue">{venueName}</p> : null}

                        {/* Rating summary, printed as rows on the glass */}
                        <div className="pnm-reviews__summary">
                            <div className="pnm-reviews__score">
                                <span className="pnm-reviews__score-value">{avgRating.toFixed(1)}</span>
                                <StarRating rating={Math.round(avgRating)} label="Average rating" />
                                <span className="pnm-reviews__total">{`${totalReviews} Review${totalReviews !== 1 ? 's' : ''}`}</span>
                            </div>
                            <div className="pnm-reviews__distribution">
                                {[5, 4, 3, 2, 1].map(s => (
                                    <RatingBar key={s} stars={s} count={distribution[s] || 0} total={totalReviews} />
                                ))}
                            </div>
                        </div>

                        {/* GAP FIX: the form asks every reviewer to fill in five category ratings
                            and the API returns them as `category_averages`, but nothing rendered
                            them — the ratings were write-only from the user's point of view.
                            `verified_count` was likewise never surfaced. */}
                        {categoryAverages && Object.keys(CATEGORY_AVG_LABELS).some(k => categoryAverages[k] != null) && (
                            <div className="pnm-reviews__categories">
                                <div className="pnm-reviews__section-head">
                                    <span>Category Ratings</span>
                                    {verifiedCount > 0 && (
                                        <span className="pnm-reviews__verified-count">{`${verifiedCount} Verified Player${verifiedCount !== 1 ? 's' : ''}`}</span>
                                    )}
                                </div>
                                {Object.entries(CATEGORY_AVG_LABELS).map(([key, label]) => {
                                    const val = categoryAverages[key];
                                    if (val == null) return null;
                                    return (
                                        <div key={key} className="vr-rating-bar-row pnm-reviews__bar-row">
                                            <span className="pnm-reviews__bar-label pnm-reviews__bar-label--wide">{label}</span>
                                            <div className="pnm-reviews__bar-track">
                                                <div className="pnm-reviews__bar-fill" style={{ width: `${(Number(val) / 5) * 100}%` }} />
                                            </div>
                                            <span className="pnm-reviews__bar-count">{Number(val).toFixed(1)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Write review toggle: a lit word on the glass */}
                        {userId && (
                            <button
                                type="button"
                                className="pnm-reviews__text-action vr-write-btn"
                                aria-expanded={showWriteReview}
                                onClick={() => { setSubmitError(''); setShowWriteReview(!showWriteReview); }}
                            >
                                <PokerNearMeConsoleIcon name="edit" className="pnm-reviews__action-icon" />
                                {showWriteReview ? 'Close Review Form' : 'Write A Review'}
                            </button>
                        )}

                        {/* Write review form: its Cancel / Submit are the console's two plates */}
                        {showWriteReview && (
                            <div className="pnm-reviews__form">
                                <div className="pnm-reviews__field">
                                    <span className="pnm-console-dialog__label">Overall Rating (Required)</span>
                                    <StarRating rating={newRating} interactive label="Overall rating" onChange={setNewRating} />
                                </div>

                                <div className="pnm-reviews__field">
                                    <span className="pnm-console-dialog__label">Category Ratings (Optional)</span>
                                    <div className="pnm-reviews__category-inputs">
                                        {CATEGORIES.map(cat => (
                                            <div key={cat.key} className="pnm-reviews__category-row">
                                                <span className="pnm-reviews__category-label">{cat.label}</span>
                                                <StarRating
                                                    rating={categoryRatings[cat.key] || 0}
                                                    interactive
                                                    label={cat.label}
                                                    onChange={val => setCategoryRatings(prev => ({ ...prev, [cat.key]: val }))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pnm-console-dialog__content">
                                    <label className="pnm-console-dialog__field">
                                        <span className="pnm-console-dialog__label">Your Review (Required)</span>
                                        <textarea
                                            value={newText}
                                            onChange={e => setNewText(e.target.value)}
                                            placeholder="Tell Other Players About Your Experience..."
                                            className="pnm-reviews__textarea"
                                            rows={4}
                                            disabled={submitting}
                                        />
                                    </label>
                                </div>

                                {submitError && <p className="pnm-console-dialog__error" role="alert">{submitError}</p>}
                            </div>
                        )}

                        {/* Sort: four lit toggles, the active one pressed */}
                        <div className="pnm-reviews__sort" role="group" aria-label="Sort Reviews">
                            {SORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    className="pnm-reviews__text-action pnm-reviews__sort-option"
                                    aria-pressed={sortBy === opt.key}
                                    onClick={() => setSortBy(opt.key)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Reviews list */}
                        <div className="pnm-reviews__list">
                            {loading && <p className="pnm-reviews__status" role="status">Loading Reviews...</p>}
                            {!loading && reviews.length === 0 && (
                                <p className="pnm-reviews__status">No Reviews Yet. Be The First!</p>
                            )}
                            {reviews.map((r, i) => (
                                <article key={r.id || i} className="pnm-reviews__review">
                                    <div className="pnm-reviews__review-head">
                                        {/* WIRING FIX: the API enriches each review with
                                            profile.avatar_url; it was ignored in favour of a letter
                                            monogram for everyone. */}
                                        {r.profile?.avatar_url ? (
                                            <img src={r.profile.avatar_url} alt="" className="pnm-reviews__avatar" loading="lazy" />
                                        ) : (
                                            <span className="pnm-reviews__avatar pnm-reviews__avatar--initial" aria-hidden="true">
                                                {(r.reviewer_name || '?')[0].toUpperCase()}
                                            </span>
                                        )}
                                        <div className="pnm-reviews__reviewer">
                                            <span className="pnm-reviews__reviewer-name">
                                                {r.reviewer_name}
                                                {/* WIRING FIX: the canonical field is the top-level
                                                    boolean is_verified_player — what the GET selects,
                                                    what verified_count counts and what the `verified`
                                                    sort filters on. metadata.verified_player is only a
                                                    best-effort copy written on NEW inserts, so imported
                                                    and older rows never showed the badge. */}
                                                {(r.is_verified_player ?? r.metadata?.verified_player) && (
                                                    <span className="pnm-reviews__verified" title="Verified Player - Has Played At This Venue">Verified Player</span>
                                                )}
                                            </span>
                                            <span className="pnm-reviews__date">{timeAgo(r.created_at)}</span>
                                        </div>
                                        <StarRating rating={r.rating} label="Rating" />
                                    </div>
                                    <p className="pnm-reviews__text">{r.review_text}</p>
                                    {/* STUB FIX: the review photo strip that used to render here was dead
                                        code — venue_reviews has no photos column, /api/poker/reviews never
                                        selects or stores one (the upload picker was already removed from the
                                        submit path above), so `r.photos` was always undefined. Removed along
                                        with the orphaned .vr-photo-* / .vr-review-photo* style rules. */}
                                    <div className="pnm-reviews__review-actions">
                                        <button
                                            type="button"
                                            className="pnm-reviews__text-action"
                                            aria-pressed={!!r.voted_helpful}
                                            onClick={() => !r.voted_helpful && voteReview(r.id, 'helpful')}
                                        >
                                            Helpful {r.helpful_count > 0 ? `(${r.helpful_count})` : ''}
                                        </button>
                                        <button
                                            type="button"
                                            className="pnm-reviews__text-action pnm-reviews__text-action--quiet"
                                            aria-pressed={!!r.voted_unhelpful}
                                            onClick={() => !r.voted_unhelpful && voteReview(r.id, 'unhelpful')}
                                        >
                                            Not Helpful {r.unhelpful_count > 0 ? `(${r.unhelpful_count})` : ''}
                                        </button>
                                    </div>
                                </article>
                            ))}
                            {/* GAP FIX: there was no pagination at all, so reviews past the first
                                page were unreachable while the header advertised the full total. */}
                            {!loading && hasMore && (
                                <button type="button" className="pnm-reviews__text-action pnm-reviews__load-more" onClick={loadMoreReviews} disabled={loadingMore}>
                                    {loadingMore ? 'Loading...' : 'Load More Reviews'}
                                </button>
                            )}
                        </div>
                    </div>
                </PokerNearMeConsole>
                <button
                    type="button"
                    className="pnm-console-dialog__close"
                    onClick={onClose}
                    aria-label="Close Reviews"
                >
                    Close
                </button>
            </section>
        </div>
    );
}
