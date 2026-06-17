import React from 'react';
import { getAccessToken } from '../../../lib/authUtils';

export default function DevicesModal({
showDevicesModal, setShowDevicesModal, connectedDevices, setConnectedDevices, devicesLoading, setDevicesLoading, revokeDeviceTarget, setRevokeDeviceTarget, user, setMfaFeedback, mfaFeedback
}) {
    return (
        <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowDevicesModal(false); setRevokeDeviceTarget(null); } }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowDevicesModal(false); setRevokeDeviceTarget(null); } }}
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
                            Manage Devices That Have Access To Your Account
                        </p>

                        {devicesLoading ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <div style={{ width: 40, height: 40, border: '3px solid rgba(0, 212, 255, 0.2)', borderTop: '3px solid #00D4FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading Devices...</p>
                            </div>
                        ) : connectedDevices.length === 0 ? (
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: 12,
                                padding: 40,
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                                    No Session Data Available. This Feature Tracks Active Login Sessions.
                                </p>
                            </div>
                        ) : (
                            <div style={{ marginBottom: 20 }}>
                                {connectedDevices.map((device, index) => (
                                    <div key={index} style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: 12,
                                        padding: 16,
                                        marginBottom: 12
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                                                    {device.device_name || 'Unknown Device'}
                                                </div>
                                                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 4 }}>
                                                    {device.ip_address || 'IP not recorded'}
                                                </div>
                                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                                    Last Active: {device.last_active ? new Date(device.last_active).toLocaleString() : 'Unknown'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setRevokeDeviceTarget(device)}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: '#ff4757',
                                                    border: 'none',
                                                    borderRadius: 20,
                                                    color: '#fff',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Revoke
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Device Revoke Confirmation */}
                        {revokeDeviceTarget && (
                            <div style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 12 }}>
                                    Revoke access for <strong style={{ color: '#fff' }}>{revokeDeviceTarget.device_name || 'this device'}</strong>?
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={async () => {
                                            try {
                                                if (!user?.id) return;
                                                const response = await fetch('/api/auth/sessions/revoke', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAccessToken()}` },
                                                    body: JSON.stringify({ sessionId: revokeDeviceTarget.id })
                                                });
                                                if (response.ok) {
                                                    setConnectedDevices(prev => prev.filter(d => d.id !== revokeDeviceTarget.id));
                                                } else {
                                                    console.warn('Failed to revoke session');
                                                }
                                            } catch (err) {
                                                console.warn('Error revoking session:', err);
                                            } finally {
                                                setRevokeDeviceTarget(null);
                                            }
                                        }}
                                        style={{ flex: 1, padding: '10px', background: '#ff4757', border: 'none', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Yes, Revoke
                                    </button>
                                    <button
                                        onClick={() => setRevokeDeviceTarget(null)}
                                        style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => { setShowDevicesModal(false); setRevokeDeviceTarget(null); }}
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
