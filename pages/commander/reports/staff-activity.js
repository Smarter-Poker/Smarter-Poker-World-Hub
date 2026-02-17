/**
 * Staff Activity Log
 * /commander/reports/staff-activity
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { Activity, Users, Clock, Shield, Loader2 } from 'lucide-react';
import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';

export default function StaffActivity() {
  const router = useRouter();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
        const res = await fetch('/api/commander/incidents?status=all&limit=50', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) setActivities(json.data || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchActivity();
  }, []);

  const typeColors = {
    floor_call: '#F59E0B',
    dispute: '#EF4444',
    incident: '#EF4444',
    maintenance: '#B0B3B8',
    general: '#1877F2'
  };

  return (
    <CommanderLayout title="Staff Activity" backHref="/commander/reports">
      <>
        <SEOHead
                title="Commander — Staff Activity"
                description="Club Commander Poker Room Management Tool."
                noindex={true}
            />
        <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
          <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
            <h1 className="text-lg font-bold text-white">Staff Activity Log</h1>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[#1877F2] animate-spin mx-auto" /></div>
            ) : activities.length === 0 ? (
              <div className="text-center py-16">
                <Activity className="w-10 h-10 text-[#3A3B3C] mx-auto mb-3" />
                <p className="text-[#B0B3B8]">No Activity Logged Yet</p>
                <p className="text-xs text-[#B0B3B8]/60 mt-1">Floor Calls, Incidents, And Actions Will Appear Here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activities.map(a => (
                  <div key={a.id} className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                      style={{ backgroundColor: typeColors[a.type] || '#B0B3B8' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-[#B0B3B8] uppercase">{a.type?.replace('_', ' ')}</span>
                        {a.table_number && <span className="text-xs text-[#B0B3B8]">• Table {a.table_number}</span>}
                        <span className="text-xs text-[#B0B3B8]/50">
                          {a.created_at ? new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-[#E4E6EB]">{a.description}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === 'open' ? 'bg-[#F59E0B]/20 text-[#F59E0B]' :
                        a.status === 'resolved' ? 'bg-[#31A24C]/20 text-[#31A24C]' :
                          'bg-[#3A3B3C] text-[#B0B3B8]'
                      }`}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <style jsx>{`
`}</style>
      </>
    </CommanderLayout>
  );
}
