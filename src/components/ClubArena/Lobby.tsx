/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — CLUB ARENA LOBBY
   Software Neutrality Architecture (Premium Club Standard)
   Mandatory Legal Disclaimer + Play Money Gate
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import GameCarousel from '../club-arena/GameCarousel';

// ─────────────────────────────────────────────────────────────────────────────
// 🏛️ SOFTWARE NEUTRALITY DISCLAIMER — NON-DISMISSIBLE POPUP
// ─────────────────────────────────────────────────────────────────────────────

const SOFTWARE_NEUTRALITY_DISCLAIMER = `
SMARTER.POKER IS A SOCIAL TRAINING PLATFORM. WE ARE A NEUTRAL SOFTWARE PROVIDER ONLY. 
WE DO NOT OFFER, OPERATE, OR ENDORSE REAL-MONEY GAMING. 

ANY EXTERNAL SETTLEMENT IS PROHIBITED AND DONE AT YOUR OWN RISK. 

BY PROCEEDING, YOU INDEMNIFY SMARTER.POKER FROM ALL LIABILITY.
`;

interface DisclaimerPopupProps {
    onAccept: () => void;
    isVisible: boolean;
}

/**
 * MANDATORY DISCLAIMER POPUP
 * Non-dismissible — user MUST accept to enter Club Arena
 */
