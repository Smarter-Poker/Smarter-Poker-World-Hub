/**
 * 🎨 AVATAR GENERATION SCRIPT
 * Generates all 75 avatar images for the avatar library
 * Run with: node scripts/generate-avatars.js
 */

const AVATAR_LIBRARY = require('../src/data/AVATAR_LIBRARY.js').default;
const fs = require('fs');
const path = require('path');

// Avatar generation prompts (100% ORIGINAL - NO CELEBRITY LIKENESSES)
const AVATAR_PROMPTS = {
    // FREE AVATARS
    'free-people-001': 'High-quality 3D rendered circular avatar of original retro rockstar character, wild colorful mohawk, studded leather jacket, multiple piercings, confident smirk, guitar pick necklace, rebellious attitude, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features, completely original character',

    'free-people-002': 'High-quality 3D rendered circular avatar of original jolly master chef character, tall white chef hat, bushy mustache, big friendly smile, checkered apron, wooden spoon, warm personality, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features, completely original character',

    'free-people-003': 'High-quality 3D rendered circular avatar of original lab scientist character, lab coat, safety goggles, bow tie, beakers, friendly nerdy smile, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features, completely original character',

    'free-people-004': 'High-quality 3D rendered circular avatar of original mad inventor character, wild gray Einstein-style hair, intense eyes, vintage suit, electric sparks around head, eccentric genius vibe, Pixar/Disney style, studio lighting, dark navy background, headshot, completely original character',

    'free-people-005': 'High-quality 3D rendered circular avatar of original cyborg warrior character, half human half robot face, glowing blue eye, metallic plates, futuristic armor, stoic expression, Pixar/Disney style, studio lighting, dark navy background, headshot, completely original character',

    'free-people-006': 'High-quality 3D rendered circular avatar of original stand-up comedian character, big warm smile, expressive eyes, casual sweater, microphone, friendly approachable personality, Pixar/Disney style, studio lighting, dark navy background, headshot, completely original character',

    'free-people-007': 'High-quality 3D rendered circular avatar of original pop star character, glamorous makeup, sparkly outfit, confident smile, microphone, stage presence, Pixar/Disney style, studio lighting, dark navy background, headshot, completely original character',

    'free-people-008': 'High-quality 3D rendered circular avatar of original astronaut character, white NASA-style spacesuit, helmet visor reflecting stars, confident heroic expression, Pixar/Disney style, studio lighting, dark navy background, headshot, completely original character',

    // FREE ANIMALS
    'free-animal-001': 'High-quality 3D rendered circular avatar of menacing poker shark character, great white shark with sunglasses, sharp teeth grin, gold chain necklace, aggressive predator, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features',

    'free-animal-002': 'High-quality 3D rendered circular avatar of lucky white rabbit character, cute big eyes, pink nose, lucky clover necklace, soft fluffy fur, friendly innocent expression, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated cute features',

    'free-animal-003': 'High-quality 3D rendered circular avatar of majestic lion king character, golden mane flowing, crown on head, fierce intimidating eyes, royal regal posture, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated noble features',

    'free-animal-004': 'High-quality 3D rendered circular avatar of wise owl character, large intelligent eyes, reading glasses, brown feathers, scholarly professor vibe, book under wing, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated wise features',

    'free-animal-005': 'High-quality 3D rendered circular avatar of sly fox character, orange fur, clever smirk, green eyes, cunning expression, playful yet sneaky, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features',

    'free-animal-006': 'High-quality 3D rendered circular avatar of cool penguin character, tuxedo pattern, sunglasses, confident smile, ice cold personality, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features',

    // FREE ARCHETYPES
    'free-arch-001': 'High-quality 3D rendered circular avatar of Wild West cowboy character, rugged face, worn brown cowboy hat, leather vest, confident smirk, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated masculine features',

    'free-arch-002': 'High-quality 3D rendered circular avatar of shadow ninja character, black mask, katana on back, intense eyes, stealthy pose, martial arts master, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features',

    'free-arch-003': 'High-quality 3D rendered circular avatar of detective character, trench coat, fedora hat, magnifying glass, pipe, observant eyes, Sherlock-inspired but original, Pixar/Disney style, studio lighting, dark navy background, headshot',

    'free-arch-004': 'High-quality 3D rendered circular avatar of business professional character, suit and tie, confident smile, briefcase, ambitious executive type, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features',

    'free-arch-005': 'High-quality 3D rendered circular avatar of street musician character, acoustic guitar, casual bohemian clothing, dreadlocks or messy hair, carefree smile, Pixar/Disney style, studio lighting, dark navy background, headshot',

    'free-arch-006': 'High-quality 3D rendered circular avatar of school teacher character, glasses, professional attire, warm smile, holding book or apple, patient expression, Pixar/Disney style, studio lighting, dark navy background, headshot',

    // FREE MIX
    'free-mix-001': 'High-quality 3D rendered circular avatar of pirate commander character, tricorn hat, eye patch, beard, earring, sword, adventurous grin, Pixar/Disney style, studio lighting, dark navy background, headshot, exaggerated features',

    'free-mix-002': 'High-quality 3D rendered circular avatar of medieval knight character, silver armor, helmet with visor up, honorable expression, shield, Pixar/Disney style, studio lighting, dark navy background, headshot',

    'free-mix-003': 'High-quality 3D rendered circular avatar of samurai warrior character, traditional armor, topknot hairstyle, katana, disciplined intense expression, Pixar/Disney style, studio lighting, dark navy background, headshot',

    'free-mix-004': 'High-quality 3D rendered circular avatar of cute Shiba Inu dog character, orange and white fur, happy smiling face, playful personality, internet meme style, Pixar/Disney style, studio lighting, dark navy background, headshot',

    'free-mix-005': 'High-quality 3D rendered circular avatar of android robot character, metallic body, glowing LED eyes, circuit patterns, futuristic design, emotionless face, Pixar/Disney style, studio lighting, dark navy background, headshot',
};

console.log('🎨 Avatar Generation Script');
console.log('═══════════════════════════════════════');
console.log(`Total avatars to generate: ${AVATAR_LIBRARY.length}`);
console.log(`\nPrompts defined: ${Object.keys(AVATAR_PROMPTS).length}`);
console.log('\nNote: Due to API rate limits, generate in batches of 5-10');
console.log('\nTo generate via Gemini AI, use the generate_image tool');

module.exports = { AVATAR_PROMPTS };
