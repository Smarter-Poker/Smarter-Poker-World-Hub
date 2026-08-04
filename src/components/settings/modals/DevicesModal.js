/* ═══════════════════════════════════════════════════════════════════════════
   CONNECTED DEVICES MODAL
   ═══════════════════════════════════════════════════════════════════════════

   Two different things live in this modal, and they are deliberately kept
   apart because they are backed by different (and unequal) data:

   1. SIGNED-IN DEVICES — real rows from `user_sessions`, loaded by the parent
      through GET /api/auth/sessions/list and revoked through
      POST /api/auth/sessions/revoke. That endpoint is honest that it only
      removes the row: Supabase does not expose per-device token revocation,
      so the other device stays signed in until its token expires. We repeat
      that wording here rather than promising a revoke we cannot deliver.

   2. TWO-FACTOR TRUSTED DEVICES — the 30-day `mfa_trusted_device` cookie is a
      signed, stateless HttpOnly cookie held BY each browser. Nothing is
      written server-side, so there is no list to render and no per-device
      revoke. Rather than invent rows, we say exactly that, and tell the user
      what does work today. See the agent notes for the endpoint + table that
      would make this section real.

   Defensive throughout: `connectedDevices` may arrive as undefined or as a
   non-array while the API shape is in flux; nothing here indexes into it
   without checking first.
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { getAccessToken } from '../../../lib/authUtils';

const noop = () => {};

async function readJson(res) {
    try {
        const parsed = await res.json();
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
        return {};
    }
}

export default function DevicesModal({
    showDevicesModal, setShowDevicesModal, connectedDevices, setConnectedDevices, devicesLoading, setDevicesLoading, revokeDeviceTarget, setRevokeDeviceTarget, user, setMfaFeedback, mfaFeedback
}) {
    const closeModal = typeof setShowDevicesModal === 'function' ? setShowDevicesModal : noop;
    const setTarget = typeof setRevokeDeviceTarget === 'function' ? setRevokeDeviceTarget : noop;
    const setDevices = typeof setConnectedDevices === 'function' ? setConnectedDevices : noop;
    const pushFeedback = typeof setMfaFeedback === 'function' ? setMfaFeedback : noop;

    const [feedback, setFeedback] = useState(null); // { type, message }
    const [revoking, setRevoking] = useState(false);

    /* The parent may hand us undefined, null, or (mid-refactor) an object. */
    const devices = Array.isArray(connectedDevices) ? connectedDevices : [];

    const say = (type, message) => {
        const payload = message ? { type, message } : null;
        setFeedback(payload);
        pushFeedback(payload);
    };

    const close = () => { setTarget(null); closeModal(false); };

    const revoke = async () => {
        const target = revokeDeviceTarget;
        if (!target || revoking) return;
        setRevoking(true);
        try {
            const res = await fetch('/api/auth/sessions/revoke', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ sessionId: target.id }),
            });
            const json = await readJson(res);

            if (!res.ok || json.success === false) {
                say('error', typeof json.error === 'string' && json.error
                    ? json.error
                    : 'We could not remove that device. Please try again.');
                return;
            }

            setDevices((prev) => (Array.isArray(prev) ? prev.filter((d) => d && d.id !== target.id) : []));
            /* Use the server's wording — it is careful not to over-promise. */
            say('success', typeof json.message === 'string' && json.message
                ? json.message
                : 'Device removed from your list. Its sign-in stays valid until it expires — change your password to force a sign-out everywhere.');
        } catch (err) {
            console.warn('Error revoking session:', err);
            say('error', 'We could not reach the server. Please try again.');
        } finally {
            setRevoking(false);
            setTarget(null);
        }
    };

    const shown = feedback || (mfaFeedback && typeof mfaFeedback === 'object' ? mfaFeedback : null);

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) close(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
            tabIndex={-1}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.9)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20
            }}>
            <div style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: 16,
                padding: 32,
                maxWidth: 600,
                width: '100%',
                maxHeight: '80vh',
                overflow: 'auto',
                border: '1px solid rgba(0, 212, 255, 0.2)'
            }}>
                <h2 style={{ color: '#fff', marginBottom: 16, fontSize: 24 }}>Connected Devices</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, fontSize: 14 }}>
                    Devices that have signed in to your account.
                </p>

                {devicesLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <div style={{ width: 40, height: 40, border: '3px solid rgba(0, 212, 255, 0.2)', borderTop: '3px solid #00D4FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading Devices...</p>
                    </div>
                ) : devices.length === 0 ? (
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: 12,
                        padding: 32,
                        textAlign: 'center'
                    }}>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '0 0 6px', fontWeight: 600 }}>
                            No devices recorded yet
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                            Sign-ins are only listed here once your browser has reported one. Nothing is hidden —
                            there is simply no session history stored for this account yet.
                        </p>
                    </div>
                ) : (
                    <div style={{ marginBottom: 20 }}>
                        {devices.map((device, index) => (
                            <div key={(device && device.id) || index} style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: 12,
                                padding: 16,
                                marginBottom: 12
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                                            {(device && device.device_name) || 'Unknown Device'}
                                        </div>
                                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 4 }}>
                                            {(device && device.ip_address) || 'IP not recorded'}
                                        </div>
                                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                            Last Active: {device && device.last_active ? new Date(device.last_active).toLocaleString() : 'Unknown'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setTarget(device)}
                                        disabled={revoking}
                                        style={{
                                            padding: '8px 16px',
                                            background: revoking ? '#999' : '#ff4757',
                                            border: 'none',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: revoking ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Revoke confirmation ─────────────────────────────────── */}
                {revokeDeviceTarget && (
                    <div style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 6 }}>
                            Remove <strong style={{ color: '#fff' }}>{revokeDeviceTarget.device_name || 'this device'}</strong> from your list?
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
                            This takes it off the list. It does not sign that device out — its existing sign-in stays
                            valid until it expires. To force a sign-out everywhere, change your password.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={revoke}
                                disabled={revoking}
                                style={{ flex: 1, padding: '10px', background: revoking ? '#999' : '#ff4757', border: 'none', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: revoking ? 'not-allowed' : 'pointer' }}
                            >
                                {revoking ? 'Removing...' : 'Yes, Remove'}
                            </button>
                            <button
                                onClick={() => setTarget(null)}
                                disabled={revoking}
                                style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Two-factor trusted devices: honest empty state ──────── */}
                <div style={{
                    background: 'rgba(0, 212, 255, 0.06)',
                    border: '1px solid rgba(0, 212, 255, 0.2)',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16
                }}>
                    <h3 style={{ color: '#00D4FF', fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>
                        Devices trusted for two-factor
                    </h3>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 8px', lineHeight: 1.55 }}>
                        When you tick <em>Remember this device for 30 days</em> after entering a texted code, that
                        browser stops asking you for a code for 30 days — at sign-in and on every gated action.
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0, lineHeight: 1.55 }}>
                        We cannot list those devices here: the trust is a signed cookie stored on each device, not a
                        record on our servers, so there is nothing for this screen to read. To end it on a device,
                        sign out or clear cookies in that browser. To end it everywhere at once, turn two-factor off
                        and back on in Security settings.
                    </p>
                </div>

                {shown && shown.message && (
                    <div style={{ padding: '8px 12px', marginBottom: 16, background: shown.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${shown.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: shown.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                        {shown.message}
                    </div>
                )}

                <button
                    onClick={close}
                    style={{
                        width: '100%',
                        padding: '12px 24px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 20,
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    Close
                </button>
            </div>
        </div>
    );
}
