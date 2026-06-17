import React from 'react';
import { getAccessToken } from '../../../lib/authUtils';

export default function TwoFactorAuthModal({
show2FAModal, setShow2FAModal, twoFactorEnabled, setTwoFactorEnabled, qrCode, setQrCode, manualEntryKey, setManualEntryKey, verificationCode, setVerificationCode, backupCodes, setBackupCodes, loadingMFA, setLoadingMFA, mfaFeedback, setMfaFeedback, user, showDisable2FAConfirm, setShowDisable2FAConfirm, backupCodesCopied, setBackupCodesCopied
}) {
    return (
        <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setShow2FAModal(false); setVerificationCode(''); setMfaFeedback(null); } }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShow2FAModal(false); setVerificationCode(''); setMfaFeedback(null); } }}
                    tabIndex={-1}
                    style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
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
                        maxWidth: 500,
                        width: '100%',
                        border: '1px solid rgba(0, 212, 255, 0.2)'
                    }}>
                        <h2 style={{ color: '#fff', marginBottom: 16, fontSize: 24 }}>Enable Two-Factor Authentication</h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, fontSize: 14 }}>
                            Add An Extra Layer Of Security To Your Account With 2FA.
                        </p>

                        {!twoFactorEnabled ? (
                            <>
                                <div style={{
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    borderRadius: 12,
                                    padding: 20,
                                    marginBottom: 20
                                }}>
                                    <h3 style={{ color: '#00D4FF', fontSize: 16, marginBottom: 12 }}>Setup Instructions:</h3>
                                    <ol style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, paddingLeft: 20, margin: 0 }}>
                                        <li style={{ marginBottom: 8 }}>Download An Authenticator App (Google Authenticator, Authy, Etc.)</li>
                                        <li style={{ marginBottom: 8 }}>Scan The QR Code Below With Your App</li>
                                        <li>Enter The 6-digit Code To Verify</li>
                                    </ol>
                                </div>

                                <div style={{
                                    background: '#fff',
                                    padding: 20,
                                    borderRadius: 12,
                                    marginBottom: 20,
                                    textAlign: 'center'
                                }}>
                                    {loadingMFA ? (
                                        <div style={{ fontSize: 14, color: '#666', padding: 40 }}>Loading QR Code...</div>
                                    ) : qrCode ? (
                                        <>
                                            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Scan With Your Authenticator App</div>
                                            <img src={qrCode} alt="QR Code" style={{ width: 200, height: 200, margin: '0 auto' }} />
                                            <p style={{ fontSize: 12, color: '#666', marginTop: 12 }}>
                                                Manual Entry Key: {manualEntryKey || 'Loading...'}
                                            </p>
                                        </>
                                    ) : (
                                        <div style={{ fontSize: 14, color: '#666', padding: 40 }}>Failed To Generate QR Code</div>
                                    )}
                                </div>

                                <input
                                    type="text"
                                    placeholder="Enter 6-digit Code"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && verificationCode.length === 6) verify2FA(); }}
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: 8,
                                        color: '#fff',
                                        fontSize: 16,
                                        marginBottom: 20,
                                        textAlign: 'center',
                                        letterSpacing: 4
                                    }}
                                />

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        onClick={verify2FA}
                                        disabled={loadingMFA || verificationCode.length !== 6}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: loadingMFA || verificationCode.length !== 6 ? '#666' : '#00D4FF',
                                            border: 'none',
                                            borderRadius: 20,
                                            color: loadingMFA || verificationCode.length !== 6 ? '#999' : '#000',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: loadingMFA || verificationCode.length !== 6 ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {loadingMFA ? 'Verifying...' : 'Verify & Enable'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShow2FAModal(false);
                                            setVerificationCode('');
                                            setMfaFeedback(null);
                                        }}
                                        style={{
                                            flex: 1,
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
                                        Cancel
                                    </button>
                                </div>

                                {/* Phase 2: MFA inline feedback banner */}
                                {mfaFeedback && (
                                    <div style={{ padding: '8px 12px', marginTop: 12, background: mfaFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${mfaFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: mfaFeedback.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                        {mfaFeedback.message}
                                    </div>
                                )}

                                {/* Backup Codes Display — shown after successful 2FA verify */}
                                {backupCodes.length > 0 && (
                                    <div style={{
                                        background: 'rgba(0, 212, 255, 0.08)',
                                        border: '1px solid rgba(0, 212, 255, 0.25)',
                                        borderRadius: 12,
                                        padding: 20,
                                        marginTop: 16,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <h4 style={{ color: '#00D4FF', fontSize: 14, fontWeight: 700, margin: 0 }}>Backup Codes</h4>
                                            <button
                                                onClick={() => {
                                                    try { navigator.clipboard.writeText(backupCodes.join('\n')); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                                                    setBackupCodesCopied(true);
                                                    setTimeout(() => setBackupCodesCopied(false), 2000);
                                                }}
                                                style={{ padding: '4px 12px', background: backupCodesCopied ? 'rgba(49, 162, 76, 0.2)' : 'rgba(0, 212, 255, 0.15)', border: `1px solid ${backupCodesCopied ? 'rgba(49, 162, 76, 0.4)' : 'rgba(0, 212, 255, 0.3)'}`, borderRadius: 20, color: backupCodesCopied ? '#31A24C' : '#00D4FF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                {backupCodesCopied ? 'Copied!' : 'Copy All'}
                                            </button>
                                        </div>
                                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 12 }}>Save these codes in a safe place. Each can be used once if you lose access to your authenticator app.</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                            {backupCodes.map((code, i) => (
                                                <div key={i} style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, color: '#fff', fontSize: 13, fontFamily: 'monospace', textAlign: 'center' }}>{code}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={{
                                    background: 'rgba(0, 255, 0, 0.1)',
                                    border: '1px solid rgba(0, 255, 0, 0.3)',
                                    borderRadius: 12,
                                    padding: 20,
                                    marginBottom: 20,
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                    <h3 style={{ color: '#0f0', fontSize: 18, marginBottom: 8 }}>2FA Is Active</h3>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>
                                        Your Account Is Protected With Two-Factor Authentication
                                    </p>
                                </div>

                                {!showDisable2FAConfirm ? (
                                    <button
                                        onClick={() => setShowDisable2FAConfirm(true)}
                                        disabled={loadingMFA}
                                        style={{
                                            width: '100%',
                                            padding: '12px 24px',
                                            background: loadingMFA ? '#999' : '#ff4757',
                                            border: 'none',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: loadingMFA ? 'not-allowed' : 'pointer',
                                            marginBottom: 12
                                        }}
                                    >
                                        {loadingMFA ? 'Disabling...' : 'Disable 2FA'}
                                    </button>
                                ) : (
                                    <div style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 12 }}>Are you sure? This will make your account less secure.</p>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={disable2FA} disabled={loadingMFA} style={{ flex: 1, padding: '10px', background: '#ff4757', border: 'none', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                                {loadingMFA ? 'Disabling...' : 'Yes, Disable'}
                                            </button>
                                            <button onClick={() => setShowDisable2FAConfirm(false)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                                Keep Enabled
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => { setShow2FAModal(false); setMfaFeedback(null); }}
                                    style={{
                                        width: '100%',
                                        padding: '12px 24px',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        borderRadius: 8,
                                        color: '#fff',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Close
                                </button>

                                {/* Phase 2: MFA inline feedback (enabled state) */}
                                {mfaFeedback && (
                                    <div style={{ padding: '8px 12px', marginTop: 12, background: mfaFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${mfaFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: mfaFeedback.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                        {mfaFeedback.message}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
    );
}
