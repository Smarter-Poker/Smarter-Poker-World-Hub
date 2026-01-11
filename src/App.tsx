/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — SOVEREIGN APPLICATION
   Pure Tri-Layer Architecture: WorldHub is the only render target
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import WorldHub from './world/WorldHub';
import { useWorldStore } from './state/worldStore';

function App() {
  const updateCursor = useWorldStore((s) => s.updateCursor);

  // Track cursor for spatial effects
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      updateCursor(x, y);

      // Update CSS variables for spatial tilt
      const tiltX = (x - 0.5) * 10;
      const tiltY = (y - 0.5) * -10;
      document.documentElement.style.setProperty('--perspective-x', `${tiltX}deg`);
      document.documentElement.style.setProperty('--perspective-y', `${tiltY}deg`);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [updateCursor]);

  return <WorldHub />;
}

export default App;
