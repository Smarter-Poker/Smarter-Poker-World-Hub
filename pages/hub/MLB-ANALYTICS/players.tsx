import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, Search, X, AlertTriangle, Loader2 } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import SEOHead from '../../../src/components/seo/SEOHead';

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

const fetcher = (url: string) => fetch(url).then(res => res.json());

const PlayerCard = ({ player, type }: { player: PlayerProfile, type: 'hitters' | 'pitchers' }) => {
    // Premium dynamic headshot using official MLB CDN
    const headshotUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.player_id}/headshot/67/current`;
    const [imgSrc, setImgSrc] = useState(headshotUrl);

    return (
        <Link href={`/hub/MLB-ANALYTICS/players/${player.player_id}`} style={{ textDecoration: 'none' }}>
            <div 
                className="metal-frame"
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '16px 20px',
                    marginBottom: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    position: 'relative'
                }}
                onMouseEnter={(e) => { 
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 212, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3)';
                    e.currentTarget.style.borderColor = '#00D4FF';
                }}
                onMouseLeave={(e) => { 
                    e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5)';
                    e.currentTarget.style.borderColor = '#3d4f5f';
                }}
            >
                <div className="frame-corner top-left" />
                <div className="frame-corner top-right" />
                <div className="frame-corner bottom-left" />
                <div className="frame-corner bottom-right" />
                <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
                <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
                <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
                <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
                <div className="neon-strip left" />

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, zIndex: 1 }}>
                    <div style={{ position: 'relative', width: 56, height: 56 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                            src={imgSrc} 
                            onError={() => setImgSrc('/avatars/default-avatar.png')}
                            alt={player.full_name}
                            loading="lazy"
                            style={{ 
                                width: 56, 
                                height: 56, 
                                borderRadius: '50%', 
                                objectFit: 'cover', 
                                background: '#0d1117', 
                                border: '2px solid #3d4f5f',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), 0 0 10px rgba(0,212,255,0.2)'
                            }} 
                        />
                        {player.team_id && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img 
                                src={`https://www.mlbstatic.com/team-logos/${player.team_id}.svg`} 
                                alt="Team Logo"
                                loading="lazy"
                                style={{ 
                                    position: 'absolute', 
                                    bottom: -4, 
                                    right: -4, 
                                    width: 24, 
                                    height: 24, 
                                    background: '#0d1117', 
                                    borderRadius: '50%', 
                                    padding: 2, 
                                    border: '1px solid #3d4f5f', 
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.8)' 
                                }}
                            />
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ 
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 18, 
                            fontWeight: 700, 
                            color: '#FFFFFF', 
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                        }}>
                            {player.full_name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            {type === 'pitchers' ? (
                                <>
                                    <span style={{ color: '#00D4FF', fontWeight: 700, fontSize: 14, fontFamily: "'Orbitron', sans-serif", textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>
                                        FIP {player.fip != null ? Number(player.fip).toFixed(2) : 'N/A'}
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>|</span>
                                    <span style={{ color: '#94A3B8', fontSize: 13, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                        SIERA {player.siera != null ? Number(player.siera).toFixed(2) : 'N/A'}
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>|</span>
                                    <span style={{ color: '#94A3B8', fontSize: 13, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                        {player.bf || 0} BF
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span style={{ color: '#00D4FF', fontWeight: 700, fontSize: 14, fontFamily: "'Orbitron', sans-serif", textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>
                                        wRC+ {player.wrc_plus != null ? Number(player.wrc_plus).toFixed(0) : 'N/A'}
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>|</span>
                                    <span style={{ color: '#94A3B8', fontSize: 13, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                        wOBA {player.woba != null ? Number(player.woba).toFixed(3) : 'N/A'}
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>|</span>
                                    <span style={{ color: '#94A3B8', fontSize: 13, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                        {player.pa || 0} PA
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                
                <div style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: '50%', 
                    background: '#0d1117', 
                    border: '2px solid #3d4f5f', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)',
                    zIndex: 1
                }}>
                    <ChevronRight size={18} color="#00D4FF" style={{ filter: 'drop-shadow(0 0 2px rgba(0,212,255,0.5))' }} />
                </div>
            </div>
        </Link>
    );
};

export default function PlayersPage() {
    const { data, error, isLoading } = useSWR('/api/mlb/players', fetcher, {
        refreshInterval: 60000 // Poll every minute
    });

    const hitters = data?.hitters || [];
    const pitchers = data?.pitchers || [];
    const fetchError = error || data?.fetchError;

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('Regular Hitters');

    const filteredPlayers = useMemo(() => {
        let list: PlayerProfile[] = [];
        if (activeTab === 'Regular Hitters') {
            list = hitters.filter((h: PlayerProfile) => (h.pa || 0) >= 150);
        } else if (activeTab === 'Bench / Fringe') {
            list = hitters.filter((h: PlayerProfile) => (h.pa || 0) < 150);
        } else if (activeTab === 'Pitchers') {
            list = pitchers;
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            list = list.filter((p: PlayerProfile) => p.full_name?.toLowerCase().includes(query));
        }
        
        // Optimization: limit the initial render list to prevent DOM bloat on search
        return list.slice(0, 150); 
    }, [hitters, pitchers, activeTab, searchQuery]);

    const tabs = ['Regular Hitters', 'Bench / Fringe', 'Pitchers'];

    return (
        <div style={{ 
            minHeight: '100vh', 
            background: '#0a0a15', 
            color: '#FFFFFF', 
            paddingBottom: 70, 
            fontFamily: "'Rajdhani', sans-serif", 
            width: '100%', 
            maxWidth: '100vw', 
            overflowX: 'hidden' 
        }}>
           <SEOHead 
               title="Players | MLB Analytics" 
               description="Complete profiles for every 2026 MLB hitter and pitcher."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />

           <div className="edge-to-edge-container" style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
               
               <div style={{ marginBottom: 24 }}>
                   <h1 style={{ 
                       margin: '0 0 8px', 
                       fontSize: 32, 
                       fontWeight: 700, 
                       letterSpacing: '0.1em', 
                       color: '#FFFFFF',
                       fontFamily: "'Orbitron', sans-serif",
                       textTransform: 'uppercase',
                       textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                   }}>Player Database</h1>
                   <p style={{ margin: 0, fontSize: 16, color: '#94A3B8', fontWeight: 500, letterSpacing: '0.02em' }}>
                       Complete profiles for every 2026 MLB hitter and pitcher. Access situational splits, recent form, and advanced metrics.
                   </p>
               </div>

               <div style={{ position: 'relative', marginBottom: 20 }}>
                   <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#00D4FF', display: 'flex', pointerEvents: 'none' }}>
                       <Search size={18} style={{ filter: 'drop-shadow(0 0 2px rgba(0,212,255,0.5))' }} />
                   </div>
                   <input 
                       type="text" 
                       inputMode="search"
                       placeholder="SEARCH PLAYERS BY NAME..." 
                       value={searchQuery}
                       onChange={e => setSearchQuery(e.target.value)}
                       className="metal-input"
                       style={{ 
                           width: '100%', 
                           padding: '14px 40px 14px 44px',
                           boxSizing: 'border-box',
                           letterSpacing: '0.05em',
                           textTransform: 'uppercase'
                       }}
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

               <div style={{ display: 'flex', gap: 12, marginBottom: 24, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                   {tabs.map(tab => (
                       <button 
                           key={tab}
                           onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
                           style={{
                               padding: '12px 24px',
                               background: activeTab === tab ? 'linear-gradient(180deg, rgba(0,212,255,0.2) 0%, #1a2332 100%)' : 'linear-gradient(180deg, #1a2332 0%, #0d1117 100%)',
                               border: `2px solid ${activeTab === tab ? '#00D4FF' : '#3d4f5f'}`,
                               borderRadius: '4px',
                               clipPath: 'polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)',
                               color: activeTab === tab ? '#00D4FF' : '#94A3B8',
                               fontFamily: "'Orbitron', sans-serif",
                               fontWeight: 700,
                               fontSize: 12,
                               letterSpacing: '0.1em',
                               textTransform: 'uppercase',
                               cursor: 'pointer',
                               whiteSpace: 'nowrap',
                               transition: 'all 0.3s ease',
                               boxShadow: activeTab === tab ? '0 0 10px rgba(0,212,255,0.3), inset 0 2px 4px rgba(255,255,255,0.1)' : 'inset 0 2px 4px rgba(255,255,255,0.05)'
                           }}
                       >
                           {tab}
                       </button>
                   ))}
               </div>

               {fetchError && (
                   <div className="metal-frame" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, borderColor: '#ef4444', background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.1) 0%, #0d1117 100%)' }}>
                       <div className="frame-corner top-left" />
                       <div className="frame-corner top-right" />
                       <div className="frame-corner bottom-left" />
                       <div className="frame-corner bottom-right" />
                       <div style={{ 
                           width: 40, height: 40, borderRadius: '50%', background: '#0d1117', border: '2px solid #ef4444', 
                           display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(239,68,68,0.5)' 
                       }}>
                           <AlertTriangle color="#ef4444" size={20} />
                       </div>
                       <div>
                           <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 16, fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase' }}>System Error</div>
                           <div style={{ color: '#fca5a5', fontSize: 14, marginTop: 4, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>Data transmission failed. Attempting to reconnect...</div>
                       </div>
                   </div>
               )}

               <div style={{ display: 'flex', flexDirection: 'column' }}>
                   {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '80px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                            <Loader2 size={40} className="neon-animated" style={{ color: '#00D4FF', animation: 'spin 2s linear infinite' }} />
                            <div style={{ color: '#00D4FF', fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.2em', fontSize: 14, fontWeight: 700 }}>LOADING DATA...</div>
                        </div>
                   ) : filteredPlayers.length > 0 ? (
                       filteredPlayers.map((player: PlayerProfile) => (
                           <PlayerCard 
                               key={player.player_id} 
                               player={player} 
                               type={activeTab === 'Pitchers' ? 'pitchers' : 'hitters'} 
                           />
                       ))
                   ) : (
                       !fetchError && (
                           <div className="metal-frame" style={{ textAlign: 'center', padding: '80px 20px', color: '#94A3B8' }}>
                               <div className="frame-corner top-left" />
                               <div className="frame-corner top-right" />
                               <div className="frame-corner bottom-left" />
                               <div className="frame-corner bottom-right" />
                               <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
                                   <div style={{ 
                                       width: 80, height: 80, borderRadius: '50%', background: '#0d1117', border: '2px solid #3d4f5f', 
                                       display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)' 
                                   }}>
                                       <Search size={32} style={{ color: '#3d4f5f' }} />
                                   </div>
                               </div>
                               <div style={{ marginBottom: 16, fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 600, letterSpacing: '0.05em' }}>NO PLAYERS FOUND MATCHING "{searchQuery}"</div>
                               {searchQuery && (
                                   <button 
                                       onClick={() => setSearchQuery('')}
                                       className="hex-button"
                                   >
                                       CLEAR QUERY
                                   </button>
                               )}
                           </div>
                       )
                   )}
               </div>

           </div>
           
           <BottomNavBar />
           <style dangerouslySetInnerHTML={{__html: `
               @keyframes spin {
                   from { transform: rotate(0deg); }
                   to { transform: rotate(360deg); }
               }
           `}} />
        </div>
    );
}
