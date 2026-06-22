import Link from 'next/link';
import { useRouter } from 'next/router';

export default function MlbSubNav() {
    const router = useRouter();
    const links = [
        { label: 'Slate', href: '/hub/MLB-ANALYTICS' },
        { label: 'Best Bets', href: '/hub/MLB-ANALYTICS/best-bets' },
        { label: 'Standings', href: '/hub/MLB-ANALYTICS/standings' },
        { label: 'Model Intel', href: '/hub/MLB-ANALYTICS/model-intel' },
        { label: 'Props', href: '/hub/MLB-ANALYTICS/props' },
        { label: 'HR Tracker', href: '/hub/MLB-ANALYTICS/hr-tracker' },
        { label: 'Tracker', href: '/hub/MLB-ANALYTICS/tracker' },
        { label: 'Players', href: '/hub/MLB-ANALYTICS/players' },
        { label: 'Teams', href: '/hub/MLB-ANALYTICS/teams' },
        { label: 'Backtest', href: '/hub/MLB-ANALYTICS/backtest' },
        { label: 'Status', href: '/hub/MLB-ANALYTICS/status' },
        { label: 'Portfolio', href: '/hub/MLB-ANALYTICS/portfolio' },
        { label: 'Validation', href: '/hub/MLB-ANALYTICS/validation' }
    ];

    return (
        <div className="bg-[#0a0a15] border-b border-[#3d4f5f] px-4 py-3 flex gap-4 overflow-x-auto whitespace-nowrap shadow-[0_4px_20px_rgba(0,0,0,0.5)] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {links.map(l => {
                // Slate is exact-match only; all others use startsWith so nested routes stay highlighted.
                // Teams is special: match both /teams (list) and /team/ (singular detail page).
                // Model Intel also catches the old /accuracy route since it redirects here.
                const isActive = l.label === 'Slate'
                    ? (router.pathname === l.href || router.pathname === '/hub/MLB-ANALYTICS')
                    : l.label === 'Teams'
                    ? (router.pathname.startsWith('/hub/MLB-ANALYTICS/teams') || router.pathname.startsWith('/hub/MLB-ANALYTICS/team/'))
                    : l.label === 'Model Intel'
                    ? (router.pathname.startsWith('/hub/MLB-ANALYTICS/model-intel') || router.pathname.startsWith('/hub/MLB-ANALYTICS/accuracy'))
                    : router.pathname.startsWith(l.href);
                return (
                    <Link key={l.label} href={l.href} className={`pb-1 text-[14px] font-extrabold capitalize tracking-widest transition-all touch-manipulation flex-shrink-0 ${
                        isActive 
                            ? 'text-[#00D4FF] border-b-[2px] border-[#00D4FF] shadow-[0_4px_10px_-2px_rgba(0,212,255,0.4)]' 
                            : 'text-slate-500 border-b-[2px] border-transparent hover:text-slate-300 hover:border-slate-600'
                    }`} style={{ textDecoration: 'none' }}>
                        {l.label}
                    </Link>
                );
            })}
        </div>
    );
}
