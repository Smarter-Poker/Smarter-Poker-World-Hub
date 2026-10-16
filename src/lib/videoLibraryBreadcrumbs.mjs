/** Public Video Library trails use the same names and canonical destinations as navigation. */
export function buildVideoLibraryBreadcrumbs(trail) {
    if (!Array.isArray(trail) || trail.length < 2) throw new TypeError('A Breadcrumb Trail Needs At Least Two Items');
    const items = trail.map(([name, path], index) => {
        if (typeof path !== 'string' || !path.startsWith('/') && !path.startsWith('https://smarter.poker/')) throw new TypeError('Invalid Video Library Breadcrumb Destination');
        const url = new URL(path, 'https://smarter.poker');
        if (typeof name !== 'string' || !name.trim() || url.origin !== 'https://smarter.poker' || url.search || url.hash) throw new TypeError('Invalid Video Library Breadcrumb');
        return { '@type': 'ListItem', position: index + 1, name: name.trim(), item: url.href };
    });
    return { '@type': 'BreadcrumbList', '@id': `${items.at(-1).item}#breadcrumb`, itemListElement: items };
}
