import { createClient } from '../../../src/lib/supabaseServerClient';
import { buildWeeklyWireRssXml, buildEmptyWeeklyWireRssXml } from '../../../src/lib/newsletter/wireRssBuilder.mjs';

const SITE_URL = 'https://smarter.poker';

export async function getServerSideProps({ res }) {
    let xml = '';
    try {
        const supabase = createClient();
        xml = await buildWeeklyWireRssXml(supabase, {
            siteUrl: SITE_URL,
            selfPath: '/hub/wire/rss.xml',
        });
    } catch (_err) {
        xml = buildEmptyWeeklyWireRssXml({
            siteUrl: SITE_URL,
            selfPath: '/hub/wire/rss.xml',
        });
    }

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.write(xml);
    res.end();
    return { props: {} };
}

export default function WeeklyWireRssPage() {
    return null;
}
