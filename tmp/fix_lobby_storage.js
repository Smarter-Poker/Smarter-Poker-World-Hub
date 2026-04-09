const fs = require('fs');
const p = 'pages/hub/poker-near-me-lobby.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/    const handleStorageSync = \(e\) => {[\s\S]*?    window\.addEventListener\('storage', handleStorageSync\);/m, `    const handleStorageSync = (e) => {
      // Listen to cross-tab updates from localStorage 'sp-favorites' (venues)
      if (e.key === 'sp-favorites' && e.newValue) {
        try {
          const rawFavs = JSON.parse(e.newValue);
          setFavorites(prev => {
            const next = { ...prev };
            let changed = false;
            // Map venue-* back to lobby namespace
            const newFavIds = Object.keys(rawFavs)
              .filter(k => k.startsWith('venue-'))
              .map(k => k.split('-')[1]);
            
            // Clean old venues
            Object.keys(next).forEach(k => {
               if (k.startsWith('venue-')) {
                 const id = k.split('-')[1];
                 if (!newFavIds.includes(id)) { delete next[k]; changed = true; }
               }
            });
            
            // Add new venues
            newFavIds.forEach(id => {
              if (!next[\`venue-\${id}\`]) { next[\`venue-\${id}\`] = true; changed = true; }
            });
            return changed ? next : prev;
          });
        } catch { }
      }
      
      // Listen to cross-tab updates from localStorage 'followed-series'
      if (e.key === 'followed-series' && e.newValue) {
        try {
          const rawSeriesIds = JSON.parse(e.newValue); // Array of string IDs
          setFavorites(prev => {
            const next = { ...prev };
            let changed = false;
            
            // Clean old series
            Object.keys(next).forEach(k => {
               if (k.startsWith('series-')) {
                 const id = k.split('-')[1];
                 if (!rawSeriesIds.includes(id)) { delete next[k]; changed = true; }
               }
            });
            
            // Add new series
            rawSeriesIds.forEach(id => {
              if (!next[\`series-\${id}\`]) { next[\`series-\${id}\`] = true; changed = true; }
            });
            return changed ? next : prev;
          });
        } catch { }
      }
    };

    window.addEventListener('storage', handleStorageSync);`);

fs.writeFileSync(p, c);
