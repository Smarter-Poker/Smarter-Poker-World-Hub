import React, { useState } from 'react';
import MetalModal from './MetalModal';
import { getAuthUser } from '../../lib/authUtils'; // Assuming authUtils is two levels up
import { busEmit } from '../../engine/EventBus';

export default function ReportBugWidget({ contextPath = '/hub/messenger' }) {
    const [showModal, setShowModal] = useState(false);
    const [bugSubject, setBugSubject] = useState('');
    const [bugDescription, setBugDescription] = useState('');
    const [bugPriority, setBugPriority] = useState('medium');
    const [bugSubmitting, setBugSubmitting] = useState(false);
    const [bugSuccess, setBugSuccess] = useState(false);
    const [bugError, setBugError] = useState('');

    const handleSubmit = async () => {
        if (!bugSubject.trim() || !bugDescription.trim()) {
            setBugError('Please fill in both subject and description.');
            return;
        }
        setBugSubmitting(true);
        setBugError('');
        try {
            // Get auth token
            let token = null;
            if (typeof window !== 'undefined') {
                const keys = ['smarter-poker-auth', 'smarter_poker_auth', 'sp_auth'];
                for (const key of keys) {
                    const raw = localStorage.getItem(key);
                    if (raw) {
                        const p = JSON.parse(raw);
                        if (p?.access_token) { token = p.access_token; break; }
                    }
                }
            }

            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/live-help/report-bug', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    subject: bugSubject.trim(),
                    description: bugDescription.trim(),
                    priority: bugPriority,
                    currentPage: contextPath,
                    userAgent: navigator.userAgent,
                }),
            });

            if (!res.ok) throw new Error('Failed to submit');
            
            // Assuming endpoint returns tracking ID (res.json() may not exist if it's returning empty, but in our case ReportBug returns {"success": true, "ticket_id": v_ticket_id})
            let ticketId = 'UNKNOWN';
            try { 
                const data = await res.json(); 
                if (data.ticket_id) ticketId = data.ticket_id;
            } catch(e){}

            // Push globally to any listeners
            busEmit.bugReportSubmitted(ticketId, bugPriority, contextPath);

            setBugSuccess(true);
            setBugSubject('');
            setBugDescription('');
            setBugPriority('medium');
        } catch (err) {
            setBugError('Failed to submit bug report. Please try again.');
        } finally {
            setBugSubmitting(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px',
                    borderRadius: 8,
                    background: 'rgba(255, 107, 107, 0.1)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    color: '#ff6b6b',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)';
                }}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                Report a Bug to Customer Service
            </button>

            <MetalModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setBugSuccess(false);
                    setBugError('');
                }}
                title="Report a Bug"
                width="400px"
            >
                {bugSuccess ? (
                    <div style={{ textAlign: 'center', padding: '20px 10px', color: '#00ff88' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <h3 style={{ margin: '0 0 8px 0', color: '#fff' }}>Report Submitted</h3>
                        <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                            Our engineering team has been notified. We'll look into it right away. Thank you!
                        </p>
                        <button
                            onClick={() => setShowModal(false)}
                            style={{
                                marginTop: 24, padding: '10px 24px', borderRadius: 8,
                                background: 'rgba(0, 255, 136, 0.15)', border: '1px solid rgba(0, 255, 136, 0.3)',
                                color: '#00ff88', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Close
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Subject / Summary</label>
                            <input
                                type="text"
                                value={bugSubject}
                                onChange={e => setBugSubject(e.target.value)}
                                placeholder="What went wrong?"
                                maxLength={120}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: 8,
                                    border: '1px solid rgba(255, 107, 107, 0.3)',
                                    background: 'rgba(0,0,0,0.2)', color: '#fff',
                                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>
                        
                        <div>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Detailed Description</label>
                            <textarea
                                value={bugDescription}
                                onChange={e => setBugDescription(e.target.value)}
                                placeholder="Describe the issue. What were you doing? What did you expect to happen?"
                                rows={4}
                                maxLength={2000}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: 8,
                                    border: '1px solid rgba(255, 107, 107, 0.3)',
                                    background: 'rgba(0,0,0,0.2)', color: '#fff',
                                    fontSize: 14, outline: 'none', resize: 'vertical',
                                    lineHeight: 1.5, boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Priority Level</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {['low', 'medium', 'high'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setBugPriority(p)}
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: 6,
                                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                            textTransform: 'uppercase', letterSpacing: '0.5px',
                                            transition: 'all 0.2s',
                                            background: bugPriority === p
                                                ? p === 'high' ? 'rgba(255,68,68,0.2)' : p === 'medium' ? 'rgba(255,165,0,0.2)' : 'rgba(0,255,136,0.2)'
                                                : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${bugPriority === p
                                                ? p === 'high' ? '#ff4444' : p === 'medium' ? '#ffa500' : '#00ff88'
                                                : 'rgba(255,255,255,0.1)'}`,
                                            color: bugPriority === p
                                                ? p === 'high' ? '#ff4444' : p === 'medium' ? '#ffa500' : '#00ff88'
                                                : 'rgba(255,255,255,0.5)',
                                        }}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {bugError && (
                            <div style={{ fontSize: 13, color: '#ff6b6b' }}>{bugError}</div>
                        )}

                        <button
                            onClick={handleSubmit}
                            disabled={bugSubmitting || !bugSubject.trim() || !bugDescription.trim()}
                            style={{
                                marginTop: 8, width: '100%', padding: '12px', borderRadius: 8,
                                background: (bugSubject.trim() && bugDescription.trim())
                                    ? 'linear-gradient(135deg, #cc3333 0%, #ff4444 100%)'
                                    : 'rgba(255,255,255,0.08)',
                                border: 'none', color: '#fff', fontSize: 15, fontWeight: 700,
                                cursor: (bugSubject.trim() && bugDescription.trim()) ? 'pointer' : 'not-allowed',
                                opacity: bugSubmitting ? 0.6 : 1, transition: 'all 0.2s',
                            }}
                        >
                            {bugSubmitting ? 'Submitting...' : 'Submit Bug Report'}
                        </button>
                    </div>
                )}
            </MetalModal>
        </>
    );
}
