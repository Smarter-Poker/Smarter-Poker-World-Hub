const fs = require('fs');
const p = 'pages/hub/series/[id].js';
let c = fs.readFileSync(p, 'utf8');

if (!c.includes('import eventBus')) {
  c = c.replace(/import { useRouter } from 'next\/router';/, "import { useRouter } from 'next/router';\nimport eventBus from '../../../src/lib/eventBus';");
}

if (!c.includes("eventBus.emit('series:favorite'")) {
  c = c.replace(/localStorage\.setItem\('followed-series', JSON\.stringify\(updated\)\);[\s\S]*?} catch \{/m, `localStorage.setItem('followed-series', JSON.stringify(updated));
      
      // Emit universal bus event for multi-tab synchronization within identical process memory
      try { 
        eventBus.emit(newState ? 'series:favorite' : 'series:unfavorite', { seriesId: sid, name: series?.name }, 'SeriesDetail'); 
      } catch {}
    } catch {`);
}
fs.writeFileSync(p, c);
