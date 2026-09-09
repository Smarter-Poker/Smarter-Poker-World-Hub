/* ═══════════════════════════════════════════════════════════════════════════
   VANGUARD SILVER — MASTER REGISTRY INDEX
   Empire Hub Synchronization Protocol
   
   All sub-projects officially indexed as global children of Next.js framework
   ═══════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
// 🚪 GATEWAY NODES (PUBLIC FACING)
// ─────────────────────────────────────────────────────────────────────────────
export const GATEWAY_NODES = {
    landingPage: {
        path: 'pages/index.js',
        type: 'gateway',
        description: 'Marketing Landing Page - Video game aesthetic, Orange Ball accents',
        features: ['Hero Section', 'Orb Study Previews', 'Diamond Multiplier Preview', 'Stats Bar'],
    },
    signIn: {
        path: 'pages/auth/signin.js',
        type: 'gateway',
        description: 'Sign-In Access Node - Phone OTP via Supabase + Twilio',
        redirectTo: '/hub',
    },
    signUp: {
        path: 'pages/auth/signup.js',
        type: 'gateway',
        description: 'Sign-Up Registration Node - Profile initialization (Diamonds=0, Multiplier=1x)',
        redirectTo: '/hub',
        initializesProfile: true,
    },
    callback: {
        path: 'pages/auth/callback.js',
        type: 'gateway',
        description: 'OAuth Callback Handler',
        redirectTo: '/hub',
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 CORE ENGINE SYSTEMS
// ─────────────────────────────────────────────────────────────────────────────
export const MASTER_REGISTRY = {
    // Neural Engine — 3D background effects and brain visualization
    neuralEngine: {
        path: 'src/engine/NeuralField.tsx',
        type: 'core',
        description: 'Animated neural network background with brain traces',
    },

    // Carousel System — 3D card carousel for orb navigation
    carouselSystem: {
        path: 'src/world/carousel',
        type: 'core',
        children: [
            'CarouselEngine.tsx',
            'CarouselLabels.tsx',
            'OrbCore.tsx',
        ],
        description: 'Snap-to-center 3D card carousel with gesture support',
    },

    // World HUD — Main heads-up display components
    worldHud: {
        path: 'src/components/WorldHUD.tsx',
        type: 'core',
        description: 'Status indicators, orb navigator, and instructions',
    },

    // Orb Manifest — Registry of all 10 orbs (Marketplace removed)
    orbManifest: {
        path: 'src/orbs/manifest/registry.ts',
        type: 'core',
        description: '10-orb configuration with colors, labels, and images',
        orbs: [
            'social-media',
            'club-arena',
            'training',
            'preflop-charts',
            'personal-assistant',

            'bankroll-manager',
            'poker-near-me',
            'trivia',
        ],
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 🌍 WORLD COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
export const WORLD_COMPONENTS = {
    worldHub: 'src/world/WorldHub.tsx',
    worldCanvas: 'src/world/WorldCanvas.tsx',
    worldEffects: 'src/world/WorldEffects.tsx',
    profileOrb: 'src/world/ProfileOrb.tsx',
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
export const UI_COMPONENTS = {
    headerStats: 'src/world/components/HeaderStats.tsx',
    welcomeMessage: 'src/world/components/WelcomeMessage.tsx',
    streakPopup: 'src/world/components/StreakPopup.tsx',
    globalSearch: 'src/world/components/GlobalSearch.tsx',
    profileDropdown: 'src/world/components/ProfileDropdown.tsx',
    geevesOrb: 'src/world/components/GeevesOrb.tsx',     // Geeves = Live Help
    geevesPanel: 'src/world/components/Geeves/',          // Geeves = Live Help
    jarvisPanel: 'src/world/components/Jarvis/',          // Jarvis = Personal Assistant
    neuronLights: 'src/world/components/NeuronLights.tsx',
    settingsOrb: 'src/world/components/SettingsOrb.tsx',
};

// ─────────────────────────────────────────────────────────────────────────────
// 📊 STATE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
export const STATE_STORES = {
    worldStore: 'src/state/worldStore.ts',
    userPreferences: 'src/state/userPreferences.ts',
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 AUTHENTICATION & SERVICES
// ─────────────────────────────────────────────────────────────────────────────
export const SERVICES = {
    supabaseClient: 'src/lib/supabase.ts',
    authMethod: 'Phone OTP via Twilio',
    profileTable: 'profiles',
    profileInitialization: {
        diamonds: 0,
        diamond_multiplier: 1.0,
        streak_days: 0,
        skill_tier: 'Newcomer',
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 🃏 CARD ASSETS (public/cards)
// ─────────────────────────────────────────────────────────────────────────────
export const CARD_ASSETS = [
    'bankroll-manager.jpg',
    'club-arena.jpg',

    'memory-games.jpg',
    'personal-assistant.jpg',
    'poker-near-me.jpg',
    'social-media.jpg',
    'training.jpg',
    'trivia.jpg',
];

// ─────────────────────────────────────────────────────────────────────────────
// 📄 NEXT.JS PAGES
// ─────────────────────────────────────────────────────────────────────────────
export const PAGES = {
    // Gateway
    landing: 'pages/index.js',
    signIn: 'pages/auth/signin.js',
    signUp: 'pages/auth/signup.js',
    callback: 'pages/auth/callback.js',
    // Core
    hub: 'pages/hub/index.js',
    // Framework
    app: 'pages/_app.js',
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 BUILD CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
export const BUILD_CONFIG = {
    framework: 'Next.js 14',
    runtime: 'Node.js',
    deployment: 'Vercel',
    projectRef: 'hub-vanguard',
    supabaseRef: 'kuklfnapbkmacvwxktbh',
    domain: 'smarter.poker',
};

console.log('📋 Vanguard Silver Master Registry Loaded');
console.log(`   ${Object.keys(GATEWAY_NODES || {}).length} Gateway Nodes`);
console.log(`   ${Object.keys(MASTER_REGISTRY || {}).length} Core Systems`);
console.log(`   ${Object.keys(WORLD_COMPONENTS || {}).length} World Components`);
console.log(`   ${Object.keys(UI_COMPONENTS || {}).length} UI Components`);
console.log(`   ${CARD_ASSETS.length} Card Assets`);