const DisclaimerPopup: React.FC<DisclaimerPopupProps> = ({ onAccept, isVisible }) => {
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [scrolledToBottom, setScrolledToBottom] = useState(false);

    if (!isVisible) return null;

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        const isBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 10;
        if (isBottom) setScrolledToBottom(true);
    };

    const canProceed = termsAccepted && scrolledToBottom;

    return (
        <div style={popupStyles.overlay}>
            <div style={popupStyles.modal}>
                {/* Header */}
                <div style={popupStyles.header}>
                    <div style={popupStyles.warningIcon}>⚠️</div>
                    <h2 style={popupStyles.title}>Software Neutrality Disclaimer</h2>
                    <p style={popupStyles.subtitle}>Club Arena — Play Money Home Games</p>
                </div>

                {/* Disclaimer Content */}
                <div
                    style={popupStyles.contentScroll}
                    onScroll={handleScroll}
                >
                    <div style={popupStyles.disclaimerBox}>
                        <p style={popupStyles.disclaimerText}>
                            {SOFTWARE_NEUTRALITY_DISCLAIMER}
                        </p>
                    </div>

                    <div style={popupStyles.policySection}>
                        <h3 style={popupStyles.sectionTitle}>📜 Important Legal Notice</h3>
                        <ul style={popupStyles.policyList}>
                            <li>Smarter.Poker Provides <strong>Educational Software Tools Only</strong></li>
                            <li>Club Arena Operates Exclusively With <strong>Play Money Chips</strong></li>
                            <li>We Do Not Facilitate, Endorse, Or Participate In Any Form Of Gambling</li>
                            <li>External Arrangements Between Users Are <strong>Strictly Prohibited</strong></li>
                            <li>Violation Of These Terms Will Result In Immediate Account Termination</li>
                        </ul>
                    </div>

                    <div style={popupStyles.policySection}>
                        <h3 style={popupStyles.sectionTitle}>🛡️ User Responsibilities</h3>
                        <ul style={popupStyles.policyList}>
                            <li>You Agree To Use Club Arena <strong>For Entertainment Only</strong></li>
                            <li>You Will Not Use The Platform To Facilitate Real-money Transactions</li>
                            <li>You Understand Play Money Has <strong>No Cash Value</strong></li>
                            <li>You Accept Full Responsibility For Your Use Of The Platform</li>
                            <li>You Indemnify Smarter.Poker From Any Liability Arising From Your Actions</li>
                        </ul>
                    </div>

                    <div style={popupStyles.policySection}>
                        <h3 style={popupStyles.sectionTitle}>🚫 Prohibited Activities</h3>
                        <ul style={popupStyles.policyList}>
                            <li>Discussing Or Arranging Real-money Settlements</li>
                            <li>Sharing Payment App Information (Venmo, CashApp, Zelle, Etc.)</li>
                            <li>Converting Play Money To Real Currency</li>
                            <li>Using The Platform For Any Form Of Gambling</li>
                            <li>Advertising External Gambling Services</li>
                        </ul>
                    </div>

                    <div style={popupStyles.scrollHint}>
                        {!scrolledToBottom && (
                            <span>↓ Scroll To Continue Reading ↓</span>
                        )}
                        {scrolledToBottom && (
                            <span style={{ color: '#00ff66' }}>✓ You Have Read The Disclaimer</span>
                        )}
                    </div>
                </div>

                {/* Accept Section */}
                <div style={popupStyles.acceptSection}>
                    <label style={popupStyles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={(e) => setTermsAccepted(e.target.checked)}
                            style={popupStyles.checkbox}
                        />
                        <span style={popupStyles.checkboxText}>
                            I have read and agree to the{' '}
                            <a href="/terms" target="_blank" style={popupStyles.link}>Terms Of Service</a>,{' '}
                            <a href="/terms#privacy" target="_blank" style={popupStyles.link}>Privacy Policy</a>, and{' '}
                            <a href="/legal/official-rules" target="_blank" style={popupStyles.link}>Official Rules</a>.
                            I understand that Club Arena is a <strong>Play Money Platform Only</strong>.
                        </span>
                    </label>

                    <button
                        style={{
                            ...popupStyles.acceptButton,
                            opacity: canProceed ? 1 : 0.5,
                            cursor: canProceed ? 'pointer' : 'not-allowed',
                        }}
                        disabled={!canProceed}
                        onClick={onAccept}
                    >
                        {canProceed ? 'I Accept — Enter Club Arena' : 'Read & Accept Terms to Continue'}
                    </button>

                    <p style={popupStyles.footerNote}>
                        By clicking "I Accept", you acknowledge that you are 18+ years of age and
                        agree to be bound by all terms and conditions.
                    </p>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 CLUB ARENA LOBBY COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ClubArenaLobbyProps {
    userId: string;
    onEnterClub?: (clubId: string) => void;
}

/**
 * CLUB ARENA LOBBY
 * Entry point for poker home games with mandatory legal disclaimer
 */

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 MOCK DATA FOR LOBBY CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_GAMES = [
    { id: 'g1', game_type: 'cash', variant: 'nlh', stakes: [1, 2], seating: 9, player_count: 6, name: "Texas Hold'em - $1/$2", club_name: "Smarter Poker Club", status: 'active' },
    { id: 'g2', game_type: 'tournament', variant: 'nlh', buy_in: 55, registered_count: 45, name: "Sunday Deepstack", club_name: "Vegas Grinders", start_time: new Date().toISOString() },
    { id: 'g3', game_type: 'cash', variant: 'plo', stakes: [2, 5], seating: 8, player_count: 8, name: "Omaha Kings PLO", club_name: "Omaha Kings", status: 'active' },
    { id: 'g4', game_type: 'cash', variant: 'nlh', stakes: [0.5, 1], seating: 6, player_count: 3, name: "Casual Micro 6-Max", club_name: "Beginners Club", status: 'active' },
    { id: 'g5', game_type: 'tournament', variant: 'nlh', buy_in: 11, registered_count: 120, name: "Bounty Builder (PKO)", club_name: "Smarter Poker Club", start_time: new Date(Date.now() + 86400000).toISOString() }
];

export const ClubArenaLobby: React.FC<ClubArenaLobbyProps> = ({ userId, onEnterClub }) => {
    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Check if user has previously accepted (stored in localStorage)
    useEffect(() => {
        const accepted = localStorage.getItem(`smarter_poker_club_disclaimer_${userId}`);
        if (accepted === 'true') {
            setDisclaimerAccepted(true);
        }
        setIsLoading(false);
    }, [userId]);

    const handleDisclaimerAccept = () => {
        // Store acceptance
        localStorage.setItem(`smarter_poker_club_disclaimer_${userId}`, 'true');
        localStorage.setItem(`smarter_poker_club_disclaimer_timestamp_${userId}`, new Date().toISOString());
        setDisclaimerAccepted(true);
    };

    // Show loading state
    if (isLoading) {
        return (
            <div style={lobbyStyles.loadingContainer}>
                <div style={lobbyStyles.loader}>Loading Club Arena...</div>
            </div>
        );
    }

    return (
        <div style={lobbyStyles.container}>
            {/* MANDATORY DISCLAIMER POPUP — Must accept before accessing */}
            <DisclaimerPopup
                isVisible={!disclaimerAccepted}
                onAccept={handleDisclaimerAccept}
            />

            {/* CLUB LOBBY CONTENT — Only shown after disclaimer accepted */}
            {disclaimerAccepted && (
                <div style={lobbyStyles.lobbyContent}>
                    <header style={lobbyStyles.header}>
                        <h1 style={lobbyStyles.title}>🏛️ Club Arena</h1>
                        <p style={lobbyStyles.subtitle}>Play Money Home Games — Train With Friends</p>

                        {/* Play Money Badge */}
                        <div style={lobbyStyles.playMoneyBadge}>
                            🎮 PLAY MONEY ONLY — NO CASH VALUE
                        </div>
                    </header>

                    {/* Endless Game Carousel (World Hub Logic) */}
                    <div style={lobbyStyles.clubList}>
                        <GameCarousel 
                            games={MOCK_GAMES} 
                            onGameSelect={(game) => {
                                console.log("Selected game:", game);
                                if (onEnterClub) onEnterClub(game.id);
                            }}
                        />
                    </div>

                    {/* Footer Reminder */}
                    <footer style={lobbyStyles.footer}>
                        <p style={lobbyStyles.footerText}>
                            Remember: Club Arena is for entertainment only.
                            Play money has no cash value.
                            <Link href="/terms" style={lobbyStyles.footerLink}> View Terms</Link>
                        </p>
                    </footer>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 POPUP STYLES
// ─────────────────────────────────────────────────────────────────────────────

const popupStyles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(10px)',
    },
    modal: {
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        background: 'linear-gradient(180deg, #0a1628 0%, #050f1e 100%)',
        borderRadius: '24px',
        border: '2px solid rgba(255, 77, 77, 0.5)',
        boxShadow: '0 0 60px rgba(255, 77, 77, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        padding: '24px',
        borderBottom: '1px solid rgba(255, 77, 77, 0.3)',
        textAlign: 'center',
    },
    warningIcon: {
        fontSize: '48px',
        marginBottom: '12px',
    },
    title: {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '24px',
        fontWeight: 700,
        color: '#ff4d4d',
        margin: 0,
    },
    subtitle: {
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: '8px',
    },
    contentScroll: {
        flex: 1,
        padding: '24px',
        overflowY: 'auto',
        maxHeight: '400px',
    },
    disclaimerBox: {
        padding: '20px',
        background: 'rgba(255, 77, 77, 0.1)',
        border: '1px solid rgba(255, 77, 77, 0.3)',
        borderRadius: '12px',
        marginBottom: '20px',
    },
    disclaimerText: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        lineHeight: 1.8,
        color: '#ffffff',
        fontWeight: 500,
        whiteSpace: 'pre-line',
        textAlign: 'center',
    },
    policySection: {
        marginBottom: '20px',
    },
    sectionTitle: {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#00D4FF',
        marginBottom: '12px',
    },
    policyList: {
        margin: 0,
        paddingLeft: '20px',
        listStyle: 'disc',
        fontSize: '13px',
        lineHeight: 2,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    scrollHint: {
        textAlign: 'center',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        padding: '12px',
    },
    acceptSection: {
        padding: '24px',
        borderTop: '1px solid rgba(0, 212, 255, 0.2)',
        background: 'rgba(0, 0, 0, 0.3)',
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        marginBottom: '20px',
        cursor: 'pointer',
    },
    checkbox: {
        width: '20px',
        height: '20px',
        marginTop: '2px',
        accentColor: '#00D4FF',
    },
    checkboxText: {
        fontSize: '13px',
        lineHeight: 1.6,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    link: {
        color: '#00D4FF',
        textDecoration: 'underline',
    },
    acceptButton: {
        width: '100%',
        padding: '16px',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        border: 'none',
        borderRadius: '12px',
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#000000',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    footerNote: {
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        marginTop: '16px',
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 LOBBY STYLES
// ─────────────────────────────────────────────────────────────────────────────

const lobbyStyles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        background: '#0a1628',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    loadingContainer: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a1628',
    },
    loader: {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '16px',
        color: '#00D4FF',
    },
    lobbyContent: {
        padding: '40px',
        maxWidth: '1200px',
        margin: '0 auto',
    },
    header: {
        textAlign: 'center',
        marginBottom: '40px',
    },
    title: {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '32px',
        fontWeight: 700,
        color: '#ffffff',
        margin: 0,
    },
    subtitle: {
        fontSize: '16px',
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: '8px',
    },
    playMoneyBadge: {
        display: 'inline-block',
        marginTop: '16px',
        padding: '10px 24px',
        background: 'rgba(0, 255, 102, 0.1)',
        border: '1px solid rgba(0, 255, 102, 0.3)',
        borderRadius: '20px',
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '12px',
        fontWeight: 600,
        color: '#00ff66',
    },
    clubList: {
        marginBottom: '40px',
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px 40px',
        background: 'rgba(0, 212, 255, 0.05)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: '20px',
    },
    emptyIcon: {
        fontSize: '64px',
        marginBottom: '16px',
    },
    emptyTitle: {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '20px',
        fontWeight: 600,
        color: '#ffffff',
        marginBottom: '8px',
    },
    emptyText: {
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: '24px',
    },
    createButton: {
        padding: '14px 32px',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        border: 'none',
        borderRadius: '12px',
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#000000',
        cursor: 'pointer',
    },
    footer: {
        textAlign: 'center',
        padding: '20px',
        borderTop: '1px solid rgba(0, 212, 255, 0.1)',
    },
    footerText: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.4)',
    },
    footerLink: {
        color: '#00D4FF',
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 📦 EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default ClubArenaLobby;
