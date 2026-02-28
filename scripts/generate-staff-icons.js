/**
 * Generate all 10 Staff & Operations icons programmatically
 * Uses ONE base background with SVG icon overlays for pixel-perfect consistency
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'images', 'commander', 'icons');
const SIZE = 640;

// The single shared SVG background template - dark brushed steel panel with screws and red neon border
function createBackground() {
    return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="steel" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="#4a4a4a"/>
        <stop offset="45%" stop-color="#383838"/>
        <stop offset="100%" stop-color="#1a1a1a"/>
      </radialGradient>
      <radialGradient id="steelShine" cx="45%" cy="40%" r="50%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
      <filter id="neonGlow">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="textShadow">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <radialGradient id="screwGrad" cx="40%" cy="35%">
        <stop offset="0%" stop-color="#555"/>
        <stop offset="100%" stop-color="#111"/>
      </radialGradient>
    </defs>

    <!-- Pure black outer area -->
    <rect width="${SIZE}" height="${SIZE}" fill="#0a0a0a" rx="40"/>

    <!-- Main panel body -->
    <rect x="20" y="20" width="${SIZE - 40}" height="${SIZE - 40}" rx="28" fill="url(#steel)"
      stroke="#222" stroke-width="3"/>

    <!-- Brushed steel texture lines -->
    ${Array.from({ length: 60 }, (_, i) => {
        const y = 30 + i * 10;
        const opacity = 0.02 + Math.random() * 0.03;
        return `<line x1="25" y1="${y}" x2="${SIZE - 25}" y2="${y}" stroke="rgba(255,255,255,${opacity})" stroke-width="0.5"/>`;
    }).join('\n    ')}

    <!-- Circular brushed metal sheen -->
    <rect x="20" y="20" width="${SIZE - 40}" height="${SIZE - 40}" rx="28" fill="url(#steelShine)"/>

    <!-- Red neon inner border -->
    <rect x="42" y="42" width="${SIZE - 84}" height="${SIZE - 84}" rx="16" fill="none"
      stroke="#EF4444" stroke-width="3" filter="url(#neonGlow)" opacity="0.9"/>

    <!-- Corner screws -->
    <circle cx="46" cy="46" r="10" fill="url(#screwGrad)" stroke="#0a0a0a" stroke-width="2"/>
    <line x1="40" y1="46" x2="52" y2="46" stroke="#333" stroke-width="1.5"/>
    <line x1="46" y1="40" x2="46" y2="52" stroke="#333" stroke-width="1.5"/>

    <circle cx="${SIZE - 46}" cy="46" r="10" fill="url(#screwGrad)" stroke="#0a0a0a" stroke-width="2"/>
    <line x1="${SIZE - 52}" y1="46" x2="${SIZE - 40}" y2="46" stroke="#333" stroke-width="1.5"/>
    <line x1="${SIZE - 46}" y1="40" x2="${SIZE - 46}" y2="52" stroke="#333" stroke-width="1.5"/>

    <circle cx="46" cy="${SIZE - 46}" r="10" fill="url(#screwGrad)" stroke="#0a0a0a" stroke-width="2"/>
    <line x1="40" y1="${SIZE - 46}" x2="52" y2="${SIZE - 46}" stroke="#333" stroke-width="1.5"/>
    <line x1="46" y1="${SIZE - 52}" x2="46" y2="${SIZE - 40}" stroke="#333" stroke-width="1.5"/>

    <circle cx="${SIZE - 46}" cy="${SIZE - 46}" r="10" fill="url(#screwGrad)" stroke="#0a0a0a" stroke-width="2"/>
    <line x1="${SIZE - 52}" y1="${SIZE - 46}" x2="${SIZE - 40}" y2="${SIZE - 46}" stroke="#333" stroke-width="1.5"/>
    <line x1="${SIZE - 46}" y1="${SIZE - 52}" x2="${SIZE - 46}" y2="${SIZE - 40}" stroke="#333" stroke-width="1.5"/>
  </svg>`;
}

// Create icon overlay SVG with the red neon icon + text
function createIconOverlay(iconPath, textLines) {
    const textY = textLines.length === 1 ? 560 : (textLines.length === 2 ? 530 : 510);
    const lineHeight = 50;
    const fontSize = textLines.some(l => l.length > 10) ? 38 : 44;

    const textSvg = textLines.map((line, i) =>
        `<text x="${SIZE / 2}" y="${textY + i * lineHeight}" text-anchor="middle"
      font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="${fontSize}"
      fill="#c8c8c8" letter-spacing="2" filter="url(#textShadow)">${line}</text>`
    ).join('\n    ');

    return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="neonGlow">
        <feGaussianBlur stdDeviation="5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="textShadow">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.7)"/>
      </filter>
    </defs>

    <!-- Icon centered in upper area -->
    <g transform="translate(${SIZE / 2 - 110}, 100)" filter="url(#neonGlow)">
      ${iconPath}
    </g>

    <!-- Text at bottom -->
    ${textSvg}
  </svg>`;
}

// Icon SVG paths (red neon outline style, all drawn at ~220x220 scale)
const ICONS = {
    employee: {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Person silhouette -->
      <circle cx="90" cy="65" r="40"/>
      <path d="M 20 220 Q 20 150 90 140 Q 160 150 160 220"/>
      <!-- Badge/clipboard -->
      <rect x="140" y="80" width="70" height="100" rx="8"/>
      <line x1="155" y1="110" x2="195" y2="110"/>
      <line x1="155" y1="130" x2="195" y2="130"/>
      <line x1="155" y1="150" x2="180" y2="150"/>
      <rect x="163" y="68" width="24" height="16" rx="4"/>
    </g>`,
        text: ['EMPLOYEE', 'MAINTENANCE']
    },
    'time-clock': {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Person outline -->
      <circle cx="80" cy="55" r="35"/>
      <path d="M 15 200 Q 15 140 80 130 Q 130 138 140 170"/>
      <!-- Checkmark -->
      <polyline points="155,35 175,60 215,15" stroke-width="7"/>
      <!-- Clock -->
      <circle cx="160" cy="160" r="55"/>
      <line x1="160" y1="160" x2="160" y2="120"/>
      <line x1="160" y1="160" x2="185" y2="170"/>
    </g>`,
        text: ['TIME CLOCK', 'IN / OUT']
    },
    'poker-room': {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Building with columns -->
      <polygon points="110,20 210,70 10,70"/>
      <line x1="40" y1="70" x2="40" y2="180"/>
      <line x1="80" y1="70" x2="80" y2="180"/>
      <line x1="140" y1="70" x2="140" y2="180"/>
      <line x1="180" y1="70" x2="180" y2="180"/>
      <line x1="10" y1="180" x2="210" y2="180"/>
      <!-- Poker chips -->
      <ellipse cx="80" cy="220" rx="30" ry="12"/>
      <ellipse cx="80" cy="210" rx="30" ry="12"/>
      <ellipse cx="140" cy="225" rx="25" ry="10"/>
      <ellipse cx="140" cy="215" rx="25" ry="10"/>
    </g>`,
        text: ['POKER ROOM', 'FUNCTIONS']
    },
    'staff-schedule': {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Calendar -->
      <rect x="10" y="40" width="160" height="150" rx="12"/>
      <line x1="10" y1="80" x2="170" y2="80"/>
      <line x1="55" y1="25" x2="55" y2="55"/>
      <line x1="125" y1="25" x2="125" y2="55"/>
      <!-- Calendar grid -->
      <line x1="65" y1="80" x2="65" y2="190"/>
      <line x1="120" y1="80" x2="120" y2="190"/>
      <line x1="10" y1="117" x2="170" y2="117"/>
      <line x1="10" y1="153" x2="170" y2="153"/>
      <!-- Clock overlay -->
      <circle cx="170" cy="170" r="55"/>
      <line x1="170" y1="170" x2="170" y2="132"/>
      <line x1="170" y1="170" x2="195" y2="180"/>
    </g>`,
        text: ['STAFF', 'SCHEDULE']
    },
    'shift-handoff': {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Handshake -->
      <path d="M 5 130 L 50 90 L 90 100 L 120 80"/>
      <path d="M 215 130 L 170 90 L 130 100 L 120 80"/>
      <path d="M 50 90 L 30 130 L 55 155 L 85 140 L 115 155 L 140 140"/>
      <path d="M 170 90 L 190 130 L 165 155 L 135 140"/>
      <!-- Cuff lines -->
      <line x1="5" y1="130" x2="5" y2="185"/>
      <line x1="5" y1="185" x2="55" y2="185"/>
      <line x1="215" y1="130" x2="215" y2="185"/>
      <line x1="215" y1="185" x2="165" y2="185"/>
    </g>`,
        text: ['SHIFT', 'HANDOFF']
    },
    cashier: {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Cash register body -->
      <rect x="20" y="100" width="180" height="110" rx="10"/>
      <!-- Register top/display -->
      <rect x="40" y="50" width="100" height="50" rx="6"/>
      <rect x="50" y="60" width="80" height="25" rx="3"/>
      <!-- Buttons -->
      <circle cx="70" cy="140" r="10"/>
      <circle cx="110" cy="140" r="10"/>
      <circle cx="150" cy="140" r="10"/>
      <circle cx="70" cy="170" r="10"/>
      <circle cx="110" cy="170" r="10"/>
      <circle cx="150" cy="170" r="10"/>
      <!-- Cash drawer -->
      <line x1="20" y1="210" x2="200" y2="210"/>
      <rect x="80" y="210" width="60" height="20" rx="4"/>
    </g>`,
        text: ['CASHIER']
    },
    'time-billing': {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Dollar sign -->
      <path d="M 100 20 C 50 20, 30 55, 65 80 C 100 105, 40 130, 40 150 C 40 185, 80 200, 120 200"/>
      <path d="M 120 20 C 170 20, 190 55, 155 80 C 120 105, 180 130, 180 150 C 180 185, 140 200, 100 200"/>
      <line x1="110" y1="5" x2="110" y2="30"/>
      <line x1="110" y1="190" x2="110" y2="220"/>
      <!-- Clock overlay -->
      <circle cx="55" cy="155" r="50"/>
      <line x1="55" y1="155" x2="55" y2="120"/>
      <line x1="55" y1="155" x2="78" y2="163"/>
    </g>`,
        text: ['TIME', 'BILLING']
    },
    incidents: {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Warning triangle -->
      <polygon points="110,20 210,210 10,210" stroke-width="7"/>
      <!-- Exclamation mark -->
      <line x1="110" y1="80" x2="110" y2="155" stroke-width="8"/>
      <circle cx="110" cy="180" r="6" fill="#EF4444"/>
    </g>`,
        text: ['INCIDENTS']
    },
    'room-presets': {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Slider tracks -->
      <line x1="45" y1="30" x2="45" y2="210"/>
      <line x1="95" y1="30" x2="95" y2="210"/>
      <line x1="145" y1="30" x2="145" y2="210"/>
      <line x1="195" y1="30" x2="195" y2="210"/>
      <!-- Slider handles -->
      <rect x="30" y="80" width="30" height="22" rx="5" fill="#EF4444" opacity="0.3"/>
      <rect x="30" y="80" width="30" height="22" rx="5"/>
      <rect x="80" y="120" width="30" height="22" rx="5" fill="#EF4444" opacity="0.3"/>
      <rect x="80" y="120" width="30" height="22" rx="5"/>
      <rect x="130" y="60" width="30" height="22" rx="5" fill="#EF4444" opacity="0.3"/>
      <rect x="130" y="60" width="30" height="22" rx="5"/>
      <rect x="180" y="140" width="30" height="22" rx="5" fill="#EF4444" opacity="0.3"/>
      <rect x="180" y="140" width="30" height="22" rx="5"/>
      <!-- Knobs at top -->
      <circle cx="45" cy="30" r="10"/>
      <circle cx="95" cy="30" r="10"/>
      <circle cx="145" cy="30" r="10"/>
      <circle cx="195" cy="30" r="10"/>
    </g>`,
        text: ['ROOM', 'PRESETS']
    },
    'game-types': {
        path: `<g fill="none" stroke="#EF4444" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Playing cards fanned -->
      <g transform="rotate(-20, 60, 200)">
        <rect x="30" y="30" width="90" height="130" rx="8"/>
        <text x="50" y="70" fill="#EF4444" font-size="28" font-weight="bold" font-family="Arial">10</text>
        <text x="55" y="140" fill="#EF4444" font-size="22">♠</text>
      </g>
      <g transform="rotate(-10, 90, 200)">
        <rect x="50" y="25" width="90" height="130" rx="8"/>
        <text x="70" y="65" fill="#EF4444" font-size="28" font-weight="bold" font-family="Arial">J</text>
        <text x="75" y="135" fill="#EF4444" font-size="22">♥</text>
      </g>
      <g transform="rotate(0, 110, 200)">
        <rect x="70" y="20" width="90" height="130" rx="8"/>
        <text x="90" y="60" fill="#EF4444" font-size="28" font-weight="bold" font-family="Arial">Q</text>
        <text x="95" y="130" fill="#EF4444" font-size="22">♦</text>
      </g>
      <g transform="rotate(10, 130, 200)">
        <rect x="90" y="25" width="90" height="130" rx="8"/>
        <text x="110" y="65" fill="#EF4444" font-size="28" font-weight="bold" font-family="Arial">K</text>
        <text x="115" y="135" fill="#EF4444" font-size="22">♠</text>
      </g>
      <g transform="rotate(20, 150, 200)">
        <rect x="110" y="30" width="90" height="130" rx="8"/>
        <text x="130" y="70" fill="#EF4444" font-size="28" font-weight="bold" font-family="Arial">A</text>
        <text x="135" y="140" fill="#EF4444" font-size="22">♥</text>
      </g>
    </g>`,
        text: ['GAME TYPES']
    }
};

async function generateIcon(name, config) {
    const bgSvg = createBackground();
    const overlaySvg = createIconOverlay(config.path, config.text);

    const bgBuffer = Buffer.from(bgSvg);
    const overlayBuffer = Buffer.from(overlaySvg);

    const outputPath = path.join(OUTPUT_DIR, `mg-${name}.png`);

    await sharp(bgBuffer)
        .resize(SIZE, SIZE)
        .composite([{ input: overlayBuffer, top: 0, left: 0 }])
        .png()
        .toFile(outputPath);

    console.log(`✓ Generated: ${outputPath}`);
}

async function main() {
    console.log('Generating 10 Staff & Operations icons...');
    console.log(`Output: ${OUTPUT_DIR}\n`);

    for (const [name, config] of Object.entries(ICONS)) {
        await generateIcon(name, config);
    }

    console.log('\n✅ All 10 icons generated with identical backgrounds!');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
