/**
 * SMARTER.POKER MESSENGER COLOR PALETTE
 */

export function getTheme(dark) {
    return {
        bg: dark ? '#1C1E21' : '#F0F2F5',
        card: dark ? '#242526' : '#FFFFFF',
        text: dark ? '#E4E6EB' : '#050505',
        textSec: dark ? '#B0B3B8' : '#65676B',
        blue: '#0084FF',
        blueHover: '#0073E6',
        green: '#31A24C',
        purple: '#8A2BE2',
        gold: '#FFD700',
        red: '#E41E3F',
        border: dark ? '#3E4042' : '#E4E6EB',
        hoverBg: dark ? '#3A3B3C' : '#E4E6EB',
        ownBubble: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)',
        otherBubble: dark ? '#3A3B3C' : '#E4E6EB',
        pokerGreen: '#35654d',
        pokerFelt: '#1a472a',
        chipGold: '#FFD700',
        cardRed: '#E41E3F',
        muted: dark ? '#8A8D91' : '#90949C',
    };
}

export const defaultTheme = getTheme(false);
