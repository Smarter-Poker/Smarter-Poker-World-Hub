import React from 'react';
import { getAccessToken } from '../../../lib/authUtils';

export default function CancelVipModal({
    showCancelModal, setShowCancelModal,
    cancelStep, setCancelStep,
    cancelReason, setCancelReason,
    cancelOtherText, setCancelOtherText,
    cancelLoading, setCancelLoading,
    cancelFeedback, setCancelFeedback,
    user
}) {
    return (
        <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowCancelModal(false); setCancelFeedback(null); } }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowCancelModal(false); setCancelFeedback(null); } }}
                    tabIndex={-1}
                    style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.85)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                }}>
                    <div style={{
                        background: '#1c2333',
                        borderRadius: 16,
                        width: '100%',
                        maxWidth: 480,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                        overflow: 'hidden',
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>
                                {cancelStep === 'reason' && 'Cancel VIP Membership'}
                                {cancelStep === 'offer' && 'Wait — Special Offer!'}
                                {cancelStep === 'confirmed' && 'Membership Cancelled'}
                                {cancelStep === 'retained' && 'Welcome Back!'}
                            </h3>
                            <button
                                onClick={() => { setShowCancelModal(false); setCancelFeedback(null); }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.5)',
                                    fontSize: 24,
                                    cursor: 'pointer',
                                    padding: 0,
                                    lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div style={{ padding: '24px' }}>
                            {/* Step 1: Reason Survey */}
                            {cancelStep === 'reason' && (
                                <>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 20 }}>
                                        We Are Sorry To See You Go. Please Let Us Know Why You Are Cancelling So We Can Improve.
                                    </p>
                                    {[
                                        { id: 'too_expensive', label: 'Too Expensive' },
                                        { id: 'not_using', label: 'Not Using Enough' },
                                        { id: 'found_alternative', label: 'Found An Alternative' },
                                        { id: 'missing_features', label: 'Missing Features I Need' },
                                        { id: 'technical_issues', label: 'Technical Issues' },
                                        { id: 'other', label: 'Other' },
                                    ].map(reason => (
                                        <button
                                            key={reason.id}
                                            onClick={() => setCancelReason(reason.id)}
                                            style={{
                                                width: '100%',
                                                padding: '14px 16px',
                                                marginBottom: 8,
                                                background: cancelReason === reason.id
                                                    ? 'rgba(24, 119, 242, 0.15)'
                                                    : 'rgba(255, 255, 255, 0.05)',
                                                border: cancelReason === reason.id
                                                    ? '1px solid rgba(24, 119, 242, 0.4)'
                                                    : '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: 10,
                                                color: cancelReason === reason.id ? '#1877F2' : '#fff',
                                                fontSize: 14,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {reason.label}
                                        </button>
                                    ))}

                                    {cancelReason === 'other' && (
                                        <textarea
                                            value={cancelOtherText}
                                            onChange={(e) => setCancelOtherText(e.target.value)}
                                            placeholder="Tell Us More..."
                                            style={{
                                                width: '100%',
                                                padding: '12px 16px',
                                                marginTop: 4,
                                                marginBottom: 8,
                                                background: 'rgba(0, 0, 0, 0.3)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                borderRadius: 10,
                                                color: '#fff',
                                                fontSize: 14,
                                                minHeight: 80,
                                                resize: 'vertical',
                                                outline: 'none',
                                                fontFamily: 'Inter, sans-serif',
                                            }}
                                        />
                                    )}

                                    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                                        <button
                                            onClick={() => { setShowCancelModal(false); setCancelFeedback(null); }}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'rgba(255, 255, 255, 0.08)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                borderRadius: 20,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Keep Membership
                                        </button>
                                        <button
                                            onClick={() => cancelReason && setCancelStep('offer')}
                                            disabled={!cancelReason}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: cancelReason ? '#1877F2' : 'rgba(24, 119, 242, 0.3)',
                                                border: 'none',
                                                borderRadius: 20,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: cancelReason ? 'pointer' : 'not-allowed',
                                                opacity: cancelReason ? 1 : 0.5,
                                            }}
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Step 2: Retention Offer */}
                            {cancelStep === 'offer' && (
                                <>
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '20px 0',
                                    }}>
                                        <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                                        <h4 style={{ color: '#1877F2', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                                            50% Off For 3 Months!
                                        </h4>
                                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
                                            Before You Go, We Would Love To Offer You <strong style={{ color: '#1877F2' }}>50% Off Your VIP Membership</strong> For The Next 3 Months. Keep All Your Premium Benefits At Half The Price.
                                        </p>

                                        <div style={{
                                            background: 'rgba(24, 119, 242, 0.08)',
                                            border: '1px solid rgba(24, 119, 242, 0.25)',
                                            borderRadius: 12,
                                            padding: '16px 20px',
                                            marginBottom: 24,
                                        }}>
                                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 }}>Your New Price</div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                                <span style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'line-through', fontSize: 18 }}>$19.99/mo</span>
                                                <span style={{ color: '#1877F2', fontSize: 28, fontWeight: 700, fontFamily: 'Rajdhani, sans-serif' }}>$9.99/mo</span>
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>For 3 Months, Then Regular Price Resumes</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <button
                                            onClick={() => {
                                                // Accept the retention offer
                                                // Note: actual Stripe coupon application would be done here
                                                setCancelStep('retained');
                                            }}
                                            disabled={cancelLoading}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                                border: 'none',
                                                borderRadius: 20,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 20px rgba(24, 119, 242, 0.3)',
                                            }}
                                        >
                                            Claim 50% Off
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setCancelLoading(true);
                                                try {
                                                    const cancelRes = await fetch('/api/store/cancel-vip', {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            'Authorization': `Bearer ${getAccessToken()}`
                                                        },
                                                        body: JSON.stringify({
                                                            userId: user?.id,
                                                            reason: cancelReason,
                                                            reasonText: cancelReason === 'other' ? cancelOtherText : '',
                                                        }),
                                                    });
                                                    if (cancelRes.ok) {
                                                        setCancelStep('confirmed');
                                                    } else {
                                                        const errData = await cancelRes.json().catch(() => ({}));
                                                        setCancelFeedback({ type: 'error', message: errData.error || 'Failed To Cancel Membership. Please Try Again.' });
                                                    }
                                                } catch (err) {
                                                    console.warn('Cancel VIP error:', err);
                                                    setCancelFeedback({ type: 'error', message: 'Something Went Wrong. Please Try Again.' });
                                                } finally {
                                                    setCancelLoading(false);
                                                }
                                            }}
                                            disabled={cancelLoading}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'rgba(24, 119, 242, 0.1)',
                                                border: '1px solid rgba(24, 119, 242, 0.25)',
                                                borderRadius: 20,
                                                color: '#1877F2',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: cancelLoading ? 'wait' : 'pointer',
                                                opacity: cancelLoading ? 0.6 : 1,
                                            }}
                                        >
                                            {cancelLoading ? 'Cancelling...' : 'Cancel Anyway'}
                                        </button>
                                    </div>

                                    {/* Phase 2: VIP cancel inline feedback */}
                                    {cancelFeedback && (
                                        <div style={{ padding: '8px 12px', marginTop: 12, background: cancelFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${cancelFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: cancelFeedback.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                            {cancelFeedback.message}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Step 3a: Cancellation Confirmed */}
                            {cancelStep === 'confirmed' && (
                                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                                    <h4 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                                        Your Membership Has Been Cancelled
                                    </h4>
                                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                                        Your VIP Benefits Will Remain Active Until The End Of Your Current Billing Period.
                                    </p>
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 24 }}>
                                        You Can Re-Subscribe Anytime From The Diamond Store.
                                    </p>
                                    <button
                                        onClick={() => { setShowCancelModal(false); setCancelFeedback(null); }}
                                        style={{
                                            padding: '14px 40px',
                                            background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                            border: 'none',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Done
                                    </button>
                                </div>
                            )}

                            {/* Step 3b: Retention Success */}
                            {cancelStep === 'retained' && (
                                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                                    <h4 style={{ color: '#1877F2', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                                        Discount Applied!
                                    </h4>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                                        Your VIP Membership Is Now <strong style={{ color: '#1877F2' }}>$9.99/Month</strong> For The Next 3 Months.
                                    </p>
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 24 }}>
                                        Thank You For Staying With Us! Enjoy Your Premium Benefits.
                                    </p>
                                    <button
                                        onClick={() => { setShowCancelModal(false); setCancelFeedback(null); }}
                                        style={{
                                            padding: '14px 40px',
                                            background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                            border: 'none',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 20px rgba(24, 119, 242, 0.3)',
                                        }}
                                    >
                                        Awesome!
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
    );
}
