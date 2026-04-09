const fs = require('fs');
const p = 'pages/hub/poker-near-me-lobby.js';
let c = fs.readFileSync(p, 'utf8');

if (!c.includes("eventBus.on('series:favorite'")) {
  c = c.replace(/const unsubUnfav = eventBus.on\('venue:unfavorite', \(event\) => \{[\s\S]*?\}\);/m, `$&

    const unsubSeriesFav = eventBus.on('series:favorite', (event) => {
      const seriesId = event?.payload?.seriesId || event?.seriesId;
      if (seriesId) setFavorites(prev => ({ ...prev, ['series-' + seriesId]: true }));
    });

    const unsubSeriesUnfav = eventBus.on('series:unfavorite', (event) => {
      const seriesId = event?.payload?.seriesId || event?.seriesId;
      if (seriesId) {
        setFavorites(prev => {
          const next = { ...prev };
          delete next['series-' + seriesId];
          return next;
        });
      }
    });`);
    
  c = c.replace(/return \(\) => \{[\s\S]*?unsubFav\(\);[\s\S]*?unsubUnfav\(\);/m, `$&
      unsubSeriesFav();
      unsubSeriesUnfav();`);
}
fs.writeFileSync(p, c);
