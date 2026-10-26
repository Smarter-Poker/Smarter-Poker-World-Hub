export function digestLayoutFixture() {
    const longAlert = 'ServerTableEngine.authoritative_hand_semantic_refusal_with_post_commit_obligations';
    return {
        day: '2026-10-24', day_label: 'Saturday, Oct 24', generated_at: '2026-10-25T12:00:00Z',
        metrics: {
            window: { start: '2026-10-24T05:00:00Z', end: '2026-10-25T05:00:00Z' },
            money: { cash_rake: 1234567.89, tournament_rake: 120.5 },
            diamonds: { given_by_source: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`fixture_source_${i}_with_a_long_descriptive_name`, 1000 + i])) },
            health: { alerts_top: [{ alertname: longAlert, severity: 'critical', n: 12 }] },
        },
        player_totals: {
            players: [], totals: {},
            period: Object.fromEntries(['day', 'week', 'month'].map(k => [k, {
                from: '2026-10-01', to: '2026-10-25', players: 44, hands: 15527,
                minutes: 11912, net: -5315.43, cash_net: -5000, tournament_net: -315.43,
                cash_rake: 1234567.89, tournament_rake: 152.49, wallet_end: 6077.63,
                missing_days: 0,
            }])),
        },
        mtd: {}, prev: null, series: {}, week: null,
        attention: [{ title: `${longAlert} (12 original events)`, severity: 'critical', status: 'tracked' }],
        attention_status: { tracked: 1 },
        horse_roster: {
            size: 938, demand: 6, plo_count: 938, refreshes_today: 4,
            added: [], dropped: [], plo_added: [], plo_dropped: [],
            members: Array.from({ length: 938 }, (_, i) => ({ rank: i + 1, name: `Fixture Horse ${i + 1}`, bb100: 1.25, hands: 5000, plo: true, plo_bb100: 1.1 })),
        },
    };
}
