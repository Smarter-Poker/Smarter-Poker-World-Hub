const fs = require('fs');
const p = 'pages/hub/poker-near-me.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/    const \[favorites, setFavorites\] = useState\(\(\) => \{[\s\S]*?            try \{ return JSON\.parse\(localStorage\.getItem\('sp-favorites'\) || '\{\}'\); \} catch \{ return \{\}; \}[\s\S]*?        \}[\s\S]*?        return \{\};[\s\S]*?    \}\);/m, `    const [favorites, setFavorites] = useState(() => {
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
