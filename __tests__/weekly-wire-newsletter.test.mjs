import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PLATFORM_UPDATES_CATALOG,
    TOOL_SPOTLIGHT_CATALOG,
} from '../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    areSameStoryline,
    buildPromoBlockForSegment,
    curateWeeklyWireEdition,
    isEchoingOrEmptyBlurb,
    isLowValueScheduleStub,
    renderWeeklyWireEmail,
    resolveWeeklyWireRecipients,
    toolMarkerUuid,
    updateMarkerUuid,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';

function createWireMockDb(initial = {}) {
    const tables = {
        newsletter_campaigns: [...(initial.newsletter_campaigns || [])],
        poker_news: [...(initial.poker_news || [])],
        newsletter_subscribers: [...(initial.newsletter_subscribers || [])],
        notification_preferences: [...(initial.notification_preferences || [])],
        profiles: [...(initial.profiles || [])],
        club_members: [...(initial.club_members || [])],
        promo_codes: [...(initial.promo_codes || [])],
        promo_code_redemptions: [...(initial.promo_code_redemptions || [])],
    };

    const makeQuery = (tableName) => {
        const filters = [];
        let pendingUpdate = null;

        const applyFilters = () => (tables[tableName] || []).filter((r) => filters.every((fn) => fn(r)));

        const builder = {
            select() {
                return builder;
            },
            eq(col, val) {
                filters.push((r) => r?.[col] === val);
                return builder;
            },
            neq(col, val) {
                filters.push((r) => r?.[col] !== val);
                return builder;
            },
            gte(col, val) {
                const targetMs = Date.parse(String(val));
                filters.push((r) => Date.parse(String(r?.[col] || 0)) >= targetMs);
                return builder;
            },
            in(col, vals) {
                const set = new Set(vals);
                filters.push((r) => set.has(r?.[col]));
                return builder;
            },
            like(col, pattern) {
                if (pattern === '%@%') filters.push((r) => String(r?.[col] || '').includes('@'));
                return builder;
            },
            or(expr) {
                if (expr.includes('is_active.is.null,is_active.eq.true')) {
                    filters.push((r) => r?.is_active == null || r?.is_active === true);
                }
                return builder;
            },
            order() {
                return builder;
            },
            update(patch) {
                pendingUpdate = patch;
                return builder;
            },
            limit(n) {
                return Promise.resolve({ data: applyFilters().slice(0, n), error: null });
            },
            range(from, to) {
                return Promise.resolve({ data: applyFilters().slice(from, to + 1), error: null });
            },
            maybeSingle() {
                const matched = applyFilters();
                if (pendingUpdate) {
                    for (const row of matched) Object.assign(row, pendingUpdate);
                }
                return Promise.resolve({ data: matched[0] || null, error: null });
            },
            then(resolve, reject) {
                try {
                    const matched = applyFilters();
                    if (pendingUpdate) {
                        for (const row of matched) Object.assign(row, pendingUpdate);
                    }
                    return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
                } catch (err) {
                    return Promise.reject(err).then(resolve, reject);
                }
            },
        };
        return builder;
    };

    return {
        tables,
        from: (name) => makeQuery(name),
    };
}

test('title-echo detector catches verbatim and truncated headline repeats while keeping real summaries', () => {
    const title = 'APT Championship Main Event Second-Richest in History; Super High Roller Champions Crowned';
    assert.equal(isEchoingOrEmptyBlurb(title, title), true);
    assert.equal(isEchoingOrEmptyBlurb(title, 'APT Championship Main Event Second-Richest in History; Super High Roller Champio'), true);
    assert.equal(isEchoingOrEmptyBlurb(title, ''), true);
    assert.equal(
        isEchoingOrEmptyBlurb(
            title,
            'More than 1,800 entries built a massive prize pool in Taipei as two new high-roller champions lifted trophies.'
        ),
        false
    );
});

test('storyline clustering collapses cross-outlet Kevin Hart $2.6M pot duplicates and filters raw Event #N stubs', () => {
    const pokerOrgTitle = 'Kevin Hart Loses 1.66m After Monster 2.65m Pot On High Stakes Poker Live';
    const pokerNewsTitle = "'Texas Mike' Wins $2.6 Million Poker Hand Against Comedian Kevin Hart";
    const unrelatedTitle = 'Brazilians Dominate the 888 Sunday Sale Mystery Bounty Main Event';

    assert.equal(areSameStoryline(pokerOrgTitle, pokerNewsTitle), true);
    assert.equal(areSameStoryline(pokerOrgTitle, unrelatedTitle), false);

    assert.equal(isLowValueScheduleStub({ title: 'Event #21: $600 Seniors 50+ Black Chip Bounty NLH...' }), true);
    assert.equal(isLowValueScheduleStub({ title: 'Event #21: $600 Seniors Champion Crowned After Heads-Up Comeback' }), false);
});

