/**
 * ═══════════════════════════════════════════════════════════════════════
 * AUDIO CONFIGURATION - Simple mapping for audio files
 * 
 * HOW TO USE:
 * 1. Download audio from Epidemic Sound, Artlist, etc.
 * 2. Save to /public/audio/ folder
 * 3. Tell the agent which file to use for which slot
 * 
 * Example: "Use cinematic-hit-epic.mp3 for the intro"
 * ═══════════════════════════════════════════════════════════════════════
 */

export const AUDIO_CONFIG = {
    // ═══════════════════════════════════════════════════════════════════
    // CINEMATIC INTRO - Plays when user first logs in or creates account
    // Recommended: 2-4 second epic hit/logo reveal sound
    // ═══════════════════════════════════════════════════════════════════
    cinematicIntro: {
        file: null, // Set to filename like 'cinematic-intro.mp3'
        volume: 0.8,
        description: 'Epic intro sound for first-time login (2-4 seconds)'
    },

    // ═══════════════════════════════════════════════════════════════════
    // UI SOUNDS - Button clicks, navigation, etc.
    // ═══════════════════════════════════════════════════════════════════
    buttonClick: {
        file: null,
        volume: 0.5,
        description: 'Subtle click for buttons'
    },

    cardHover: {
        file: null,
        volume: 0.3,
        description: 'Soft whoosh when hovering cards'
    },

    cardSelect: {
        file: null,
        volume: 0.6,
        description: 'Satisfying click when selecting a card'
    },

    // ═══════════════════════════════════════════════════════════════════
    // NOTIFICATION SOUNDS
    // ═══════════════════════════════════════════════════════════════════
    notification: {
        file: null,
        volume: 0.5,
        description: 'Alert for new notifications'
    },

    message: {
        file: null,
        volume: 0.5,
        description: 'New message received'
    },

    // ═══════════════════════════════════════════════════════════════════
    // REWARD SOUNDS
    // ═══════════════════════════════════════════════════════════════════
    diamondReward: {
        file: null,
        volume: 0.7,
        description: 'Celebrating diamond rewards'
    },

    xpGain: {
        file: null,
        volume: 0.5,
        description: 'XP increase notification'
    },

    levelUp: {
        file: null,
        volume: 0.8,
        description: 'Level up celebration'
    },

    // ═══════════════════════════════════════════════════════════════════
    // GAME SOUNDS (for training games, etc.)
    // ═══════════════════════════════════════════════════════════════════
    correctAnswer: {
        file: null,
        volume: 0.6,
        description: 'Correct answer in training games'
    },

    wrongAnswer: {
        file: null,
        volume: 0.5,
        description: 'Wrong answer feedback'
    },

    timerTick: {
        file: null,
        volume: 0.3,
        description: 'Timer countdown tick'
    },

    timerWarning: {
        file: null,
        volume: 0.6,
        description: 'Low time warning (last 10 seconds)'
    }
};

/**
 * Get the full path to an audio file
 */
export function getAudioPath(key: keyof typeof AUDIO_CONFIG): string | null {
    const config = AUDIO_CONFIG[key];
    if (!config.file) return null;
    return `/audio/${config.file}`;
}

/**
 * Play an audio file
 */
export function playAudio(key: keyof typeof AUDIO_CONFIG): void {
    const path = getAudioPath(key);
    if (!path) {
        console.log(`[Audio] No file configured for: ${key}`);
        return;
    }

    const config = AUDIO_CONFIG[key];
    const audio = new Audio(path);
    audio.volume = config.volume;
    audio.play().catch(err => {
        console.warn(`[Audio] Failed to play ${key}:`, err.message);
    });
}
