import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ChevronRight, Search, X, AlertTriangle } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export interface PlayerProfile {
    player_id: number;
    full_name: string;
    team_id?: number;
    wrc_plus?: number;
    woba?: number;
    pa?: number;
    fip?: number;
    siera?: number;
    bf?: number;
}

export async function getStaticProps() {
    try {
        const mlbDb = getMlbSupabase();
        
        // Fetch Hitters (Selecting ONLY necessary columns)
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
                pitchers: pitchersData || [],
                fetchError: false
            },
            revalidate: 3600 // ISR: Revalidate every hour
        };
    } catch (err) {
        console.error('Error fetching players:', err);
        return { 
            props: { hitters: [], pitchers: [], fetchError: true },
            revalidate: 60 // Retry sooner if error
        };
    }
}

const PlayerCard = ({ player, type }: { player: PlayerProfile, type: 'hitters' | 'pitchers' }) => {
    // Premium dynamic headshot using official MLB CDN
    const headshotUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.player_id}/headshot/67/current`;
    const [imgSrc, setImgSrc] = useState(headshotUrl);

    return (
        <Link href={`/hub/MLB-ANALYTICS/players/${player.player_id}`} style={{ textDecoration: 'none' }}>
            <div 
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '16px 12px', 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    background: 'transparent'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 240, 255, 0.05)'; e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'; }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ position: 'relative', width: 44, height: 44 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                            src={imgSrc} 
                            onError={() => setImgSrc('/avatars/default-avatar.png')}
                            alt={player.full_name}
                            loading="lazy"
                            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', background: '#1A1C29', border: '1px solid rgba(255,255,255,0.1)' }} 
                        />
                        {player.team_id && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img 
                                src={`https://www.mlbstatic.com/team-logos/${player.team_id}.svg`} 
                                alt="Team Logo"
                                loading="lazy"
                                style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, background: '#1A1C29', borderRadius: '50%', padding: 2, border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                            />
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.01em' }}>
                            {player.full_name}
                        </span>
                        <span style={{ fontSize: 13, color: '#94A3B8', marginTop: 3, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {type === 'pitchers' ? (
                                <>
                                    <span style={{ color: '#00F0FF', fontWeight: 600 }}>FIP {player.fip != null ? Number(player.fip).toFixed(2) : 'N/A'}</span>
                                    <span>· SIERA {player.siera != null ? Number(player.siera).toFixed(2) : 'N/A'}</span>
                                    <span>· {player.bf || 0} BF</span>
                                </>
                            ) : (
                                <>
                                    <span style={{ color: '#00F0FF', fontWeight: 600 }}>wRC+ {player.wrc_plus != null ? Number(player.wrc_plus).toFixed(0) : 'N/A'}</span>
                                    <span>· wOBA {player.woba != null ? Number(player.woba).toFixed(3) : 'N/A'}</span>
                                    <span>· {player.pa || 0} PA</span>
                                </>
                            )}
                        </span>
                    </div>
                </div>
                <ChevronRight size={20} color="rgba(255,255,255,0.2)" />
            </div>
        </Link>
    );
};

interface PlayersPageProps {
    hitters: PlayerProfile[];
    pitchers: PlayerProfile[];
    fetchError: boolean;
}

