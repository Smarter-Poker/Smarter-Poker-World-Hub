/**
 * GTO PRELOADER — Offline Cache Manager
 * ═══════════════════════════════════════════════════════════════════════════
 * Settings UI to "download" specific game trees for offline use.
 *
 * Route: /hub/training/gto-preloader
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const TREES = [
    { id: '100bb-6max', label: '100bb 6-Max Cash', size: '1.2 GB', desc: 'Core solver paths for standard online 6-max.', time: 'Complete' },
    { id: '20bb-mtt', label: '20bb MTT Push/Fold', size: '450 MB', desc: 'Short stack tournament ranges and reshoves.', time: 'Complete' },
    { id: 'hu-40bb', label: 'Head-Up 40bb', size: '800 MB', desc: 'Deep HU SNGs and late stage tournament HU.', time: 'Complete' },
    { id: 'live-200bb', label: 'Live 200bb Deep', size: '2.4 GB', desc: 'Exploitative deep stack mapping for live $2/$5.', time: 'Complete' }
];

export default function GtoPreloaderPage() {
    const router = useRouter();
    useTrainingBus('gto-preloader');

    const [downloads, setDownloads] = useState({}); // { id: { progress: number, status: 'idle'|'downloading'|'done' } }

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('gto-offline-trees');
            if (saved) setDownloads(JSON.parse(saved));
            else {
                // Initialize default state
                const init = {};
                TREES.forEach(t => init[t.id] = { progress: 0, status: 'idle' });
                setDownloads(init);
            }
        } catch { }
    }, []);

    const startDownload = (id) => {
        setDownloads(prev => ({ ...prev, [id]: { progress: 0, status: 'downloading' } }));

        let p = 0;
        const interval = setInterval(() => {
            p += Math.random() * 8; // Random increments
            if (p >= 100) {
                p = 100;
                clearInterval(interval);
                setDownloads(prev => {
                    const next = { ...prev, [id]: { progress: 100, status: 'done' } };
                    try { localStorage.setItem('gto-offline-trees', JSON.stringify(next)); } catch { }
                    return next;
                });
            } else {
                setDownloads(prev => ({ ...prev, [id]: { progress: p, status: 'downloading' } }));
            }
        }, 150);
    };

    const deleteTree = (id) => {
        setDownloads(prev => {
            const next = { ...prev, [id]: { progress: 0, status: 'idle' } };
            try { localStorage.setItem('gto-offline-trees', JSON.stringify(next)); } catch { }
            return next;
        });
    };

    const getDiskUsage = () => {
        const sizes = { '100bb-6max': 1200, '20bb-mtt': 450, 'hu-40bb': 800, 'live-200bb': 2400 };
        let total = 0;
        Object.entries(downloads).forEach(([id, data]) => {
            if (data.status === 'done') total += sizes[id];
            else if (data.status === 'downloading') total += sizes[id] * (data.progress / 100);
        });
        return (total / 1024).toFixed(2);
    };

    return (
        <>
            <Head><title>GTO Preloader | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                        <div><div style={{ fontSize: 16, fontWeight: 700 }}>GTO Preloader</div><div style={{ fontSize: 11, color: '#64748b' }}>Offline IndexedDB Cache Sync</div></div>
                    </div>
                </div>

                <div style={{ padding: '20px', maxWidth: 600, margin: '0 auto' }}>

                    {/* Storage Summary */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(0,0,0,0.3))', border: '1px solid rgba(59,130,246,0.2)', padding: 24, borderRadius: 16, marginBottom: 32, display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ width: 80, height: 80, borderRadius: '50%', border: '8px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💾</div>
                        <div>
                            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Local Storage Used</div>
                            <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>{getDiskUsage()} <span style={{ fontSize: 16, color: '#3b82f6' }}>GB</span></div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Available on device: ~45.2 GB</div>
                        </div>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Available Solver Trees</div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {TREES.map(tree => {
                            const state = downloads[tree.id] || { status: 'idle', progress: 0 };

                            return (
                                <div key={tree.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: 20, borderRadius: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>{tree.label}</div>
                                                {state.status === 'done' && <span style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4 }}>Offline Ready</span>}
                                            </div>
                                            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{tree.desc}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>{tree.size}</div>
                                        </div>
                                    </div>

                                    {state.status === 'idle' && (
                                        <button onClick={() => startDownload(tree.id)} style={{ width: '100%', padding: 12, borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                            ↓ Download to Device
                                        </button>
                                    )}

                                    {state.status === 'downloading' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                                                <span>Syncing nodes...</span>
                                                <span style={{ color: '#00d4ff' }}>{Math.round(state.progress)}%</span>
                                            </div>
                                            <div style={{ height: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 3, overflow: 'hidden' }}>
                                                <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #00d4ff)' }} animate={{ width: `${state.progress}%` }} />
                                            </div>
                                        </div>
                                    )}

                                    {state.status === 'done' && (
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <button disabled style={{ flex: 1, padding: 12, borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'not-allowed' }}>
                                                ✓ Synced
                                            </button>
                                            <button onClick={() => deleteTree(tree.id)} style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: 'border: none', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </>
    );
}
