/**
 * VenueReviews — Inline Review/Rating Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Renders star ratings, review count summary, and user-submitted reviews
 * for a given venue. Uses /api/poker/reviews CRUD endpoint.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import useVIPGate from '../../hooks/useVIPGate';
import VIPGateModal from '../ui/VIPGateModal';

const T = {
    bg: '#0a0a0a',
    card: '#18191a',
    border: '#3E4042',
    text: '#E4E6EB',
    textSec: '#B0B3B8',
    star: '#FFD700',
    accent: '#4facfe',
};

function getAccessToken() {
    if (typeof window === 'undefined') return null;
    try {
        const auth = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        return auth?.access_token || null;
    } catch { return null; }
}

function StarRating({ rating, onRate, interactive = false, size = 20 }) {
    const [hovered, setHovered] = useState(0);
    return (
        <div style={{ display: 'flex', gap: 2, cursor: interactive ? 'pointer' : 'default' }}>
            {[1, 2, 3, 4, 5].map(star => {
                const active = interactive ? (hovered || rating) >= star : rating >= star;
                const halfActive = !active && rating >= star - 0.5;
                return (
                    <span
                        key={star}
                        onClick={() => interactive && onRate?.(star)}
                        onMouseEnter={() => interactive && setHovered(star)}
                        onMouseLeave={() => interactive && setHovered(0)}
                        style={{
                            fontSize: size,
                            color: active ? T.star : halfActive ? T.star : 'rgba(255,255,255,0.15)',
                            opacity: halfActive ? 0.6 : 1,
                            transition: 'color 0.15s, transform 0.15s',
                            transform: interactive && hovered === star ? 'scale(1.15)' : 'scale(1)',
                        }}
                    >
                        ★
                    </span>
                );
            })}
        </div>
    );
}

function timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

export default function VenueReviews({ venueId, venueName }) {
    const { user } = useAvatar();
    const [reviews, setReviews] = useState([]);
    const [summary, setSummary] = useState({ averageRating: 0, totalReviews: 0 });
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newRating, setNewRating] = useState(0);
    const [newTitle, setNewTitle] = useState('');
    const [newBody, setNewBody] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const formRef = useRef(null);

    const { allowed, loading: gateLoading, featureConfig, showUpgradeModal, upgradeModalVisible, hideUpgradeModal } = useVIPGate('poker-near-me');

    const fetchReviews = useCallback(async () => {
        if (!venueId) return;
        try {
            const res = await fetch(`/api/poker/reviews?venueId=${venueId}&limit=10`);
            if (res.ok) {
                const data = await res.json();
                setReviews(data.reviews || []);
                setSummary(data.summary || { averageRating: 0, totalReviews: 0 });
            }
        } catch (err) {
            console.error('[VenueReviews] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [venueId]);

    useEffect(() => { fetchReviews(); }, [fetchReviews]);

    const submitReview = async (e) => {
        e.preventDefault();
        if (newRating === 0) { setError('Please select a star rating'); return; }
        if (!newTitle.trim()) { setError('Please enter a title'); return; }
        setSubmitting(true);
        setError('');

        try {
            const token = getAccessToken();
            const res = await fetch('/api/poker/reviews', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    venueId,
                    rating: newRating,
                    title: newTitle.trim(),
                    body: newBody.trim(),
                }),
            });
            if (res.ok) {
                setNewRating(0); setNewTitle(''); setNewBody('');
                setShowForm(false);
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

    if (loading) {
        return (
            <div style={{ padding: '16px 0', color: T.textSec, fontSize: 13 }}>
                Loading reviews...
            </div>
        );
    }

    return (
        <div style={{ marginTop: 16 }}>
            {/* Summary Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StarRating rating={summary.averageRating} size={18} />
                    <span style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>
                        {summary.averageRating?.toFixed(1) || '0.0'}
                    </span>
                    <span style={{ color: T.textSec, fontSize: 13 }}>
                        ({summary.totalReviews} {summary.totalReviews === 1 ? 'review' : 'reviews'})
                    </span>
                </div>
                {user && (
                    <button
                        onClick={() => setShowForm(!showForm)}
                        style={{
                            background: showForm ? 'rgba(255,255,255,0.05)' : 'rgba(79,172,254,0.1)',
                            border: `1px solid ${showForm ? T.border : T.accent + '44'}`,
                            borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                            color: showForm ? T.textSec : T.accent, fontSize: 12, fontWeight: 700,
                        }}
                    >
                        {showForm ? 'Cancel' : 'Write Review'}
                    </button>
                )}
            </div>

            {/* Gated Review list and form */}
            {!allowed ? (
                <div style={{ position: 'relative', marginTop: 16, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ filter: 'blur(8px)', opacity: 0.5, pointerEvents: 'none' }}>
                        {/* Fake Skeleton Data */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${T.border}`, padding: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #4facfe, #00f2fe)' }} />
                                    <div style={{ width: 100, height: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }} />
                                </div>
                                <div style={{ width: '80%', height: 14, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 8 }} />
                                <div style={{ width: '90%', height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 4 }} />
                                <div style={{ width: '60%', height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${T.border}`, padding: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #4facfe, #00f2fe)' }} />
                                    <div style={{ width: 120, height: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }} />
                                </div>
                                <div style={{ width: '70%', height: 14, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 8 }} />
                                <div style={{ width: '85%', height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
                            </div>
                        </div>
                    </div>
                    
                    {/* Lock Overlay */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.4)', borderRadius: 10, zIndex: 10, padding: 16, textAlign: 'center'
                    }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Player Reviews</div>
                        <div style={{ fontSize: 12, color: T.textSec, marginBottom: 12 }}>Unlock to read and write venue reviews</div>
                        <button
                            onClick={showUpgradeModal}
                            style={{
                                padding: '6px 14px', borderRadius: 8, background: 'rgba(255,215,0,0.1)',
                                border: `1px solid ${T.star}44`, color: T.star, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            Unlock Feature
                        </button>
                        <VIPGateModal 
                            visible={upgradeModalVisible} 
                            onClose={hideUpgradeModal} 
                            featureName="Player Reviews"
                            featureConfig={featureConfig}
                        />
                    </div>
                </div>
            ) : (
                <>
                    {/* Review Form */}
                    {showForm && (
                        <form
                            ref={formRef}
                            onSubmit={submitReview}
                            style={{
                                background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                                border: `1px solid ${T.border}`, padding: 16, marginBottom: 16,
                            }}
                        >
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, color: T.textSec, marginBottom: 6, fontWeight: 600 }}>Rating</div>
                                <StarRating rating={newRating} onRate={setNewRating} interactive size={28} />
                            </div>
                            <input
                                type="text"
                                placeholder="Review Title"
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                maxLength={100}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: 8,
                                    background: 'rgba(0,0,0,0.3)', border: `1px solid ${T.border}`,
                                    color: T.text, fontSize: 14, marginBottom: 8, outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                            <textarea
                                placeholder="Tell other players about your experience (optional)"
                                value={newBody}
                                onChange={e => setNewBody(e.target.value)}
                                maxLength={1000}
                                rows={4}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: 8,
                                    background: 'rgba(0,0,0,0.3)', border: `1px solid ${T.border}`,
                                    color: T.text, fontSize: 13, resize: 'vertical', outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                            {error && <div style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{error}</div>}
                            <button
                                type="submit"
                                disabled={submitting}
                                style={{
                                    marginTop: 10, padding: '10px 24px', borderRadius: 10,
                                    background: submitting ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #4facfe, #00f2fe)',
                                    border: 'none', color: '#000', fontWeight: 800, fontSize: 14,
                                    cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.5 : 1,
                                }}
                            >
                                {submitting ? 'Submitting...' : 'Submit Review'}
                            </button>
                        </form>
                    )}

            {/* Review List */}
            {reviews.length === 0 ? (
                <div style={{
                    padding: 20, textAlign: 'center', color: T.textSec, fontSize: 13,
                    background: 'rgba(255,255,255,0.02)', borderRadius: 10,
                    border: `1px solid ${T.border}`,
                }}>
                    No reviews yet. Be the first to review {venueName || 'this venue'}!
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {reviews.map(review => (
                        <div
                            key={review.id}
                            style={{
                                background: 'rgba(255,255,255,0.02)', borderRadius: 10,
                                border: `1px solid ${T.border}`, padding: 14,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                {/* Avatar */}
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                                    overflow: 'hidden', flexShrink: 0,
                                }}>
                                    {review.profiles?.avatar_url ? (
                                        <img src={review.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{
                                            width: '100%', height: '100%', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            fontSize: 12, fontWeight: 800, color: '#000',
                                        }}>
                                            {(review.profiles?.username || 'A').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ color: T.text, fontSize: 13, fontWeight: 700 }}>
                                            {review.profiles?.username || 'Anonymous'}
                                        </span>
                                        <span style={{ color: T.textSec, fontSize: 11 }}>
                                            {timeAgo(review.created_at)}
                                        </span>
                                    </div>
                                    <StarRating rating={review.rating} size={12} />
                                </div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>
                                {review.title}
                            </div>
                            {review.body && (
                                <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5 }}>
                                    {review.body}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
                </>
            )}
        </div>
    );
}