export default function PlayersPage({ hitters = [], pitchers = [], fetchError = false }: PlayersPageProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('Regular Hitters');

    const filteredPlayers = useMemo(() => {
        let list: PlayerProfile[] = [];
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
        
        // Optimization: limit the initial render list to prevent DOM bloat on search
        return list.slice(0, 150); 
    }, [hitters, pitchers, activeTab, searchQuery]);

    const tabs = ['Regular Hitters', 'Bench / Fringe', 'Pitchers'];

    return (
        <div style={{ minHeight: '100vh', background: '#0A0A15', color: '#FFFFFF', paddingBottom: 70, fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif", width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
           <SEOHead 
               title="Players | MLB Analytics" 
               description="Complete profiles for every 2026 MLB hitter and pitcher."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />

           <div className="edge-to-edge-container" style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
               
               <div style={{ marginBottom: 24 }}>
                   <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>Player Database</h1>
                   <p style={{ margin: 0, fontSize: 15, color: '#94A3B8', lineHeight: 1.5 }}>
                       Complete profiles for every 2026 MLB hitter and pitcher. Access situational splits, recent form, and advanced metrics.
                   </p>
               </div>

               <div style={{ position: 'relative', marginBottom: 20 }}>
                   <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#00F0FF', display: 'flex', pointerEvents: 'none' }}>
                       <Search size={18} />
                   </div>
                   <input 
                       type="text" 
                       inputMode="search"
                       placeholder="Search players by name..." 
                       value={searchQuery}
                       onChange={e => setSearchQuery(e.target.value)}
                       style={{ 
                           width: '100%', 
                           padding: '14px 40px 14px 40px', 
                           borderRadius: 12, 
                           border: '1px solid rgba(255, 255, 255, 0.1)', 
                           fontSize: 16, 
                           outline: 'none', 
                           background: '#131420',
                           color: '#FFFFFF',
                           transition: 'all 0.2s',
                           boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                       }}
                       onFocus={(e) => { e.currentTarget.style.borderColor = '#00F0FF'; e.currentTarget.style.boxShadow = '0 0 0 1px #00F0FF, inset 0 2px 4px rgba(0,0,0,0.2)'; }}
                       onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.2)'; }}
                   />
                   {searchQuery && (
                       <div 
                           onClick={() => setSearchQuery('')}
                           style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex', cursor: 'pointer', padding: 4 }}
                       >
                           <X size={18} />
                       </div>
                   )}
               </div>

               <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                   {tabs.map(tab => (
                       <button 
                           key={tab}
                           onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
                           style={{
                               padding: '8px 16px', 
                               borderRadius: 20, 
                               border: activeTab === tab ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)', 
                               fontSize: 14, 
                               fontWeight: 600, 
                               cursor: 'pointer',
                               whiteSpace: 'nowrap',
                               transition: 'all 0.2s',
                               background: activeTab === tab ? 'rgba(0, 240, 255, 0.1)' : '#131420',
                               color: activeTab === tab ? '#00F0FF' : '#94A3B8'
                           }}
                       >
                           {tab}
                       </button>
                   ))}
               </div>

               {fetchError && (
                   <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                       <AlertTriangle color="#EF4444" size={24} />
                       <div>
                           <div style={{ color: '#EF4444', fontWeight: 600, fontSize: 15 }}>Data Connection Error</div>
                           <div style={{ color: '#FCA5A5', fontSize: 14, marginTop: 2 }}>Unable to load player profiles. Please try refreshing the page.</div>
                       </div>
                   </div>
               )}

               <div style={{ display: 'flex', flexDirection: 'column', background: '#131420', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.5)' }}>
                   {filteredPlayers.length > 0 ? (
                       filteredPlayers.map(player => (
                           <PlayerCard 
                               key={player.player_id} 
                               player={player} 
                               type={activeTab === 'Pitchers' ? 'pitchers' : 'hitters'} 
                           />
                       ))
                   ) : (
                       !fetchError && (
                           <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94A3B8', fontSize: 15 }}>
                               <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Search size={40} style={{ opacity: 0.2, color: '#00F0FF' }} /></div>
                               <div style={{ marginBottom: 12 }}>No players found matching "{searchQuery}".</div>
                               {searchQuery && (
                                   <button 
                                       onClick={() => setSearchQuery('')}
                                       style={{ background: 'transparent', border: '1px solid rgba(0, 240, 255, 0.3)', color: '#00F0FF', padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                                   >
                                       Clear Search
                                   </button>
                               )}
                           </div>
                       )
                   )}
               </div>

           </div>
           
           <BottomNavBar />
        </div>
    );
}