test('curateWeeklyWireEdition enforces permanent Zero-Repeat across articles, storylines, platform updates, and tools', async () => {
    const nowIso = new Date().toISOString();
    const alreadySentArticleId = '10000000-0000-4000-8000-000000000001';
    const kevinHartA = '10000000-0000-4000-8000-000000000002';
    const kevinHartB = '10000000-0000-4000-8000-000000000003';
    const scheduleStub = '10000000-0000-4000-8000-000000000004';
    const freshStory1 = '10000000-0000-4000-8000-000000000005';
    const freshStory2 = '10000000-0000-4000-8000-000000000006';

    const firstUpdateUuid = updateMarkerUuid(PLATFORM_UPDATES_CATALOG[0].slug);
    const firstToolUuid = toolMarkerUuid(TOOL_SPOTLIGHT_CATALOG[0].slug);

    const db = createWireMockDb({
        newsletter_campaigns: [
            {
                id: 'camp-prev-1',
                subject: 'Previous Wire',
                status: 'sent',
                article_ids: [alreadySentArticleId, firstUpdateUuid, firstToolUuid],
                created_at: nowIso,
            },
        ],
        poker_news: [
            {
                id: alreadySentArticleId,
                title: 'WSOP Paradise Announces Expanded Guarantee Schedule',
                excerpt: 'WSOP Paradise Announces Expanded Guarantee Schedule',
                source_name: 'WSOP',
                image_url: 'https://smarter.poker/cards/news.png',
                category: 'tournament',
                is_published: true,
                published_at: nowIso,
            },
            {
                id: kevinHartA,
                title: 'Kevin Hart Loses 1.66m After Monster 2.65m Pot On High Stakes Poker Live',
                excerpt: 'Kevin Hart Loses 1.66m After Monster 2.65m Pot On High Stakes Poker Live',
                source_name: 'Poker.org',
                image_url: 'https://smarter.poker/cards/news.png',
                category: 'news',
                is_published: true,
                published_at: nowIso,
            },
            {
                id: kevinHartB,
                title: "'Texas Mike' Wins $2.6 Million Poker Hand Against Comedian Kevin Hart",
                excerpt: "'Texas Mike' Wins $2.6 Million Poker Hand Against Comedian Kevin Hart",
                source_name: 'PokerNews',
                image_url: 'https://smarter.poker/cards/news.png',
                category: 'news',
                is_published: true,
                published_at: nowIso,
            },
            {
                id: scheduleStub,
                title: 'Event #21: $600 Seniors 50+ Black Chip Bounty NLH',
                excerpt: 'Event #21: $600 Seniors 50+ Black Chip Bounty NLH',
                source_name: 'MSPT',
                image_url: 'https://smarter.poker/cards/news.png',
                category: 'tournament',
                is_published: true,
                published_at: nowIso,
            },
            {
                id: freshStory1,
                title: 'APT Championship Main Event Sets Second-Richest Prize Pool In Tour History',
                summary: 'Players from 45 countries converged on Taipei to push the main event prize pool past expectations.',
                source_name: 'PokerNews',
                image_url: 'https://smarter.poker/cards/news.png',
                category: 'tournament',
                is_published: true,
                published_at: nowIso,
            },
            {
                id: freshStory2,
                title: 'Ontario & Alberta Regulated Online Poker Liquidity Report Shows Record Growth',
                summary: 'Regulated provincial liquidity pools posted strong autumn tournament turnout across major operators.',
                source_name: 'Pokerfuse',
                image_url: 'https://smarter.poker/cards/news.png',
                category: 'industry',
                is_published: true,
                published_at: nowIso,
            },
        ],
    });

    const edition1 = await curateWeeklyWireEdition(db, {
        days: 7,
        articleLimit: 5,
        updateLimit: 2,
        enrichMetaDescriptions: false,
    });

    // Already-sent UUID, duplicate Kevin Hart outlet, and Event #21 stub are all excluded
    const chosenIds = edition1.articles.map((a) => a.id);
    assert.equal(chosenIds.includes(alreadySentArticleId), false);
    assert.equal(chosenIds.includes(scheduleStub), false);
    const kevinCount = chosenIds.filter((id) => id === kevinHartA || id === kevinHartB).length;
    assert.equal(kevinCount, 1, 'only one Kevin Hart storyline article may be included');
    assert.equal(chosenIds.includes(freshStory1), true);
    assert.equal(chosenIds.includes(freshStory2), true);

    // Consumed update #0 and tool #0 skipped -> advances to update #1/#2 and tool #1
    assert.equal(edition1.platformUpdates[0].slug, PLATFORM_UPDATES_CATALOG[1].slug);
    assert.equal(edition1.platformUpdates[1].slug, PLATFORM_UPDATES_CATALOG[2].slug);
    assert.equal(edition1.toolSpotlight.slug, TOOL_SPOTLIGHT_CATALOG[1].slug);

    // Echoed summary on Kevin Hart row is suppressed (empty rather than repeating title)
    const kevinChosen = edition1.articles.find((a) => a.id === kevinHartA || a.id === kevinHartB);
    assert.equal(kevinChosen.summary, '');

    // Simulate sending edition1 and immediately curating edition2 -> ZERO overlap!
    db.tables.newsletter_campaigns.push({
        id: 'camp-prev-2',
        subject: edition1.subject,
        status: 'sent',
        article_ids: edition1.ledgerUuidsToRecord,
        created_at: nowIso,
    });

    const edition2 = await curateWeeklyWireEdition(db, {
        days: 7,
        articleLimit: 5,
        updateLimit: 2,
        enrichMetaDescriptions: false,
    });

    assert.equal(edition2.articles.length, 0, 'all stories from edition1 (including rival Kevin Hart outlet) must be blocked in edition2');
    assert.equal(edition2.platformUpdates[0].slug, PLATFORM_UPDATES_CATALOG[3].slug);
    assert.equal(edition2.toolSpotlight.slug, TOOL_SPOTLIGHT_CATALOG[2].slug);
});

