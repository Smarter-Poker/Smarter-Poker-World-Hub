/**
 * AVATAR LIBRARY — 75 Pre-Made User Avatars
 * ═══════════════════════════════════════════════════════════════════════════
 * Complete avatar library for user profile selection:
 * - 25 FREE avatars (accessible to all users)
 * - 50 VIP avatars (restricted to VIP members)
 * - 100% ORIGINAL characters - NO celebrity likenesses
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Avatar categories
export const AVATAR_CATEGORIES = {
    PEOPLE: { id: 'people', name: 'People & Professions', icon: '◆' },
    ANIMALS: { id: 'animals', name: 'Animals', icon: '◆' },
    ARCHETYPES: { id: 'archetypes', name: 'Archetypes', icon: '◆' },
    FANTASY: { id: 'fantasy', name: 'Fantasy', icon: '◆' },
    CULTURE: { id: 'culture', name: 'Culture', icon: '◆' },
    SPORTS: { id: 'sports', name: 'Sports', icon: '◆' },
};

// Player personality archetypes (maps to playing style)
export const PERSONALITY_TYPES = {
    SHARK: 'shark',        // Aggressive, winning
    FISH: 'fish',          // Passive, beginner
    NIT: 'nit',            // Tight, conservative
    LAG: 'lag',            // Loose aggressive
    MYSTERY: 'mystery',    // Unpredictable
    FRIENDLY: 'friendly',  // Recreational
    INTIMIDATING: 'intimidating', // Serious pro
    WILD: 'wild',          // Crazy, loose
};

// Complete avatar library (100% ORIGINAL CHARACTERS).
// 97 avatars: 25 FREE, 72 VIP-locked (Dan 2026-08-27: "25 FREE REST GATED").
export const AVATAR_LIBRARY = [
    // ═══════════════════════════════════════════════════════════════════════
    // FREE AVATARS (25) - Mix across all categories.
    // The header said 25 while the list held 23; Dan's 2026-08-27 ruling set the
    // number at 25, so the two sports avatars below were promoted to close the
    // gap - `sports` was the only category with NO free option at all.
    // ═══════════════════════════════════════════════════════════════════════

    // FREE - People & Professions (8)
    {
        id: 'free-people-001',
        name: 'Retro Rockstar',
        description: 'Wild Hair, Don\'t care',
        category: 'people',
        tier: 'FREE',
        personality: 'wild',
        image: '/avatars/free/rockstar.webp',
        tags: ['music', 'retro', 'energetic']
    },
    {
        id: 'free-people-002',
        name: 'Master Chef',
        description: 'Cooking up Wins',
        category: 'people',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/chef.webp',
        tags: ['cooking', 'friendly', 'jovial']
    },
    {
        id: 'free-people-003',
        name: 'Lab Scientist',
        description: 'Calculated Plays',
        category: 'people',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/wizard.webp',
        tags: ['science', 'smart', 'methodical']
    },


    {
        id: 'free-people-007',
        name: 'Pop Star',
        description: 'Center of Attention',
        category: 'people',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/musician.webp',
        tags: ['music', 'glamorous', 'confident']
    },
    {
        id: 'free-people-008',
        name: 'Space Explorer',
        description: 'Reaching for the Stars',
        category: 'people',
        tier: 'FREE',
        personality: 'shark',
        image: '/avatars/free/space_commander.webp',
        tags: ['space', 'adventurous', 'brave']
    },

    // FREE - Animals (6)
    {
        id: 'free-animal-001',
        name: 'Poker Shark',
        description: 'Apex Predator',
        category: 'animals',
        tier: 'FREE',
        personality: 'shark',
        image: '/avatars/free/shark.webp',
        tags: ['predator', 'aggressive', 'intimidating']
    },
    // Dan 2026-08-20: this entry was 'Lucky Rabbit', pointing at a rabbit.png
    // that has never existed in public/avatars/free/. It was the one broken
    // tile in the gallery: a permanently failed image request sitting in the
    // free grid. No user_avatars row ever selected it, so it is repointed at
    // real artwork rather than left 404ing. viking.png was one of four free
    // files the library never referenced.
    {
        id: 'free-animal-002',
        name: 'Norse Raider',
        description: 'Raiding the Pot',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'intimidating',
        image: '/avatars/free/viking.webp',
        tags: ['warrior', 'bold', 'aggressive']
    },
    {
        id: 'free-animal-003',
        name: 'King Lion',
        description: 'Jungle Ruler',
        category: 'animals',
        tier: 'FREE',
        personality: 'intimidating',
        image: '/avatars/free/lion.webp',
        tags: ['royal', 'strong', 'majestic']
    },
    {
        id: 'free-animal-004',
        name: 'Wise Owl',
        description: 'Sees All Angles',
        category: 'animals',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/owl.webp',
        tags: ['wise', 'observant', 'patient']
    },
    {
        id: 'free-animal-005',
        name: 'Sly Fox',
        description: 'Crafty Player',
        category: 'animals',
        tier: 'FREE',
        personality: 'lag',
        image: '/avatars/free/fox.webp',
        tags: ['clever', 'sneaky', 'tactical']
    },
    {
        id: 'free-animal-006',
        name: 'Cool Penguin',
        description: 'Ice Cold Bluffs',
        category: 'animals',
        tier: 'FREE',
        personality: 'mystery',
        image: '/avatars/free/penguin.webp',
        tags: ['cool', 'mysterious', 'calm']
    },

    // FREE - Archetypes (6)
    {
        id: 'free-arch-001',
        name: 'Wild West Cowboy',
        description: 'Shootout Specialist',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'lag',
        image: '/avatars/free/cowboy.webp',
        tags: ['western', 'aggressive', 'bold']
    },
    {
        id: 'free-arch-002',
        name: 'Shadow Ninja',
        description: 'Silent and Deadly',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'mystery',
        image: '/avatars/free/ninja.webp',
        tags: ['stealth', 'mysterious', 'tactical']
    },
    {
        id: 'free-arch-003',
        name: 'Detective',
        description: 'Reading Every Tell',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/detective.webp',
        tags: ['observant', 'smart', 'analytical']
    },
    {
        id: 'free-arch-004',
        name: 'Business Pro',
        description: 'All About the Profit',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'shark',
        image: '/avatars/free/business.webp',
        tags: ['professional', 'calculating', 'ambitious']
    },
    // Dan 2026-08-20: 'Street Musician' pointed at musician.png, the very same
    // file as 'Pop Star' above — two tiles, two names, one picture, so the
    // grid looked like it was repeating itself. Repointed at cyborg.png, which
    // the library had never referenced.
    {
        id: 'free-arch-005',
        name: 'Street Cyborg',
        description: 'Running the Numbers',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'mystery',
        image: '/avatars/free/cyborg.webp',
        tags: ['tech', 'calculating', 'futuristic']
    },
    {
        id: 'free-arch-006',
        name: 'School Teacher',
        description: 'Teaching Lessons',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/teacher.webp',
        tags: ['educational', 'patient', 'helpful']
    },
    // Dan 2026-08-20: aztec.png and geisha.png shipped in public/avatars/free/
    // but no library entry ever named them, so they were unreachable art. The
    // free tier is 24 files; it now lists all 24.
    {
        id: 'free-arch-007',
        name: 'Aztec Warrior',
        description: 'Ancient Instincts',
        category: 'culture',
        tier: 'FREE',
        personality: 'intimidating',
        image: '/avatars/free/aztec.webp',
        tags: ['ancient', 'fierce', 'proud']
    },
    {
        id: 'free-arch-008',
        name: 'Geisha',
        description: 'Perfect Composure',
        category: 'culture',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/geisha.webp',
        tags: ['elegant', 'composed', 'traditional']
    },

    // FREE - Fantasy & Culture Mix (5)
    {
        id: 'free-mix-001',
        name: 'Pirate Commander',
        description: 'Plundering Pots',
        category: 'fantasy',
        tier: 'FREE',
        personality: 'lag',
        image: '/avatars/free/pirate.webp',
        tags: ['adventure', 'risky', 'bold']
    },
    {
        id: 'free-mix-002',
        name: 'Medieval Knight',
        description: 'Honorable Combat',
        category: 'fantasy',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/knight.webp',
        tags: ['honor', 'disciplined', 'strong']
    },
    {
        id: 'free-mix-003',
        name: 'Samurai Warrior',
        description: 'Bushido Poker',
        category: 'culture',
        tier: 'FREE',
        personality: 'intimidating',
        image: '/avatars/free/samurai.webp',
        tags: ['discipline', 'honor', 'focused']
    },
    {
        id: 'free-mix-004',
        name: 'Shiba Inu',
        description: 'Such Chips, Much Wow',
        category: 'animals',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/shiba.webp',
        tags: ['meme', 'fun', 'playful']
    },


    // ═══════════════════════════════════════════════════════════════════════
    // VIP AVATARS (50) - Premium Original Characters
    // ═══════════════════════════════════════════════════════════════════════

    // VIP - People & Professions (20)
    {
        id: 'vip-people-001',
        name: 'Political Leader',
        description: 'Power Player',
        category: 'people',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/politician.webp',
        tags: ['leadership', 'influential', 'strategic']
    },
    {
        id: 'vip-people-002',
        name: 'Rock Legend',
        description: 'Born to Win',
        category: 'people',
        tier: 'VIP',
        personality: ' wild',
        image: '/avatars/vip/rock_legend.webp',
        tags: ['music', 'legendary', 'passionate']
    },
    {
        id: 'vip-people-003',
        name: 'Tech Mogul',
        description: 'Disrupting the Game',
        category: 'people',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/tech_mogul.webp',
        tags: ['tech', 'innovative', 'ambitious']
    },
    {
        id: 'vip-people-004',
        name: 'Aerospace Pioneer',
        description: 'To Mars and Beyond',
        category: 'people',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/space_pioneer.webp',
        tags: ['visionary', 'bold', 'ambitious']
    },
    {
        id: 'vip-people-005',
        name: 'Silent Film Actor',
        description: 'Actions Speak Volumes',
        category: 'people',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/silent_actor.webp',
        tags: ['classic', 'expressive', 'artistic']
    },
    {
        id: 'vip-people-006',
        name: 'Liberty Statue',
        description: 'Freedom to Win',
        category: 'culture',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/liberty.webp',
        tags: ['icon', 'symbolic', 'majestic']
    },
    {
        id: 'vip-people-007',
        name: 'Royal Monarch',
        description: 'Royal Flush Master',
        category: 'culture',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/monarch.webp',
        tags: ['royalty', 'elegant', 'refined']
    },
    {
        id: 'vip-people-008',
        name: 'Hollywood Star',
        description: 'Glamour and Glory',
        category: 'people',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/hollywood.webp',
        tags: ['glamorous', 'charismatic', 'dazzling']
    },
    {
        id: 'vip-people-009',
        name: 'Pro Wrestler',
        description: 'Smackdown Specialist',
        category: 'sports',
        tier: 'FREE',
        personality: 'intimidating',
        image: '/avatars/vip/wrestler.webp',
        tags: ['strong', 'entertaining', 'fierce']
    },
    {
        id: 'vip-people-010',
        name: 'Football Pro',
        description: 'Game-winning Drive',
        category: 'sports',
        tier: 'FREE',
        personality: 'shark',
        image: '/avatars/vip/football.webp',
        tags: ['athletic', 'competitive', 'focused']
    },
    {
        id: 'vip-people-011',
        name: 'Basketball Star',
        description: 'Dunking on Opponents',
        category: 'sports',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/basketball.webp',
        tags: ['athletic', 'skilled', 'dominant']
    },
    {
        id: 'vip-people-012',
        name: 'Soccer Champion',
        description: 'Scoring Goals',
        category: 'sports',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/soccer.webp',
        tags: ['athletic', 'global', 'talented']
    },
    {
        id: 'vip-people-013',
        name: 'Boxing Champion',
        description: 'Float and Sting',
        category: 'sports',
        tier: 'VIP',
        personality: 'lag',
        image: '/avatars/vip/boxer.webp',
        tags: ['fighter', 'strategic', 'quick']
    },
    {
        id: 'vip-people-014',
        name: 'Physics Professor',
        description: 'Relative Advantage',
        category: 'people',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/physicist.webp',
        tags: ['genius', 'intellectual', 'analytical']
    },
    {
        id: 'vip-people-015',
        name: 'Renaissance Artist',
        description: 'Masterpiece Maker',
        category: 'culture',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/artist.webp',
        tags: ['creative', 'timeless', 'visionary']
    },
    {
        id: 'vip-people-016',
        name: 'Hip-Hop Artist',
        description: 'Dropping Bars and Chips',
        category: 'people',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/rapper.webp',
        tags: ['music', 'rhythmic', 'bold']
    },
    {
        id: 'vip-people-017',
        name: 'Dance Icon',
        description: 'Smooth Moves Only',
        category: 'people',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/dancer.webp',
        tags: ['music rhythmic', 'graceful']
    },
    {
        id: 'vip-people-018',
        name: 'Country Singer',
        description: 'Taking Chances',
        category: 'people',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/country.webp',
        tags: ['music', 'soulful', 'authentic']
    },
    {
        id: 'vip-people-019',
        name: 'Jazz Musician',
        description: 'Improvising Wins',
        category: 'people',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/jazz.webp',
        tags: ['music', 'smooth', 'artistic']
    },
    {
        id: 'vip-people-020',
        name: 'Horror Director',
        description: 'Scaring Opponents',
        category: 'people',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/director.webp',
        tags: ['creative', 'intense', 'dramatic']
    },

    // VIP - Fantasy & Fiction (15)
    {
        id: 'vip-fantasy-001',
        name: 'Secret Agent',
        description: 'Licensed to Win',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/secret_agent.webp',
        tags: ['spy', 'suave', 'tactical']
    },

    {
        id: 'vip-fantasy-004',
        name: 'Dragon Emperor',
        description: 'Fire Breathing Bluffer',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/dragon.webp',
        tags: ['mythical', 'powerful', 'majestic']
    },
    {
        id: 'vip-fantasy-005',
        name: 'Phoenix Rising',
        description: 'Comeback Specialist',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/phoenix.webp',
        tags: ['mythical', 'resilient', 'rare']
    },
    {
        id: 'vip-fantasy-006',
        name: 'Unicorn Magic',
        description: 'Pure Enchantment',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/unicorn.webp',
        tags: ['mythical', 'magical', 'rare']
    },
    {
        id: 'vip-fantasy-007',
        name: 'Vampire Count',
        description: 'Draining Chip Stacks',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/vampire.webp',
        tags: ['gothic', 'mysterious', 'elegant']
    },
    {
        id: 'vip-fantasy-008',
        name: 'Elite Cyborg',
        description: 'Upgraded Plays',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/elite_cyborg.webp',
        tags: ['tech', 'advanced', 'powerful']
    },
    {
        id: 'vip-fantasy-009',
        name: 'Plague Doctor',
        description: 'Curing Bad Beats',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/plague_doctor.webp',
        tags: ['historical', 'eerie', 'unique']
    },
    {
        id: 'vip-fantasy-010',
        name: 'Space Ranger',
        description: 'To Infinity!',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/space_ranger.webp',
        tags: ['hero', 'adventurous', 'brave']
    },
    {
        id: 'vip-fantasy-011',
        name: 'Ancient Mummy',
        description: 'Timeless Tactics',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/mummy.webp',
        tags: ['ancient', 'mysterious', 'cursed']
    },
    {
        id: 'vip-fantasy-012',
        name: 'Galactic Alien',
        description: 'Out of This World',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/alien.webp',
        tags: ['space', 'unique', 'mysterious']
    },
    {
        id: 'vip-fantasy-013',
        name: 'Ice Queen',
        description: 'Cold as Ice',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/ice_queen.webp',
        tags: ['magical', 'elegant', 'powerful']
    },
    {
        id: 'vip-fantasy-014',
        name: 'Fire Demon',
        description: 'Burning Opponents',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/fire_demon.webp',
        tags: ['fierce', 'powerful', 'aggressive']
    },
    {
        id: 'vip-fantasy-015',
        name: 'Guardian Angel',
        description: 'Divine Protection',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/angel.webp',
        tags: ['benevolent', 'protective', 'pure']
    },

    // VIP - Animals (10)
    {
        id: 'vip-animal-001',
        name: 'Grumpy Cat',
        description: 'Not Impressed',
        category: 'animals',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/grumpy_cat.webp',
        tags: ['meme', 'sassy', 'funny']
    },
    {
        id: 'vip-animal-002',
        name: 'Business Cat',
        description: 'CEO of Chips',
        category: 'animals',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/business_cat.webp',
        tags: ['meme', 'professional', 'ambitious']
    },
    {
        id: 'vip-animal-003',
        name: 'Pug Life',
        description: 'Living the Dream',
        category: 'animals',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/pug.webp',
        tags: ['cute', 'cheerful', 'lovable']
    },
    {
        id: 'vip-animal-004',
        name: 'Majestic Eagle',
        description: 'Soaring Above All',
        category: 'animals',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/eagle.webp',
        tags: ['powerful', 'majestic', 'sharp']
    },
    {
        id: 'vip-animal-005',
        name: 'Honey Badger',
        description: 'Fearless Fighter',
        category: 'animals',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/badger.webp',
        tags: ['fearless', 'aggressive', 'tough']
    },
    {
        id: 'vip-animal-006',
        name: 'Charging Bull',
        description: 'Full Steam Ahead',
        category: 'animals',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/bull.webp',
        tags: ['strong', 'aggressive', 'powerful']
    },
    {
        id: 'vip-animal-007',
        name: 'Alpha Wolf',
        description: 'Pack Leader',
        category: 'animals',
        tier: 'VIP',
        personality: 'lag',
        image: '/avatars/vip/wolf.webp',
        tags: ['strategic', 'loyal', 'fierce']
    },
    {
        id: 'vip-animal-008',
        name: 'Wise Gorilla',
        description: 'Jungle Strategist',
        category: 'animals',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/gorilla.webp',
        tags: ['wise', 'strong', 'patient']
    },
    {
        id: 'vip-animal-009',
        name: 'Sneaky Panther',
        description: 'Shadow Hunter',
        category: 'animals',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/panther.webp',
        tags: ['stealthy', 'elegant', 'dangerous']
    },
    {
        id: 'vip-animal-010',
        name: 'Grizzly Bear',
        description: 'Raw Power',
        category: 'animals',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/bear.webp',
        tags: ['powerful', 'fierce', 'dominant']
    },

    // VIP - Culture & History (5)
    {
        id: 'vip-culture-001',
        name: 'Egyptian Pharaoh',
        description: 'Ancient Royalty',
        category: 'culture',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/pharaoh.webp',
        tags: ['historical', 'royal', 'powerful']
    },
    {
        id: 'vip-culture-002',
        name: 'Viking Warrior',
        description: 'Nordic Raider',
        category: 'culture',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/viking_warrior.webp',
        tags: ['warrior', 'fierce', 'bold']
    },
    {
        id: 'vip-culture-003',
        name: 'Geisha Master',
        description: 'Graceful Artisan',
        category: 'culture',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/geisha_master.webp',
        tags: ['elegant', 'cultural', 'refined']
    },
    {
        id: 'vip-culture-004',
        name: 'Aztec Warrior',
        description: 'Ancient Champion',
        category: 'culture',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/aztec_warrior.webp',
        tags: ['historical', 'warrior', 'fierce']
    },
    {
        id: 'vip-culture-005',
        name: 'Spartan Hero',
        description: 'This is Poker!',
        category: 'culture',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/spartan.webp',
        tags: ['warrior', 'disciplined', 'legendary']
    },

    // NEW VIP AVATARS ADDED
    {
        id: 'vip-new-001',
        name: 'Arctic Explorer',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/arctic_explorer.webp',
        tags: ['vip', 'premium', 'arctic']
    },
    {
        id: 'vip-new-002',
        name: 'Astronaut',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/astronaut.webp',
        tags: ['vip', 'premium', 'astronaut']
    },
    {
        id: 'vip-new-003',
        name: 'Bounty Hunter',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/bounty_hunter.webp',
        tags: ['vip', 'premium', 'bounty']
    },
    {
        id: 'vip-new-004',
        name: 'Casino Dealer',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/casino_dealer.webp',
        tags: ['vip', 'premium', 'casino']
    },
    {
        id: 'vip-new-005',
        name: 'Cyber Assassin',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/cyber_assassin.webp',
        tags: ['vip', 'premium', 'cyber']
    },
    {
        id: 'vip-new-006',
        name: 'Cyber Punk',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/cyber_punk.webp',
        tags: ['vip', 'premium', 'cyber']
    },
    {
        id: 'vip-new-007',
        name: 'Dj',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/dj.webp',
        tags: ['vip', 'premium', 'dj']
    },
    {
        id: 'vip-new-008',
        name: 'Galactic Emperor',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/galactic_emperor.webp',
        tags: ['vip', 'premium', 'galactic']
    },
    {
        id: 'vip-new-009',
        name: 'Gladiator',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/gladiator.webp',
        tags: ['vip', 'premium', 'gladiator']
    },
    {
        id: 'vip-new-010',
        name: 'Hacker',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/hacker.webp',
        tags: ['vip', 'premium', 'hacker']
    },
    {
        id: 'vip-new-011',
        name: 'Luchador',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/luchador.webp',
        tags: ['vip', 'premium', 'luchador']
    },
    {
        id: 'vip-new-012',
        name: 'Mad Scientist',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/mad_scientist.webp',
        tags: ['vip', 'premium', 'mad']
    },
    {
        id: 'vip-new-013',
        name: 'Mecha Pilot',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/mecha_pilot.webp',
        tags: ['vip', 'premium', 'mecha']
    },
    {
        id: 'vip-new-014',
        name: 'Mobster',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/mobster.webp',
        tags: ['vip', 'premium', 'mobster']
    },
    {
        id: 'vip-new-015',
        name: 'Neon Ninja',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/neon_ninja.webp',
        tags: ['vip', 'premium', 'neon']
    },
    {
        id: 'vip-new-016',
        name: 'Phantom',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/phantom.webp',
        tags: ['vip', 'premium', 'phantom']
    },
    {
        id: 'vip-new-017',
        name: 'Royal Guard',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/royal_guard.webp',
        tags: ['vip', 'premium', 'royal']
    },
    {
        id: 'vip-new-018',
        name: 'Samurai Cyborg',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/samurai_cyborg.webp',
        tags: ['vip', 'premium', 'samurai']
    },
    {
        id: 'vip-new-019',
        name: 'Sorceress',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/sorceress.webp',
        tags: ['vip', 'premium', 'sorceress']
    },
    {
        id: 'vip-new-020',
        name: 'Space Pirate',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/space_pirate.webp',
        tags: ['vip', 'premium', 'space']
    },
    {
        id: 'vip-new-021',
        name: 'Steampunk Inventor',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/steampunk_inventor.webp',
        tags: ['vip', 'premium', 'steampunk']
    },
    {
        id: 'vip-new-022',
        name: 'Street Racer',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/street_racer.webp',
        tags: ['vip', 'premium', 'street']
    },
    {
        id: 'vip-new-023',
        name: 'Tiger Boss',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/tiger_boss.webp',
        tags: ['vip', 'premium', 'tiger']
    },
    {
        id: 'vip-new-024',
        name: 'Vampire Hunter',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/vampire_hunter.webp',
        tags: ['vip', 'premium', 'vampire']
    },
    {
        id: 'vip-new-025',
        name: 'Voodoo Priest',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/voodoo_priest.webp',
        tags: ['vip', 'premium', 'voodoo']
    },
    {
        id: 'vip-new-026',
        name: 'Yakuza',
        description: 'Premium VIP Avatar',
        category: 'archetypes',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/yakuza.webp',
        tags: ['vip', 'premium', 'yakuza']
    },
];

// Helper functions
export const getFreeAvatars = () =>
    AVATAR_LIBRARY.filter(a => a.tier === 'FREE');

export const getVIPAvatars = () =>
    AVATAR_LIBRARY.filter(a => a.tier === 'VIP');

export const getAvatarsByCategory = (category) =>
    AVATAR_LIBRARY.filter(a => a.category === category);

export const getAvatarsByPersonality = (personality) =>
    AVATAR_LIBRARY.filter(a => a.personality === personality);

export const getAvatarById = (id) =>
    AVATAR_LIBRARY.find(a => a.id === id);

export const getRandomAvatar = (tier = null) => {
    const pool = tier ? AVATAR_LIBRARY.filter(a => a.tier === tier) : AVATAR_LIBRARY;
    return pool[Math.floor(Math.random() * pool.length)];
};

export const getCategories = () => {
    const categories = [...new Set(AVATAR_LIBRARY.map(a => a.category))];
    return categories;
};

export const getAll = () => AVATAR_LIBRARY;

export const getByTier = (tier) => AVATAR_LIBRARY.filter(a => a.tier === tier.toUpperCase());

// Stats
export const AVATAR_STATS = {
    total: AVATAR_LIBRARY.length,
    free: getFreeAvatars().length,
    vip: getVIPAvatars().length,
    categories: Object.keys(AVATAR_CATEGORIES || {}).length,
};

export default AVATAR_LIBRARY;
