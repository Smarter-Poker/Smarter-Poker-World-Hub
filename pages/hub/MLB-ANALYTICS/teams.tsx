import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Search, SearchX } from 'lucide-react';
import useSWR from 'swr';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export interface Streaks {
    record?: string;
    last10_record?: string;
    [key: string]: any;
}

export interface TeamProfile {
    team_id: number;
    name: string;
    streaks: Streaks | null;
    [key: string]: any;
}

interface TeamsPageProps {
    teams: TeamProfile[];
    todayStr: string;
}

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();
        
        // Compute 'today' in America/Chicago
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());
        
        const { data: teams, error } = await mlbDb
            .from('v_team_profile')
            .select('*')
            .order('name', { ascending: true });
            
        if (error) {
            console.error('[TeamsPage] Error fetching teams:', error);
            return { props: { teams: [], todayStr } };
        }
        
        return {
            props: {
                teams: teams || [],
                todayStr
            }
        };
    } catch (err) {
        console.error('[TeamsPage] Error in getServerSideProps:', err);
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());
        return { props: { teams: [], todayStr } };
    }
}

const TeamLogo = ({ teamId, teamName }: { teamId: number, teamName: string }) => {
    const [imgError, setImgError] = useState(false);
    if (imgError) {
        return (
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#64748B' }}>
                {teamName.substring(0, 1).toUpperCase()}
            </div>
        );
    }
    return (
        <Image 
            unoptimized 
            width={24} 
            height={24} 
            src={`https://nscdmxldtyszyvcxxwgr.supabase.co/storage/v1/object/public/team-logos/${teamId}.svg`} 
            alt={teamName} 
            className="h-6 w-6 shrink-0"
            style={{ objectFit: 'contain' }}
            onError={() => setImgError(true)}
        />
    );
};

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function TeamsPage({ teams: fallbackTeams, todayStr }: TeamsPageProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const { data, error } = useSWR('/api/mlb/teams', fetcher, {
        fallbackData: { teams: fallbackTeams },
        refreshInterval: 15000,
        revalidateOnFocus: true,
    });

    const activeTeams = data?.teams || fallbackTeams || [];

    const filteredTeams = activeTeams.filter((team: TeamProfile) => 
        team.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="page-container" style={{ 
            minHeight: '100vh', 
            background: '#F8FAFC', 
            color: '#0F172A', 
            paddingBottom: 70, // Required clearance for BottomNavBar 
            fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
            width: '100%',
            maxWidth: '100vw',
            overflowX: 'hidden',
            boxSizing: 'border-box'
        }}>
            <SEOHead 
                title="Teams | MLB Analytics" 
                description="MLB Team profiles and analytics."
                noIndex={true} 
            />

            <UniversalHeader pageDepth={2} />

            <main className="feed-layout" style={{
                display: 'flex',
                gap: 0,
                justifyContent: 'center',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                <div className="feed-column" style={{ width: '100%', maxWidth: 680, overflowX: 'hidden', margin: '0 auto', boxSizing: 'border-box' }}>
                    
                    <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Link href="/hub/MLB-ANALYTICS" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563EB', fontSize: 12, fontWeight: 700, textDecoration: 'none', letterSpacing: 1 }}>
                                <ArrowLeft size={14} /> DASHBOARD
                            </Link>
                            <h1 style={{ margin: '8px 0 2px', fontSize: 24, fontWeight: 800 }}>All <span style={{ color: '#2563EB' }}>Teams</span></h1>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Standings & Streaks • {todayStr}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ color: '#2563EB', fontSize: 11, fontWeight: 800, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                                MLB EDGE
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', position: 'absolute', animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }} className="animate-ping" />
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', position: 'relative' }} />
                                </div>
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', marginTop: 4 }}>{activeTeams.length} CLUBS</div>
                        </div>
                    </div>

                    <div style={{ padding: '16px' }}>
                        <div style={{ marginBottom: 16, position: 'relative' }}>
                            <div style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }}>
                                <Search size={16} />
                            </div>
                            <input 
                                type="text"
                                placeholder="Search teams..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '10px 12px 10px 36px', 
                                    borderRadius: 8, 
                                    border: '1px solid #E2E8F0',
                                    outline: 'none',
                                    fontSize: 14,
                                    boxSizing: 'border-box',
                                    touchAction: 'manipulation'
                                }}
                            />
                        </div>

                        {filteredTeams.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                                <div style={{ marginBottom: 12, color: '#94A3B8', display: 'flex', justifyContent: 'center' }}>
                                    <SearchX size={32} />
                                </div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                                    No teams found.
                                </div>
                                <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                                    {activeTeams.length === 0 ? "The database returned no teams." : "Try adjusting your search query."}
                                </div>
                            </div>
                        ) : (
                            <ul style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, margin: 0, padding: 0, listStyle: 'none' }}>
                                {filteredTeams.map((team, idx) => {
                                    const record = team.streaks?.record || '';
                                    const last10 = team.streaks?.last10_record || '—';
                                    const isLast = idx === filteredTeams.length - 1;
                                    
                                    return (
                                        <li key={team.team_id} style={{ borderBottom: isLast ? 'none' : '1px solid #E2E8F0' }}>
                                            <Link 
                                                href={`/hub/MLB-ANALYTICS/team/${team.team_id}`}
                                                style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', padding: '12px 16px', alignItems: 'center' }}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#0F172A', fontWeight: 600, fontSize: 15 }}>
                                                    <TeamLogo teamId={team.team_id} teamName={team.name} />
                                                    {team.name}
                                                </span>
                                                <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 500 }}>
                                                    {record}{record ? ' · ' : ''}last10 {last10}
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </main>
            
            <BottomNavBar />
        </div>
    );
}
