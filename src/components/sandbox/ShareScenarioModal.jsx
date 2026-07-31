/**
 * SHARE SCENARIO MODAL (W6-2)
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates a public link to the current sandbox state.
 *
 * Mobile: the native share sheet is the primary action (clipboard access is
 * undefined on insecure origins and inside several in-app webviews), copy is
 * the secondary path, and a QR code covers "show it to the person next to me".
 * Failures are mapped to human copy instead of raw fetch error text.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link2, Copy, Check, Share2, QrCode, Info } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, btn } from './paTokens';
import { BottomSheet, PAStyles, ErrorState, Skeleton } from './paKit';

export default function ShareScenarioModal({ onClose, sandboxState }) {
    const [loading, setLoading] = useState(false);
    const [shareUrl, setShareUrl] = useState(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);
    const [qrUrl, setQrUrl] = useState(null);
    const [qrState, setQrState] = useState('idle'); // idle | loading | ready | unavailable
    const copyTimer = useRef(null);

    useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

    const generateLink = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch('/api/sandbox/create-share', {
                method: 'POST',
                headers,
                body: JSON.stringify({ state_json: sandboxState }),
            });
            const json = await res.json().catch(() => null);

            if (res.status === 401) {
                setError('Sign in to create a share link.');
                return;
            }
            if (res.ok && json?.success && json.shareId) {
                const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker';
                setShareUrl(`${origin}/sandbox/${json.shareId}`);
                return;
            }
            setError('Could not create the link. Please try again.');
        } catch (err) {
            console.warn('[ShareScenarioModal] create error:', err?.message || err);
            setError('Could not create the link — check your connection.');
        } finally {
            setLoading(false);
        }
    }, [sandboxState]);

    const handleNativeShare = useCallback(async () => {
        if (!shareUrl) return;
        try {
            await navigator.share({ title: 'GTO Sandbox spot', text: 'Take a look at this spot', url: shareUrl });
        } catch (e) {
            if (e?.name !== 'AbortError') console.warn('[ShareScenarioModal] share failed:', e?.message || e);
        }
    }, [shareUrl]);

    const copyToClipboard = useCallback(async () => {
        if (!shareUrl) return;
        if (typeof navigator?.clipboard?.writeText !== 'function') {
            setError('Copying is blocked here — long-press the link above to copy it.');
            return;
        }
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            if (copyTimer.current) clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(false), 2000);
            try { navigator.vibrate?.(10); } catch (e) { /* noop */ }
        } catch (e) {
            console.warn('[ShareScenarioModal] copy failed:', e?.message || e);
            setError('Copying is blocked here — long-press the link above to copy it.');
        }
    }, [shareUrl]);

    const showQr = useCallback(async () => {
        if (!shareUrl) return;
        setQrState('loading');
        try {
            const mod = await import('qrcode');
            const QRCode = mod?.default || mod;
            const dataUrl = await QRCode.toDataURL(shareUrl, {
                width: 320, margin: 1,
                color: { dark: '#18191A', light: '#FFFFFF' },
            });
            setQrUrl(dataUrl);
            setQrState('ready');
        } catch (e) {
            console.warn('[ShareScenarioModal] QR unavailable:', e?.message || e);
            setQrState('unavailable');
        }
    }, [shareUrl]);

    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Share this spot"
            titleIcon={<Link2 size={18} strokeWidth={2} color={T.accent} />}
            subtitle="Anyone with the link can open this exact sandbox state."
            ariaLabel="Share scenario"
            footer={shareUrl ? (
                <button type="button" className="pa-btn" onClick={onClose} style={{ ...btn('secondary', { block: true }) }}>
                    Done
                </button>
            ) : (
                <button
                    type="button"
                    className="pa-btn"
                    onClick={generateLink}
                    disabled={loading}
                    style={{ ...btn('primary', { block: true, disabled: loading }) }}
                >
                    {loading ? 'Creating link…' : 'Create share link'}
                </button>
            )}
        >
            <PAStyles />

            <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
                {error && (
                    <ErrorState
                        title="Sharing failed"
                        body={error}
                        onRetry={shareUrl ? null : generateLink}
                    />
                )}

                {loading && !shareUrl && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }} aria-hidden="true">
                        <Skeleton h={48} />
                        <Skeleton h={44} w="60%" />
                    </div>
                )}

                {!shareUrl && !loading && (
                    <p style={{ fontSize: F.bodySm, color: T.textMuted, lineHeight: 1.45, margin: 0 }}>
                        The link captures the board, ranges, stacks and villain setup exactly as they are now.
                        Later edits at the table do not change it.
                    </p>
                )}

                {shareUrl && (
                    <>
                        <div
                            style={{
                                background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm,
                                padding: S.md, fontSize: F.bodySm, color: T.text, wordBreak: 'break-all', lineHeight: 1.45,
                            }}
                        >
                            {shareUrl}
                        </div>

                        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                            {canNativeShare && (
                                <button
                                    type="button"
                                    className="pa-btn"
                                    onClick={handleNativeShare}
                                    style={{ ...btn('primary'), flex: '1 1 140px' }}
                                >
                                    <Share2 size={18} strokeWidth={2} /> Share
                                </button>
                            )}
                            <button
                                type="button"
                                className="pa-btn"
                                onClick={copyToClipboard}
                                aria-label="Copy share link"
                                style={{ ...btn('secondary'), flex: '1 1 120px', minHeight: 48 }}
                            >
                                {copied ? <Check size={18} strokeWidth={2} color={T.success} /> : <Copy size={18} strokeWidth={2} />}
                                {copied ? 'Copied' : 'Copy link'}
                            </button>
                        </div>

                        {qrState !== 'ready' && (
                            <button
                                type="button"
                                className="pa-btn"
                                onClick={showQr}
                                disabled={qrState === 'loading' || qrState === 'unavailable'}
                                style={{ ...btn('secondary', { block: true, disabled: qrState === 'unavailable' }) }}
                            >
                                <QrCode size={18} strokeWidth={2} />
                                {qrState === 'loading' ? 'Building QR code…'
                                    : qrState === 'unavailable' ? 'QR code unavailable here'
                                        : 'Show QR code'}
                            </button>
                        )}

                        {qrState === 'ready' && qrUrl && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={qrUrl}
                                alt="QR code for the share link"
                                style={{
                                    width: 220, height: 220, alignSelf: 'center', borderRadius: R.sm,
                                    background: '#FFFFFF', padding: S.sm, boxSizing: 'border-box',
                                }}
                            />
                        )}

                        <div style={{ display: 'flex', gap: S.sm, alignItems: 'flex-start' }}>
                            <Info size={18} strokeWidth={2} color={T.textDim} style={{ flexShrink: 0, marginTop: 1 }} />
                            <p style={{ fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                                This link is public and cannot be revoked from here. Only share spots you are happy for
                                anyone to open.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </BottomSheet>
    );
}
