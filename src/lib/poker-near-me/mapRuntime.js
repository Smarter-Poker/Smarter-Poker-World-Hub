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

  const targetHref = new URL(href, document.baseURI).href.toLowerCase();
  const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .find((link) => String(link.href || '').toLowerCase() === targetHref);
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

export function resetPokerMapRuntime() {
  runtimePromise = null;
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

export function createPokerMapSession({
  L,
  container,
  mapOptions = {},
  tileStyle = 'dark_nolabels',
  tileOptions = {},
  attribution = true,
} = {}) {
  if (!L || !container) throw new Error('Poker map session requires Leaflet and a container');
  const map = L.map(container, { zoomControl: true, attributionControl: false, ...mapOptions });
  const tiles = L.tileLayer(
    `https://{s}.basemaps.cartocdn.com/${tileStyle}/{z}/{x}/{y}{r}.png`,
    { subdomains: 'abcd', maxZoom: 19, attribution: '', ...tileOptions },
  ).addTo(map);
  if (attribution) {
    L.control.attribution({ prefix: false })
      .addAttribution('Powered By <a href="https://smarter.poker">Smarter.Poker</a>')
      .addTo(map);
  }
  let destroyed = false;
  return {
    map,
    tiles,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Leaflet has no public API for cancelling its 250ms zoom-transition
      // fallback. A map can therefore unmount between fitBounds() starting and
      // _onZoomTransitionEnd() firing; that callback then reads the removed
      // map pane and throws on `_leaflet_pos`. Settle the pinned runtime's
      // animation flags before remove() so every queued callback becomes a
      // no-op. _stop() also cancels any in-flight pan/fly animation.
      if (typeof map._stop === 'function') map._stop();
      if (map._animatingZoom) map._animatingZoom = false;
      map.off();
      map.remove();
    },
  };
}

export function createPokerMarkerLayer({
  L,
  map,
  clusteringAvailable = false,
  disableClustering = false,
  iconCreateFunction,
  disableClusteringAtZoom = 9,
} = {}) {
  if (!L || !map) throw new Error('Poker marker layer requires Leaflet and a map');
  const canCluster = clusteringAvailable && !disableClustering && typeof L.markerClusterGroup === 'function';
  const layer = canCluster
    ? L.markerClusterGroup(createPokerClusterOptions({ iconCreateFunction, disableClusteringAtZoom }))
    : L.layerGroup();
  layer.addTo(map);
  return { layer, clustering: canCluster ? 'available' : disableClustering ? 'disabled' : 'fallback' };
}

export const pokerMapRuntimeContract = Object.freeze({
  executableSource: 'local-npm',
  styleSource: 'local-public',
  chunkedLoading: true,
  densityAwareClustering: true,
  sharedSessionLifecycle: true,
  sharedMarkerLayerFactory: true,
});
