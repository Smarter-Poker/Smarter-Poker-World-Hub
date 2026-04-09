const fs = require('fs');
const p = 'pages/hub/poker-near-me.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/        const handleStorageSync = \(e\) => \{[\s\S]*?        window\.addEventListener\('storage', handleStorageSync\);/m, `        const handleStorageSync = (e) => {
            if (e.key === 'sp-favorites' && e.newValue) {
                try {
                    const newFavs = JSON.parse(e.newValue);
                    setFavorites(prev => {
                        const next = { ...prev };
                        let changed = false;
                        const newFavIds = Object.keys(newFavs);
                        Object.keys(next).forEach(k => {
                            if (k.startsWith('venue-') && !newFavIds.includes(k)) { delete next[k]; changed = true; }
                        });
                        newFavIds.forEach(k => {
                            if (!next[k]) { next[k] = newFavs[k]; changed = true; }
                        });
                        return changed ? next : prev;
                    });
                } catch { }
            }
            if (e.key === 'followed-series' && e.newValue) {
                try {
                    const rawSeriesIds = JSON.parse(e.newValue);
                    setFavorites(prev => {
                        const next = { ...prev };
                        let changed = false;
                        Object.keys(next).forEach(k => {
                            if (k.startsWith('series-') && !rawSeriesIds.includes(k.split('-')[1])) { delete next[k]; changed = true; }
                        });
                        rawSeriesIds.forEach(id => {
                            if (!next[\`series-\${id}\`]) { next[\`series-\${id}\`] = true; changed = true; }
                        });
                        return changed ? next : prev;
                    });
                } catch { }
            }
        };
        window.addEventListener('storage', handleStorageSync);`);

if (!c.includes('const handleBusSeriesFavSync')) {
  c = c.replace(/        const handleBusUnfavSync = \(event\) => \{[\s\S]*?        \};([\s\S]*?)const unsubFav = eventBus.on\('venue:favorite', handleBusFavSync\);/m, `$&

        const handleBusSeriesFavSync = (event) => {
            const data = event.payload;
            if (data && data.seriesId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    next['series-' + data.seriesId] = true;
                    return next;
                });
            }
        };
        const handleBusSeriesUnfavSync = (event) => {
            const data = event.payload;
            if (data && data.seriesId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    delete next['series-' + data.seriesId];
                    return next;
                });
            }
        };
        const unsubSeriesFav = eventBus.on('series:favorite', handleBusSeriesFavSync);
        const unsubSeriesUnfav = eventBus.on('series:unfavorite', handleBusSeriesUnfavSync);`);
        
  c = c.replace(/if \(unsubUnfav\) unsubUnfav\(\);/m, `$&
            if (unsubSeriesFav) unsubSeriesFav();
            if (unsubSeriesUnfav) unsubSeriesUnfav();`);
}

fs.writeFileSync(p, c);
