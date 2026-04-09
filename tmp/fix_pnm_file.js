const fs = require('fs');
const p = 'pages/hub/poker-near-me.js';
let c = fs.readFileSync(p, 'utf8');

// The bad line 1:
if (c.startsWith('    const [favorites, setFavorites] = useState(() => {')) {
    const lines = c.split('\n');
    // Remove the first 12 lines that were added
    c = lines.slice(12).join('\n');
}

// Now replace the correct one which is still there at line 1134 (now shifted):
c = c.replace(/    const \[favorites, setFavorites\] = useState\(\(\) => \{[\s\S]*?        return \{\};\n    \}\);/, `    const [favorites, setFavorites] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const favs = JSON.parse(localStorage.getItem('sp-favorites') || '{}');
                try {
                    const seriesIds = JSON.parse(localStorage.getItem('followed-series') || '[]');
                    seriesIds.forEach(id => { favs['series-' + id] = true; });
                } catch {}
                return favs;
            } catch { return {}; }
        }
        return {};
    });`);

fs.writeFileSync(p, c);
