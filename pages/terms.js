import SEOHead from '../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState } from 'react';

export default function TermsOfService() {
    const [activeSection, setActiveSection] = useState('terms');

    const sections = [
        { id: 'terms', label: 'Terms Of Service' },
        { id: 'privacy', label: 'Privacy Policy' },
        { id: 'sms', label: 'SMS & Communications' },
        { id: 'gaming', label: 'Gaming Policy' },
    ];

    return (
        <>
            <SEOHead
                title="Terms Of Service"
                description="Smarter.Poker Terms Of Service. Read Our Usage Policies And User Agreements."
                canonical="/terms"
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
                    <Link href="/auth/signup" style={{ display: 'inline-block' }}>
                        <img src="/images/btn-back.png" alt="Back" style={{ height: 32 }} loading="lazy" decoding="async">
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
            <h1 style={styles.title}>Terms Of Service</h1>
            <p style={styles.intro}>
                Welcome to Smarter.Poker. By accessing or using our platform, you agree to be bound by these Terms of Service.
            </p>

            <h2 style={styles.heading}>1. Acceptance Of Terms</h2>
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
                <li>You Will Receive A Unique Player Number Upon Registration</li>
                <li>Your Poker Alias Must Be Appropriate And Not Impersonate Others</li>
                <li>One Account Per Person Is Permitted</li>
                <li>Account Sharing Is Prohibited</li>
            </ul>

            <h2 style={styles.heading}>4. Platform Services</h2>
            <p style={styles.paragraph}>
                Smarter.Poker provides poker training and educational services, including but not limited to:
            </p>
            <ul style={styles.list}>
                <li><strong>PokerIQ:</strong> Interactive GTO Training And Quizzes</li>
                <li><strong>Diamond Arena:</strong> Competitive Training Challenges</li>
                <li><strong>Club Arena:</strong> Community Features And Club Management</li>
                <li><strong>Hand History Analysis:</strong> Review And Improvement Tools</li>
            </ul>

            <h2 style={styles.heading}>5. Virtual Currency (Diamonds)</h2>
            <p style={styles.paragraph}>
                The Platform uses virtual currency called "Diamonds" for in-platform activities. Diamonds have no direct
                cash value and cannot be exchanged for cash. However, Diamonds can be transferred between users and
                redeemed in our Diamond Store for merchandise, gift cards, platform upgrades, and tournament buy-ins.
                We reserve the right to modify, suspend, or discontinue any virtual currency features at any time.
            </p>

            <h2 style={styles.heading}>6. User Conduct</h2>
            <p style={styles.paragraph}>You Agree Not To:</p>
            <ul style={styles.list}>
                <li>Use The Platform For Any Unlawful Purpose</li>
                <li>Attempt To Gain Unauthorized Access To Any Part Of The Platform</li>
                <li>Use Automated Systems Or Bots To Access The Platform</li>
                <li>Harass, Abuse, Or Harm Other Users</li>
                <li>Share Or Distribute Copyrighted Training Content</li>
                <li>Manipulate Leaderboards Or Competitive Features</li>
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

            <h2 style={styles.heading}>9. Disclaimer Of Warranties</h2>
            <p style={styles.paragraph}>
                THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE THAT USING OUR
                TRAINING WILL RESULT IN IMPROVED POKER PERFORMANCE OR FINANCIAL GAIN.
            </p>

            <h2 style={styles.heading}>10. Limitation Of Liability</h2>
            <p style={styles.paragraph}>
                IN NO EVENT SHALL SMARTER.POKER BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES ARISING OUT OF YOUR USE OF THE PLATFORM.
            </p>

            <h2 style={styles.heading}>11. Governing Law</h2>
            <p style={styles.paragraph}>
                These Terms shall be governed by and construed in accordance with the laws of the State of Illinois,
                without regard to conflict of law principles.
            </p>

            <h2 style={styles.heading}>12. Changes To Terms</h2>
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
                <li><strong>Account Data:</strong> Full Name, Email Address, Phone Number, City, State</li>
                <li><strong>Profile Data:</strong> Poker Alias, Player Number, Skill Tier</li>
                <li><strong>Usage Data:</strong> Training Progress, Quiz Scores, XP Earned</li>
            </ul>

            <h3 style={styles.subheading}>Automatically Collected Information</h3>
            <ul style={styles.list}>
                <li>Device Information And Browser Type</li>
                <li>IP Address And Location Data</li>
                <li>Session Duration And Interaction Patterns</li>
                <li>Cookies And Similar Tracking Technologies</li>
            </ul>

            <h2 style={styles.heading}>2. How We Use Your Information</h2>
            <ul style={styles.list}>
                <li>Provide And Improve Our Training Services</li>
                <li>Personalize Your Learning Experience</li>
                <li>Send Account-related Communications</li>
                <li>Process Transactions And Maintain Records</li>
                <li>Analyze Usage Patterns To Enhance The Platform</li>
                <li>Prevent Fraud And Enforce Our Terms</li>
                <li>Send Promotional Content (with Your Consent)</li>
            </ul>

            <h2 style={styles.heading}>3. Information Sharing</h2>
            <p style={styles.paragraph}>
                We do not sell your personal information. We may share information with:
            </p>
            <ul style={styles.list}>
                <li><strong>Service Providers:</strong> Third Parties Who Help Us Operate The Platform</li>
                <li><strong>Legal Requirements:</strong> When Required By Law Or To Protect Our Rights</li>
                <li><strong>Business Transfers:</strong> In Connection With A Merger Or Acquisition</li>
            </ul>

            <h2 style={styles.heading}>4. Data Security</h2>
            <p style={styles.paragraph}>
                We implement industry-standard security measures to protect your information, including encryption,
                secure servers, and regular security audits. However, no method of transmission over the Internet
                is 100% secure.
            </p>

            <h2 style={styles.heading}>5. Your Rights</h2>
            <p style={styles.paragraph}>You Have The Right To:</p>
            <ul style={styles.list}>
                <li>Access Your Personal Information</li>
                <li>Correct Inaccurate Data</li>
                <li>Request Deletion Of Your Data</li>
                <li>Opt-out Of Marketing Communications</li>
                <li>Export Your Data In A Portable Format</li>
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

            <h2 style={styles.heading}>1. Consent To Receive Messages</h2>
            <p style={styles.paragraph}>
                By providing your mobile phone number during registration or at any other time, you expressly consent
                to receive the following types of text messages (SMS) and other electronic communications from
                Smarter.Poker:
            </p>
            <ul style={styles.list}>
                <li><strong>Verification Codes:</strong> One-time Passwords (OTP) For Account Verification And Security</li>
                <li><strong>Account Alerts:</strong> Important Notifications About Your Account Status And Security</li>
                <li><strong>Service Updates:</strong> Information About Platform Changes, Maintenance, And New Features</li>
                <li><strong>Training Reminders:</strong> Optional Reminders About Your Training Goals And Streaks</li>
                <li><strong>Promotional Messages:</strong> Special Offers And Updates (with Separate Opt-in)</li>
            </ul>

            <h2 style={styles.heading}>2. Message Frequency</h2>
            <p style={styles.paragraph}>
                Message frequency varies based on your account activity. Verification codes are sent only when you
                initiate a sign-in or security action. You may receive up to 5 account-related messages per month.
                Promotional messages (if opted-in) will not exceed 4 messages per month.
            </p>

            <h2 style={styles.heading}>3. Standard Message And Data Rates</h2>
            <p style={styles.paragraph}>
                <strong>Message And Data Rates May Apply.</strong> Your mobile carrier's standard messaging and data
                rates will apply to any messages you send or receive. Smarter.Poker is not responsible for any
                charges incurred from your mobile carrier.
            </p>

            <h2 style={styles.heading}>4. How To Opt-Out</h2>
            <p style={styles.paragraph}>
                You can opt-out of receiving text messages at any time by:
            </p>
            <ul style={styles.list}>
                <li>Replying <strong>STOP</strong> To Any Message You Receive From Us</li>
                <li>Updating Your Communication Preferences In Your Account Settings</li>
                <li>Contacting Us At <a href="mailto:support@smarter.poker" style={styles.link}>support@smarter.poker</a></li>
            </ul>
            <p style={styles.paragraph}>
                <strong>Note:</strong> Opting out of promotional messages will not affect transactional messages
                such as verification codes and critical account alerts, which are necessary for platform security.
            </p>

            <h2 style={styles.heading}>5. Help And Support</h2>
            <p style={styles.paragraph}>
                For assistance with SMS messages, you can:
            </p>
            <ul style={styles.list}>
                <li>Reply <strong>HELP</strong> To Any Message For Support Information</li>
                <li>Email Us At <a href="mailto:support@smarter.poker" style={styles.link}>support@smarter.poker</a></li>
                <li>Visit Our Help Center At <a href="https://smarter.poker/help" style={styles.link}>Smarter.poker/help</a></li>
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
                    <li>Consent Is Not A Condition Of Purchase</li>
                    <li>You Can Opt-out At Any Time By Texting STOP</li>
                    <li>Message And Data Rates May Apply</li>
                    <li>Message Frequency Varies</li>
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
                Smarter.Poker is an <strong>Educational Poker Training Platform</strong> (also known as a "Social Casino"
                for entertainment and skill development). All games, challenges, and competitions on the Platform are
                for entertainment and educational purposes only. No real money is wagered, and no real money can be
                won or lost through the Platform.
            </p>
            <p style={styles.paragraph}>
                <strong>Train From Anywhere. Win Prizes Where Legal.</strong> Users in all 50 states can sign up
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
                <li><strong>PokerIQ Hub:</strong> Full Access With Training And Rewards</li>
                <li><strong>GTO Training:</strong> Skill Development With Diamond Rewards</li>
                <li><strong>Social Media:</strong> Full Integration, Posting, And Sharing</li>
                <li><strong>Diamond Arena:</strong> Prize Redemptions Enabled</li>
                <li><strong>Cash Out Prizes:</strong> Eligible For Prizes Up To $1,100 Per Redemption</li>
            </ul>

            <h3 style={styles.subheading}>Restricted States (WA, ID, MI, NV, CA)</h3>
            <p style={styles.paragraph}>
                Users in Washington, Idaho, Michigan, Nevada, and California maintain full access to training
                and social features but are restricted from prize redemption:
            </p>
            <ul style={styles.list}>
                <li><strong>PokerIQ Hub:</strong> ✅ ENABLED (Training/Study Only)</li>
                <li><strong>GTO Training:</strong> ✅ ENABLED (Skill Development)</li>
                <li><strong>Social Media:</strong> ✅ ENABLED (Posting/Sharing)</li>
                <li><strong>Diamond Arena:</strong> ❌ DISABLED (No Prize Entry)</li>
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
                <li>Have No Direct Cash Value And Cannot Be Exchanged For Cash</li>
                <li>Can Be Transferred Between Accounts With Other Users</li>
                <li>Can Be Redeemed In The Diamond Store For Real-world Prizes And Rewards (where Eligible)</li>
                <li>Are Subject To Expiration As Outlined In Specific Promotions</li>
                <li>May Be Forfeited Upon Account Termination For Terms Violations</li>
            </ul>

            <h3 style={styles.subheading}>Diamond Store Redemptions</h3>
            <p style={styles.paragraph}>
                In eligible jurisdictions, Diamonds can be redeemed in our Diamond Store for a variety of rewards, including:
            </p>
            <ul style={styles.list}>
                <li><strong>Merchandise:</strong> Official Smarter.Poker Branded Apparel And Accessories</li>
                <li><strong>Gift Cards:</strong> Digital Gift Cards For Popular Retailers And Services</li>
                <li><strong>Platform Upgrades:</strong> Premium Features, Cosmetics, And Enhancements Within PokerIQ</li>
                <li><strong>Tournament Buy-Ins:</strong> Entry Into Live Poker Tournaments (availability Varies By Region)</li>
            </ul>
            <p style={styles.paragraph}>
                Redemption options and Diamond values are subject to change. All redemptions are final and non-refundable.
                <strong> Redemptions Are VOID In WA, ID, MI, NV, And CA.</strong>
            </p>

            <h2 style={styles.heading}>4. No Purchase Necessary (AMOE)</h2>
            <div style={styles.consentBox}>
                <h3 style={styles.consentTitle}>⚖️ Alternative Method Of Entry</h3>
                <p style={styles.consentText}>
                    <strong>NO PURCHASE NECESSARY.</strong> A purchase of upgrades, premium features, or any
                    in-app items will NOT improve your chances of winning prizes or receiving rewards.
                </p>
                <ul style={styles.consentList}>
                    <li>Daily Login Streaks Generate "Entry Diamonds" For All Eligible Users</li>
                    <li>Completing Training Modules And Social Tasks Earns Diamonds At No Cost</li>
                    <li>XP Progression Is Based Solely On Skill And Activity, Not Purchases</li>
                    <li>Leaderboard Rankings Are Determined By Performance, Not Spending</li>
                    <li><strong>Free Roll Hourly Tournaments:</strong> Enter The Diamond Arena Every Hour With ZERO Entry Fee</li>
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
                <li><strong>No Cheating:</strong> Use Of External Tools, Solvers, Or AI During Timed Challenges Is Prohibited</li>
                <li><strong>No Collusion:</strong> Coordinating With Other Users To Gain Unfair Advantages Is Not Allowed</li>
                <li><strong>No Multi-Accounting:</strong> Each Person May Only Have One Account</li>
                <li><strong>No Exploitation:</strong> Exploiting Bugs Or Glitches For Advantage Is Prohibited</li>
            </ul>

            <h2 style={styles.heading}>6. Leaderboard Integrity</h2>
            <p style={styles.paragraph}>
                We actively monitor leaderboards and competitive features for suspicious activity. Violations may result in:
            </p>
            <ul style={styles.list}>
                <li>Removal From Leaderboards</li>
                <li>Forfeiture Of Virtual Currency And Rewards</li>
                <li>Temporary Or Permanent Account Suspension</li>
            </ul>

            <h2 style={styles.heading}>7. Responsible Gaming</h2>
            <p style={styles.paragraph}>
                While Smarter.Poker does not involve real-money gambling, we encourage responsible use of the Platform:
            </p>
            <ul style={styles.list}>
                <li>Set Reasonable Time Limits For Training Sessions</li>
                <li>Take Regular Breaks During Extended Sessions</li>
                <li>Remember That Poker Training Should Enhance, Not Replace, Real-world Activities</li>
                <li>Seek Help If You Feel Your Gaming Habits Are Becoming Problematic</li>
            </ul>

            <h2 style={styles.heading}>8. Age Restriction</h2>
            <p style={styles.paragraph}>
                You must be at least <strong>18 Years Of Age</strong> to use Smarter.Poker. We reserve the right to
                verify your age and may terminate accounts of users who do not meet this requirement.
            </p>

            <h2 style={styles.heading}>9. Legal Compliance</h2>
            <p style={styles.paragraph}>
                This tiered access structure ensures compliance with state-specific regulations:
            </p>
            <ul style={styles.list}>
                <li><strong>Entertainment Shield:</strong> Training And Social Features Operate As A Social Casino Platform, Legal In All States</li>
                <li><strong>Redemption Guard:</strong> Prize Redemptions Are Only Enabled In Jurisdictions Where Such Activities Are Permitted</li>
                <li><strong>Skill-Based Classification:</strong> Smarter.Poker Operates As A Skill-based Training Platform With An Optional Promotional Rewards Layer For Eligible Users</li>
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
