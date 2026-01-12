/* ═══════════════════════════════════════════════════════════════════════════
   VANGUARD SILVER — MASTER REGISTRY INDEX
   Empire Hub Synchronization Protocol
   
   All sub-projects officially indexed as global children of Next.js framework
   ═══════════════════════════════════════════════════════════════════════════ */

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

    // Orb Manifest — Registry of all 11 orbs
    orbManifest: {
        path: 'src/orbs/manifest/registry.ts',
        type: 'core',
        description: '11-orb configuration with colors, labels, and images',
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
    onboardingOverlay: 'src/world/components/OnboardingOverlay.tsx',
    liveHelpOrb: 'src/world/components/LiveHelpOrb.tsx',
    liveHelpPanel: 'src/world/components/LiveHelp/',
    neuronLights: 'src/world/components/NeuronLights.tsx',
};

// ─────────────────────────────────────────────────────────────────────────────
// 📊 STATE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
export const STATE_STORES = {
    worldStore: 'src/state/worldStore.ts',
    userPreferences: 'src/state/userPreferences.ts',
};

// ─────────────────────────────────────────────────────────────────────────────
// 🃏 CARD ASSETS (public/cards)
// ─────────────────────────────────────────────────────────────────────────────
export const CARD_ASSETS = [
    'bankroll-manager.jpg',
    'club-arena.jpg',
    'diamond-arcade.jpg',
    'diamond-arena.jpg',
    'marketplace-settings.jpg',
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
    root: 'pages/index.js',
    hub: 'pages/hub/index.js',
    login: 'pages/auth/login.js',
    callback: 'pages/auth/callback.ts',
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
};

console.log('📋 Vanguard Silver Master Registry Loaded');
console.log(`   ${Object.keys(MASTER_REGISTRY).length} Core Systems`);
console.log(`   ${Object.keys(WORLD_COMPONENTS).length} World Components`);
console.log(`   ${Object.keys(UI_COMPONENTS).length} UI Components`);
console.log(`   ${CARD_ASSETS.length} Card Assets`);
