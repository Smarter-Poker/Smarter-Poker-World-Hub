import React from 'react';
import { VIPCard } from '../store/StoreCards';
import { VIP_MEMBERSHIP, VIP_BENEFITS } from '../../data/diamondStoreData';
import styles from './diamondStoreStyles';

export default function VIPTab({ selectedVIP, setSelectedVIP, handleVIPSubscribe, isProcessing }) {
    return (
        <>

                            <>

                                {/* VIP Plan Selection */}
                                <div style={styles.vipPlansRow}>
                                    <VIPCard
                                        plan={VIP_MEMBERSHIP.daily}
                                        isSelected={selectedVIP === 'vip-daily'}
                                        onSelect={setSelectedVIP}
                                    />
                                    <VIPCard
                                        plan={VIP_MEMBERSHIP.monthly}
                                        isSelected={selectedVIP === 'vip-monthly'}
                                        onSelect={setSelectedVIP}
                                    />
                                    <VIPCard
                                        plan={VIP_MEMBERSHIP.annual}
                                        isSelected={selectedVIP === 'vip-annual'}
                                        onSelect={setSelectedVIP}
                                    />
                                </div>

                                {/* Subscribe Button — Metallic Image */}
                                <div style={styles.vipSubscribeSection}>
                                    <div
                                        onClick={handleVIPSubscribe}
                                        style={{
                                            cursor: isProcessing ? 'wait' : 'pointer',
                                            opacity: isProcessing ? 0.6 : 1,
                                            transition: 'transform 0.15s ease, filter 0.15s ease',
                                            display: 'inline-block',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.filter = 'brightness(1.15)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
                                    >
                                        <img
                                            src="/images/subscribe-button.png"
                                            alt={isProcessing ? 'Processing...' : 'Subscribe For $19.99 A Month'}
                                            style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}
                                            draggable={false}
                                            loading="lazy" />
                                    </div>

                                </div>

                                {/* VIP Benefits Table */}
                                <div style={styles.benefitsSection}>
                                    <h3 style={styles.benefitsTitle}>Everything Included With VIP</h3>

                                    {/* Smarter.Poker Platform */}
                                    <div style={styles.benefitsCategoryHeader}>
                                        <span style={styles.benefitsCategoryLabel}>Smarter.Poker Platform</span>
                                    </div>
                                    <div style={styles.benefitsGrid}>
                                        {VIP_BENEFITS.filter(b => b.category === 'Smarter.Poker').map((benefit, idx) => (
                                            <div key={idx} style={styles.benefitCard}>
                                                <div style={styles.benefitInfo}>
                                                    <div style={styles.benefitTitle}>{benefit.title}</div>
                                                    <div style={styles.benefitDesc}>{benefit.description}</div>
                                                </div>
                                                <div style={styles.benefitValue}>{benefit.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Club & Diamond Arena Features */}
                                    <div style={styles.benefitsCategoryHeader}>
                                        <span style={styles.benefitsCategoryLabel}>Club & Diamond Arena Features</span>
                                    </div>
                                    <div style={styles.benefitsGrid}>
                                        {VIP_BENEFITS.filter(b => b.category === 'Club & Diamond Arena').map((benefit, idx) => (
                                            <div key={idx} style={styles.benefitCard}>
                                                <div style={styles.benefitInfo}>
                                                    <div style={styles.benefitTitle}>{benefit.title}</div>
                                                    <div style={styles.benefitDesc}>{benefit.description}</div>
                                                </div>
                                                <div style={styles.benefitValue}>{benefit.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* View in Marketplace Link */}
                                <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 32 }}>
                                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                                <a
                                        href="/hub/diamond-store?tab=merch"
                                        onClick={(e) => { e.preventDefault(); setActiveTab('merch'); }}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            color: '#FFD700',
                                            fontSize: 16,
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            cursor: 'pointer',
                                            padding: '12px 24px',
                                            borderRadius: 12,
                                            background: 'rgba(255, 215, 0, 0.08)',
                                            border: '1px solid rgba(255, 215, 0, 0.2)',
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 215, 0, 0.15)'; e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.4)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 215, 0, 0.08)'; e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.2)'; }}
                                    >
                                        View in Marketplace <span style={{ fontSize: 18 }}>→</span>
                                    </a>
                                </div>

                                {/* ─── Frequently Asked Questions ─── */}
                                <div style={{
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: 16,
                                    padding: '28px 24px',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                }}>
                                    <h3 style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: '#FFFFFF',
                                        marginBottom: 20,
                                        textAlign: 'center',
                                    }}>Frequently Asked Questions</h3>

                                    {[
                                        { q: 'Can I cancel anytime?', a: 'Yes! You can cancel your VIP membership at any time. Your benefits will remain active until the end of your current billing period.' },
                                        { q: 'What happens when my diamond VIP expires?', a: 'When your VIP membership expires, you\'ll revert to the free tier. Any diamonds you\'ve earned are yours to keep, but VIP-exclusive features will become locked.' },
                                        { q: 'Do I keep my bonus diamonds?', a: 'Yes! All diamonds credited to your account — including monthly VIP bonuses — are permanently yours, even after your membership ends.' },
                                        { q: 'Can I switch between monthly and annual?', a: 'Absolutely. You can switch plans at any time. If upgrading to annual, you\'ll receive a prorated credit for your remaining monthly period.' },
                                        { q: 'What payment methods are accepted?', a: 'We accept all major credit and debit cards, Apple Pay, Google Pay, and select crypto options through our secure payment processor.' },
                                    ].map((faq, idx) => (
                                        <details key={idx} style={{
                                            borderBottom: idx < 4 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                                            paddingBottom: 0,
                                        }}>
                                            <summary style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '16px 0',
                                                cursor: 'pointer',
                                                fontSize: 15,
                                                fontWeight: 600,
                                                color: '#E4E6EB',
                                                listStyle: 'none',
                                            }}>
                                                {faq.q}
                                                <span style={{ color: '#B0B3B8', fontSize: 18, marginLeft: 12, flexShrink: 0 }}>▾</span>
                                            </summary>
                                            <p style={{
                                                padding: '0 0 16px 0',
                                                margin: 0,
                                                fontSize: 14,
                                                lineHeight: 1.6,
                                                color: '#B0B3B8',
                                            }}>{faq.a}</p>
                                        </details>
                                    ))}
                                </div>

                            </>
                        
        </>
    );
}