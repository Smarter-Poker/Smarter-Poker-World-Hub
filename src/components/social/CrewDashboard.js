import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';
import Link from 'next/link';

export default function CrewDashboard({ currentUser }) {
    const [crews, setCrews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [showJoin, setShowJoin] = useState(false);
    const [newCrewName, setNewCrewName] = useState('');
    const [joinCode, setJoinCode] = useState('');

    const loadCrews = async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            // Fetch crews the user is a part of
            const { data: memberRecords } = await supabase
                .from('crew_members')
                .select('role, crew_id, crews(*)')
                .eq('user_id', currentUser.id);
            
            if (memberRecords) {
                const formattedCrews = memberRecords.map(m => ({
                    ...m.crews,
                    myRole: m.role
                }));
                setCrews(formattedCrews);
            }
        } catch (e) {
            console.error('Error loading crews:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCrews();
    }, [currentUser]);

    const handleCreateCrew = async () => {
        if (!newCrewName.trim()) return toast.error('Crew name required');
        try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const res = await fetch('/api/social/crews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({ action: 'create', payload: { name: newCrewName.trim() } })
            });

            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Crew created!');
            setShowCreate(false);
            setNewCrewName('');
            loadCrews();
        } catch (e) {
            toast.error(e.message || 'Failed to create crew');
        }
    };

    const handleJoinCrew = async () => {
        if (!joinCode.trim()) return toast.error('Join code required');
        try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const res = await fetch('/api/social/crews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({ action: 'join', payload: { crew_code: joinCode.trim() } })
            });

            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Joined Crew!');
            setShowJoin(false);
            setJoinCode('');
            loadCrews();
        } catch (e) {
            toast.error(e.message || 'Failed to join crew');
        }
    };

    const handleLeaveCrew = async (crewId) => {
        if (!confirm('Are you sure you want to leave this crew?')) return;
        try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const res = await fetch('/api/social/crews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({ action: 'leave', payload: { crew_id: crewId } })
            });

            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Left Crew');
            loadCrews();
        } catch (e) {
            toast.error(e.message || 'Failed to leave crew');
        }
    };

    if (loading) return null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #2A1B3D 0%, #161A3E 100%)',
            borderRadius: 12, padding: 20, color: 'white', marginBottom: 16,
            border: '1px solid rgba(160, 51, 255, 0.3)',
            boxShadow: '0 4px 20px rgba(160, 51, 255, 0.15)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #A033FF, #FF00FF)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                    }}>🏴‍☠️</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>YOUR CREWS</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>Team Up & Compete</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowJoin(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer' }}>Join Crew</button>
                    <button onClick={() => setShowCreate(true)} style={{ background: '#A033FF', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Create New</button>
                </div>
            </div>

            {showCreate && (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, marginBottom: 16, display: 'flex', gap: 8 }}>
                    <input 
                        value={newCrewName} onChange={e => setNewCrewName(e.target.value)} 
                        placeholder="Crew Name..." autoFocus
                        style={{ flex: 1, background: '#111', color: 'white', border: '1px solid #444', borderRadius: 6, padding: '8px 12px', outline: 'none' }} 
                    />
                    <button onClick={handleCreateCrew} style={{ background: '#00FF88', color: 'black', border: 'none', padding: '0 16px', borderRadius: 6, fontWeight: 'bold' }}>Creat</button>
                    <button onClick={() => setShowCreate(false)} style={{ background: 'transparent', color: '#999', border: 'none', padding: '0 8px' }}>✕</button>
                </div>
            )}

            {showJoin && (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, marginBottom: 16, display: 'flex', gap: 8 }}>
                    <input 
                        value={joinCode} onChange={e => setJoinCode(e.target.value)} 
                        placeholder="Join Code (CRW-XXXXXX)..." autoFocus
                        style={{ flex: 1, background: '#111', color: 'white', border: '1px solid #444', borderRadius: 6, padding: '8px 12px', outline: 'none', textTransform: 'uppercase' }} 
                    />
                    <button onClick={handleJoinCrew} style={{ background: '#00FF88', color: 'black', border: 'none', padding: '0 16px', borderRadius: 6, fontWeight: 'bold' }}>Join</button>
                    <button onClick={() => setShowJoin(false)} style={{ background: 'transparent', color: '#999', border: 'none', padding: '0 8px' }}>✕</button>
                </div>
            )}

            {crews.length === 0 && !showCreate && !showJoin && (
                <div style={{ textAlign: 'center', padding: '20px 0', opacity: 0.7, fontSize: 13 }}>
                    You aren't in any crews yet. Create or join one to team up with friends!
                </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
                {crews.map(crew => (
                    <div key={crew.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#FFF' }}>{crew.name}</div>
                            <button onClick={() => handleLeaveCrew(crew.id)} style={{ background: 'none', border: 'none', color: '#FF4444', fontSize: 11, cursor: 'pointer' }}>Leave</button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, opacity: 0.8 }}>
                            <div>Role: <span style={{ color: crew.myRole === 'owner' ? '#FFD700' : '#A033FF', fontWeight: 'bold', textTransform: 'capitalize' }}>{crew.myRole}</span></div>
                            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: 12, letterSpacing: 1 }}>Invite: <span style={{ color: '#00FF88', fontWeight: 'bold' }}>{crew.crew_code}</span></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
