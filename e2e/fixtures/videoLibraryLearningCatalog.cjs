// Isolated synthetic catalog for compiled learning browser qualification only.
const http = require('node:http');
const SOURCE = '11111111-1111-4111-8111-111111111111';
const now = () => new Date().toISOString();
const catalogRows = () => [
    ['phase7v0000', 'Daniel Negreanu Poker Decision', ['Daniel Negreanu']],
    ['phase7v0001', 'Daniel Negreanu Tournament Review', ['Daniel Negreanu']],
    ['phase7v0002', 'Unrelated River Decision', []],
].map(([id, title, tags]) => ({ youtube_video_id: id, source_id: 'HCL', source_name: 'Channel Contract Poker', attribution_name: 'Channel Contract Poker', title, tags, type: 'cash', duration: id === 'phase7v0000' ? '1:10' : '18:42', views_count: 120000, thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, published_at: now(), scraped_at: now(), availability_status: 'verified', embeddable: true, availability_checked_at: now() }));
function createLearningCatalogFixture() {
    return http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const table = url.pathname.split('/').pop();
        let data = [];
        if (table === 'content_sources') data = [{ id: SOURCE, name: 'Channel Contract Poker', handle: 'channel-contract', provider_source_id: 'UC1111111111111111111111', attribution_url: 'https://www.youtube.com/channel/UC1111111111111111111111', ingest_topic: 'poker', is_active: true, lifecycle_status: 'active' }];
        if (table === 'video_library_channel_aliases') data = [{ source_key: 'HCL', source_id: SOURCE }];
        if (table === 'video_library_public_catalog') {
            data = catalogRows();
            for (const [field, value] of url.searchParams) {
                if (value.startsWith('eq.')) data = data.filter(row => String(row[field]) === value.slice(3));
                if (value.startsWith('neq.')) data = data.filter(row => String(row[field]) !== value.slice(4));
            }
            if (url.searchParams.get('or')?.includes('Daniel Negreanu')) data = data.filter(row => row.title.includes('Daniel Negreanu'));
            const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || data.length);
            const total = data.length; data = data.slice(offset, offset + limit);
            res.setHeader('Content-Range', `${offset}-${offset + data.length - 1}/${total}`);
            if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) data = data[0] || null;
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    });
}
module.exports = { createLearningCatalogFixture, catalogRows };
