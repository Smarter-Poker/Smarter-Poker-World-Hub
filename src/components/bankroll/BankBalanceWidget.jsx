/**
 * BankBalanceWidget — Mocked Plaid Bank Sync Integration
 * ═══════════════════════════════════════════════════════════════════════════
 * Dashboard widget showing linked bank account balances with Plaid branding.
 * Mocked real-time balance sync with visual "last synced" timestamps.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { eventBus, EventType } from '../../engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK BANK DATA — Simulated Plaid-style accounts
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_BANKS = [
    {
        id: 'plaid-chase-001',
        institution: 'Chase',
        logo: '🏦',
        accountName: 'Personal Checking',
        accountMask: '●●●● 4821',
        type: 'checking',
        balance: 12847.32,
        available: 12347.32,
        currency: 'USD',
        lastSynced: new Date(Date.now() - 1000 * 60 * 23).toISOString(), // 23 min ago
        status: 'connected',
        color: '#0060f0',
    },
    {
        id: 'plaid-boa-002',
        institution: 'Bank of America',
        logo: '🏦',
        accountName: 'Poker Bankroll Savings',
        accountMask: '●●●● 7293',
        type: 'savings',
        balance: 45200.00,
        available: 45200.00,
        currency: 'USD',
        lastSynced: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2h ago
        status: 'connected',
        color: '#dc143c',
    },
];

function formatTimeAgo(iso) {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LINK ACCOUNT MODAL (Plaid-style)
// ═══════════════════════════════════════════════════════════════════════════

function LinkAccountModal({ onClose, onLink }) {
    const [step, setStep] = useState('select'); // 'select' | 'connecting' | 'success'
    const [selectedBank, setSelectedBank] = useState(null);
    const searchRef = useRef(null);

    const AVAILABLE_BANKS = [
        { id: 'chase', name: 'Chase', logo: '🏦', color: '#0060f0' },
        { id: 'boa', name: 'Bank of America', logo: '🏦', color: '#dc143c' },
        { id: 'wells', name: 'Wells Fargo', logo: '🏦', color: '#d71e28' },
        { id: 'citi', name: 'Citibank', logo: '🏦', color: '#003b70' },
        { id: 'capital', name: 'Capital One', logo: '🏦', color: '#004977' },
        { id: 'pnc', name: 'PNC Bank', logo: '🏦', color: '#f58220' },
        { id: 'usbank', name: 'US Bank', logo: '🏦', color: '#d52b1e' },
        { id: 'td', name: 'TD Bank', logo: '🏦', color: '#34a853' },
    ];

    const handleSelect = (bank) => {
        setSelectedBank(bank);
        setStep('connecting');
        setTimeout(() => setStep('success'), 2200);
    };

    const handleFinish = () => {
        onLink(selectedBank);
        onClose();
    };

    useEffect(() => {
        if (step === 'select' && searchRef.current) searchRef.current.focus();
    }, [step]);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                style={{
                    background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 20, width: '100%', maxWidth: 420, overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>Link Bank Account</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Powered by Plaid • 256-bit encryption</div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8',
                        width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16,
                    }}>×</button>
                </div>

                <div style={{ padding: 24 }}>
                    {step === 'select' && (
                        <>
                            <input
                                ref={searchRef}
                                placeholder="Search your bank..."
                                style={{
                                    width: '100%', padding: '12px 16px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#e2e8f0', fontSize: 14, outline: 'none', marginBottom: 16,
                                    boxSizing: 'border-box',
                                }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                                {AVAILABLE_BANKS.map(bank => (
                                    <button
                                        key={bank.id}
                                        onClick={() => handleSelect(bank)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                            borderRadius: 12, cursor: 'pointer', color: '#e2e8f0', textAlign: 'left',
                                            transition: 'background 0.2s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                    >
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 10,
                                            background: `${bank.color}20`, border: `1px solid ${bank.color}40`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                                        }}>{bank.logo}</div>
                                        <div style={{ fontSize: 14, fontWeight: 700 }}>{bank.name}</div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {step === 'connecting' && (
                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                                style={{
                                    width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
                                    border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#00d4ff',
                                }}
                            />
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                                Connecting to {selectedBank?.name}...
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Verifying credentials securely via Plaid</div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <motion.div
                                initial={{ scale: 0 }} animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 200 }}
                                style={{
                                    width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
                                    background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 28, color: '#4ade80',
                                }}
                            >✓</motion.div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>
                                {selectedBank?.name} Linked!
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 24 }}>
                                Account connected. Balances will sync automatically.
                            </div>
                            <button
                                onClick={handleFinish}
                                style={{
                                    width: '100%', padding: '14px', borderRadius: 12,
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    border: 'none', color: '#fff', fontSize: 14, fontWeight: 800,
                                    cursor: 'pointer', letterSpacing: 0.5,
                                }}
                            >DONE</button>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN WIDGET
// ═══════════════════════════════════════════════════════════════════════════

export default function BankBalanceWidget({ bankrollTotal = 0 }) {
    const [accounts, setAccounts] = useState(MOCK_BANKS);
    const [syncing, setSyncing] = useState(null); // account id being synced
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const totalBankBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
    const delta = totalBankBalance - bankrollTotal;
    const deltaPercent = bankrollTotal > 0 ? ((delta / bankrollTotal) * 100).toFixed(1) : '0.0';

    const handleSync = useCallback(async (accountId) => {
        setSyncing(accountId);
        // Simulate Plaid sync delay
        await new Promise(r => setTimeout(r, 1800));
        setAccounts(prev => prev.map(a =>
            a.id === accountId
                ? { ...a, lastSynced: new Date().toISOString(), balance: a.balance + (Math.random() * 200 - 100) }
                : a
        ));
        setSyncing(null);
        eventBus.emit(EventType.SESSION_END, { source: 'BankBalanceWidget', action: 'sync', accountId }, 'BankBalanceWidget');
    }, []);

    const handleSyncAll = useCallback(async () => {
        for (const account of accounts) {
            await handleSync(account.id);
        }
    }, [accounts, handleSync]);

    const handleLink = useCallback((bank) => {
        const newAccount = {
            id: `plaid-${bank.id}-${Date.now()}`,
            institution: bank.name,
            logo: bank.logo,
            accountName: 'Linked Account',
            accountMask: `●●●● ${Math.floor(1000 + Math.random() * 9000)}`,
            type: 'checking',
            balance: Math.floor(5000 + Math.random() * 20000),
            available: 0,
            currency: 'USD',
            lastSynced: new Date().toISOString(),
            status: 'connected',
            color: bank.color,
        };
        newAccount.available = newAccount.balance - Math.floor(Math.random() * 500);
        setAccounts(prev => [...prev, newAccount]);
    }, []);

    return (
        <>
            <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(99,102,241,0.15))',
                            border: '1px solid rgba(0,212,255,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                        }}>🏦</div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', letterSpacing: 0.3 }}>Bank Sync</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>Powered by Plaid</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={handleSyncAll}
                            style={{
                                background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
                                color: '#00d4ff', fontSize: 11, fontWeight: 700, padding: '6px 12px',
                                borderRadius: 8, cursor: 'pointer',
                            }}
                        >↻ Sync All</button>
                        <button
                            onClick={() => setShowLinkModal(true)}
                            style={{
                                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                                color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '6px 12px',
                                borderRadius: 8, cursor: 'pointer',
                            }}
                        >+ Link Account</button>
                    </div>
                </div>

                {/* Total Balance Bar */}
                <div style={{
                    padding: '16px 20px', background: 'rgba(0,0,0,0.2)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                            Combined Bank Balance
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
                            ${totalBankBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                            vs Bankroll Ledger
                        </div>
                        <div style={{
                            fontSize: 16, fontWeight: 800,
                            color: delta >= 0 ? '#4ade80' : '#f87171',
                        }}>
                            {delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>({deltaPercent}%)</span>
                        </div>
                    </div>
                </div>

                {/* Account List */}
                <div style={{ padding: '0 0 4px' }}>
                    {(expanded ? accounts : accounts.slice(0, 2)).map((account, i) => (
                        <div
                            key={account.id}
                            style={{
                                padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                borderBottom: i < accounts.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: `${account.color}15`, border: `1px solid ${account.color}30`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                                }}>{account.logo}</div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{account.institution}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{account.accountName} {account.accountMask}</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                                        ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#64748b' }}>{formatTimeAgo(account.lastSynced)}</div>
                                </div>
                                <button
                                    onClick={() => handleSync(account.id)}
                                    disabled={syncing === account.id}
                                    style={{
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 6, width: 28, height: 28, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: syncing === account.id ? '#00d4ff' : '#94a3b8', fontSize: 12,
                                    }}
                                >
                                    {syncing === account.id ? (
                                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}>↻</motion.span>
                                    ) : '↻'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Expand / Collapse */}
                {accounts.length > 2 && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{
                            width: '100%', padding: '10px', background: 'rgba(255,255,255,0.02)',
                            border: 'none', borderTop: '1px solid rgba(255,255,255,0.04)',
                            color: '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                    >{expanded ? 'Show Less ▲' : `Show All ${accounts.length} Accounts ▼`}</button>
                )}
            </div>

            {/* Link Account Modal */}
            <AnimatePresence>
                {showLinkModal && (
                    <LinkAccountModal onClose={() => setShowLinkModal(false)} onLink={handleLink} />
                )}
            </AnimatePresence>
        </>
    );
}
