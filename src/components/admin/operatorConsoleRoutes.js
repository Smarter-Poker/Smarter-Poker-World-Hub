export function isOperatorConsoleRoute(pathname = '') {
  return pathname === '/horses'
    || pathname.startsWith('/horses/')
    || pathname === '/admin'
    || pathname.startsWith('/admin/')
    || pathname === '/hub/admin'
    || pathname.startsWith('/hub/admin/');
}

export function operatorConsoleLabel(pathname = '') {
  if (pathname === '/horses') return 'Stable Admin';
  if (pathname.startsWith('/horses/')) return 'Stable Admin Tool';
  if (pathname.startsWith('/hub/admin/')) return 'World Hub Operations';
  return 'Platform Operations';
}
