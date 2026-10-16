import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildVideoLibraryBreadcrumbs } from '../src/lib/videoLibraryBreadcrumbs.mjs';
import { buildChannelJsonLd } from '../src/lib/videoLibraryChannels.mjs';
import { buildPlayerJsonLd } from '../src/lib/videoLibraryPlayers.mjs';

test('public breadcrumbs preserve visible hierarchy with sequential canonical destinations', () => {
    const trail = [['World Hub', '/hub'], ['Video Library', '/hub/video-library'], ['A & B', 'https://smarter.poker/hub/video-library/players/a']];
    const result = buildVideoLibraryBreadcrumbs(trail);
    assert.equal(result['@id'], 'https://smarter.poker/hub/video-library/players/a#breadcrumb');
    assert.deepEqual(result.itemListElement.map(item => [item.position, item.name, item.item]), [[1, 'World Hub', 'https://smarter.poker/hub'], [2, 'Video Library', 'https://smarter.poker/hub/video-library'], [3, 'A & B', 'https://smarter.poker/hub/video-library/players/a']]);
    for (const invalid of [[], [['Only', '/hub']], [['A', '/hub'], ['', '/hub/x']], [['A', '/hub'], ['B', 'https://foreign.example/x']], [['A', '/hub'], ['B', '/hub?private=1']], [['A', '/hub'], ['B', '/hub#private']], [['A', '/hub'], ['B', undefined]], [['A', '/hub'], ['B', 'relative']]]) assert.throws(() => buildVideoLibraryBreadcrumbs(invalid));
});

test('collection trails and empty lists remain truthful without rich video stubs', () => {
    const channel = buildChannelJsonLd({ name: 'Source', description: 'Verified Videos', path: '/hub/video-library/channels/source' }, []);
    const player = buildPlayerJsonLd({ name: 'Phil Ivey', path: '/hub/video-library/players/phil-ivey' }, []);
    assert.deepEqual(channel[1].itemListElement.map(item => item.name), ['World Hub', 'Video Library', 'Source']);
    assert.deepEqual(player[1].itemListElement.map(item => item.name), ['World Hub', 'Video Library', 'Poker Players', 'Phil Ivey']);
    assert.equal(channel[2].numberOfItems, 0);
    assert.deepEqual(player[2].itemListElement, []);
});

test('directory emits the visible public trail while private routes stay noindex', () => {
    const page = readFileSync(new URL('../pages/hub/video-library/players/index.js', import.meta.url), 'utf8');
    assert.match(page, /jsonLd=\{buildVideoLibraryBreadcrumbs/);
    for (const path of ['owner.js', 'playlists/[playlistId].js']) {
        const source = readFileSync(new URL(`../pages/hub/video-library/${path}`, import.meta.url), 'utf8');
        assert.match(source, /noindex/);
        assert.doesNotMatch(source, /jsonLd=/);
    }
});

test('watch current breadcrumb matches its structured video title', () => {
 const source = readFileSync(new URL('../pages/hub/video-library/watch/[videoId]/[[...slug]].js', import.meta.url), 'utf8');
 assert.match(source, /<span aria-current="page">\{video.title\}<\/span>/);
});

test('actual catalog SEO component emits inert parseable JSON without forwarding unsafe markup', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const ts = require('typescript');
    const { serializeVideoLibraryStructuredData } = await import('../src/lib/videoLibraryStructuredData.mjs');
    const source = readFileSync(new URL('../src/components/video-library/VideoLibrarySEOHead.jsx', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
    let forwarded;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => {
        if (name === 'react/jsx-runtime') return require(name);
        if (name === 'next/head') return { default: props => React.createElement(React.Fragment, null, props.children) };
        if (name === '../seo/SEOHead') return { default: props => { forwarded = props; return React.createElement('title', null, props.title); } };
        if (name.endsWith('videoLibraryStructuredData.mjs')) return { serializeVideoLibraryStructuredData };
        throw new Error(`Unexpected Import ${name}`);
    }, module, module.exports);
    const name = '</ScRiPt><script>window.catalogInjection=1</script> & \u2028\u2029';
    const data = [{ '@type': 'VideoObject', name }];
    const html = renderToStaticMarkup(React.createElement(module.exports.default, { title: name, canonical: '/hub/video-library', jsonLd: data }));
    assert.equal((html.match(/<script\b/gi) || []).length, 1);
    assert.equal((html.match(/<\/script>/gi) || []).length, 1);
    const raw = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i)[1];
    assert.doesNotMatch(raw, /[<>&\u2028\u2029]/);
    assert.deepEqual(JSON.parse(raw), { '@context': 'https://schema.org', '@graph': data });
    assert.equal(Object.hasOwn(forwarded, 'jsonLd'), false);
    assert.equal(forwarded.title, name);
    assert.equal(forwarded.canonical, '/hub/video-library');
    const baseline = renderToStaticMarkup(React.createElement('script', { type: 'application/ld+json', dangerouslySetInnerHTML: { __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': data }) } }));
    assert.ok((baseline.match(/<script\b/gi) || []).length > 1, 'Prior raw serializer reproduces script breakout');
    assert.deepEqual(JSON.parse(serializeVideoLibraryStructuredData({ '@type': 'BreadcrumbList', name })), { '@context': 'https://schema.org', '@type': 'BreadcrumbList', name });
    for (const path of ['pages/hub/video-library.js', 'pages/hub/video-library/watch/[videoId]/[[...slug]].js', 'pages/hub/video-library/channels/[channelId].js', 'pages/hub/video-library/players/[playerId].js', 'pages/hub/video-library/players/index.js']) {
        assert.match(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), /import SEOHead from '[^']*video-library\/VideoLibrarySEOHead'/);
    }
});
