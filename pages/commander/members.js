/**
 * Club Commander — Members Page
 * Full member management: list, search, add, scan, detail view
 * NO EMOJIS (per /no-emoji-commander)
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
    Users, UserPlus, ScanLine, Search, Filter, ArrowLeft,
    ChevronDown, User, Clock, Star, Loader2
} from 'lucide-react';
import AddMemberModal from '../../src/components/commander/members/AddMemberModal';
import ScanMemberModal from '../../src/components/commander/members/ScanMemberModal';
import MemberDetailPanel from '../../src/components/commander/members/MemberDetailPanel';

const TIER_COLORS = { standard: '#B0B3B8', gold: '#F59E0B', platinum: '#94A3B8', vip: '#A855F7' };
const STATUS_COLORS = { active: '#31A24C', suspended: '#EF4444', expired: '#8A8D91', banned: '#DC2626' };

export default function MembersPage() {
    const router = useRouter();
    const [staff, setStaff] = useState(null);
    const [venueId, setVenueId] = useState(null);
    const [venueName, setVenueName] = useState('');

    // Data
    const [members, setMembers] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    // Filters
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [tierFilter, setTierFilter] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showScanModal, setShowScanModal] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null);

    // Auth
    useEffect(() => {
        const stored = localStorage.getItem('commander_staff');
        if (!stored) { router.push('/commander/login'); return; }
        try {
            const data = JSON.parse(stored);
            setStaff(data);
            setVenueId(data.venue_id);
            setVenueName(data.venue_name || '');
        } catch { router.push('/commander/login'); }
    }, [router]);

    // Fetch members
    const fetchMembers = useCallback(async () => {
        if (!venueId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ venue_id: venueId, page, limit: 50 });
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);
            if (tierFilter) params.set('tier', tierFilter);

            const res = await fetch(`/api/commander/members?${params}`);
            const data = await res.json();
            if (data.success) {
                setMembers(data.data.members);
                setTotal(data.data.total);
            }
        } catch (err) {
            console.error('Fetch members error:', err);
        } finally { setLoading(false); }
    }, [venueId, page, search, statusFilter, tierFilter]);

    useEffect(() => { fetchMembers(); }, [fetchMembers]);

    // Search debounce
    const [searchInput, setSearchInput] = useState('');
    useEffect(() => {
        const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const handleMemberCreated = (newMember) => {
        setMembers(prev => [newMember, ...prev]);
        setTotal(prev => prev + 1);
        setSelectedMember(newMember);
    };

    const handleMemberUpdated = (updatedMember) => {
        setMembers(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
        setSelectedMember(updatedMember);
    };

    if (!staff) {
        return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;
    }

    return (
        <>
            <Head>
                <title>Members | Club Commander</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            </Head>

            <div className="min-h-screen bg-[#18191A]">
                {/* Header */}
                <header className="bg-[#242526] border-b border-[#3A3B3C] sticky top-0 z-30">
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => router.push('/commander/dashboard')} className="p-2 hover:bg-[#3A3B3C] rounded-lg transition-colors">
                                <img src="/images/btn-back.png" alt="Back" style={{ height: 44, objectFit: 'contain' }} />
                            </button>
                            <div>
                                <h1 className="font-bold text-white flex items-center gap-2">
                                    <Users className="w-5 h-5 text-[#1877F2]" /> Members
                                </h1>
                                <p className="text-xs text-[#B0B3B8]">{total} total members</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowScanModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#E4E6EB] rounded-lg text-sm font-medium transition-colors">
                                <ScanLine className="w-4 h-4" /> Scan
                            </button>
                            <button onClick={() => setShowAddModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] hover:bg-[#1664d9] text-white rounded-lg text-sm font-medium transition-colors">
                                <UserPlus className="w-4 h-4" /> Add Member
                            </button>
                        </div>
                    </div>
                </header>

                {/* Search & Filters */}
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8D91]" />
                            <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                                placeholder="Search by name, number, phone, or email..."
                                className="w-full pl-10 pr-4 py-2.5 bg-[#242526] border border-[#3A3B3C] rounded-lg text-[#E4E6EB] text-sm focus:border-[#1877F2] focus:outline-none placeholder-[#8A8D91]" />
                        </div>
                        <button onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${showFilters ? 'bg-[#1877F2] text-white' : 'bg-[#242526] border border-[#3A3B3C] text-[#B0B3B8] hover:bg-[#3A3B3C]'}`}>
                            <Filter className="w-4 h-4" /> Filters
                        </button>
                    </div>

                    {/* Filter Dropdowns */}
                    {showFilters && (
                        <div className="flex gap-3 mt-3">
                            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                                className="px-3 py-2 bg-[#242526] border border-[#3A3B3C] rounded-lg text-[#E4E6EB] text-sm">
                                <option value="">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                                <option value="expired">Expired</option>
                                <option value="banned">Banned</option>
                            </select>
                            <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(1); }}
                                className="px-3 py-2 bg-[#242526] border border-[#3A3B3C] rounded-lg text-[#E4E6EB] text-sm">
                                <option value="">All Tiers</option>
                                <option value="standard">Standard</option>
                                <option value="gold">Gold</option>
                                <option value="platinum">Platinum</option>
                                <option value="vip">VIP</option>
                            </select>
                            {(statusFilter || tierFilter) && (
                                <button onClick={() => { setStatusFilter(''); setTierFilter(''); setPage(1); }}
                                    className="px-3 py-2 text-[#1877F2] text-sm font-medium">Clear</button>
                            )}
                        </div>
                    )}
                </div>

                {/* Members List */}
                <div className="max-w-6xl mx-auto px-4 pb-8">
                    {loading ? (
                        <div className="text-center py-16"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin mx-auto mb-2" /><p className="text-sm text-[#B0B3B8]">Loading members...</p></div>
                    ) : members.length === 0 ? (
                        <div className="text-center py-16 bg-[#242526] rounded-xl border border-[#3A3B3C]">
                            <Users className="w-12 h-12 text-[#3A3B3C] mx-auto mb-3" />
                            <h3 className="text-lg font-medium text-[#E4E6EB] mb-1">{search ? 'No members found' : 'No members yet'}</h3>
                            <p className="text-sm text-[#B0B3B8] mb-4">{search ? 'Try a different search term' : 'Add your first club member to get started'}</p>
                            {!search && (
                                <button onClick={() => setShowAddModal(true)} className="px-6 py-2.5 bg-[#1877F2] text-white rounded-lg text-sm font-medium">
                                    Add First Member
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block bg-[#242526] rounded-xl border border-[#3A3B3C] overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[#3A3B3C]">
                                            <th className="text-left px-4 py-3 text-xs text-[#8A8D91] font-medium uppercase tracking-wider">Member</th>
                                            <th className="text-left px-4 py-3 text-xs text-[#8A8D91] font-medium uppercase tracking-wider">Number</th>
                                            <th className="text-left px-4 py-3 text-xs text-[#8A8D91] font-medium uppercase tracking-wider">Tier</th>
                                            <th className="text-left px-4 py-3 text-xs text-[#8A8D91] font-medium uppercase tracking-wider">Status</th>
                                            <th className="text-left px-4 py-3 text-xs text-[#8A8D91] font-medium uppercase tracking-wider">Visits</th>
                                            <th className="text-left px-4 py-3 text-xs text-[#8A8D91] font-medium uppercase tracking-wider">Last Visit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {members.map(m => (
                                            <tr key={m.id} onClick={() => setSelectedMember(m)}
                                                className="border-b border-[#3A3B3C] last:border-0 hover:bg-[#3A3B3C]/30 cursor-pointer transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 bg-[#3A3B3C] rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                            {m.photo_url ? <img src={m.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <User className="w-4 h-4 text-[#B0B3B8]" />}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-[#E4E6EB]">{m.first_name} {m.last_name}</div>
                                                            {m.phone && <div className="text-xs text-[#8A8D91]">{m.phone}</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm font-mono text-[#1877F2]">{m.member_number}</td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                                        style={{ backgroundColor: (TIER_COLORS[m.membership_tier] || '#B0B3B8') + '20', color: TIER_COLORS[m.membership_tier] }}>
                                                        {m.membership_tier}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                                        style={{ backgroundColor: (STATUS_COLORS[m.membership_status] || '#8A8D91') + '20', color: STATUS_COLORS[m.membership_status] }}>
                                                        {m.membership_status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-[#B0B3B8]">{m.total_visits || 0}</td>
                                                <td className="px-4 py-3 text-sm text-[#B0B3B8]">
                                                    {m.last_visit ? new Date(m.last_visit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Cards */}
                            <div className="md:hidden space-y-2">
                                {members.map(m => (
                                    <button key={m.id} onClick={() => setSelectedMember(m)}
                                        className="w-full bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 text-left hover:bg-[#3A3B3C]/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-[#3A3B3C] rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                {m.photo_url ? <img src={m.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" /> : <User className="w-6 h-6 text-[#B0B3B8]" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-[#E4E6EB]">{m.first_name} {m.last_name}</div>
                                                <div className="text-xs font-mono text-[#1877F2]">{m.member_number}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                                        style={{ backgroundColor: (TIER_COLORS[m.membership_tier] || '#B0B3B8') + '20', color: TIER_COLORS[m.membership_tier] }}>
                                                        {m.membership_tier}
                                                    </span>
                                                    <span className="text-xs text-[#8A8D91] flex items-center gap-1"><Clock className="w-3 h-3" />{m.total_visits || 0} visits</span>
                                                </div>
                                            </div>
                                            <ChevronDown className="w-4 h-4 text-[#8A8D91] -rotate-90" />
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Pagination */}
                            {total > 50 && (
                                <div className="flex items-center justify-center gap-3 mt-6">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                                        className="px-4 py-2 bg-[#3A3B3C] text-[#B0B3B8] rounded-lg text-sm disabled:opacity-50">Previous</button>
                                    <span className="text-sm text-[#B0B3B8]">Page {page} of {Math.ceil(total / 50)}</span>
                                    <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)}
                                        className="px-4 py-2 bg-[#3A3B3C] text-[#B0B3B8] rounded-lg text-sm disabled:opacity-50">Next</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Modals */}
            <AddMemberModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSubmit={handleMemberCreated} venueId={venueId} />
            <ScanMemberModal isOpen={showScanModal} onClose={() => setShowScanModal(false)} venueId={venueId} onMemberFound={(m) => { setShowScanModal(false); setSelectedMember(m); }} />
            {selectedMember && <MemberDetailPanel member={selectedMember} venueName={venueName} onClose={() => setSelectedMember(null)} onUpdate={handleMemberUpdated} />}
        </>
    );
}
