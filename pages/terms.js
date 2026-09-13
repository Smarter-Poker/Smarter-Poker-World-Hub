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
                        <img src="/images/btn-back.png" alt="Back" style={{ height: 32 }}  loading="lazy" />
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
                            <p style={styles.lastUpdated}>Last Updated: September 8, 2026</p>
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

// Terms of Service Section
function TermsSection() {
    return (
        <div style={styles.section}>
            <h1 style={styles.title}>Terms Of Service</h1>
            <p style={styles.intro}>
                Welcome To Smarter.Poker. By Accessing Or Using Our Platform, You Agree To Be Bound By These Terms Of Service.
            </p>

            <h2 style={styles.heading}>1. Acceptance Of Terms</h2>
            <p style={styles.paragraph}>
                By Creating An Account, Accessing, Or Using Smarter.Poker ("The Platform"), You Acknowledge That You Have Read,
                Understood, And Agree To Be Bound By These Terms Of Service ("Terms"). If You Do Not Agree To These Terms,
                You May Not Access Or Use The Platform.
            </p>

            <h2 style={styles.heading}>2. Eligibility</h2>
            <p style={styles.paragraph}>
                You Must Be At Least 18 Years Of Age To Use Smarter.Poker. By Using The Platform, You Represent And Warrant
                That You Are At Least 18 Years Old And Have The Legal Capacity To Enter Into These Terms. The Platform Is
                Intended For Educational Purposes Only And Does Not Involve Real-Money Gambling.
            </p>

            <h2 style={styles.heading}>3. Account Registration</h2>
            <p style={styles.paragraph}>
                To Access Certain Features, You Must Register For An Account. You Agree To Provide Accurate, Current, And
                Complete Information During Registration And To Update Such Information To Keep It Accurate. You Are
                Responsible For Safeguarding Your Account Credentials And For All Activities Under Your Account.
            </p>
            <ul style={styles.list}>
                <li>You Will Receive A Unique Player Number Upon Registration</li>
                <li>Your Poker Alias Must Be Appropriate And Not Impersonate Others</li>
                <li>One Account Per Person Is Permitted</li>
                <li>Account Sharing Is Prohibited</li>
            </ul>

            <h2 style={styles.heading}>4. Platform Services</h2>
            <p style={styles.paragraph}>
                Smarter.Poker Provides Poker Training And Educational Services, Including But Not Limited To:
            </p>
            <ul style={styles.list}>
                <li><strong>PokerIQ:</strong> Interactive GTO Training And Quizzes</li>
                <li><strong>Diamond Arena:</strong> Competitive Training Challenges</li>
                <li><strong>Club Arena:</strong> Community Features And Club Management</li>
                <li><strong>Hand History Analysis:</strong> Review And Improvement Tools</li>
            </ul>

            <h2 style={styles.heading}>5. Virtual Currency (Diamonds)</h2>
            <p style={styles.paragraph}>
                The Platform Uses Virtual Currency Called "Diamonds" For In-Platform Activities. Diamonds Have No Direct
                Cash Value And Cannot Be Exchanged For Cash. However, Diamonds Can Be Transferred Between Users And
                Redeemed In Our Diamond Store For Merchandise, Gift Cards, Platform Upgrades, And Tournament Buy-Ins.
                We Reserve The Right To Modify, Suspend, Or Discontinue Any Virtual Currency Features At Any Time.
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
                All Content, Features, And Functionality Of The Platform Are Owned By Smarter.Poker And Are Protected By
                Copyright, Trademark, And Other Intellectual Property Laws. You May Not Reproduce, Distribute, Or Create
                Derivative Works Without Our Express Written Consent.
            </p>

            <h2 style={styles.heading}>8. Termination</h2>
            <p style={styles.paragraph}>
                We Reserve The Right To Suspend Or Terminate Your Account At Any Time For Violation Of These Terms Or For
                Any Other Reason At Our Sole Discretion. Upon Termination, Your Right To Use The Platform Will Immediately
                Cease, And Any Virtual Currency Or Progress May Be Forfeited.
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
                These Terms Shall Be Governed By And Construed In Accordance With The Laws Of The State Of Illinois,
                Without Regard To Conflict Of Law Principles.
            </p>

            <h2 style={styles.heading}>12. Changes To Terms</h2>
            <p style={styles.paragraph}>
                We Reserve The Right To Modify These Terms At Any Time. We Will Notify You Of Any Material Changes Via
                Email Or Through The Platform. Your Continued Use Of The Platform After Such Modifications Constitutes
                Your Acceptance Of The Updated Terms.
            </p>
        </div>
    );
}

