const fs = require('fs');
const path = require('path');

const sources = [
    { id: 'POKERGO', name: 'PokerGO' },
    { id: 'NEEME', name: 'Andrew Neeme' },
    { id: 'RAMPAGE', name: 'Rampage Poker' },
    { id: 'MARIANO', name: 'Mariano' },
    { id: 'WOLFGANG', name: 'Wolfgang Poker' },
    { id: 'JOHNNIE', name: 'JohnnieVibes' },
    { id: 'JLITTLE', name: 'Jonathan Little' },
    { id: 'POLK', name: 'Doug Polk' },
    { id: 'BART', name: 'Bart Hanson' },
    { id: 'UPSWING', name: 'Upswing Poker' },
    { id: 'NEGREANU', name: 'Daniel Negreanu' },
    { id: 'HELLMUTH', name: 'Phil Hellmuth' },
    { id: 'IVEY', name: 'Phil Ivey' },
    { id: 'DWAN', name: 'Tom Dwan' },
    { id: 'GARRETT', name: 'Garrett Adelstein' }
];

const outDir = path.join(__dirname, '../public/images/video-sources');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

sources.forEach(src => {
    // extract initials (up to 2 letters)
    let initials = '';
    const parts = src.name.split(' ');
    if (parts.length > 1) {
        initials = (parts[0][0] + parts[1][0]).toUpperCase();
    } else {
        initials = src.name.substring(0, 2).toUpperCase();
    }
    
    // Generate metal-style SVG
    const svg = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141c28"/>
      <stop offset="100%" stop-color="#0c1018"/>
    </linearGradient>
    <linearGradient id="metalRing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a0b0c0"/>
      <stop offset="50%" stop-color="#405060"/>
      <stop offset="100%" stop-color="#a0b0c0"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="256" height="256" rx="64" fill="url(#bg)"/>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="none" stroke="url(#metalRing)" stroke-width="16"/>
  <text x="128" y="160" font-family="-apple-system, system-ui, sans-serif" font-size="96" font-weight="900" fill="#becde1" text-anchor="middle" letter-spacing="-4">${initials}</text>
</svg>
    `.trim();
    
    const filename = src.id.toLowerCase() + '.svg';
    fs.writeFileSync(path.join(outDir, filename), svg);
    console.log('Created ' + filename);
});
