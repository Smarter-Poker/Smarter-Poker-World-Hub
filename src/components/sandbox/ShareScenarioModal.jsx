/**
 * SHARE SCENARIO MODAL (W6-2)
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates a public link to the current sandbox state.
 *
 * Mobile: the native share sheet is the primary action (clipboard access is
 * undefined on insecure origins and inside several in-app webviews), copy is
 * the secondary path, and a QR code covers "show it to the person next to me".
 * Failures are mapped to human copy instead of raw fetch error text.
 *
 * REVOKE. The create response carries `revocable`, which is true only when the
 * row was written with a creator_id (i.e. the caller was signed in). Guest
 * links have a null creator_id and genuinely cannot be taken back, so the
 * control is not rendered for them rather than rendered and failing.
 * Revoking sends DELETE /api/sandbox/create-share/<id> with the Bearer token —
 * the id travels in the path because DELETE bodies are dropped by some proxies
 * and the server reads the trailing path segment.
 *
 * The confirm step is inline, not window.confirm(): native dialogs are
 * suppressed in installed PWAs and several in-app webviews, which would turn a
 * destructive action into a no-op with no feedback.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link2, Copy, Check, Share2, QrCode, Info, Trash2, ShieldAlert } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, btn } from './paTokens';
import { BottomSheet, PAStyles, ErrorState, Skeleton } from './paKit';

// A revoke request that never settles would leave the sheet spinning forever
// (mobile radios drop requests silently). Abort and report instead.
const REVOKE_TIMEOUT_MS = 15000;

export default function ShareScenarioModal({ onClose, sandboxState }) {
    const [loading, setLoading] = useState(false);
    const [shareUrl, setShareUrl] = useState(null);
    const [shareId, setShareId] = useState(null);
    const [revocable, setRevocable] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);
    const [qrUrl, setQrUrl] = useState(null);
    const [qrState, setQrState] = useState('idle'); // idle | loading | ready | unavailable

    // idle -> confirm -> working. 'confirm' is also where a failed attempt
    // lands, so the Revoke button is still there to tap again.
    const [revokeStep, setRevokeStep] = useState('idle');
    // null (still live) | 'revoked' (we deleted it) | 'gone' (404 from server)
    const [revokeResult, setRevokeResult] = useState(null);
    const [revokeError, setRevokeError] = useState(null); // { body, retry }

    const copyTimer = useRef(null);
    const revokeTimer = useRef(null);
    const revokeAbort = useRef(null);
    const revokeTimedOut = useRef(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (copyTimer.current) { clearTimeout(copyTimer.current); copyTimer.current = null; }
            if (revokeTimer.current) { clearTimeout(revokeTimer.current); revokeTimer.current = null; }
            try { revokeAbort.current?.abort(); } catch (e) { /* already settled */ }
        };
    }, []);

    // Once the link is revoked (or was never ours) every outbound control is
    // dead weight — sharing a URL that 404s is worse than no button at all.
    const linkDead = revokeResult !== null;

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
                setShareId(json.shareId);
                // Only the server can know whether the row got a creator_id.
                // Anything other than an explicit true means "do not offer it".
                setRevocable(json.revocable === true);
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

    const revokeLink = useCallback(async () => {
        if (!shareId || linkDead) return;

        setRevokeError(null);
        setRevokeStep('working');
        revokeTimedOut.current = false;

        const token = getAccessToken();
        if (!token) {
            // No point round-tripping: the endpoint requires a Bearer token.
            setRevokeStep('confirm');
            setRevokeError({
                body: 'Your session has expired. Sign in again and reopen this sheet to revoke the link.',
                retry: false,
            });
            return;
        }

        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        revokeAbort.current = ctrl;
        if (revokeTimer.current) clearTimeout(revokeTimer.current);
        revokeTimer.current = setTimeout(() => {
            revokeTimedOut.current = true;
            try { ctrl?.abort(); } catch (e) { /* already settled */ }
        }, REVOKE_TIMEOUT_MS);

        try {
            const res = await fetch(`/api/sandbox/create-share/${encodeURIComponent(shareId)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
                ...(ctrl ? { signal: ctrl.signal } : null),
            });
            const json = await res.json().catch(() => null);
            if (!mounted.current) return;

            if (res.ok && json?.success) {
                setRevokeResult('revoked');
                setRevokeStep('idle');
                setQrUrl(null);
                setQrState('idle');
                try { navigator.vibrate?.(10); } catch (e) { /* unsupported */ }
                return;
            }
            if (res.status === 404) {
                // The endpoint answers 404 both for "no such link" and for
                // "not yours", on purpose. Say only what we actually know.
                setRevokeResult('gone');
                setRevokeStep('idle');
                setQrUrl(null);
                setQrState('idle');
                return;
            }
            if (res.status === 401) {
                setRevokeStep('confirm');
                setRevokeError({
                    body: 'Your session has expired. Sign in again and reopen this sheet to revoke the link.',
                    retry: false,
                });
                return;
            }
            if (res.status === 429) {
                setRevokeStep('confirm');
                setRevokeError({ body: 'Too many attempts. Wait a moment, then try again.', retry: true });
                return;
            }
            setRevokeStep('confirm');
            setRevokeError({ body: 'The link could not be revoked. It is still live — please try again.', retry: true });
        } catch (e) {
            if (!mounted.current) return;
            console.warn('[ShareScenarioModal] revoke error:', e?.message || e);
            setRevokeStep('confirm');
            setRevokeError({
                body: revokeTimedOut.current
                    ? 'That request timed out, so the link may still be live. Check your connection and try again.'
                    : 'Could not reach the server, so the link is still live. Check your connection and try again.',
                retry: true,
            });
        } finally {
            if (revokeTimer.current) { clearTimeout(revokeTimer.current); revokeTimer.current = null; }
            revokeAbort.current = null;
        }
    }, [shareId, linkDead]);

    const handleNativeShare = useCallback(async () => {
        if (!shareUrl || linkDead) return;
        try {
            await navigator.share({ title: 'GTO Sandbox spot', text: 'Take a look at this spot', url: shareUrl });
        } catch (e) {
            if (e?.name !== 'AbortError') console.warn('[ShareScenarioModal] share failed:', e?.message || e);
        }
    }, [shareUrl, linkDead]);

    const copyToClipboard = useCallback(async () => {
        if (!shareUrl || linkDead) return;
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
    }, [shareUrl, linkDead]);

    const showQr = useCallback(async () => {
        if (!shareUrl || linkDead) return;
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
    }, [shareUrl, linkDead]);

    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const revoking = revokeStep === 'working';

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
                                padding: S.md, fontSize: F.bodySm, color: linkDead ? T.textDim : T.text,
                                wordBreak: 'break-all', lineHeight: 1.45,
                                textDecoration: linkDead ? 'line-through' : 'none',
                            }}
                        >
                            {shareUrl}
                        </div>

                        {linkDead && (
                            <div
                                role="status"
                                style={{
                                    display: 'flex', gap: S.sm, alignItems: 'flex-start',
                                    background: revokeResult === 'revoked' ? T.successSoft : T.surface2,
                                    border: `1px solid ${revokeResult === 'revoked' ? 'rgba(34,197,94,0.4)' : T.border}`,
                                    borderRadius: R.sm, padding: S.md,
                                }}
                            >
                                {revokeResult === 'revoked'
                                    ? <Check size={18} strokeWidth={2} color={T.success} style={{ flexShrink: 0, marginTop: 1 }} />
                                    : <ShieldAlert size={18} strokeWidth={2} color={T.textMuted} style={{ flexShrink: 0, marginTop: 1 }} />}
                                <div style={{ minWidth: 0 }}>
                                    <p style={{
                                        fontSize: F.bodySm, fontWeight: 700, margin: `0 0 ${S.xs}px`,
                                        color: revokeResult === 'revoked' ? T.success : T.text,
                                    }}>
                                        {revokeResult === 'revoked' ? 'Link revoked' : 'Nothing to revoke'}
                                    </p>
                                    <p style={{ fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                                        {revokeResult === 'revoked'
                                            ? 'This link is dead. Anyone who opens it now sees a page saying the shared hand is no longer available. Create a new link if you want to share the spot again.'
                                            : 'This link is not on your account, so there was nothing here to take back. It may already have been revoked. Create a new link if you still want to share the spot.'}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                            {canNativeShare && (
                                <button
                                    type="button"
                                    className="pa-btn"
                                    onClick={handleNativeShare}
                                    disabled={linkDead}
                                    style={{ ...btn('primary', { disabled: linkDead }), flex: '1 1 140px' }}
                                >
                                    <Share2 size={18} strokeWidth={2} /> Share
                                </button>
                            )}
                            <button
                                type="button"
                                className="pa-btn"
                                onClick={copyToClipboard}
                                disabled={linkDead}
                                aria-label="Copy share link"
                                style={{ ...btn('secondary', { disabled: linkDead }), flex: '1 1 120px', minHeight: 48 }}
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
                                disabled={linkDead || qrState === 'loading' || qrState === 'unavailable'}
                                style={{ ...btn('secondary', { block: true, disabled: linkDead || qrState === 'unavailable' }) }}
                            >
                                <QrCode size={18} strokeWidth={2} />
                                {qrState === 'loading' ? 'Building QR code…'
                                    : qrState === 'unavailable' ? 'QR code unavailable here'
                                        : 'Show QR code'}
                            </button>
                        )}

                        {qrState === 'ready' && qrUrl && !linkDead && (
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

                        {revocable && !linkDead && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                                {revokeError && (
                                    <ErrorState
                                        title="Revoke failed"
                                        body={revokeError.body}
                                        onRetry={revokeError.retry && !revoking ? revokeLink : null}
                                        retryLabel="Try again"
                                    />
                                )}

                                {revokeStep === 'idle' ? (
                                    <button
                                        type="button"
                                        className="pa-btn"
                                        onClick={() => { setRevokeError(null); setRevokeStep('confirm'); }}
                                        style={{ ...btn('danger', { block: true }), minHeight: 48 }}
                                    >
                                        <Trash2 size={18} strokeWidth={2} />
                                        Revoke this link
                                    </button>
                                ) : (
                                    <div
                                        role="group"
                                        aria-label="Confirm revoking the share link"
                                        style={{
                                            display: 'flex', flexDirection: 'column', gap: S.md,
                                            background: T.dangerSoft, border: '1px solid rgba(239,68,68,0.4)',
                                            borderRadius: R.sm, padding: S.md,
                                        }}
                                    >
                                        <p style={{ fontSize: F.bodySm, color: T.text, margin: 0, lineHeight: 1.45 }}>
                                            Revoke this link? Anyone holding it loses access straight away, and it cannot
                                            be brought back.
                                        </p>
                                        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="pa-btn"
                                                onClick={revokeLink}
                                                disabled={revoking}
                                                style={{ ...btn('danger', { disabled: revoking }), flex: '1 1 130px', minHeight: 48 }}
                                            >
                                                {!revoking && <Trash2 size={18} strokeWidth={2} />}
                                                {revoking ? 'Revoking…' : 'Revoke'}
                                            </button>
                                            <button
                                                type="button"
                                                className="pa-btn"
                                                onClick={() => { setRevokeStep('idle'); setRevokeError(null); }}
                                                disabled={revoking}
                                                style={{ ...btn('secondary', { disabled: revoking }), flex: '1 1 130px', minHeight: 48 }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!linkDead && (
                            <div style={{ display: 'flex', gap: S.sm, alignItems: 'flex-start' }}>
                                <Info size={18} strokeWidth={2} color={T.textDim} style={{ flexShrink: 0, marginTop: 1 }} />
                                <p style={{ fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                                    {revocable
                                        ? 'This link is public — anyone who has it can open the spot until you revoke it here.'
                                        : 'This link was created while you were signed out, so it is public and cannot be revoked from here. Only share spots you are happy for anyone to open.'}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </BottomSheet>
    );
}
