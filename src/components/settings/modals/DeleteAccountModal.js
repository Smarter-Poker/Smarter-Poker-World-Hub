import React from 'react';
import { getAccessToken } from '../../../lib/authUtils';

export default function DeleteAccountModal({
showDeleteModal, setShowDeleteModal, deleteConfirmText, setDeleteConfirmText, deleteLoading, setDeleteLoading, deleteFeedback, setDeleteFeedback, user, setLocalUser
}) {
    return (
        <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteModal(false); setDeleteConfirmText(''); setDeleteFeedback(null); } }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowDeleteModal(false); setDeleteConfirmText(''); setDeleteFeedback(null); } }}
                    tabIndex={-1}
                    style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.9)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: 16,
                        padding: 32,
                        maxWidth: 480,
                        width: '100%',
                        border: '1px solid rgba(255, 71, 87, 0.3)',
                        boxShadow: '0 20px 60px rgba(255, 71, 87, 0.15)',
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%',
                                background: 'rgba(255, 71, 87, 0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px',
                                border: '2px solid rgba(255, 71, 87, 0.3)',
                            }}>
                                <span style={{ fontSize: 28, color: '#ff4757' }}>X</span>
                            </div>
                            <h2 style={{ color: '#ff4757', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                                Delete Your Account?
                            </h2>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6 }}>
                                This action is permanent and cannot be undone. All your data, posts, training progress, diamonds, and VIP status will be permanently erased.
                            </p>
                        </div>

                        <div style={{
                            background: 'rgba(255, 71, 87, 0.08)',
                            border: '1px solid rgba(255, 71, 87, 0.2)',
                            borderRadius: 10,
                            padding: 16,
                            marginBottom: 20,
                        }}>
                            <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                                Type <strong style={{ color: '#ff4757' }}>DELETE</strong> to confirm:
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                                placeholder="Type DELETE here"
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: deleteConfirmText === 'DELETE'
                                        ? '2px solid #ff4757'
                                        : '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: 8,
                                    color: '#fff',
                                    fontSize: 16,
                                    fontFamily: 'Orbitron, monospace',
                                    letterSpacing: 4,
                                    textAlign: 'center',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {deleteFeedback && (
                            <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(255, 71, 87, 0.15)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 8, color: '#ff4757', fontSize: 13 }}>
                                {deleteFeedback.message}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button
                                onClick={async () => {
                                    if (deleteConfirmText !== 'DELETE') return;
                                    setDeleteLoading(true);
                                    try {
                                        await handleDeleteAccount();
                                    } finally {
                                        // Only reached on error — success navigates away
                                        setDeleteLoading(false);
                                    }
                                }}
                                disabled={deleteConfirmText !== 'DELETE' || deleteLoading}
                                style={{
                                    flex: 1,
                                    padding: '14px 24px',
                                    background: deleteConfirmText === 'DELETE' && !deleteLoading
                                        ? '#ff4757'
                                        : 'rgba(255, 71, 87, 0.2)',
                                    border: 'none',
                                    borderRadius: 20,
                                    color: deleteConfirmText === 'DELETE' && !deleteLoading
                                        ? '#fff'
                                        : 'rgba(255,255,255,0.4)',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: deleteConfirmText === 'DELETE' && !deleteLoading
                                        ? 'pointer'
                                        : 'not-allowed',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setDeleteConfirmText('');
                                    setDeleteFeedback(null);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '14px 24px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: 20,
                                    color: '#fff',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
    );
}
