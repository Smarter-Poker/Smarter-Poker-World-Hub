/**
 * LIVE HUD SYNC — Live Table Beacon Manager
 * ═══════════════════════════════════════════════════════════════════════════
 * Premium setup screen simulating a physical cardroom HUD pairing with the Smarter Poker beacon.
 *
 * Route: /hub/training/live-hud-sync
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function LiveHudSyncPage() {
    const router = useRouter();
    useTrainingBus('live-hud-sync');

    const [scanning, setScanning] = useState(false);
    const [connected, setConnected] = useState(false);
    const [beaconName, setBeaconName] = useState(null);
    const [settings, setSettings] = useState({ silent: true, autoTrack: false });

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    const toggleScan = () => {
        if (connected) {
            setConnected(false);
            setBeaconName(null);
            return;
        }

        setScanning(true);
        setTimeout(() => {
            setScanning(false);
            setConnected(true);
            setBeaconName(`SP-Beacon-${Math.floor(1000 + Math.random() * 9000)}`);
        }, 3000);
    };

    return (
        <>
            <Head><title>Live HUD Sync | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: '#05050A', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                        <div><div style={{ fontSize: 16, fontWeight: 700 }}>Live HUD Sync</div><div style={{ fontSize: 11, color: '#64748b' }}>Hardware Beacon Manager</div></div>
                    </div>
                </div>

                <div style={{ padding: '40px 20px', maxWidth: 500, margin: '0 auto', textAlign: 'center', position: 'relative' }}>

                    {/* Visual Radar Scanner */}
                    <div style={{ position: 'relative', width: 240, height: 240, margin: '0 auto 40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '1px solid rgba(0, 212, 255, 0.1)' }} />
                        <div style={{ position: 'absolute', width: '70%', height: '70%', borderRadius: '50%', border: '1px solid rgba(0, 212, 255, 0.2)' }} />
                        <div style={{ position: 'absolute', width: '40%', height: '40%', borderRadius: '50%', border: '1px dashed rgba(0, 212, 255, 0.3)' }} />

                        {scanning && (
                            <motion.div
                                style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(0,212,255,0) 70%, rgba(0,212,255,0.4) 100%)', transformOrigin: 'center' }}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                            />
                        )}

                        <div style={{ zIndex: 2, background: connected ? '#00d4ff' : '#1e293b', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: connected ? '0 0 30px #00d4ff' : 'none', transition: 'all 0.4s' }}>
                            <span style={{ fontSize: 24 }}>{connected ? '📶' : '📡'}</span>
                        </div>

                        {connected && (
                            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ position: 'absolute', top: 40, right: 40, width: 12, height: 12, background: '#4ade80', borderRadius: '50%', boxShadow: '0 0 10px #4ade80' }} />
                        )}
                    </div>

                    {/* Status Info */}
                    <div style={{ marginBottom: 40 }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginBottom: 8, letterSpacing: '-0.5px' }}>
                            {scanning ? 'Scanning for Beacons...' : connected ? 'Beacon Connected' : 'No Beacon Detected'}
                        </div>
                        <div style={{ fontSize: 14, color: '#94a3b8' }}>
                            {connected ? (
                                <span style={{ color: '#00d4ff', fontWeight: 700 }}>Paired with {beaconName}</span>
                            ) : (
                                "Ensure your Smarter.Poker physical hardware beacon is powered on and within Bluetooth range of your device."
                            )}
                        </div>
                    </div>

                    <motion.button whileTap={{ scale: 0.95 }} onClick={toggleScan} disabled={scanning}
                        style={{ width: '100%', padding: 20, borderRadius: 16, background: connected ? 'rgba(239,68,68,0.1)' : 'rgba(0,212,255,0.1)', border: `1px solid ${connected ? 'rgba(239,68,68,0.3)' : 'rgba(0,212,255,0.3)'}`, color: connected ? '#fca5a5' : '#00d4ff', fontSize: 16, fontWeight: 800, cursor: scanning ? 'not-allowed' : 'pointer', letterSpacing: 1, marginBottom: 40 }}>
                        {scanning ? 'SEARCHING...' : connected ? 'DISCONNECT BEACON' : 'START PAIRING SCAN'}
                    </motion.button>

                    {/* Hardware Settings */}
                    <AnimatePresence>
                        {connected && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20 }}>Hardware Settings</div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Silent Haptic Mode</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Notifications sent as vibrations only</div>
                                    </div>
                                    <button onClick={() => setSettings(s => ({ ...s, silent: !s.silent }))} style={{ width: 44, height: 24, borderRadius: 12, background: settings.silent ? '#4ade80' : '#334155', border: 'none', position: 'relative', cursor: 'pointer', transition: '0.3s' }}>
                                        <div style={{ position: 'absolute', top: 2, left: settings.silent ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: '0.3s' }} />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Auto-Track Hands</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Use camera sensor to log table cards</div>
                                    </div>
                                    <button onClick={() => setSettings(s => ({ ...s, autoTrack: !s.autoTrack }))} style={{ width: 44, height: 24, borderRadius: 12, background: settings.autoTrack ? '#4ade80' : '#334155', border: 'none', position: 'relative', cursor: 'pointer', transition: '0.3s' }}>
                                        <div style={{ position: 'absolute', top: 2, left: settings.autoTrack ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: '0.3s' }} />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                </div>
            </div>
        </>
    );
}
