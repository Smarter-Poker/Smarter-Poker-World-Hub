import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

export default function TermsOfService() {
    const [activeSection, setActiveSection] = useState('terms');

    const sections = [
        { id: 'terms', label: 'Terms of Service' },
        { id: 'privacy', label: 'Privacy Policy' },
        { id: 'sms', label: 'SMS & Communications' },
        { id: 'gaming', label: 'Gaming Policy' },
    ];

    return (
        <>
            <Head>
                <title>Terms of Service | Smarter.Poker</title>
                <meta name="description" content="Terms of Service, Privacy Policy, and SMS consent for Smarter.Poker - GTO poker training platform" />
            </Head>

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
                    <Link href="/auth/signup" style={styles.backButton}>
                        ← Back to Signup
                    </Link>
                </header>

                {/* Main Content */}
                <main style={styles.main}>
                    <div style={styles.card}>
                        {/* Navigation Tabs */}
                        <nav style={styles.tabNav}>
                            {sections.map((section) => (
                                <button
                                    key={section.id}
                                    onClick={() => setActiveSection(section.id)}
                                    style={{
                                        ...styles.tab,
                                        ...(activeSection === section.id ? styles.activeTab : {}),
                                    }}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </nav>

                        {/* Content Area */}
                        <div style={styles.content}>
                            {activeSection === 'terms' && <TermsSection />}
                            {activeSection === 'privacy' && <PrivacySection />}
                            {activeSection === 'sms' && <SMSSection />}
                            {activeSection === 'gaming' && <GamingSection />}
                        </div>

                        {/* Footer */}
                        <div style={styles.footer}>
                            <p style={styles.lastUpdated}>Last Updated: January 11, 2026</p>
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

// Terms of Service Section
function TermsSection() {
    return (
        <div style={styles.section}>
            <h1 style={styles.title}>Terms of Service</h1>
            <p style={styles.intro}>
                Welcome to Smarter.Poker. By accessing or using our platform, you agree to be bound by these Terms of Service.
            </p>

            <h2 style={styles.heading}>1. Acceptance of Terms</h2>
            <p style={styles.paragraph}>
                By creating an account, accessing, or using Smarter.Poker ("the Platform"), you acknowledge that you have read,
                understood, and agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms,
                you may not access or use the Platform.
            </p>

            <h2 style={styles.heading}>2. Eligibility</h2>
            <p style={styles.paragraph}>
                You must be at least 18 years of age to use Smarter.Poker. By using the Platform, you represent and warrant
                that you are at least 18 years old and have the legal capacity to enter into these Terms. The Platform is
                intended for educational purposes only and does not involve real-money gambling.
            </p>

            <h2 style={styles.heading}>3. Account Registration</h2>
            <p style={styles.paragraph}>
                To access certain features, you must register for an account. You agree to provide accurate, current, and
                complete information during registration and to update such information to keep it accurate. You are
                responsible for safeguarding your account credentials and for all activities under your account.
            </p>
            <ul style={styles.list}>
                <li>You will receive a unique Player Number upon registration</li>
                <li>Your Poker Alias must be appropriate and not impersonate others</li>
                <li>One account per person is permitted</li>
                <li>Account sharing is prohibited</li>
            </ul>

            <h2 style={styles.heading}>4. Platform Services</h2>
            <p style={styles.paragraph}>
                Smarter.Poker provides poker training and educational services, including but not limited to:
            </p>
            <ul style={styles.list}>
                <li><strong>PokerIQ:</strong> Interactive GTO training and quizzes</li>
                <li><strong>Diamond Arena:</strong> Competitive training challenges</li>
                <li><strong>Club Arena:</strong> Community features and club management</li>
                <li><strong>Hand History Analysis:</strong> Review and improvement tools</li>
            </ul>

            <h2 style={styles.heading}>5. Virtual Currency (Diamonds)</h2>
            <p style={styles.paragraph}>
                The Platform uses virtual currency called "Diamonds" for in-platform activities. Diamonds have no direct
                cash value and cannot be exchanged for cash. However, Diamonds can be transferred between users and
                redeemed in our Diamond Store for merchandise, gift cards, platform upgrades, and tournament buy-ins.
                We reserve the right to modify, suspend, or discontinue any virtual currency features at any time.
            </p>

            <h2 style={styles.heading}>6. User Conduct</h2>
            <p style={styles.paragraph}>You agree not to:</p>
            <ul style={styles.list}>
                <li>Use the Platform for any unlawful purpose</li>
                <li>Attempt to gain unauthorized access to any part of the Platform</li>
                <li>Use automated systems or bots to access the Platform</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Share or distribute copyrighted training content</li>
                <li>Manipulate leaderboards or competitive features</li>
            </ul>

            <h2 style={styles.heading}>7. Intellectual Property</h2>
            <p style={styles.paragraph}>
                All content, features, and functionality of the Platform are owned by Smarter.Poker and are protected by
                copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, or create
                derivative works without our express written consent.
            </p>

            <h2 style={styles.heading}>8. Termination</h2>
            <p style={styles.paragraph}>
                We reserve the right to suspend or terminate your account at any time for violation of these Terms or for
                any other reason at our sole discretion. Upon termination, your right to use the Platform will immediately
                cease, and any virtual currency or progress may be forfeited.
            </p>

            <h2 style={styles.heading}>9. Disclaimer of Warranties</h2>
            <p style={styles.paragraph}>
                THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE THAT USING OUR
                TRAINING WILL RESULT IN IMPROVED POKER PERFORMANCE OR FINANCIAL GAIN.
            </p>

            <h2 style={styles.heading}>10. Limitation of Liability</h2>
            <p style={styles.paragraph}>
                IN NO EVENT SHALL SMARTER.POKER BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES ARISING OUT OF YOUR USE OF THE PLATFORM.
            </p>

            <h2 style={styles.heading}>11. Governing Law</h2>
            <p style={styles.paragraph}>
                These Terms shall be governed by and construed in accordance with the laws of the State of Illinois,
                without regard to conflict of law principles.
            </p>

            <h2 style={styles.heading}>12. Changes to Terms</h2>
            <p style={styles.paragraph}>
                We reserve the right to modify these Terms at any time. We will notify you of any material changes via
                email or through the Platform. Your continued use of the Platform after such modifications constitutes
                your acceptance of the updated Terms.
            </p>
        </div>
    );
}

// Privacy Policy Section
function PrivacySection() {
    return (
        <div style={styles.section}>
            <h1 style={styles.title}>Privacy Policy</h1>
            <p style={styles.intro}>
                Your privacy is important to us. This Privacy Policy explains how we collect, use, and protect your information.
            </p>

            <h2 style={styles.heading}>1. Information We Collect</h2>
            <h3 style={styles.subheading}>Personal Information</h3>
            <ul style={styles.list}>
                <li><strong>Account Data:</strong> Full name, email address, phone number, city, state</li>
                <li><strong>Profile Data:</strong> Poker alias, player number, skill tier</li>
                <li><strong>Usage Data:</strong> Training progress, quiz scores, XP earned</li>
            </ul>

            <h3 style={styles.subheading}>Automatically Collected Information</h3>
            <ul style={styles.list}>
                <li>Device information and browser type</li>
                <li>IP address and location data</li>
                <li>Session duration and interaction patterns</li>
                <li>Cookies and similar tracking technologies</li>
            </ul>

            <h2 style={styles.heading}>2. How We Use Your Information</h2>
            <ul style={styles.list}>
                <li>Provide and improve our training services</li>
                <li>Personalize your learning experience</li>
                <li>Send account-related communications</li>
                <li>Process transactions and maintain records</li>
                <li>Analyze usage patterns to enhance the Platform</li>
                <li>Prevent fraud and enforce our Terms</li>
                <li>Send promotional content (with your consent)</li>
            </ul>

            <h2 style={styles.heading}>3. Information Sharing</h2>
            <p style={styles.paragraph}>
                We do not sell your personal information. We may share information with:
            </p>
            <ul style={styles.list}>
                <li><strong>Service Providers:</strong> Third parties who help us operate the Platform</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                <li><strong>Business Transfers:</strong> In connection with a merger or acquisition</li>
            </ul>

            <h2 style={styles.heading}>4. Data Security</h2>
            <p style={styles.paragraph}>
                We implement industry-standard security measures to protect your information, including encryption,
                secure servers, and regular security audits. However, no method of transmission over the Internet
                is 100% secure.
            </p>

            <h2 style={styles.heading}>5. Your Rights</h2>
            <p style={styles.paragraph}>You have the right to:</p>
            <ul style={styles.list}>
                <li>Access your personal information</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Opt-out of marketing communications</li>
                <li>Export your data in a portable format</li>
            </ul>

            <h2 style={styles.heading}>6. Data Retention</h2>
            <p style={styles.paragraph}>
                We retain your information for as long as your account is active or as needed to provide services.
                We may retain certain information as required by law or for legitimate business purposes.
            </p>

            <h2 style={styles.heading}>7. Children's Privacy</h2>
            <p style={styles.paragraph}>
                The Platform is not intended for users under 18 years of age. We do not knowingly collect information
                from children. If we learn we have collected information from a child, we will delete it promptly.
            </p>

            <h2 style={styles.heading}>8. Contact Us</h2>
            <p style={styles.paragraph}>
                For privacy-related inquiries, contact us at{' '}
                <a href="mailto:support@smarter.poker" style={styles.link}>support@smarter.poker</a>
            </p>
        </div>
    );
}

// SMS & Communications Section
function SMSSection() {
    return (
        <div style={styles.section}>
            <h1 style={styles.title}>SMS & Communications Consent</h1>
            <p style={styles.intro}>
                By providing your phone number and signing up for Smarter.Poker, you consent to receive text messages
                and other communications from us as described below.
            </p>

            <h2 style={styles.heading}>1. Consent to Receive Messages</h2>
            <p style={styles.paragraph}>
                By providing your mobile phone number during registration or at any other time, you expressly consent
                to receive the following types of text messages (SMS) and other electronic communications from
                Smarter.Poker:
            </p>
            <ul style={styles.list}>
                <li><strong>Verification Codes:</strong> One-time passwords (OTP) for account verification and security</li>
                <li><strong>Account Alerts:</strong> Important notifications about your account status and security</li>
                <li><strong>Service Updates:</strong> Information about platform changes, maintenance, and new features</li>
                <li><strong>Training Reminders:</strong> Optional reminders about your training goals and streaks</li>
                <li><strong>Promotional Messages:</strong> Special offers and updates (with separate opt-in)</li>
            </ul>

            <h2 style={styles.heading}>2. Message Frequency</h2>
            <p style={styles.paragraph}>
                Message frequency varies based on your account activity. Verification codes are sent only when you
                initiate a sign-in or security action. You may receive up to 5 account-related messages per month.
                Promotional messages (if opted-in) will not exceed 4 messages per month.
            </p>

            <h2 style={styles.heading}>3. Standard Message and Data Rates</h2>
            <p style={styles.paragraph}>
                <strong>Message and data rates may apply.</strong> Your mobile carrier's standard messaging and data
                rates will apply to any messages you send or receive. Smarter.Poker is not responsible for any
                charges incurred from your mobile carrier.
            </p>

            <h2 style={styles.heading}>4. How to Opt-Out</h2>
            <p style={styles.paragraph}>
                You can opt-out of receiving text messages at any time by:
            </p>
            <ul style={styles.list}>
                <li>Replying <strong>STOP</strong> to any message you receive from us</li>
                <li>Updating your communication preferences in your account settings</li>
                <li>Contacting us at <a href="mailto:support@smarter.poker" style={styles.link}>support@smarter.poker</a></li>
            </ul>
            <p style={styles.paragraph}>
                <strong>Note:</strong> Opting out of promotional messages will not affect transactional messages
                such as verification codes and critical account alerts, which are necessary for platform security.
            </p>

            <h2 style={styles.heading}>5. Help and Support</h2>
            <p style={styles.paragraph}>
                For assistance with SMS messages, you can:
            </p>
            <ul style={styles.list}>
                <li>Reply <strong>HELP</strong> to any message for support information</li>
                <li>Email us at <a href="mailto:support@smarter.poker" style={styles.link}>support@smarter.poker</a></li>
                <li>Visit our Help Center at <a href="https://smarter.poker/help" style={styles.link}>smarter.poker/help</a></li>
            </ul>

            <h2 style={styles.heading}>6. Carrier Disclaimer</h2>
            <p style={styles.paragraph}>
                Carriers are not liable for delayed or undelivered messages. We work with major carriers to ensure
                reliable message delivery, but cannot guarantee delivery due to factors outside our control.
            </p>

            <h2 style={styles.heading}>7. Privacy</h2>
            <p style={styles.paragraph}>
                Your phone number and messaging activity are protected under our Privacy Policy. We do not share your
                phone number with third parties for marketing purposes. Phone numbers are used solely for the purposes
                described in this consent.
            </p>

            <div style={styles.consentBox}>
                <h3 style={styles.consentTitle}>📱 Your Consent</h3>
                <p style={styles.consentText}>
                    By signing up for Smarter.Poker and providing your phone number, you acknowledge that you have read
                    and agree to this SMS & Communications Consent. You understand that:
                </p>
                <ul style={styles.consentList}>
                    <li>Consent is not a condition of purchase</li>
                    <li>You can opt-out at any time by texting STOP</li>
                    <li>Message and data rates may apply</li>
                    <li>Message frequency varies</li>
                </ul>
            </div>
        </div>
    );
}

// Gaming Policy Section
function GamingSection() {
    return (
        <div style={styles.section}>
            <h1 style={styles.title}>Gaming & Fair Play Policy</h1>
            <p style={styles.intro}>
                Smarter.Poker is committed to providing a fair, educational, and enjoyable experience for all users.
                This policy outlines our "Skill-Access, Prize-Lock" dual infrastructure for compliance across all jurisdictions.
            </p>

            <h2 style={styles.heading}>1. Educational Purpose & Platform Nature</h2>
            <p style={styles.paragraph}>
                Smarter.Poker is an <strong>educational poker training platform</strong> (also known as a "Social Casino"
                for entertainment and skill development). All games, challenges, and competitions on the Platform are
                for entertainment and educational purposes only. No real money is wagered, and no real money can be
                won or lost through the Platform.
            </p>
            <p style={styles.paragraph}>
                <strong>Train from anywhere. Win prizes where legal.</strong> Users in all 50 states can sign up
                and access our training, social, and AI-powered coaching features. Real-world prize redemptions
                are strictly limited to eligible jurisdictions.
            </p>

            <h2 style={styles.heading}>2. Tiered Access System</h2>
            <p style={styles.paragraph}>
                Smarter.Poker operates a <strong>"Skill-Access, Prize-Lock"</strong> infrastructure. Users in
                certain states have restricted access to prize redemption features while maintaining full access
                to all training and social features.
            </p>

            <h3 style={styles.subheading}>Full Access States</h3>
            <p style={styles.paragraph}>
                Users in unrestricted states have complete access to all Platform features, including:
            </p>
            <ul style={styles.list}>
                <li><strong>PokerIQ Hub:</strong> Full access with training and rewards</li>
                <li><strong>GTO Training:</strong> Skill development with Diamond rewards</li>
                <li><strong>Social Media:</strong> Full integration, posting, and sharing</li>
                <li><strong>Diamond Arena:</strong> Prize redemptions enabled</li>
                <li><strong>Cash Out Prizes:</strong> Eligible for prizes up to $1,100 per redemption</li>
            </ul>

            <h3 style={styles.subheading}>Restricted States (WA, ID, MI, NV, CA)</h3>
            <p style={styles.paragraph}>
                Users in Washington, Idaho, Michigan, Nevada, and California maintain full access to training
                and social features but are restricted from prize redemption:
            </p>
            <ul style={styles.list}>
                <li><strong>PokerIQ Hub:</strong> ✅ ENABLED (Training/Study only)</li>
                <li><strong>GTO Training:</strong> ✅ ENABLED (Skill development)</li>
                <li><strong>Social Media:</strong> ✅ ENABLED (Posting/Sharing)</li>
                <li><strong>Diamond Arena:</strong> ❌ DISABLED (No prize entry)</li>
                <li><strong>Cash Out Prizes:</strong> ❌ BLOCKED (Physical Lock)</li>
            </ul>
            <p style={styles.paragraph}>
                <em>Diamond Redemptions are not available in your region if you reside in a restricted state.
                    Your Diamonds remain active for in-world upgrades, leaderboard standing, and platform enhancements.</em>
            </p>

            <h2 style={styles.heading}>3. Virtual Currency Policy</h2>
            <p style={styles.paragraph}>
                <strong>Diamonds</strong> are virtual tokens used within the Platform. They:
            </p>
            <ul style={styles.list}>
                <li>Have no direct cash value and cannot be exchanged for cash</li>
                <li>Can be transferred between accounts with other users</li>
                <li>Can be redeemed in the Diamond Store for real-world prizes and rewards (where eligible)</li>
                <li>Are subject to expiration as outlined in specific promotions</li>
                <li>May be forfeited upon account termination for Terms violations</li>
            </ul>

            <h3 style={styles.subheading}>Diamond Store Redemptions</h3>
            <p style={styles.paragraph}>
                In eligible jurisdictions, Diamonds can be redeemed in our Diamond Store for a variety of rewards, including:
            </p>
            <ul style={styles.list}>
                <li><strong>Merchandise:</strong> Official Smarter.Poker branded apparel and accessories</li>
                <li><strong>Gift Cards:</strong> Digital gift cards for popular retailers and services</li>
                <li><strong>Platform Upgrades:</strong> Premium features, cosmetics, and enhancements within PokerIQ</li>
                <li><strong>Tournament Buy-ins:</strong> Entry into live poker tournaments (availability varies by region)</li>
            </ul>
            <p style={styles.paragraph}>
                Redemption options and Diamond values are subject to change. All redemptions are final and non-refundable.
                <strong> Redemptions are VOID in WA, ID, MI, NV, and CA.</strong>
            </p>

            <h2 style={styles.heading}>4. No Purchase Necessary (AMOE)</h2>
            <div style={styles.consentBox}>
                <h3 style={styles.consentTitle}>⚖️ Alternative Method of Entry</h3>
                <p style={styles.consentText}>
                    <strong>NO PURCHASE NECESSARY.</strong> A purchase of upgrades, premium features, or any
                    in-app items will NOT improve your chances of winning prizes or receiving rewards.
                </p>
                <ul style={styles.consentList}>
                    <li>Daily login streaks generate "Entry Diamonds" for all eligible users</li>
                    <li>Completing training modules and social tasks earns Diamonds at no cost</li>
                    <li>XP progression is based solely on skill and activity, not purchases</li>
                    <li>Leaderboard rankings are determined by performance, not spending</li>
                    <li><strong>Free Roll Hourly Tournaments:</strong> Enter the Diamond Arena every hour with ZERO entry fee</li>
                </ul>
                <p style={styles.consentText}>
                    Free methods of earning Diamonds are always available to all users. Premium purchases
                    enhance your experience but do not provide competitive advantages in prize eligibility.
                </p>
            </div>

            <h2 style={styles.heading}>5. Fair Play Requirements</h2>
            <p style={styles.paragraph}>
                All users must adhere to fair play standards:
            </p>
            <ul style={styles.list}>
                <li><strong>No Cheating:</strong> Use of external tools, solvers, or AI during timed challenges is prohibited</li>
                <li><strong>No Collusion:</strong> Coordinating with other users to gain unfair advantages is not allowed</li>
                <li><strong>No Multi-Accounting:</strong> Each person may only have one account</li>
                <li><strong>No Exploitation:</strong> Exploiting bugs or glitches for advantage is prohibited</li>
            </ul>

            <h2 style={styles.heading}>6. Leaderboard Integrity</h2>
            <p style={styles.paragraph}>
                We actively monitor leaderboards and competitive features for suspicious activity. Violations may result in:
            </p>
            <ul style={styles.list}>
                <li>Removal from leaderboards</li>
                <li>Forfeiture of virtual currency and rewards</li>
                <li>Temporary or permanent account suspension</li>
            </ul>

            <h2 style={styles.heading}>7. Responsible Gaming</h2>
            <p style={styles.paragraph}>
                While Smarter.Poker does not involve real-money gambling, we encourage responsible use of the Platform:
            </p>
            <ul style={styles.list}>
                <li>Set reasonable time limits for training sessions</li>
                <li>Take regular breaks during extended sessions</li>
                <li>Remember that poker training should enhance, not replace, real-world activities</li>
                <li>Seek help if you feel your gaming habits are becoming problematic</li>
            </ul>

            <h2 style={styles.heading}>8. Age Restriction</h2>
            <p style={styles.paragraph}>
                You must be at least <strong>18 years of age</strong> to use Smarter.Poker. We reserve the right to
                verify your age and may terminate accounts of users who do not meet this requirement.
            </p>

            <h2 style={styles.heading}>9. Legal Compliance</h2>
            <p style={styles.paragraph}>
                This tiered access structure ensures compliance with state-specific regulations:
            </p>
            <ul style={styles.list}>
                <li><strong>Entertainment Shield:</strong> Training and social features operate as a Social Casino platform, legal in all states</li>
                <li><strong>Redemption Guard:</strong> Prize redemptions are only enabled in jurisdictions where such activities are permitted</li>
                <li><strong>Skill-Based Classification:</strong> Smarter.Poker operates as a skill-based training platform with an optional promotional rewards layer for eligible users</li>
            </ul>

            <h2 style={styles.heading}>10. Reporting Violations</h2>
            <p style={styles.paragraph}>
                If you witness or suspect any violations of this policy, please report them to{' '}
                <a href="mailto:support@smarter.poker" style={styles.link}>support@smarter.poker</a>
            </p>
        </div>
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
    tabNav: {
        display: 'flex',
        gap: '0',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
        overflowX: 'auto',
    },
    tab: {
        flex: '1',
        padding: '18px 24px',
        background: 'transparent',
        border: 'none',
        borderBottom: '3px solid transparent',
        color: 'rgba(255,255,255,0.5)',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
    },
    activeTab: {
        color: '#00D4FF',
        borderBottomColor: '#00D4FF',
        background: 'rgba(0,212,255,0.05)',
    },
    content: {
        padding: '40px',
        maxHeight: '70vh',
        overflowY: 'auto',
    },
    section: {},
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
    consentBox: {
        marginTop: '32px',
        padding: '24px',
        background: 'rgba(0,212,255,0.05)',
        border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: '12px',
    },
    consentTitle: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#00D4FF',
        marginBottom: '12px',
    },
    consentText: {
        fontSize: '14px',
        lineHeight: '1.7',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: '16px',
    },
    consentList: {
        marginLeft: '20px',
        listStyle: 'disc',
        color: 'rgba(255,255,255,0.7)',
        fontSize: '14px',
        lineHeight: '1.8',
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
};
