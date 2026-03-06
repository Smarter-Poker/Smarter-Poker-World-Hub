import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';

export default function OfficialRules() {
    return (
        <>
            <SEOHead
                title="Official Rules — Promotions & Contests"
                description="Official Rules For Smarter.Poker Promotions, Contests, And Giveaways."
                canonical="/legal/official-rules"
            />

            <div style={styles.container}>
                {/* Background Effects */}
                <div style={styles.backgroundGrid} />
                <div style={styles.glowEffect} />

                {/* Header */}
                <header style={styles.header}>
                    <Link href="/" style={styles.logo}>
                        <div style={styles.logoOrb} />
                        <span style={styles.logoText}>Smarter.Poker</span>
                    </Link>
                    <Link href="/terms" style={{ display: 'inline-block' }}>
                        <img src="/images/btn-back.png" alt="Back" style={{ height: 32 }}  loading="lazy" />
                    </Link>
                </header>

                {/* Main Content */}
                <main style={styles.main}>
                    <div style={styles.card}>
                        <div style={styles.content}>
                            <h1 style={styles.title}>Official Rules</h1>
                            <p style={styles.intro}>
                                Smarter.Poker Diamond Arena Sweepstakes & Promotional Rewards Program
                            </p>

                            {/* AMOE Banner */}
                            <div style={styles.amoeBox}>
                                <h2 style={styles.amoeTitle}>⚖️ NO PURCHASE NECESSARY</h2>
                                <p style={styles.amoeText}>
                                    A PURCHASE OR PAYMENT OF ANY KIND WILL NOT INCREASE YOUR CHANCES OF WINNING.
                                    VOID WHERE PROHIBITED BY LAW.
                                </p>
                            </div>

                            <h2 style={styles.heading}>1. Eligibility</h2>
                            <p style={styles.paragraph}>
                                The Smarter.Poker promotional rewards program ("Program") is open to legal residents
                                of the 50 United States who are at least 18 years of age at the time of entry.
                            </p>
                            <p style={styles.paragraph}>
                                <strong>Geographic Restrictions For Prize Redemption:</strong> Real-world prize
                                redemptions are <strong>VOID in Washington (WA), Idaho (ID), Michigan (MI),
                                    Nevada (NV), and California (CA)</strong>. Residents of these states may
                                participate in training and social features but are not eligible to redeem
                                Diamonds for cash-equivalent prizes.
                            </p>

                            <h2 style={styles.heading}>2. Platform Description</h2>
                            <p style={styles.paragraph}>
                                Smarter.Poker is a <strong>Social Training Platform</strong> available nationwide.
                                Users can access:
                            </p>
                            <ul style={styles.list}>
                                <li><strong>PokerIQ Training:</strong> GTO Strategy Lessons And Interactive Drills</li>
                                <li><strong>Social Features:</strong> Community Posts, Leaderboards, And Club Management</li>
                                <li><strong>AI Coaching:</strong> Personalized Leak Detection And Improvement Suggestions</li>
                                <li><strong>Diamond Economy:</strong> Virtual Currency Earned Through Skill And Activity</li>
                            </ul>
                            <p style={styles.paragraph}>
                                <em>"Train From Anywhere. Win Prizes Where Legal."</em>
                            </p>

                            <h2 style={styles.heading}>3. How To Enter</h2>

                            <h3 style={styles.subheading}>Free Entry Methods (AMOE)</h3>
                            <p style={styles.paragraph}>
                                You may earn Entry Diamonds without making any purchase:
                            </p>
                            <ul style={styles.list}>
                                <li><strong>Daily Login Streak:</strong> Log In Daily To Earn Free Entry Diamonds (up To 100/day)</li>
                                <li><strong>Training Completion:</strong> Complete GTO Training Modules To Earn Diamonds</li>
                                <li><strong>Social Tasks:</strong> Post, Share, And Engage With The Community</li>
                                <li><strong>Referral Program:</strong> Invite Friends To Earn Bonus Diamonds</li>
                                <li><strong>Leaderboard Ranking:</strong> Top Performers On Weekly Leaderboards Receive Diamond Bonuses</li>
                                <li><strong>Free Roll Hourly Tournaments:</strong> Enter The Diamond Arena Every Hour With <strong>ZERO Entry Fee</strong> — Winners Receive Diamond Prizes</li>
                            </ul>

                            <h3 style={styles.subheading}>Premium Features (Optional)</h3>
                            <p style={styles.paragraph}>
                                Optional premium purchases enhance your training experience but <strong>DO NOT</strong>
                                improve your chances of winning prizes. Premium features include cosmetic upgrades,
                                advanced analytics, and additional training content.
                            </p>

                            {/* MAIL-IN AMOE SECTION */}
                            <div style={styles.mailInBox}>
                                <h3 style={styles.mailInTitle}>📬 Mail-In Entry (AMOE)</h3>
                                <p style={styles.paragraph}>
                                    To receive free Entry Diamonds without using the platform, mail a handwritten
                                    3×5 index card to the address below:
                                </p>
                                <div style={styles.addressBlock}>
                                    <strong>Smarter.Poker AMOE Entry</strong><br />
                                    P.O. Box 12345<br />
                                    Chicago, IL 60601<br />
                                    United States
                                </div>
                                <p style={styles.paragraph}>
                                    <strong>Physical Standards:</strong>
                                </p>
                                <ul style={styles.list}>
                                    <li>Must Be A <strong>Handwritten 3×5 Index Card</strong></li>
                                    <li>Include: Your <strong>Full Legal Name</strong>, <strong>Email Address</strong>, And <strong>State Of Residence</strong></li>
                                    <li>Place The Card In A <strong>Hand-addressed #10 Envelope</strong> With A <strong>First-Class Stamp</strong></li>
                                    <li>No Photocopies, Mechanical Reproductions, Or Printed Labels Allowed</li>
                                </ul>
                                <p style={styles.paragraph}>
                                    <strong>Entry Limit:</strong> <strong>ONE (1)</strong> mail-in request per person per week.
                                </p>
                                <p style={styles.paragraph}>
                                    <strong>Reward:</strong> Each Valid Mail-in Entry Receives <strong>500 Entry Diamonds</strong> —
                                    equivalent to the maximum a player can earn in a day through free platform activity.
                                </p>
                                <p style={styles.paragraph}>
                                    <em>Mail-in entries have the same value as Diamonds earned through platform activity.
                                        This alternative method of entry ensures compliance with sweepstakes regulations
                                        in all 50 states.</em>
                                </p>
                            </div>

                            <h2 style={styles.heading}>4. Diamond Arena - Tiered Access</h2>

                            <h3 style={styles.subheading}>Full Access (Eligible States)</h3>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={styles.tableHeader}>
                                        <th style={styles.th}>Feature</th>
                                        <th style={styles.th}>Access Level</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>PokerIQ Hub</td>
                                        <td style={{ ...styles.td, color: '#00ff66' }}>✅ Full Access (Training + Rewards)</td>
                                    </tr>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>GTO Training</td>
                                        <td style={{ ...styles.td, color: '#00ff66' }}>✅ Full Access (Skill + Rewards)</td>
                                    </tr>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>Social Media</td>
                                        <td style={{ ...styles.td, color: '#00ff66' }}>✅ Full Integration</td>
                                    </tr>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>Diamond Arena</td>
                                        <td style={{ ...styles.td, color: '#00ff66' }}>✅ Prize Redemptions Enabled</td>
                                    </tr>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>Cash Out Prizes</td>
                                        <td style={{ ...styles.td, color: '#00ff66' }}>✅ Up To $1,100 Per Redemption</td>
                                    </tr>
                                </tbody>
                            </table>

                            <h3 style={styles.subheading}>Restricted States (WA, ID, MI, NV, CA)</h3>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={styles.tableHeader}>
                                        <th style={styles.th}>Feature</th>
                                        <th style={styles.th}>Access Level</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>PokerIQ Hub</td>
                                        <td style={{ ...styles.td, color: '#00ff66' }}>✅ ENABLED (Training/Study Only)</td>
                                    </tr>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>GTO Training</td>
                                        <td style={{ ...styles.td, color: '#00ff66' }}>✅ ENABLED (Skill Development)</td>
                                    </tr>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>Social Media</td>
                                        <td style={{ ...styles.td, color: '#00ff66' }}>✅ ENABLED (Posting/Sharing)</td>
                                    </tr>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>Diamond Arena</td>
                                        <td style={{ ...styles.td, color: '#ff4d4d' }}>❌ DISABLED (No Prize Entry)</td>
                                    </tr>
                                    <tr style={styles.tableRow}>
                                        <td style={styles.td}>Cash Out Prizes</td>
                                        <td style={{ ...styles.td, color: '#ff4d4d' }}>❌ BLOCKED (Physical Lock)</td>
                                    </tr>
                                </tbody>
                            </table>
                            <p style={styles.paragraph}>
                                <em>If you reside in a restricted state, your Diamonds remain active for in-world
                                    upgrades, leaderboard standing, and platform enhancements. Prize redemptions are
                                    not available in your region.</em>
                            </p>

                            <h2 style={styles.heading}>5. Prizes & Redemption</h2>
                            <p style={styles.paragraph}>
                                Eligible users may redeem Diamonds in the Diamond Store for:
                            </p>
                            <ul style={styles.list}>
                                <li><strong>Merchandise:</strong> Official Smarter.Poker Branded Apparel And Accessories</li>
                                <li><strong>Gift Cards:</strong> Digital Gift Cards For Popular Retailers (up To $100 Value)</li>
                                <li><strong>Platform Upgrades:</strong> Premium Cosmetics And Feature Unlocks</li>
                                <li><strong>Tournament Buy-Ins:</strong> Entry Into Partner Live Poker Events</li>
                            </ul>
                            <p style={styles.paragraph}>
                                Maximum prize value per redemption: <strong>$1,100</strong>. Annual prize limit per
                                user: <strong>$5,000</strong>. Winners may be required to complete a W-9 form for
                                tax purposes.
                            </p>

                            <h2 style={styles.heading}>6. Odds Of Winning</h2>
                            <p style={styles.paragraph}>
                                Diamond accumulation and prize eligibility are based solely on skill, activity,
                                and participation. The odds of accumulating sufficient Diamonds for prize
                                redemption depend on individual user engagement and performance on the Platform.
                            </p>

                            <h2 style={styles.heading}>7. Legal Compliance</h2>
                            <p style={styles.paragraph}>
                                This Program structure ensures compliance with all applicable state and federal laws:
                            </p>
                            <ul style={styles.list}>
                                <li><strong>Entertainment Shield:</strong> Training and social features operate as a
                                    Social Casino platform, legal entertainment in all 50 states</li>
                                <li><strong>Redemption Guard:</strong> Prize redemptions physically locked for
                                    residents of states where sweepstakes/promotional rewards are restricted</li>
                                <li><strong>Skill-Based Classification:</strong> Smarter.Poker is a skill-based
                                    training platform with an optional promotional sweepstakes layer for eligible users</li>
                                <li><strong>2026 Compliance:</strong> Structure addresses California AB 831 and
                                    similar state regulations by classification as "Skill-Based Training Platform
                                    with optional Promotional Sweepstakes"</li>
                            </ul>

                            <h2 style={styles.heading}>8. General Conditions</h2>
                            <ul style={styles.list}>
                                <li>Sponsor Reserves The Right To Modify, Suspend, Or Terminate The Program At Any Time</li>
                                <li>All Decisions By Sponsor Are Final And Binding</li>
                                <li>Prize Substitutions May Occur At Sponsor's Discretion</li>
                                <li>Participants Must Comply With All Platform Terms Of Service</li>
                                <li>Fraudulent Activity Will Result In Disqualification And Account Termination</li>
                            </ul>

                            <h2 style={styles.heading}>9. Sponsor Contact</h2>
                            <p style={styles.paragraph}>
                                <strong>Smarter.Poker</strong><br />
                                Email: <a href="mailto:support@smarter.poker" style={styles.link}>support@smarter.poker</a><br />
                                Website: <a href="https://smarter.poker" style={styles.link}>https://smarter.poker</a>
                            </p>

                            <h2 style={styles.heading}>10. Governing Law</h2>
                            <p style={styles.paragraph}>
                                This Program is governed by the laws of the State of Illinois, without regard to
                                conflict of law principles. Any disputes arising from this Program shall be
                                resolved in the state or federal courts located in Cook County, Illinois.
                            </p>
                        </div>

                        {/* Footer */}
                        <div style={styles.footer}>
                            <p style={styles.lastUpdated}>Last Updated: January 12, 2026 (v2.0)</p>
                            <p style={styles.contact}>
                                Questions? Contact us at{' '}
                                <a href="mailto:support@smarter.poker" style={styles.link}>
                                    support@smarter.poker
                                </a>
                            </p>
                        </div>
                    </div>
                </main>
            </div>

            <style jsx global>{`
                * {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }
                html, body {
                    background: #0a1628;
                    color: #e0e0e0;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    min-height: 100vh;
                }
                a {
                    text-decoration: none;
                }
                ::selection {
                    background: rgba(0, 212, 255, 0.3);
                }
            `}</style>
        </>
    );
}

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
    },
    backgroundGrid: {
        position: 'fixed',
        inset: 0,
        backgroundImage: `
            linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        pointerEvents: 'none',
        zIndex: 0,
    },
    glowEffect: {
        position: 'fixed',
        top: '-20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '80%',
        height: '50%',
        background: 'radial-gradient(ellipse, rgba(0,212,255,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
    },
    header: {
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 48px',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
    },
    logo: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        textDecoration: 'none',
    },
    logoOrb: {
        width: '40px',
        height: '40px',
        borderRadius: '8px',
        background: 'linear-gradient(135deg, #0a1628, #1a2a4a)',
        border: '2px solid #00D4FF',
        boxShadow: '0 0 20px rgba(0,212,255,0.5)',
    },
    logoText: {
        fontSize: '24px',
        fontWeight: '700',
        color: '#fff',
    },
    backButton: {
        padding: '10px 20px',
        background: 'rgba(0,212,255,0.1)',
        border: '1px solid rgba(0,212,255,0.3)',
        borderRadius: '8px',
        color: '#00D4FF',
        fontSize: '14px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    main: {
        position: 'relative',
        zIndex: 10,
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '40px 24px',
    },
    card: {
        background: 'rgba(10, 22, 40, 0.8)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(0,212,255,0.2)',
        overflow: 'hidden',
    },
    content: {
        padding: '40px',
        maxHeight: '80vh',
        overflowY: 'auto',
    },
    title: {
        fontSize: '32px',
        fontWeight: '700',
        color: '#00D4FF',
        marginBottom: '16px',
        letterSpacing: '-0.02em',
    },
    intro: {
        fontSize: '16px',
        lineHeight: '1.7',
        color: 'rgba(255,255,255,0.7)',
        marginBottom: '32px',
        paddingBottom: '24px',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
    },
    amoeBox: {
        marginBottom: '32px',
        padding: '24px',
        background: 'rgba(0,212,255,0.1)',
        border: '2px solid #00D4FF',
        borderRadius: '12px',
        textAlign: 'center',
    },
    amoeTitle: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#00D4FF',
        marginBottom: '12px',
    },
    amoeText: {
        fontSize: '14px',
        lineHeight: '1.7',
        color: 'rgba(255,255,255,0.9)',
    },
    heading: {
        fontSize: '20px',
        fontWeight: '600',
        color: '#fff',
        marginTop: '32px',
        marginBottom: '12px',
    },
    subheading: {
        fontSize: '16px',
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        marginTop: '20px',
        marginBottom: '10px',
    },
    paragraph: {
        fontSize: '15px',
        lineHeight: '1.8',
        color: 'rgba(255,255,255,0.7)',
        marginBottom: '16px',
    },
    list: {
        marginLeft: '24px',
        marginBottom: '16px',
        listStyle: 'disc',
        color: 'rgba(255,255,255,0.7)',
        fontSize: '15px',
        lineHeight: '2',
    },
    link: {
        color: '#00D4FF',
        textDecoration: 'underline',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        marginBottom: '20px',
        marginTop: '12px',
    },
    tableHeader: {
        background: 'rgba(0,212,255,0.1)',
    },
    th: {
        padding: '12px 16px',
        textAlign: 'left',
        borderBottom: '1px solid rgba(0,212,255,0.2)',
        color: '#00D4FF',
        fontWeight: '600',
        fontSize: '14px',
    },
    tableRow: {
        borderBottom: '1px solid rgba(255,255,255,0.1)',
    },
    td: {
        padding: '12px 16px',
        fontSize: '14px',
        color: 'rgba(255,255,255,0.8)',
    },
    footer: {
        padding: '24px 40px',
        background: 'rgba(0,0,0,0.2)',
        borderTop: '1px solid rgba(0,212,255,0.1)',
        textAlign: 'center',
    },
    lastUpdated: {
        fontSize: '13px',
        color: 'rgba(255,255,255,0.4)',
        marginBottom: '8px',
    },
    contact: {
        fontSize: '14px',
        color: 'rgba(255,255,255,0.6)',
    },
    // MAIL-IN AMOE STYLES
    mailInBox: {
        marginTop: '24px',
        marginBottom: '24px',
        padding: '24px',
        background: 'rgba(0, 255, 102, 0.05)',
        border: '1px solid rgba(0, 255, 102, 0.3)',
        borderRadius: '12px',
    },
    mailInTitle: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#00ff66',
        marginBottom: '12px',
    },
    addressBlock: {
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: '8px',
        marginBottom: '16px',
        fontFamily: 'monospace',
        fontSize: '14px',
        lineHeight: '1.8',
        color: 'rgba(255, 255, 255, 0.9)',
    },
};
