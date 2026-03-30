/**
 * Messenger Color Palette — Shared across extracted messenger components
 */
export const C = {
    bg: '#F0F2F5',
    bgDark: '#1C1E21',
    card: '#FFFFFF',
    cardDark: '#242526',
    text: '#050505',
    textDark: '#E4E6EB',
    textSec: '#65676B',
    textSecDark: '#B0B3B8',
    blue: '#0084FF',
    blueHover: '#0073E6',
    green: '#31A24C',
    purple: '#8A2BE2',
    gold: '#FFD700',
    red: '#E41E3F',
    border: '#E4E6EB',
    borderDark: '#3E4042',
    hoverBg: '#E4E6EB',
    hoverBgDark: '#3A3B3C',
    ownBubble: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)',
    otherBubble: '#E4E6EB',
    otherBubbleDark: '#3A3B3C',
    pokerGreen: '#35654d',
    pokerFelt: '#1a472a',
    chipGold: '#FFD700',
    cardRed: '#E41E3F',
};

/** Utility: time ago formatter */
export function timeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

/** Utility: format message time */
export function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
