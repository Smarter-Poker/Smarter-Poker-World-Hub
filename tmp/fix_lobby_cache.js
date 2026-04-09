const fs = require('fs');
const p = 'pages/hub/poker-near-me-lobby.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/  useEffect\(\(\) => \{\n    if \(!userId\) \{\n      const timer = setTimeout\(\(\) => \{/, `  // Sync favorites map to localStorage ALWAYS (acts as local cache + cross-tab trigger)
  useEffect(() => {
    const timer = setTimeout(() => {`);

c = c.replace(/          \}\n        \} catch \(err\) \{ console.error\('Error syncing local favs:', err\); \}\n      \}, 300\);\n      return \(\) => clearTimeout\(timer\);\n    \}\n  \}, \[favorites, userId\]\);/, `        }
        } catch (err) { console.error('Error syncing local favs:', err); }
    }, 300);
    return () => clearTimeout(timer);
  }, [favorites]);`);

fs.writeFileSync(p, c);
