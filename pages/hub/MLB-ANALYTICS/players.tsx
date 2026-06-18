import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();
        
        // Fetch Hitters (Selecting ONLY necessary columns to avoid massive payload from fangraphs_full)
        const { data: hittersData, error: hittersErr } = await mlbDb
            .from('v_hitter_profile')
            .select('player_id, full_name, team_id, wrc_plus, woba, pa')
            .order('wrc_plus', { ascending: false });
            
        if (hittersErr) throw hittersErr;
        
        // Fetch Pitchers (Selecting ONLY necessary columns)
        const { data: pitchersData, error: pitchersErr } = await mlbDb
            .from('v_pitcher_profile')
            .select('player_id, full_name, team_id, fip, siera, bf')
            .order('fip', { ascending: true }); // Lower FIP is better
            
        if (pitchersErr) throw pitchersErr;
        
        return {
            props: {
                hitters: hittersData || [],
                pitchers: pitchersData || []
            }
        };
    } catch (err) {
        console.error('Error fetching players:', err);
        return { props: { hitters: [], pitchers: [] } };
    }
}

const PlayerCard = ({ player, type }) => {
    // Premium dynamic headshot using official MLB CDN
    const headshotUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.player_id}/headshot/67/current`;

    const renderStats = () => {
        if (type === 'pitchers') {
            const fip = player.fip != null ? Number(player.fip).toFixed(2) : 'N/A';
            const siera = player.siera != null ? Number(player.siera).toFixed(2) : 'N/A';
            return `FIP ${fip} · SIERA ${siera} · ${player.bf || 0} BF`;
        } else {
            const wrc = player.wrc_plus != null ? Number(player.wrc_plus).toFixed(1) : 'N/A';
            const woba = player.woba != null ? Number(player.woba).toFixed(3) : 'N/A';
            return `wRC+ ${wrc} · wOBA ${woba} · ${player.pa || 0} PA`;
        }
    };

    return (
        <Link href={`/hub/MLB-ANALYTICS/players/${player.player_id}`} style={{ textDecoration: 'none' }}>
            <div 
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '16px 12px', 
                    borderBottom: '1px solid #E2E8F0',
                    transition: 'background-color 0.2s ease',
                    cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ position: 'relative', width: 44, height: 44 }}>
                        <img 
                            src={headshotUrl} 
                            onError={(e) => { e.currentTarget.src = '/avatars/default-avatar.png'; }}
                            alt={player.full_name}
                            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', background: '#F1F5F9', border: '1px solid #E2E8F0' }} 
                        />
                        {player.team_id && (
                            <img 
                                src={`https://www.mlbstatic.com/team-logos/${player.team_id}.svg`} 
                                alt="Team Logo"
                                style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, background: '#fff', borderRadius: '50%', padding: 2, border: '1px solid #CBD5E1', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                            />
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                            {player.full_name}
                        </span>
                        <span style={{ fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: 500 }}>
                            {renderStats()}
                        </span>
                    </div>
                </div>
                <ChevronRight size={20} color="#CBD5E1" />
            </div>
        </Link>
    );
};

export default function PlayersPage({ hitters = [], pitchers = [] }: any) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('Regular Hitters');

    const filteredPlayers = useMemo(() => {
        let list = [];
        if (activeTab === 'Regular Hitters') {
            list = hitters.filter(h => (h.pa || 0) >= 150);
        } else if (activeTab === 'Bench / Fringe') {
            list = hitters.filter(h => (h.pa || 0) < 150);
        } else if (activeTab === 'Pitchers') {
            list = pitchers;
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            list = list.filter(p => p.full_name?.toLowerCase().includes(query));
        }
        return list;
    }, [hitters, pitchers, activeTab, searchQuery]);

    const tabs = ['Regular Hitters', 'Bench / Fringe', 'Pitchers'];

    return (
        <div style={{ minHeight: '100vh', background: '#fff', color: '#0F172A', paddingBottom: 70, fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif", width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
           <SEOHead 
               title="Players | MLB Analytics" 
               description="Complete profiles for every 2026 MLB hitter and pitcher."
               noIndex={true}
           />

           {/* MANDATORY HUB STANDARD HEADER */}
           <UniversalHeader pageDepth={2} />

           <div style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
               
               <div style={{ marginBottom: 24 }}>
                   <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Player Database</h1>
                   <p style={{ margin: 0, fontSize: 15, color: '#64748B', lineHeight: 1.5 }}>
                       Complete profiles for every 2026 MLB hitter and pitcher. Access situational splits, recent form, and advanced metrics.
                   </p>
               </div>

               <div style={{ position: 'relative', marginBottom: 20 }}>
                   <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex', pointerEvents: 'none' }}>
                       <Search size={18} />
                   </div>
                   <input 
                       type="text" 
                       placeholder="Search players by name..." 
                       value={searchQuery}
                       onChange={e => setSearchQuery(e.target.value)}
                       style={{ 
                           width: '100%', 
                           padding: '14px 16px 14px 40px', 
                           borderRadius: 12, 
                           border: '1px solid #E2E8F0', 
                           fontSize: 15, 
                           outline: 'none', 
                           background: '#F8FAFC',
                           transition: 'all 0.2s',
                           boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                       }}
                       onFocus={(e) => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'; }}
                       onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.02)'; }}
                   />
               </div>

               <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                   {tabs.map(tab => (
                       <button 
                           key={tab}
                           onClick={() => setActiveTab(tab)}
                           style={{
                               padding: '8px 16px', 
                               borderRadius: 20, 
                               border: 'none', 
                               fontSize: 14, 
                               fontWeight: 600, 
                               cursor: 'pointer',
                               whiteSpace: 'nowrap',
                               transition: 'all 0.2s',
                               background: activeTab === tab ? '#0F172A' : '#F1F5F9',
                               color: activeTab === tab ? '#FFFFFF' : '#64748B'
                           }}
                       >
                           {tab}
                       </button>
                   ))}
               </div>

               <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                   {filteredPlayers.length > 0 ? (
                       filteredPlayers.map(player => (
                           <PlayerCard 
                               key={player.player_id} 
                               player={player} 
                               type={activeTab === 'Pitchers' ? 'pitchers' : 'hitters'} 
                           />
                       ))
                   ) : (
                       <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8', fontSize: 15 }}>
                           <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Search size={32} style={{ opacity: 0.5 }} /></div>
                           No players found matching "{searchQuery}".
                       </div>
                   )}
               </div>

           </div>
           
           <BottomNavBar />
        </div>
    );
}