test('resolveWeeklyWireRecipients and renderWeeklyWireEmail segment Promo CTAs and enforce CAN-SPAM footer', async () => {
    const nowMs = Date.parse('2026-11-24T20:00:00Z');
    const db = createWireMockDb({
        newsletter_subscribers: [
            { id: 's1', email: 'newlead@gmail.com', is_active: true },
            { id: 's2', email: 'unsubbed@gmail.com', is_active: false },
        ],
        profiles: [
            {
                id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
                username: 'activehero',
                email: 'active@gmail.com',
                is_horse: false,
                created_at: '2026-06-01T00:00:00Z',
                last_active: '2026-11-23T12:00:00Z',
            },
            {
                id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
                username: 'dormant21',
                email: 'dormant@yahoo.com',
                is_horse: false,
                created_at: '2026-06-01T00:00:00Z',
                last_active: '2026-10-01T00:00:00Z',
            },
        ],
    });

    const resolved = await resolveWeeklyWireRecipients(db, { audienceMode: 'opted_in_all', nowMs });
    assert.equal(resolved.recipients.length, 3);
    assert.deepEqual(resolved.segmentCounts, { non_account: 1, inactive_21d: 1, active_member: 1 });

    const leadBlock = buildPromoBlockForSegment('non_account', { siteUrl: 'https://smarter.poker' });
    const inactiveBlock = buildPromoBlockForSegment('inactive_21d', {
        userId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
        siteUrl: 'https://smarter.poker',
    });
    const activeBlock = buildPromoBlockForSegment('active_member', { siteUrl: 'https://smarter.poker' });

    assert.match(leadBlock.ctaUrl, /\/auth\/signup\?.*pt=/);
    assert.match(inactiveBlock.ctaUrl, /\/promo\/welcome-back\?wb=/);
    assert.doesNotMatch(activeBlock.ctaUrl, /\/auth\/signup/);

    const rendered = renderWeeklyWireEmail({
        edition: {
            editionNumber: 2,
            subject: 'Test Subject',
            platformUpdates: [PLATFORM_UPDATES_CATALOG[0]],
            articles: [
                {
                    id: '10000000-0000-4000-8000-000000000099',
                    title: 'Major Main Event Draws Record Field',
                    summary: 'Clean summary without echoing the headline.',
                    source_name: 'PokerNews',
                    image_url: 'https://smarter.poker/cards/news.png',
                    category: 'TOURNAMENT',
                },
            ],
            toolSpotlight: TOOL_SPOTLIGHT_CATALOG[0],
        },
        promoBlock: activeBlock,
    });

    assert.match(rendered.html, /SMARTER\.POKER WEEKLY WIRE/);
    assert.match(rendered.html, /PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453/);
    assert.match(rendered.html, /Tool Spotlight Of The Week/);
    assert.match(rendered.text, /PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453/);
});
