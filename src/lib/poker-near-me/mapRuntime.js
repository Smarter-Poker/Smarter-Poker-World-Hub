const LEAFLET_STYLES = Object.freeze([
  {
    id: 'leaflet',
    href: '/vendor/leaflet/leaflet.css',
  },
  {
    id: 'marker-cluster',
    href: '/vendor/leaflet/MarkerCluster.css',
  },
  {
    id: 'marker-cluster-default',
    href: '/vendor/leaflet/MarkerCluster.Default.css',
  },
  {
    id: 'poker-map-controls',
    href: '/vendor/leaflet/poker-map-controls.css',
  },
]);

let runtimePromise = null;

function ensureStylesheet({ id, href }) {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[data-pnm-map-style="${id}"]`)) return;

  const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .find((link) => String(link.href || '').toLowerCase() === href.toLowerCase());
  if (existing) {
    existing.dataset.pnmMapStyle = id;
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.pnmMapStyle = id;
  document.head.appendChild(link);
}

/**
 * Load the map engine once per browser session from the repository's pinned
 * npm packages. Styles and their image assets are vendored under /public, so
 * the controls and clusters remain usable even when third-party CDNs fail.
 */
export async function loadPokerMapRuntime() {
  if (typeof window === 'undefined') throw new Error('Poker map runtime is browser-only');
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    LEAFLET_STYLES.forEach(ensureStylesheet);

    const leafletModule = await import('leaflet');
    const L = leafletModule.default || leafletModule;

    // leaflet.markercluster is a UMD plugin and attaches itself to the shared
    // Leaflet namespace. Expose the npm instance before importing the plugin.
    window.L = L;
    if (typeof L.markerClusterGroup !== 'function') {
      await import('leaflet.markercluster');
    }

    return {
      L,
      clusteringAvailable: typeof L.markerClusterGroup === 'function',
    };
  })().catch((error) => {
    runtimePromise = null;
    throw error;
  });

  return runtimePromise;
}

export function createPokerClusterOptions({ iconCreateFunction, disableClusteringAtZoom = 9 } = {}) {
  return {
    // National views need a wider capture radius; city views stay precise.
    maxClusterRadius: (zoom) => {
      if (zoom <= 4) return 72;
      if (zoom <= 6) return 54;
      if (zoom <= 8) return 38;
      return 28;
    },
    iconCreateFunction,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom,
    removeOutsideVisibleBounds: true,
    animateAddingMarkers: false,
    chunkedLoading: true,
    chunkInterval: 50,
    chunkDelay: 12,
  };
}

/** Add marker collections in one operation so MarkerCluster can yield between chunks. */
export function addPokerMapLayers(layer, markers) {
  const validMarkers = (markers || []).filter(Boolean);
  if (!layer || validMarkers.length === 0) return;
  if (typeof layer.addLayers === 'function') {
    layer.addLayers(validMarkers);
    return;
  }
  validMarkers.forEach((marker) => layer.addLayer(marker));
}

export const pokerMapRuntimeContract = Object.freeze({
  executableSource: 'local-npm',
  styleSource: 'local-public',
  chunkedLoading: true,
  densityAwareClustering: true,
});