// Privacy Policy Section. Also rendered on its own at /privacy (pages/privacy.js),
// which is the URL the app stores read.
export function PrivacySection() {
    return (
        <div style={styles.section}>
            <h1 style={styles.title}>Privacy Policy</h1>
            <p style={styles.intro}>
                Your Privacy Is Important To Us. This Privacy Policy Explains How We Collect, Use, And Protect Your Information.
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
                <li>Send Account-Related Communications</li>
                <li>Process Transactions And Maintain Records</li>
                <li>Analyze Usage Patterns To Enhance The Platform</li>
                <li>Prevent Fraud And Enforce Our Terms</li>
                <li>Send Promotional Content (With Your Consent)</li>
            </ul>

            <h2 style={styles.heading}>3. Information Sharing</h2>
            <p style={styles.paragraph}>
                We Do Not Sell Your Personal Information. We May Share Information With:
            </p>
            <ul style={styles.list}>
                <li><strong>Service Providers:</strong> Third Parties Who Help Us Operate The Platform</li>
                <li><strong>Legal Requirements:</strong> When Required By Law Or To Protect Our Rights</li>
                <li><strong>Business Transfers:</strong> In Connection With A Merger Or Acquisition</li>
            </ul>

            <h2 style={styles.heading}>4. Data Security</h2>
            <p style={styles.paragraph}>
                We Implement Industry-Standard Security Measures To Protect Your Information, Including Encryption,
                Secure Servers, And Regular Security Audits. However, No Method Of Transmission Over The Internet
                Is 100% Secure.
            </p>

            <h2 style={styles.heading}>5. Your Rights</h2>
            <p style={styles.paragraph}>You Have The Right To:</p>
            <ul style={styles.list}>
                <li>Access Your Personal Information</li>
                <li>Correct Inaccurate Data</li>
                <li>Request Deletion Of Your Data</li>
                <li>Opt-Out Of Marketing Communications</li>
                <li>Export Your Data In A Portable Format</li>
            </ul>

            <h2 style={styles.heading}>6. Data Retention</h2>
            <p style={styles.paragraph}>
                We Retain Your Information For As Long As Your Account Is Active Or As Needed To Provide Services.
                We May Retain Certain Information As Required By Law Or For Legitimate Business Purposes.
            </p>

            <h2 style={styles.heading}>7. Children's Privacy</h2>
            <p style={styles.paragraph}>
                The Platform Is Not Intended For Users Under 18 Years Of Age. We Do Not Knowingly Collect Information
                From Children. If We Learn We Have Collected Information From A Child, We Will Delete It Promptly.
            </p>

            <h2 style={styles.heading}>8. The Club Arena App</h2>
            <p style={styles.paragraph}>
                The Club Arena App For Apple And Android Phones Is The Same Service Under This Policy. In The App:
            </p>
            <ul style={styles.list}>
                <li><strong>Purchases:</strong> Diamonds And VIP Are Sold Through The App Store Or Google Play. We Receive A Receipt And The Product Purchased From RevenueCat; We Never See Your Card.</li>
                <li><strong>Notifications:</strong> If You Turn Them On, Your Device's Push Token Is Stored So We Can Send You Seat, Tournament And Club Alerts. Turn Them Off In Settings Or In Your Phone's Notification Settings And The Token Is Retired.</li>
                <li><strong>Crash Reports:</strong> Sent To Sentry Without Your Email Address, To Fix Errors.</li>
                <li><strong>Analytics:</strong> Product Analytics (PostHog) Run Only After You Say Yes In The App, And Can Be Turned Off In Settings At Any Time.</li>
                <li><strong>Age:</strong> We Ask Your Date Of Birth Once. Under 18 Cannot Create An Account, And Nothing About A Minor Is Sent To Us.</li>
                <li><strong>Deleting Your Account:</strong> Settings, Then Delete Account, Removes Your Profile, Your Wallet And Your Push Tokens. Records We Must Keep By Law Are Retained Only As Long As Required.</li>
                <li><strong>Chips:</strong> Chips Are Club Play Credits. Smarter.Poker Does Not Sell, Redeem Or Pay Out Chips And Assigns Them No Monetary Value.</li>
            </ul>

            <h2 style={styles.heading}>9. Contact Us</h2>
            <p style={styles.paragraph}>
                For Privacy-Related Inquiries, Contact Us at{' '}
                <a href="mailto:support@smarter.poker" style={styles.link}>Support@Smarter.Poker</a>
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
                By Providing Your Phone Number And Signing Up For Smarter.Poker, You Consent To Receive Text Messages
                And Other Communications From Us As Described Below.
            </p>

            <h2 style={styles.heading}>1. Consent To Receive Messages</h2>
            <p style={styles.paragraph}>
                By Providing Your Mobile Phone Number During Registration Or At Any Other Time, You Expressly Consent
                To Receive The Following Types Of Text Messages (SMS) And Other Electronic Communications From
                Smarter.Poker:
            </p>
            <ul style={styles.list}>
                <li><strong>Verification Codes:</strong> One-Time Passwords (OTP) For Account Verification And Security</li>
                <li><strong>Account Alerts:</strong> Important Notifications About Your Account Status And Security</li>
                <li><strong>Service Updates:</strong> Information About Platform Changes, Maintenance, And New Features</li>
                <li><strong>Training Reminders:</strong> Optional Reminders About Your Training Goals And Streaks</li>
                <li><strong>Promotional Messages:</strong> Special Offers And Updates (With Separate Opt-In)</li>
            </ul>

            <h2 style={styles.heading}>2. Message Frequency</h2>
            <p style={styles.paragraph}>
                Message Frequency Varies Based On Your Account Activity. Verification Codes Are Sent Only When You
                Initiate A Sign-In Or Security Action. You May Receive Up To 5 Account-Related Messages Per Month.
                Promotional Messages (If Opted-In) Will Not Exceed 4 Messages Per Month.
            </p>

            <h2 style={styles.heading}>3. Standard Message And Data Rates</h2>
            <p style={styles.paragraph}>
                <strong>Message And Data Rates May Apply.</strong> Your Mobile Carrier's Standard Messaging And Data
                Rates Will Apply To Any Messages You Send Or Receive. Smarter.Poker Is Not Responsible For Any
                Charges Incurred From Your Mobile Carrier.
            </p>

            <h2 style={styles.heading}>4. How To Opt-Out</h2>
            <p style={styles.paragraph}>
                You Can Opt-Out Of Receiving Text Messages At Any Time By:
            </p>
            <ul style={styles.list}>
                <li>Replying <strong>STOP</strong> To Any Message You Receive From Us</li>
                <li>Updating Your Communication Preferences In Your Account Settings</li>
                <li>Contacting Us At <a href="mailto:support@smarter.poker" style={styles.link}>Support@Smarter.Poker</a></li>
            </ul>
            <p style={styles.paragraph}>
                <strong>Note:</strong> Opting Out Of Promotional Messages Will Not Affect Transactional Messages
                Such As Verification Codes And Critical Account Alerts, Which Are Necessary For Platform Security.
            </p>

            <h2 style={styles.heading}>5. Help And Support</h2>
            <p style={styles.paragraph}>
                For Assistance With SMS Messages, You Can:
            </p>
            <ul style={styles.list}>
                <li>Reply <strong>HELP</strong> To Any Message For Support Information</li>
                <li>Email Us At <a href="mailto:support@smarter.poker" style={styles.link}>Support@Smarter.Poker</a></li>
                <li>Visit Our Help Center At <a href="https://smarter.poker/help" style={styles.link}>Smarter.Poker/Help</a></li>
            </ul>

            <h2 style={styles.heading}>6. Carrier Disclaimer</h2>
            <p style={styles.paragraph}>
                Carriers Are Not Liable For Delayed Or Undelivered Messages. We Work With Major Carriers To Ensure
                Reliable Message Delivery, But Cannot Guarantee Delivery Due To Factors Outside Our Control.
            </p>

            <h2 style={styles.heading}>7. Privacy</h2>
            <p style={styles.paragraph}>
                Your Phone Number And Messaging Activity Are Protected Under Our Privacy Policy. We Do Not Share Your
                Phone Number With Third Parties For Marketing Purposes. Phone Numbers Are Used Solely For The Purposes
                Described In This Consent.
            </p>

            <div style={styles.consentBox}>
                <h3 style={styles.consentTitle}>📱 Your Consent</h3>
                <p style={styles.consentText}>
                    By Signing Up For Smarter.Poker And Providing Your Phone Number, You Acknowledge That You Have Read
                    And Agree To This SMS & Communications Consent. You Understand That:
                </p>
                <ul style={styles.consentList}>
                    <li>Consent Is Not A Condition Of Purchase</li>
                    <li>You Can Opt-Out At Any Time By Texting STOP</li>
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
                Smarter.Poker Is Committed To Providing A Fair, Educational, And Enjoyable Experience For All Users.
                This Policy Outlines Our "Skill-Access, Prize-Lock" Dual Infrastructure For Compliance Across All Jurisdictions.
            </p>

            <h2 style={styles.heading}>1. Educational Purpose & Platform Nature</h2>
            <p style={styles.paragraph}>
                Smarter.Poker Is An <strong>Educational Poker Training Platform</strong> (Also Known As A "Social Casino"
                For Entertainment And Skill Development). All Games, Challenges, And Competitions On The Platform Are
                For Entertainment And Educational Purposes Only. No Real Money Is Wagered, And No Real Money Can Be
                Won Or Lost Through The Platform.
            </p>
            <p style={styles.paragraph}>
                <strong>Train From Anywhere. Win Prizes Where Legal.</strong> Users In All 50 States Can Sign Up
                And Access Our Training, Social, And AI-Powered Coaching Features. Real-World Prize Redemptions
                Are Strictly Limited To Eligible Jurisdictions.
            </p>

            <h2 style={styles.heading}>2. Tiered Access System</h2>
            <p style={styles.paragraph}>
                Smarter.Poker Operates A <strong>"Skill-Access, Prize-Lock"</strong> Infrastructure. Users In
                Certain States Have Restricted Access To Prize Redemption Features While Maintaining Full Access
                To All Training And Social Features.
            </p>

            <h3 style={styles.subheading}>Full Access States</h3>
            <p style={styles.paragraph}>
                Users In Unrestricted States Have Complete Access To All Platform Features, Including:
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
                Users In Washington, Idaho, Michigan, Nevada, And California Maintain Full Access To Training
                And Social Features But Are Restricted From Prize Redemption:
            </p>
            <ul style={styles.list}>
                <li><strong>PokerIQ Hub:</strong> ✅ ENABLED (Training/Study Only)</li>
                <li><strong>GTO Training:</strong> ✅ ENABLED (Skill Development)</li>
                <li><strong>Social Media:</strong> ✅ ENABLED (Posting/Sharing)</li>
                <li><strong>Diamond Arena:</strong> ❌ DISABLED (No Prize Entry)</li>
                <li><strong>Cash Out Prizes:</strong> ❌ BLOCKED (Physical Lock)</li>
            </ul>
            <p style={styles.paragraph}>
                <em>Diamond Redemptions Are Not Available In Your Region If You Reside In A Restricted State.
                    Your Diamonds Remain Active For In-World Upgrades, Leaderboard Standing, And Platform Enhancements.</em>
            </p>

            <h2 style={styles.heading}>3. Virtual Currency Policy</h2>
            <p style={styles.paragraph}>
                <strong>Diamonds</strong> Are Virtual Tokens Used Within The Platform. They:
            </p>
            <ul style={styles.list}>
                <li>Have No Direct Cash Value And Cannot Be Exchanged For Cash</li>
                <li>Can Be Transferred Between Accounts With Other Users</li>
                <li>Can Be Redeemed In The Diamond Store For Real-World Prizes And Rewards (Where Eligible)</li>
                <li>Are Subject To Expiration As Outlined In Specific Promotions</li>
                <li>May Be Forfeited Upon Account Termination For Terms Violations</li>
            </ul>

            <h3 style={styles.subheading}>Diamond Store Redemptions</h3>
            <p style={styles.paragraph}>
                In Eligible Jurisdictions, Diamonds Can Be Redeemed In Our Diamond Store For A Variety Of Rewards, Including:
            </p>
            <ul style={styles.list}>
                <li><strong>Merchandise:</strong> Official Smarter.Poker Branded Apparel And Accessories</li>
                <li><strong>Gift Cards:</strong> Digital Gift Cards For Popular Retailers And Services</li>
                <li><strong>Platform Upgrades:</strong> Premium Features, Cosmetics, And Enhancements Within PokerIQ</li>
                <li><strong>Tournament Buy-Ins:</strong> Entry Into Live Poker Tournaments (Availability Varies By Region)</li>
            </ul>
            <p style={styles.paragraph}>
                Redemption Options And Diamond Values Are Subject To Change. All Redemptions Are Final And Non-Refundable.
                <strong> Redemptions Are VOID In WA, ID, MI, NV, And CA.</strong>
            </p>

            <h2 style={styles.heading}>4. No Purchase Necessary (AMOE)</h2>
            <div style={styles.consentBox}>
                <h3 style={styles.consentTitle}>⚖️ Alternative Method Of Entry</h3>
                <p style={styles.consentText}>
                    <strong>NO PURCHASE NECESSARY.</strong> A Purchase Of Upgrades, Premium Features, Or Any
                    In-App Items Will NOT Improve Your Chances Of Winning Prizes Or Receiving Rewards.
                </p>
                <ul style={styles.consentList}>
                    <li>Daily Login Streaks Generate "Entry Diamonds" For All Eligible Users</li>
                    <li>Completing Training Modules And Social Tasks Earns Diamonds At No Cost</li>
                    <li>XP Progression Is Based Solely On Skill And Activity, Not Purchases</li>
                    <li>Leaderboard Rankings Are Determined By Performance, Not Spending</li>
                    <li><strong>Free Roll Hourly Tournaments:</strong> Enter The Diamond Arena Every Hour With ZERO Entry Fee</li>
                </ul>
                <p style={styles.consentText}>
                    Free Methods Of Earning Diamonds Are Always Available To All Users. Premium Purchases
                    Enhance Your Experience But Do Not Provide Competitive Advantages In Prize Eligibility.
                </p>
            </div>

            <h2 style={styles.heading}>5. Fair Play Requirements</h2>
            <p style={styles.paragraph}>
                All Users Must Adhere To Fair Play Standards:
            </p>
            <ul style={styles.list}>
                <li><strong>No Cheating:</strong> Use Of External Tools, Solvers, Or AI During Timed Challenges Is Prohibited</li>
                <li><strong>No Collusion:</strong> Coordinating With Other Users To Gain Unfair Advantages Is Not Allowed</li>
                <li><strong>No Multi-Accounting:</strong> Each Person May Only Have One Account</li>
                <li><strong>No Exploitation:</strong> Exploiting Bugs Or Glitches For Advantage Is Prohibited</li>
            </ul>

            <h2 style={styles.heading}>6. Leaderboard Integrity</h2>
            <p style={styles.paragraph}>
                We Actively Monitor Leaderboards And Competitive Features For Suspicious Activity. Violations May Result In:
            </p>
            <ul style={styles.list}>
                <li>Removal From Leaderboards</li>
                <li>Forfeiture Of Virtual Currency And Rewards</li>
                <li>Temporary Or Permanent Account Suspension</li>
            </ul>

            <h2 style={styles.heading}>7. Responsible Gaming</h2>
            <p style={styles.paragraph}>
                While Smarter.Poker Does Not Involve Real-Money Gambling, We Encourage Responsible Use Of The Platform:
            </p>
            <ul style={styles.list}>
                <li>Set Reasonable Time Limits For Training Sessions</li>
                <li>Take Regular Breaks During Extended Sessions</li>
                <li>Remember That Poker Training Should Enhance, Not Replace, Real-World Activities</li>
                <li>Seek Help If You Feel Your Gaming Habits Are Becoming Problematic</li>
            </ul>

            <h2 style={styles.heading}>8. Age Restriction</h2>
            <p style={styles.paragraph}>
                You Must Be At Least <strong>18 Years Of Age</strong> To Use Smarter.Poker. We Reserve The Right To
                Verify Your Age And May Terminate Accounts Of Users Who Do Not Meet This Requirement.
            </p>

            <h2 style={styles.heading}>9. Legal Compliance</h2>
            <p style={styles.paragraph}>
                This Tiered Access Structure Ensures Compliance With State-Specific Regulations:
            </p>
            <ul style={styles.list}>
                <li><strong>Entertainment Shield:</strong> Training And Social Features Operate As A Social Casino Platform, Legal In All States</li>
                <li><strong>Redemption Guard:</strong> Prize Redemptions Are Only Enabled In Jurisdictions Where Such Activities Are Permitted</li>
                <li><strong>Skill-Based Classification:</strong> Smarter.Poker Operates As A Skill-Based Training Platform With An Optional Promotional Rewards Layer For Eligible Users</li>
            </ul>

            <h2 style={styles.heading}>10. Reporting Violations</h2>
            <p style={styles.paragraph}>
                If You Witness Or Suspect Any Violations Of This Policy, Please Report Them to{' '}
                <a href="mailto:support@smarter.poker" style={styles.link}>Support@Smarter.Poker</a>
            </p>
        </div>
    );
}

// Styles
export const styles = {
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
