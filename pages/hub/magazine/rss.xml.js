import {
    MAGAZINE_SITE_URL,
} from '../../../src/lib/magazine/magazineSchema.mjs';
import {
    buildMagazineRssXml,
    escapeMagazineXml,
} from '../../../src/lib/magazine/magazineRssBuilder.mjs';

export { escapeMagazineXml as escapeMagazineRssXml, buildMagazineRssXml as renderInlineMagazineRssXml };

export async function getServerSideProps({ res }) {
    let publishedRows = [];
    try {
        const { createClient } = await import('../../../src/lib/supabaseServerClient.js');
        const sb = createClient();
        const { data } = await sb
            .from('magazine_issues')
            .select(
                'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, cover_image_url, status, published_at, updated_at, created_at'
            )
            .eq('status', 'published')
            .order('issue_number', { ascending: false })
            .limit(24);
        if (Array.isArray(data)) {
            publishedRows = data;
        }
    } catch (_err) {
        publishedRows = [];
    }

    const xml = buildMagazineRssXml(publishedRows, {
        siteUrl: MAGAZINE_SITE_URL,
        selfPath: '/hub/magazine/rss.xml',
    });

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.write(xml);
    res.end();
    return { props: {} };
}

export default function SmarterPokerMagazineRssPage() {
    return null;
}
