import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';
import Link from 'next/link';

/** Read auth token without triggering session lock contention */
const getCrewToken = () => {
  try {
    const raw = localStorage.getItem('smarter-poker-auth');
    if (raw) {
      const t = JSON.parse(raw)?.access_token;
      if (t) return t;
    }
    const sbKey = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (sbKey) return JSON.parse(localStorage.getItem(sbKey) || '{}')?.access_token || null;
  } catch (_) {}
  return null;
};

export default function CrewDashboard({ currentUser }) {
  const [crews, setCrews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newCrewName, setNewCrewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [confirmLeaveId, setConfirmLeaveId] = useState(null);

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
        const formattedCrews = memberRecords.map((m) => ({
          ...m.crews,
          myRole: m.role,
        }));
        setCrews(formattedCrews);
      }
    } catch (e) {
      console.warn('Error loading crews:', e);
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
      const token = getCrewToken();
      const res = await fetch('/api/social/crews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'create', payload: { name: newCrewName.trim() } }),
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
      const token = getCrewToken();
      const res = await fetch('/api/social/crews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'join', payload: { crew_code: joinCode.trim() } }),
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
    if (confirmLeaveId !== crewId) {
      setConfirmLeaveId(crewId);
      setTimeout(() => setConfirmLeaveId(null), 5000); // Auto-reset after 5s
      return;
    }
    setConfirmLeaveId(null);
    try {
      const token = getCrewToken();
      const res = await fetch('/api/social/crews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'leave', payload: { crew_id: crewId } }),
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
    <div
      style={{
        background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 100%)',
        borderRadius: 12,
        padding: 20,
        color: 'white',
        marginBottom: 16,
        border: '1px solid rgba(59, 130, 246, 0.3)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            🏴‍☠️
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>YOUR CREWS</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Team Up & Compete</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowJoin(true)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(59,130,246,0.4)',
              color: 'white',
              padding: '6px 12px',
              borderRadius: 16,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Join Crew
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              border: 'none',
              color: 'white',
              padding: '6px 12px',
              borderRadius: 16,
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Create New
          </button>
        </div>
      </div>

      {showCreate && (
        <div
          style={{
            background: 'rgba(0,0,0,0.3)',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            value={newCrewName}
            onChange={(e) => setNewCrewName(e.target.value)}
            placeholder="Crew Name..."
            autoFocus
            style={{
              flex: 1,
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              borderRadius: 6,
              padding: '8px 12px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleCreateCrew}
            style={{
              background: '#00FF88',
              color: 'black',
              border: 'none',
              padding: '0 16px',
              borderRadius: 6,
              fontWeight: 'bold',
            }}
          >
            Create
          </button>
          <button
            onClick={() => setShowCreate(false)}
            style={{ background: 'transparent', color: '#999', border: 'none', padding: '0 8px' }}
          >
            ✕
          </button>
        </div>
      )}

      {showJoin && (
        <div
          style={{
            background: 'rgba(0,0,0,0.3)',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Join Code (CRW-XXXXXX)..."
            autoFocus
            style={{
              flex: 1,
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              borderRadius: 6,
              padding: '8px 12px',
              outline: 'none',
              textTransform: 'uppercase',
            }}
          />
          <button
            onClick={handleJoinCrew}
            style={{
              background: '#00FF88',
              color: 'black',
              border: 'none',
              padding: '0 16px',
              borderRadius: 6,
              fontWeight: 'bold',
            }}
          >
            Join
          </button>
          <button
            onClick={() => setShowJoin(false)}
            style={{ background: 'transparent', color: '#999', border: 'none', padding: '0 8px' }}
          >
            ✕
          </button>
        </div>
      )}

      {crews.length === 0 && !showCreate && !showJoin && (
        <div style={{ textAlign: 'center', padding: '20px 0', opacity: 0.7, fontSize: 13 }}>
          You Aren't In Any Crews Yet. Create Or Join One To Team Up With Friends!
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {crews.map((crew) => (
          <div
            key={crew.id}
            style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 16 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#FFF' }}>{crew.name}</div>
              <button
                onClick={() => handleLeaveCrew(crew.id)}
                style={{
                  background: confirmLeaveId === crew.id ? '#FF4444' : 'none',
                  border: 'none',
                  color: confirmLeaveId === crew.id ? 'white' : '#FF4444',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: confirmLeaveId === crew.id ? '4px 10px' : '0',
                  borderRadius: 6,
                  transition: 'all 0.2s',
                  fontWeight: confirmLeaveId === crew.id ? 700 : 400,
                }}
              >
                {confirmLeaveId === crew.id ? 'Confirm Leave?' : 'Leave'}
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 12,
                opacity: 0.8,
              }}
            >
              <div>
                Role:{' '}
                <span
                  style={{
                    color: crew.myRole === 'owner' ? '#FFD700' : '#06b6d4',
                    fontWeight: 'bold',
                    textTransform: 'capitalize',
                  }}
                >
                  {crew.myRole}
                </span>
              </div>
              <div
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  padding: '4px 10px',
                  borderRadius: 12,
                  letterSpacing: 1,
                }}
              >
                Invite:{' '}
                <span style={{ color: '#06b6d4', fontWeight: 'bold' }}>{crew.crew_code}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
