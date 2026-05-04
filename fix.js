const fs = require('fs');
let content = fs.readFileSync('src/components/social/ReelsFeedCarousel.jsx', 'utf8');

content = content.replace(
    /}\n\n\/\/ Main Reels Feed Carousel component\nexport function ReelsFeedCarousel\(\) {/g,
    '});\n\n// Main Reels Feed Carousel component\nexport function ReelsFeedCarousel() {'
);

fs.writeFileSync('src/components/social/ReelsFeedCarousel.jsx', content);
