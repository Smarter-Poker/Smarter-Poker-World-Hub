import registry from './world-footer-navigation.json';

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
    registry.worlds.find((world) =>
      world.routePrefixes.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`)
      )
    ) || null
  );
};

export const getFallbackFooter = () => registry.fallback;
export const WORLD_FOOTERS = registry.worlds;
export default registry;
