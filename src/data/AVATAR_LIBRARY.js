/**
 * 🎭 AVATAR LIBRARY — 75 Pre-Made User Avatars
 * ═══════════════════════════════════════════════════════════════════════════
 * Complete avatar library for user profile selection:
 * - 25 FREE avatars (accessible to all users)
 * - 50 VIP avatars (restricted to VIP members)
 * - 100% ORIGINAL characters - NO celebrity likenesses
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Avatar categories
export const AVATAR_CATEGORIES = {
    PEOPLE: { id: 'people', name: 'People & Professions', icon: '👤' },
    ANIMALS: { id: 'animals', name: 'Animals', icon: '🦁' },
    ARCHETYPES: { id: 'archetypes', name: 'Archetypes', icon: '🎭' },
    FANTASY: { id: 'fantasy', name: 'Fantasy', icon: '🧙' },
    CULTURE: { id: 'culture', name: 'Culture', icon: '🌍' },
    SPORTS: { id: 'sports', name: 'Sports', icon: '⚽' },
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

// Complete 75-avatar library (100% ORIGINAL CHARACTERS)
export const AVATAR_LIBRARY = [
    // ═══════════════════════════════════════════════════════════════════════
    // FREE AVATARS (25) - Mix across all categories
    // ═══════════════════════════════════════════════════════════════════════

    // FREE - People & Professions (8)
    {
        id: 'free-people-001',
        name: 'Retro Rockstar',
        description: 'Wild hair, don\'t care',
        category: 'people',
        tier: 'FREE',
        personality: 'wild',
        image: '/avatars/free/rockstar.png',
        tags: ['music', 'retro', 'energetic']
    },
    {
        id: 'free-people-002',
        name: 'Master Chef',
        description: 'Cooking up wins',
        category: 'people',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/chef.png',
        tags: ['cooking', 'friendly', 'jovial']
    },
    {
        id: 'free-people-003',
        name: 'Lab Scientist',
        description: 'Calculated plays',
        category: 'people',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/scientist.png',
        tags: ['science', 'smart', 'methodical']
    },
    {
        id: 'free-people-004',
        name: 'Mad Inventor',
        description: 'Chaotic genius',
        category: 'people',
        tier: 'FREE',
        personality: 'wild',
        image: '/avatars/free/inventor.png',
        tags: ['science', 'wild', 'eccentric']
    },
    {
        id: 'free-people-005',
        name: 'Cyborg Warrior',
        description: 'Half human, all poker',
        category: 'fantasy',
        tier: 'FREE',
        personality: 'intimidating',
        image: '/avatars/free/cyborg.png',
        tags: ['tech', 'futuristic', 'strong']
    },
    {
        id: 'free-people-006',
        name: 'Stand-Up Comic',
        description: 'Always joking around',
        category: 'people',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/comedian.png',
        tags: ['comedy', 'fun', 'energetic']
    },
    {
        id: 'free-people-007',
        name: 'Pop Star',
        description: 'Center of attention',
        category: 'people',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/popstar.png',
        tags: ['music', 'glamorous', 'confident']
    },
    {
        id: 'free-people-008',
        name: 'Space Explorer',
        description: 'Reaching for the stars',
        category: 'people',
        tier: 'FREE',
        personality: 'shark',
        image: '/avatars/free/astronaut.png',
        tags: ['space', 'adventurous', 'brave']
    },

    // FREE - Animals (6)
    {
        id: 'free-animal-001',
        name: 'Poker Shark',
        description: 'Apex predator',
        category: 'animals',
        tier: 'FREE',
        personality: 'shark',
        image: '/avatars/free/shark.png',
        tags: ['predator', 'aggressive', 'intimidating']
    },
    {
        id: 'free-animal-002',
        name: 'Lucky Rabbit',
        description: 'Hopping to victory',
        category: 'animals',
        tier: 'FREE',
        personality: 'fish',
        image: '/avatars/free/rabbit.png',
        tags: ['cute', 'lucky', 'friendly']
    },
    {
        id: 'free-animal-003',
        name: 'King Lion',
        description: 'Jungle ruler',
        category: 'animals',
        tier: 'FREE',
        personality: 'intimidating',
        image: '/avatars/free/lion.png',
        tags: ['royal', 'strong', 'majestic']
    },
    {
        id: 'free-animal-004',
        name: 'Wise Owl',
        description: 'Sees all angles',
        category: 'animals',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/owl.png',
        tags: ['wise', 'observant', 'patient']
    },
    {
        id: 'free-animal-005',
        name: 'Sly Fox',
        description: 'Crafty player',
        category: 'animals',
        tier: 'FREE',
        personality: 'lag',
        image: '/avatars/free/fox.png',
        tags: ['clever', 'sneaky', 'tactical']
    },
    {
        id: 'free-animal-006',
        name: 'Cool Penguin',
        description: 'Ice cold bluffs',
        category: 'animals',
        tier: 'FREE',
        personality: 'mystery',
        image: '/avatars/free/penguin.png',
        tags: ['cool', 'mysterious', 'calm']
    },

    // FREE - Archetypes (6)
    {
        id: 'free-arch-001',
        name: 'Wild West Cowboy',
        description: 'Shootout specialist',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'lag',
        image: '/avatars/free/cowboy.png',
        tags: ['western', 'aggressive', 'bold']
    },
    {
        id: 'free-arch-002',
        name: 'Shadow Ninja',
        description: 'Silent and deadly',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'mystery',
        image: '/avatars/free/ninja.png',
        tags: ['stealth', 'mysterious', 'tactical']
    },
    {
        id: 'free-arch-003',
        name: 'Detective',
        description: 'Reading every tell',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/detective.png',
        tags: ['observant', 'smart', 'analytical']
    },
    {
        id: 'free-arch-004',
        name: 'Business Pro',
        description: 'All about the profit',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'shark',
        image: '/avatars/free/businessman.png',
        tags: ['professional', 'calculating', 'ambitious']
    },
    {
        id: 'free-arch-005',
        name: 'Street Musician',
        description: 'Playing for keeps',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/musician.png',
        tags: ['creative', 'passionate', 'free-spirit']
    },
    {
        id: 'free-arch-006',
        name: 'School Teacher',
        description: 'Teaching lessons',
        category: 'archetypes',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/teacher.png',
        tags: ['educational', 'patient', 'helpful']
    },

    // FREE - Fantasy & Culture Mix (5)
    {
        id: 'free-mix-001',
        name: 'Pirate Captain',
        description: 'Plundering pots',
        category: 'fantasy',
        tier: 'FREE',
        personality: 'lag',
        image: '/avatars/free/pirate.png',
        tags: ['adventure', 'risky', 'bold']
    },
    {
        id: 'free-mix-002',
        name: 'Medieval Knight',
        description: 'Honorable combat',
        category: 'fantasy',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/knight.png',
        tags: ['honor', 'disciplined', 'strong']
    },
    {
        id: 'free-mix-003',
        name: 'Samurai Warrior',
        description: 'Bushido poker',
        category: 'culture',
        tier: 'FREE',
        personality: 'intimidating',
        image: '/avatars/free/samurai.png',
        tags: ['discipline', 'honor', 'focused']
    },
    {
        id: 'free-mix-004',
        name: 'Shiba Inu',
        description: 'Such chips, much wow',
        category: 'animals',
        tier: 'FREE',
        personality: 'friendly',
        image: '/avatars/free/shiba.png',
        tags: ['meme', 'fun', 'playful']
    },
    {
        id: 'free-mix-005',
        name: 'android Bot',
        description: 'Pure logic, no emotion',
        category: 'fantasy',
        tier: 'FREE',
        personality: 'nit',
        image: '/avatars/free/robot.png',
        tags: ['ai', 'calculated', 'methodical']
    },

    // ═══════════════════════════════════════════════════════════════════════
    // VIP AVATARS (50) - Premium Original Characters
    // ═══════════════════════════════════════════════════════════════════════

    // VIP - People & Professions (20)
    {
        id: 'vip-people-001',
        name: 'Political Leader',
        description: 'Power player',
        category: 'people',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/politician.png',
        tags: ['leadership', 'influential', 'strategic']
    },
    {
        id: 'vip-people-002',
        name: 'Rock Legend',
        description: 'Born to win',
        category: 'people',
        tier: 'VIP',
        personality: ' wild',
        image: '/avatars/vip/rock-legend.png',
        tags: ['music', 'legendary', 'passionate']
    },
    {
        id: 'vip-people-003',
        name: 'Tech Mogul',
        description: 'Disrupting the game',
        category: 'people',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/tech-mogul.png',
        tags: ['tech', 'innovative', 'ambitious']
    },
    {
        id: 'vip-people-004',
        name: 'Aerospace Pioneer',
        description: 'To Mars and beyond',
        category: 'people',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/space-pioneer.png',
        tags: ['visionary', 'bold', 'ambitious']
    },
    {
        id: 'vip-people-005',
        name: 'Silent Film Actor',
        description: 'Actions speak volumes',
        category: 'people',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/silent-actor.png',
        tags: ['classic', 'expressive', 'artistic']
    },
    {
        id: 'vip-people-006',
        name: 'Liberty Statue',
        description: 'Freedom to win',
        category: 'culture',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/liberty.png',
        tags: ['icon', 'symbolic', 'majestic']
    },
    {
        id: 'vip-people-007',
        name: 'Royal Monarch',
        description: 'Royal flush master',
        category: 'culture',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/monarch.png',
        tags: ['royalty', 'elegant', 'refined']
    },
    {
        id: 'vip-people-008',
        name: 'Hollywood Star',
        description: 'Glamour and glory',
        category: 'people',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/hollywood-star.png',
        tags: ['glamorous', 'charismatic', 'dazzling']
    },
    {
        id: 'vip-people-009',
        name: 'Pro Wrestler',
        description: 'Smackdown specialist',
        category: 'sports',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/wrestler.png',
        tags: ['strong', 'entertaining', 'fierce']
    },
    {
        id: 'vip-people-010',
        name: 'Football Pro',
        description: 'Game-winning drive',
        category: 'sports',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/football-pro.png',
        tags: ['athletic', 'competitive', 'focused']
    },
    {
        id: 'vip-people-011',
        name: 'Basketball Star',
        description: 'Dunking on opponents',
        category: 'sports',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/basketball-star.png',
        tags: ['athletic', 'skilled', 'dominant']
    },
    {
        id: 'vip-people-012',
        name: 'Soccer Champion',
        description: 'Scoring goals',
        category: 'sports',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/soccer-champ.png',
        tags: ['athletic', 'global', 'talented']
    },
    {
        id: 'vip-people-013',
        name: 'Boxing Champion',
        description: 'Float and sting',
        category: 'sports',
        tier: 'VIP',
        personality: 'lag',
        image: '/avatars/vip/boxer.png',
        tags: ['fighter', 'strategic', 'quick']
    },
    {
        id: 'vip-people-014',
        name: 'Physics Professor',
        description: 'Relative advantage',
        category: 'people',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/physicist.png',
        tags: ['genius', 'intellectual', 'analytical']
    },
    {
        id: 'vip-people-015',
        name: 'Renaissance Artist',
        description: 'Masterpiece maker',
        category: 'culture',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/artist.png',
        tags: ['creative', 'timeless', 'visionary']
    },
    {
        id: 'vip-people-016',
        name: 'Hip-Hop Artist',
        description: 'Dropping bars and chips',
        category: 'people',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/rapper.png',
        tags: ['music', 'rhythmic', 'bold']
    },
    {
        id: 'vip-people-017',
        name: 'Dance Icon',
        description: 'Smooth moves only',
        category: 'people',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/dancer.png',
        tags: ['music rhythmic', 'graceful']
    },
    {
        id: 'vip-people-018',
        name: 'Country Singer',
        description: 'Taking chances',
        category: 'people',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/country-singer.png',
        tags: ['music', 'soulful', 'authentic']
    },
    {
        id: 'vip-people-019',
        name: 'Jazz Musician',
        description: 'Improvising wins',
        category: 'people',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/jazz-musician.png',
        tags: ['music', 'smooth', 'artistic']
    },
    {
        id: 'vip-people-020',
        name: 'Horror Director',
        description: 'Scaring opponents',
        category: 'people',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/director.png',
        tags: ['creative', 'intense', 'dramatic']
    },

    // VIP - Fantasy & Fiction (15)
    {
        id: 'vip-fantasy-001',
        name: 'Secret Agent',
        description: 'Licensed to win',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/agent.png',
        tags: ['spy', 'suave', 'tactical']
    },
    {
        id: 'vip-fantasy-002',
        name: 'Gray Wizard',
        description: 'You shall not pass',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/wizard.png',
        tags: ['magical', 'wise', 'powerful']
    },
    {
        id: 'vip-fantasy-003',
        name: 'Dark Vigilante',
        description: 'Justice prevails',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/vigilante.png',
        tags: ['hero', 'mysterious', 'tactical']
    },
    {
        id: 'vip-fantasy-004',
        name: 'Dragon Emperor',
        description: 'Fire breathing bluffer',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/dragon.png',
        tags: ['mythical', 'powerful', 'majestic']
    },
    {
        id: 'vip-fantasy-005',
        name: 'Phoenix Rising',
        description: 'Comeback specialist',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/phoenix.png',
        tags: ['mythical', 'resilient', 'rare']
    },
    {
        id: 'vip-fantasy-006',
        name: 'Unicorn Magic',
        description: 'Pure enchantment',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/unicorn.png',
        tags: ['mythical', 'magical', 'rare']
    },
    {
        id: 'vip-fantasy-007',
        name: 'Vampire Count',
        description: 'Draining chip stacks',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/vampire.png',
        tags: ['gothic', 'mysterious', 'elegant']
    },
    {
        id: 'vip-fantasy-008',
        name: 'Elite Cyborg',
        description: 'Upgraded plays',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/cyborg.png',
        tags: ['tech', 'advanced', 'powerful']
    },
    {
        id: 'vip-fantasy-009',
        name: 'Plague Doctor',
        description: 'Curing bad beats',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/plague-doctor.png',
        tags: ['historical', 'eerie', 'unique']
    },
    {
        id: 'vip-fantasy-010',
        name: 'Space Ranger',
        description: 'To infinity!',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/space-ranger.png',
        tags: ['hero', 'adventurous', 'brave']
    },
    {
        id: 'vip-fantasy-011',
        name: 'Ancient Mummy',
        description: 'Timeless tactics',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/mummy.png',
        tags: ['ancient', 'mysterious', 'cursed']
    },
    {
        id: 'vip-fantasy-012',
        name: 'Galactic Alien',
        description: 'Out of this world',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/alien.png',
        tags: ['space', 'unique', 'mysterious']
    },
    {
        id: 'vip-fantasy-013',
        name: 'Ice Queen',
        description: 'Cold as ice',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/ice-queen.png',
        tags: ['magical', 'elegant', 'powerful']
    },
    {
        id: 'vip-fantasy-014',
        name: 'Fire Demon',
        description: 'Burning opponents',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/fire-demon.png',
        tags: ['fierce', 'powerful', 'aggressive']
    },
    {
        id: 'vip-fantasy-015',
        name: 'Guardian Angel',
        description: 'Divine protection',
        category: 'fantasy',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/angel.png',
        tags: ['benevolent', 'protective', 'pure']
    },

    // VIP - Animals (10)
    {
        id: 'vip-animal-001',
        name: 'Grumpy Cat',
        description: 'Not impressed',
        category: 'animals',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/grumpy-cat.png',
        tags: ['meme', 'sassy', 'funny']
    },
    {
        id: 'vip-animal-002',
        name: 'Business Cat',
        description: 'CEO of chips',
        category: 'animals',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/business-cat.png',
        tags: ['meme', 'professional', 'ambitious']
    },
    {
        id: 'vip-animal-003',
        name: 'Pug Life',
        description: 'Living the dream',
        category: 'animals',
        tier: 'VIP',
        personality: 'friendly',
        image: '/avatars/vip/pug.png',
        tags: ['cute', 'cheerful', 'lovable']
    },
    {
        id: 'vip-animal-004',
        name: 'Majestic Eagle',
        description: 'Soaring above all',
        category: 'animals',
        tier: 'VIP',
        personality: 'shark',
        image: '/avatars/vip/eagle.png',
        tags: ['powerful', 'majestic', 'sharp']
    },
    {
        id: 'vip-animal-005',
        name: 'Honey Badger',
        description: 'Fearless fighter',
        category: 'animals',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/honey-badger.png',
        tags: ['fearless', 'aggressive', 'tough']
    },
    {
        id: 'vip-animal-006',
        name: 'Charging Bull',
        description: 'Full steam ahead',
        category: 'animals',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/bull.png',
        tags: ['strong', 'aggressive', 'powerful']
    },
    {
        id: 'vip-animal-007',
        name: 'Alpha Wolf',
        description: 'Pack leader',
        category: 'animals',
        tier: 'VIP',
        personality: 'lag',
        image: '/avatars/vip/wolf.png',
        tags: ['strategic', 'loyal', 'fierce']
    },
    {
        id: 'vip-animal-008',
        name: 'Wise Gorilla',
        description: 'Jungle strategist',
        category: 'animals',
        tier: 'VIP',
        personality: 'nit',
        image: '/avatars/vip/gorilla.png',
        tags: ['wise', 'strong', 'patient']
    },
    {
        id: 'vip-animal-009',
        name: 'Sneaky Panther',
        description: 'Shadow hunter',
        category: 'animals',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/panther.png',
        tags: ['stealthy', 'elegant', 'dangerous']
    },
    {
        id: 'vip-animal-010',
        name: 'Grizzly Bear',
        description: 'Raw power',
        category: 'animals',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/grizzly.png',
        tags: ['powerful', 'fierce', 'dominant']
    },

    // VIP - Culture & History (5)
    {
        id: 'vip-culture-001',
        name: 'Egyptian Pharaoh',
        description: 'Ancient royalty',
        category: 'culture',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/pharaoh.png',
        tags: ['historical', 'royal', 'powerful']
    },
    {
        id: 'vip-culture-002',
        name: 'Viking Warrior',
        description: 'Nordic raider',
        category: 'culture',
        tier: 'VIP',
        personality: 'wild',
        image: '/avatars/vip/viking.png',
        tags: ['warrior', 'fierce', 'bold']
    },
    {
        id: 'vip-culture-003',
        name: 'Geisha Master',
        description: 'Graceful artisan',
        category: 'culture',
        tier: 'VIP',
        personality: 'mystery',
        image: '/avatars/vip/geisha.png',
        tags: ['elegant', 'cultural', 'refined']
    },
    {
        id: 'vip-culture-004',
        name: 'Aztec Warrior',
        description: 'Ancient champion',
        category: 'culture',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/aztec.png',
        tags: ['historical', 'warrior', 'fierce']
    },
    {
        id: 'vip-culture-005',
        name: 'Spartan Hero',
        description: 'This is poker!',
        category: 'culture',
        tier: 'VIP',
        personality: 'intimidating',
        image: '/avatars/vip/spartan.png',
        tags: ['warrior', 'disciplined', 'legendary']
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
    categories: Object.keys(AVATAR_CATEGORIES).length,
};

export default AVATAR_LIBRARY;
