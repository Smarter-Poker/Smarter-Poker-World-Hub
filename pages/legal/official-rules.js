import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { hubCollectionSchema } from '../../src/lib/seo/hubPageSchema';

// AEO phase 3 (2026-09-17): this page had copy and no structured data.
const RULES_SCHEMA = hubCollectionSchema({
  path: '/legal/official-rules',
  name: 'Official Rules | Smarter.Poker',
  description:
    'The Official Rules For Smarter.Poker Promotions, Contests And Giveaways: Who May Enter, How Winners Are Chosen, And That Every Prize Is A Promotional Rewards Currency With No Cash Value.',
  trail: [['Official Rules', '/legal/official-rules']],
});

export default function OfficialRules() {
    return (
        <>
            <SEOHead
                title="Official Rules - Promotions & Contests"
                description="The Official Rules For Smarter.Poker Promotions, Contests And Giveaways: Who May Enter, How Winners Are Chosen, What Is Awarded, And The Fact That Every Prize Is A Promotional Rewards Currency With No Cash Value."
                canonical="/legal/official-rules"
              jsonLd={RULES_SCHEMA}
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
                                The Smarter.Poker Promotional Rewards Program ("Program") Is Open To Legal Residents
                                Of The 50 United States Who Are At Least 18 Years Of Age At The Time Of Entry.
                            </p>
                            <p style={styles.paragraph}>
                                <strong>Geographic Restrictions For Prize Redemption:</strong> Real-World Prize
                                Redemptions Are <strong>VOID In Washington (WA), Idaho (ID), Michigan (MI),
                                    Nevada (NV), And California (CA)</strong>. Residents Of These States May
                                Participate In Training And Social Features But Are Not Eligible To Redeem
                                Diamonds For Cash-Equivalent Prizes.
                            </p>

                            <h2 style={styles.heading}>2. Platform Description</h2>
                            <p style={styles.paragraph}>
                                Smarter.Poker Is A <strong>Social Training Platform</strong> Available Nationwide.
                                Users Can Access:
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
                                You May Earn Entry Diamonds Without Making Any Purchase:
                            </p>
                            <ul style={styles.list}>
                                <li><strong>Daily Login Streak:</strong> Log In Daily To Earn Free Entry Diamonds (Up To 100/Day)</li>
                                <li><strong>Training Completion:</strong> Complete GTO Training Modules To Earn Diamonds</li>
                                <li><strong>Social Tasks:</strong> Post, Share, And Engage With The Community</li>
                                <li><strong>Referral Program:</strong> Invite Friends To Earn Bonus Diamonds</li>
                                <li><strong>Leaderboard Ranking:</strong> Top Performers On Weekly Leaderboards Receive Diamond Bonuses</li>
                                <li><strong>Free Roll Hourly Tournaments:</strong> Enter The Diamond Arena Every Hour With <strong>ZERO Entry Fee</strong> - Winners Receive Diamond Prizes</li>
                            </ul>

                            <h3 style={styles.subheading}>Premium Features (Optional)</h3>
                            <p style={styles.paragraph}>
                                Optional Premium Purchases Enhance Your Training Experience But <strong>DO NOT</strong>
                                Improve Your Chances Of Winning Prizes. Premium Features Include Cosmetic Upgrades,
                                Advanced Analytics, And Additional Training Content.
                            </p>

                            {/* MAIL-IN AMOE SECTION */}
                            <div style={styles.mailInBox}>
                                <h3 style={styles.mailInTitle}>📬 Mail-In Entry (AMOE)</h3>
                                <p style={styles.paragraph}>
                                    To Receive Free Entry Diamonds Without Using The Platform, Mail A Handwritten
                                    3×5 Index Card To The Address Below:
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
                                    <li>Place The Card In A <strong>Hand-Addressed #10 Envelope</strong> With A <strong>First-Class Stamp</strong></li>
                                    <li>No Photocopies, Mechanical Reproductions, Or Printed Labels Allowed</li>
                                </ul>
                                <p style={styles.paragraph}>
                                    <strong>Entry Limit:</strong> <strong>ONE (1)</strong> Mail-In Request Per Person Per Week.
                                </p>
                                <p style={styles.paragraph}>
                                    <strong>Reward:</strong> Each Valid Mail-In Entry Receives <strong>500 Entry Diamonds</strong> -
                                    Equivalent To The Maximum A Player Can Earn In A Day Through Free Platform Activity.
                                </p>
                                <p style={styles.paragraph}>
                                    <em>Mail-In Entries Have The Same Value As Diamonds Earned Through Platform Activity.
                                        This Alternative Method Of Entry Ensures Compliance With Sweepstakes Regulations
                                        In All 50 States.</em>
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
                                <em>If You Reside In A Restricted State, Your Diamonds Remain Active For In-World
                                    Upgrades, Leaderboard Standing, And Platform Enhancements. Prize Redemptions Are
                                    Not Available In Your Region.</em>
                            </p>

                            <h2 style={styles.heading}>5. Prizes & Redemption</h2>
                            <p style={styles.paragraph}>
                                Eligible Users May Redeem Diamonds In The Diamond Store For:
                            </p>
                            <ul style={styles.list}>
                                <li><strong>Merchandise:</strong> Official Smarter.Poker Branded Apparel And Accessories</li>
                                <li><strong>Gift Cards:</strong> Digital Gift Cards For Popular Retailers (Up To $100 Value)</li>
                                <li><strong>Platform Upgrades:</strong> Premium Cosmetics And Feature Unlocks</li>
                                <li><strong>Tournament Buy-Ins:</strong> Entry Into Partner Live Poker Events</li>
                            </ul>
                            <p style={styles.paragraph}>
                                Maximum Prize Value Per Redemption: <strong>$1,100</strong>. Annual Prize Limit Per
                                User: <strong>$5,000</strong>. Winners May Be Required To Complete A W-9 Form For
                                Tax Purposes.
                            </p>

                            <h2 style={styles.heading}>6. Odds Of Winning</h2>
                            <p style={styles.paragraph}>
                                Diamond Accumulation And Prize Eligibility Are Based Solely On Skill, Activity,
                                And Participation. The Odds Of Accumulating Sufficient Diamonds For Prize
                                Redemption Depend On Individual User Engagement And Performance On The Platform.
                            </p>

                            <h2 style={styles.heading}>7. Legal Compliance</h2>
                            <p style={styles.paragraph}>
                                This Program Structure Ensures Compliance With All Applicable State And Federal Laws:
                            </p>
                            <ul style={styles.list}>
                                <li><strong>Entertainment Shield:</strong> Training And Social Features Operate As A
                                    Social Casino Platform, Legal Entertainment In All 50 States</li>
                                <li><strong>Redemption Guard:</strong> Prize Redemptions Physically Locked For
                                    Residents Of States Where Sweepstakes/Promotional Rewards Are Restricted</li>
                                <li><strong>Skill-Based Classification:</strong> Smarter.Poker Is A Skill-Based
                                    Training Platform With An Optional Promotional Sweepstakes Layer For Eligible Users</li>
                                <li><strong>2026 Compliance:</strong> Structure Addresses California AB 831 And
                                    Similar State Regulations By Classification As "Skill-Based Training Platform
                                    With Optional Promotional Sweepstakes"</li>
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
                                Email: <a href="mailto:support@smarter.poker" style={styles.link}>Support@Smarter.Poker</a><br />
                                Website: <a href="https://smarter.poker" style={styles.link}>Https://Smarter.Poker</a>
                            </p>

                            <h2 style={styles.heading}>10. Governing Law</h2>
                            <p style={styles.paragraph}>
                                This Program Is Governed By The Laws Of The State Of Illinois, Without Regard To
                                Conflict Of Law Principles. Any Disputes Arising From This Program Shall Be
                                Resolved In The State Or Federal Courts Located In Cook County, Illinois.
                            </p>
                        </div>

                        {/* Footer */}
                        <div style={styles.footer}>
                            <p style={styles.lastUpdated}>Last Updated: January 12, 2026 (V2.0)</p>
                            <p style={styles.contact}>
                                Questions? Contact Us at{' '}
                                <a href="mailto:support@smarter.poker" style={styles.link}>
                                    Support@Smarter.Poker
                                </a>
                            </p>
                        </div>
                    </div>
                </main>
            </div>

            <style>{`
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
