import registry from './world-footer-navigation.json';

/**
 * @typedef {{x: number, y: number, width: number, height: number}} FooterContentBounds
 * @typedef {{src: string, width: number, height: number, sha256: string, contentBounds: FooterContentBounds}} FooterArtwork
 * @typedef {{href: string, label: string, title: string, icon?: string, badge?: string}} FooterItem
 * @typedef {{id: string, label: string, theme: string, accent: string, routePrefixes: string[], artwork: FooterArtwork, items: FooterItem[]}} ArtworkFooterDefinition
 * @typedef {{fallback: Record<string, unknown>, worlds: ArtworkFooterDefinition[]}} FooterRegistry
 */

/** @type {FooterRegistry} */
const footerRegistry = registry;

const cleanPath = (value) => {
  const raw = String(value || '/').split(/[?#]/, 1)[0];
  return raw.replace(/\/+$/, '') || '/';
};

export const isClubArenaOwnedRoute = (value) => {
  const path = cleanPath(value);
  return path === '/hub/club-arena' || path.startsWith('/hub/club-arena/');
};

export const resolveWorldFooter = (value) => {
  const path = cleanPath(value);
  if (isClubArenaOwnedRoute(path)) return null;

  return (
    footerRegistry.worlds.find((world) =>
      world.routePrefixes.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`)
      )
    ) || null
  );
};

export const getFallbackFooter = () => footerRegistry.fallback;
export const WORLD_FOOTERS = footerRegistry.worlds;
export default footerRegistry;
