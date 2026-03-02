/* ═══════════════════════════════════════════════════════════════════════════
   PHONE VERIFICATION VIP MODAL
   Shows after new signup to collect + verify phone number
   Grants 90-day free VIP card on successful verification
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';

export default function PhoneVerifyVIPModal({ userId, onClose, onVerified }) {
    const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'success'
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(0);
    const otpRefs = useRef([]);

    // Countdown timer for resend
    useEffect(() => {
        if (countdown <= 0) return;
        const t = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [countdown]);

    // Format phone as user types: (555) 123-4567
    const formatPhone = (val) => {
        const digits = val.replace(/\D/g, '').slice(0, 10);
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    };

    const handlePhoneChange = (e) => {
        setPhone(formatPhone(e.target.value));
        setError('');
    };

    const rawPhone = phone.replace(/\D/g, '');

    // ── Send OTP ─────────────────────────────────────────────────────────
    const handleSendOtp = async () => {
        if (rawPhone.length !== 10) {
            setError('Please Enter A Valid 10-Digit Phone Number');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/sms/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: rawPhone }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed To Send Code');
            setStep('otp');
            setCountdown(60);
            setTimeout(() => otpRefs.current[0]?.focus(), 100);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── OTP digit handling ───────────────────────────────────────────────
    const handleOtpChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value.slice(-1);
        setOtp(newOtp);
        setError('');
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            setOtp(pasted.split(''));
            otpRefs.current[5]?.focus();
        }
    };

    // ── Verify OTP ───────────────────────────────────────────────────────
    const handleVerify = async () => {
        const code = otp.join('');
        if (code.length !== 6) {
            setError('Please Enter The Full 6-Digit Code');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/sms/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: rawPhone, code, userId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Verification Failed');
            setStep('success');
            setTimeout(() => {
                onVerified?.();
                onClose?.();
            }, 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Auto-verify when all 6 digits entered
    useEffect(() => {
        if (otp.every(d => d) && step === 'otp') {
            handleVerify();
        }
    }, [otp]);

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
        }}>
            <div style={{
                background: 'linear-gradient(145deg, #1a1c2e 0%, #0d0f1e 100%)',
                border: '2px solid rgba(255, 215, 0, 0.3)',
                borderRadius: '16px',
                padding: '32px 24px',
                maxWidth: '380px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 0 60px rgba(255, 215, 0, 0.15), 0 4px 30px rgba(0, 0, 0, 0.5)',
                position: 'relative',
            }}>
                {/* ── VIP Badge ─────────────────────────────────────────── */}
                <div style={{
                    width: 72, height: 72,
                    margin: '0 auto 16px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 30px rgba(255, 215, 0, 0.4)',
                    fontSize: '32px',
                }}>
                    {step === 'success' ? '🎉' : '👑'}
                </div>

                {/* ── STEP: Phone Input ─────────────────────────────────── */}
                {step === 'phone' && (
                    <>
                        <h2 style={{
                            fontFamily: 'Inter, -apple-system, sans-serif',
                            fontSize: '22px',
                            fontWeight: 700,
                            color: '#FFD700',
                            margin: '0 0 8px',
                        }}>
                            Verify Your Phone Number
                        </h2>
                        <p style={{
                            fontSize: '15px',
                            color: '#B0B3B8',
                            margin: '0 0 6px',
                            lineHeight: '1.4',
                        }}>
                            Get <span style={{ color: '#FFD700', fontWeight: 700 }}>VIP Card Privileges</span>
                        </p>
                        <p style={{
                            fontSize: '20px',
                            color: '#00D4FF',
                            fontWeight: 700,
                            margin: '0 0 24px',
                        }}>
                            FREE For 90 Days! 🔥
                        </p>

                        <div style={{ position: 'relative', marginBottom: '16px' }}>
                            <span style={{
                                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                                color: '#8A8D91', fontSize: '16px', pointerEvents: 'none',
                            }}>🇺🇸 +1</span>
                            <input
                                type="tel"
                                value={phone}
                                onChange={handlePhoneChange}
                                placeholder="(555) 123-4567"
                                style={{
                                    width: '100%',
                                    padding: '14px 14px 14px 68px',
                                    borderRadius: '10px',
                                    border: '2px solid #3A3B3C',
                                    background: '#242526',
                                    color: '#E4E6EB',
                                    fontSize: '18px',
                                    fontFamily: 'Inter, -apple-system, sans-serif',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#FFD700'}
                                onBlur={(e) => e.target.style.borderColor = '#3A3B3C'}
                            />
                        </div>

                        {error && (
                            <p style={{ color: '#ff4d4d', fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
                        )}

                        <button
                            onClick={handleSendOtp}
                            disabled={loading || rawPhone.length !== 10}
                            style={{
                                width: '100%',
                                padding: '14px',
                                borderRadius: '10px',
                                border: 'none',
                                background: rawPhone.length === 10
                                    ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'
                                    : '#3A3B3C',
                                color: rawPhone.length === 10 ? '#000' : '#666',
                                fontSize: '16px',
                                fontWeight: 700,
                                cursor: rawPhone.length === 10 ? 'pointer' : 'not-allowed',
                                opacity: loading ? 0.7 : 1,
                                marginBottom: '12px',
                            }}
                        >
                            {loading ? 'Sending...' : 'Send Verification Code'}
                        </button>

                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#666',
                                fontSize: '13px',
                                cursor: 'pointer',
                                padding: '8px',
                            }}
                        >
                            Maybe Later
                        </button>
                    </>
                )}

                {/* ── STEP: OTP Input ──────────────────────────────────── */}
                {step === 'otp' && (
                    <>
                        <h2 style={{
                            fontFamily: 'Inter, -apple-system, sans-serif',
                            fontSize: '20px',
                            fontWeight: 700,
                            color: '#E4E6EB',
                            margin: '0 0 8px',
                        }}>
                            Enter Verification Code
                        </h2>
                        <p style={{
                            fontSize: '14px',
                            color: '#B0B3B8',
                            margin: '0 0 20px',
                        }}>
                            Sent To <span style={{ color: '#00D4FF', fontWeight: 600 }}>+1 {phone}</span>
                        </p>

                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            justifyContent: 'center',
                            marginBottom: '16px',
                        }}>
                            {otp.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => otpRefs.current[i] = el}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                                    value={digit}
                                    onChange={(e) => handleOtpChange(i, e.target.value)}
                                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                    onPaste={i === 0 ? handleOtpPaste : undefined}
                                    maxLength={1}
                                    style={{
                                        width: '44px',
                                        height: '52px',
                                        textAlign: 'center',
                                        fontSize: '22px',
                                        fontWeight: 700,
                                        color: '#E4E6EB',
                                        background: '#242526',
                                        border: `2px solid ${digit ? '#FFD700' : '#3A3B3C'}`,
                                        borderRadius: '10px',
                                        outline: 'none',
                                        fontFamily: 'Inter, monospace',
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#FFD700'}
                                    onBlur={(e) => {
                                        if (!digit) e.target.style.borderColor = '#3A3B3C';
                                    }}
                                />
                            ))}
                        </div>

                        {error && (
                            <p style={{ color: '#ff4d4d', fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
                        )}

                        <button
                            onClick={handleVerify}
                            disabled={loading || otp.some(d => !d)}
                            style={{
                                width: '100%',
                                padding: '14px',
                                borderRadius: '10px',
                                border: 'none',
                                background: otp.every(d => d)
                                    ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'
                                    : '#3A3B3C',
                                color: otp.every(d => d) ? '#000' : '#666',
                                fontSize: '16px',
                                fontWeight: 700,
                                cursor: otp.every(d => d) ? 'pointer' : 'not-allowed',
                                opacity: loading ? 0.7 : 1,
                                marginBottom: '12px',
                            }}
                        >
                            {loading ? 'Verifying...' : 'Verify & Activate VIP'}
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                                onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setError(''); }}
                                style={{
                                    background: 'none', border: 'none',
                                    color: '#00D4FF', fontSize: '13px', cursor: 'pointer',
                                }}
                            >
                                ← Change Number
                            </button>
                            <button
                                onClick={handleSendOtp}
                                disabled={countdown > 0 || loading}
                                style={{
                                    background: 'none', border: 'none',
                                    color: countdown > 0 ? '#666' : '#00D4FF',
                                    fontSize: '13px', cursor: countdown > 0 ? 'default' : 'pointer',
                                }}
                            >
                                {countdown > 0 ? `Resend In ${countdown}s` : 'Resend Code'}
                            </button>
                        </div>
                    </>
                )}

                {/* ── STEP: Success ────────────────────────────────────── */}
                {step === 'success' && (
                    <>
                        <h2 style={{
                            fontFamily: 'Inter, -apple-system, sans-serif',
                            fontSize: '24px',
                            fontWeight: 700,
                            color: '#FFD700',
                            margin: '0 0 8px',
                        }}>
                            VIP Activated! 🎉
                        </h2>
                        <p style={{
                            fontSize: '16px',
                            color: '#B0B3B8',
                            margin: '0 0 8px',
                            lineHeight: '1.5',
                        }}>
                            Your Phone Is Verified And Your
                        </p>
                        <p style={{
                            fontSize: '20px',
                            color: '#00D4FF',
                            fontWeight: 700,
                            margin: '0 0 16px',
                        }}>
                            90-Day FREE VIP Card Is Active!
                        </p>
                        <div style={{
                            background: 'rgba(255, 215, 0, 0.1)',
                            border: '1px solid rgba(255, 215, 0, 0.3)',
                            borderRadius: '10px',
                            padding: '12px',
                            marginBottom: '16px',
                        }}>
                            <p style={{ color: '#FFD700', fontSize: '14px', margin: 0 }}>
                                ✅ Phone Verified &nbsp;•&nbsp; 👑 VIP Status Active
                            </p>
                        </div>
                        <p style={{ color: '#666', fontSize: '12px', margin: 0 }}>
                            Redirecting...
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
