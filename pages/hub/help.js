/* ═══════════════════════════════════════════════════════════════════════════
   HELP & SUPPORT PAGE — User assistance and FAQs
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const C = {
    bg: '#0a1628',
    card: '#1a2332',
    border: 'rgba(255,255,255,0.1)',
    text: '#fff',
    textSec: 'rgba(255,255,255,0.7)',
    accent: '#00D4FF',
};

export default function HelpPage() {
    const [expandedFaq, setExpandedFaq] = useState(null);

    const faqSections = [
        {
            title: 'Getting Started',
            questions: [
                {
                    q: 'How do I create an account?',
                    a: 'Click "Sign Up" on the homepage and enter your email, username, and password. You\'ll receive a verification email to activate your account.'
                },
                {
                    q: 'How do I customize my profile?',
                    a: 'Go to Settings → Account, then click "Edit Profile". You can update your avatar, bio, and display preferences.'
                },
                {
                    q: 'What is the Diamond economy?',
                    a: 'Diamonds are the premium currency on Smarter.Poker. Earn them through gameplay, achievements, or purchase them in the Diamond Store.'
                }
            ]
        },
        {
            title: 'Social Features',
            questions: [
                {
                    q: 'How do I add friends?',
                    a: 'Visit the Friends page, search for users by username, and send a friend request. They\'ll receive a notification to accept.'
                },
                {
                    q: 'How do I send messages?',
                    a: 'Open Messenger from the sidebar menu, select a contact, and start chatting. You can also send images and videos.'
                },
                {
                    q: 'Can I go live?',
                    a: 'Yes! Click the "Go Live" button on the social feed to start broadcasting. You can stream poker gameplay, tutorials, or just chat with the community.'
                }
            ]
        },
        {
            title: 'Training & Gameplay',
            questions: [
                {
                    q: 'What is GTO Training?',
                    a: 'Game Theory Optimal (GTO) training helps you learn mathematically sound poker strategies through interactive scenarios and AI-powered feedback.'
                },
                {
                    q: 'How do I join a tournament?',
                    a: 'Visit the Tournaments page, browse available events, and click "Register" on any tournament you want to join.'
                },
                {
                    q: 'What is the Diamond Arena?',
                    a: 'The Diamond Arena is our competitive poker room where you can play cash games and tournaments with other players for diamonds and XP.'
                }
            ]
        },
        {
            title: 'Account & Security',
            questions: [
                {
                    q: 'How do I change my password?',
                    a: 'Go to Settings → Account → Account Security, then click "Change Password". You\'ll receive a password reset email.'
                },
                {
                    q: 'Is two-factor authentication available?',
                    a: 'Two-factor authentication (2FA) is coming soon! This will add an extra layer of security to your account.'
                },
                {
                    q: 'How do I delete my account?',
                    a: 'Go to Settings → Data Export → Danger Zone. Please note that account deletion is permanent and cannot be undone.'
                }
            ]
        }
    ];

    return (
        <>
            <Head>
                <title>Help & Support — Smarter.Poker</title>
                <meta name="description" content="Get help and support for Smarter.Poker" />
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: C.bg,
                fontFamily: 'Inter, -apple-system, sans-serif',
                paddingBottom: 80,
            }}>
                {/* Header */}
                <UniversalHeader pageDepth={2} />

                {/* Page Title */}
                <div style={{
                    padding: '24px 20px',
                    borderBottom: `1px solid ${C.border}`,
                }}>
                    <h1 style={{
                        margin: 0,
                        fontSize: 28,
                        fontWeight: 700,
                        color: C.text,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                    }}>
                        <span>❓</span>
                        Help & Support
                    </h1>
                    <p style={{
                        margin: '8px 0 0',
                        color: C.textSec,
                        fontSize: 15,
                    }}>
                        Find answers to common questions and get support
                    </p>
                </div>

                {/* Quick Contact Cards */}
                <div style={{
                    padding: '20px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 16,
                }}>
                    <Link href="/hub/messenger" style={{
                        textDecoration: 'none',
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: 20,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        transition: 'all 0.2s ease',
                    }}>
                        <div style={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #0084ff, #0066cc)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 24,
                        }}>
                            💬
                        </div>
                        <div>
                            <div style={{ color: C.text, fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                                Live Chat Support
                            </div>
                            <div style={{ color: C.textSec, fontSize: 13 }}>
                                Message us directly
                            </div>
                        </div>
                    </Link>

                    <a href="mailto:support@smarter.poker" style={{
                        textDecoration: 'none',
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: 20,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        transition: 'all 0.2s ease',
                    }}>
                        <div style={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #00D4FF, #0088cc)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 24,
                        }}>
                            📧
                        </div>
                        <div>
                            <div style={{ color: C.text, fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                                Email Support
                            </div>
                            <div style={{ color: C.textSec, fontSize: 13 }}>
                                support@smarter.poker
                            </div>
                        </div>
                    </a>
                </div>

                {/* FAQ Sections */}
                <div style={{ padding: '0 20px 40px' }}>
                    <h2 style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: C.text,
                        marginBottom: 20,
                    }}>
                        Frequently Asked Questions
                    </h2>

                    {faqSections.map((section, sectionIdx) => (
                        <div key={sectionIdx} style={{ marginBottom: 32 }}>
                            <h3 style={{
                                fontSize: 18,
                                fontWeight: 600,
                                color: C.accent,
                                marginBottom: 16,
                            }}>
                                {section.title}
                            </h3>

                            {section.questions.map((faq, faqIdx) => {
                                const faqId = `${sectionIdx}-${faqIdx}`;
                                const isExpanded = expandedFaq === faqId;

                                return (
                                    <div
                                        key={faqIdx}
                                        style={{
                                            background: C.card,
                                            border: `1px solid ${C.border}`,
                                            borderRadius: 8,
                                            marginBottom: 12,
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <button
                                            onClick={() => setExpandedFaq(isExpanded ? null : faqId)}
                                            style={{
                                                width: '100%',
                                                padding: '16px 20px',
                                                background: 'none',
                                                border: 'none',
                                                color: C.text,
                                                fontSize: 15,
                                                fontWeight: 500,
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: 12,
                                            }}
                                        >
                                            <span>{faq.q}</span>
                                            <span style={{
                                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                transition: 'transform 0.2s ease',
                                                fontSize: 12,
                                            }}>
                                                ▼
                                            </span>
                                        </button>

                                        {isExpanded && (
                                            <div style={{
                                                padding: '0 20px 20px',
                                                color: C.textSec,
                                                fontSize: 14,
                                                lineHeight: 1.6,
                                                borderTop: `1px solid ${C.border}`,
                                                paddingTop: 16,
                                            }}>
                                                {faq.a}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Additional Resources */}
                <div style={{
                    padding: '0 20px 40px',
                }}>
                    <h2 style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: C.text,
                        marginBottom: 20,
                    }}>
                        Additional Resources
                    </h2>

                    <div style={{
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: 20,
                    }}>
                        <div style={{ marginBottom: 16 }}>
                            <Link href="/terms" style={{
                                color: C.accent,
                                textDecoration: 'none',
                                fontSize: 15,
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '12px 0',
                            }}>
                                <span>📄</span>
                                Terms of Service
                                <span style={{ marginLeft: 'auto', color: C.textSec }}>→</span>
                            </Link>
                        </div>
                        <div style={{ marginBottom: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                            <Link href="/privacy" style={{
                                color: C.accent,
                                textDecoration: 'none',
                                fontSize: 15,
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '12px 0',
                            }}>
                                <span>🔒</span>
                                Privacy Policy
                                <span style={{ marginLeft: 'auto', color: C.textSec }}>→</span>
                            </Link>
                        </div>
                        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                            <Link href="/hub/settings" style={{
                                color: C.accent,
                                textDecoration: 'none',
                                fontSize: 15,
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '12px 0',
                            }}>
                                <span>⚙️</span>
                                Account Settings
                                <span style={{ marginLeft: 'auto', color: C.textSec }}>→</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
