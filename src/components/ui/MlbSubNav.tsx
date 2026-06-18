import Link from 'next/link';
import { useRouter } from 'next/router';

export default function MlbSubNav() {
    const router = useRouter();
    const links = [
        { label: 'Slate', href: '/hub/MLB-ANALYTICS' },
        { label: 'Best Bets', href: '/hub/MLB-ANALYTICS/best-bets' },
        { label: 'Model Intel', href: '/hub/MLB-ANALYTICS/model-intel' },
        { label: 'Props', href: '/hub/MLB-ANALYTICS/props' },
        { label: 'Tracker', href: '/hub/MLB-ANALYTICS/tracker' },
        { label: 'Players', href: '/hub/MLB-ANALYTICS/players' },
        { label: 'Teams', href: '/hub/MLB-ANALYTICS/teams' },
        { label: 'Accuracy', href: '/hub/MLB-ANALYTICS/accuracy' },
        { label: 'Backtest', href: '/hub/MLB-ANALYTICS/backtest' },
        { label: 'Status', href: '/hub/MLB-ANALYTICS/status' },
        { label: 'Portfolio', href: '/hub/MLB-ANALYTICS/portfolio' },
        { label: 'Validation', href: '/hub/MLB-ANALYTICS/validation' }
    ];

    return (
        <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '12px 16px', display: 'flex', gap: '24px', overflowX: 'auto', whiteSpace: 'nowrap', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            <style jsx>{`
                div::-webkit-scrollbar { display: none; }
            `}</style>
            {links.map(l => {
                const isActive = router.pathname === l.href || (router.pathname === '/hub/MLB-ANALYTICS' && l.label === 'Slate');
                return (
                    <Link key={l.label} href={l.href} style={{
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: isActive ? '#2563EB' : '#64748B',
                        paddingBottom: '2px',
                        borderBottom: isActive ? '2px solid #2563EB' : '2px solid transparent',
                        transition: 'color 0.2s, border-color 0.2s'
                    }}>
                        {l.label}
                    </Link>
                );
            })}
        </div>
    );
}
