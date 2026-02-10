/**
 * Member Detail Panel — Full member profile view
 * NO EMOJIS (per /no-emoji-commander)
 */
import { useState } from 'react';
import { X, User, Mail, Phone, MapPin, Calendar, CreditCard, Clock, Star, FileText, Edit2, Shield, Printer } from 'lucide-react';
import MemberCard from './MemberCard';

const TIER_COLORS = { standard: '#B0B3B8', gold: '#F59E0B', platinum: '#94A3B8', vip: '#A855F7' };
const STATUS_COLORS = { active: '#31A24C', suspended: '#EF4444', expired: '#8A8D91', banned: '#DC2626' };

export default function MemberDetailPanel({ member, venueName, onClose, onUpdate }) {
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [showCard, setShowCard] = useState(false);

    if (!member) return null;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(member.qr_code)}&bgcolor=ffffff&color=000000`;

    const startEdit = () => {
        setEditForm({
            membership_tier: member.membership_tier,
            membership_status: member.membership_status,
            email: member.email || '',
            phone: member.phone || '',
            notes: member.notes || '',
        });
        setEditing(true);
    };

    const saveEdit = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/commander/members/${member.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            const data = await res.json();
            if (data.success && onUpdate) onUpdate(data.data.member);
            setEditing(false);
        } catch (err) {
            console.error('Update error:', err);
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative bg-[#242526] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-[#3A3B3C] shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 bg-[#242526] border-b border-[#3A3B3C] p-4 flex items-center justify-between z-10">
                    <h2 className="text-lg font-bold text-[#E4E6EB]">Member Details</h2>
                    <div className="flex items-center gap-2">
                        {!editing && <button onClick={startEdit} className="p-2 hover:bg-[#3A3B3C] rounded-lg"><Edit2 className="w-4 h-4 text-[#B0B3B8]" /></button>}
                        <button onClick={onClose} className="p-2 hover:bg-[#3A3B3C] rounded-lg"><X className="w-5 h-5 text-[#B0B3B8]" /></button>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    {/* Profile Header */}
                    <div className="text-center">
                        <div className="w-20 h-20 bg-[#3A3B3C] rounded-full flex items-center justify-center mx-auto mb-3 overflow-hidden">
                            {member.photo_url ? <img src={member.photo_url} alt="" className="w-20 h-20 rounded-full object-cover" /> : <User className="w-10 h-10 text-[#B0B3B8]" />}
                        </div>
                        <h3 className="text-xl font-bold text-[#E4E6EB]">{member.first_name} {member.last_name}</h3>
                        <p className="text-sm font-mono text-[#1877F2]">{member.member_number}</p>
                        <div className="flex items-center justify-center gap-2 mt-2">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (TIER_COLORS[member.membership_tier] || '#B0B3B8') + '20', color: TIER_COLORS[member.membership_tier] }}>{member.membership_tier?.toUpperCase()}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (STATUS_COLORS[member.membership_status] || '#8A8D91') + '20', color: STATUS_COLORS[member.membership_status] }}>{member.membership_status?.toUpperCase()}</span>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-[#18191A] rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-[#E4E6EB]">{member.total_visits || 0}</div>
                            <div className="text-xs text-[#8A8D91]">Visits</div>
                        </div>
                        <div className="bg-[#18191A] rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-[#E4E6EB]">{Number(member.total_hours_played || 0).toFixed(0)}h</div>
                            <div className="text-xs text-[#8A8D91]">Hours</div>
                        </div>
                        <div className="bg-[#18191A] rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-[#E4E6EB]">{member.last_visit ? new Date(member.last_visit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}</div>
                            <div className="text-xs text-[#8A8D91]">Last Visit</div>
                        </div>
                    </div>

                    {/* Edit Mode */}
                    {editing ? (
                        <div className="space-y-3 bg-[#18191A] rounded-xl p-4">
                            <div>
                                <label className="block text-xs text-[#B0B3B8] mb-1">Tier</label>
                                <select value={editForm.membership_tier} onChange={e => setEditForm(p => ({ ...p, membership_tier: e.target.value }))} className="w-full px-3 py-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-lg text-[#E4E6EB] text-sm">
                                    <option value="standard">Standard</option><option value="gold">Gold</option><option value="platinum">Platinum</option><option value="vip">VIP</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-[#B0B3B8] mb-1">Status</label>
                                <select value={editForm.membership_status} onChange={e => setEditForm(p => ({ ...p, membership_status: e.target.value }))} className="w-full px-3 py-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-lg text-[#E4E6EB] text-sm">
                                    <option value="active">Active</option><option value="suspended">Suspended</option><option value="expired">Expired</option><option value="banned">Banned</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-[#B0B3B8] mb-1">Email</label>
                                <input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-lg text-[#E4E6EB] text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs text-[#B0B3B8] mb-1">Phone</label>
                                <input type="tel" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-lg text-[#E4E6EB] text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs text-[#B0B3B8] mb-1">Notes</label>
                                <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-lg text-[#E4E6EB] text-sm resize-none" rows={2} />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setEditing(false)} className="flex-1 py-2 bg-[#3A3B3C] text-[#B0B3B8] rounded-lg text-sm">Cancel</button>
                                <button onClick={saveEdit} disabled={saving} className="flex-1 py-2 bg-[#1877F2] text-white rounded-lg text-sm font-medium">{saving ? 'Saving...' : 'Save'}</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Info Grid */}
                            <div className="bg-[#18191A] rounded-xl p-4 space-y-2 text-sm">
                                {member.email && <div className="flex items-center gap-2 text-[#B0B3B8]"><Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="text-[#E4E6EB]">{member.email}</span></div>}
                                {member.phone && <div className="flex items-center gap-2 text-[#B0B3B8]"><Phone className="w-3.5 h-3.5 flex-shrink-0" /><span className="text-[#E4E6EB]">{member.phone}</span></div>}
                                {member.date_of_birth && <div className="flex items-center gap-2 text-[#B0B3B8]"><Calendar className="w-3.5 h-3.5 flex-shrink-0" /><span className="text-[#E4E6EB]">{new Date(member.date_of_birth).toLocaleDateString()}</span></div>}
                                {member.id_number && <div className="flex items-center gap-2 text-[#B0B3B8]"><CreditCard className="w-3.5 h-3.5 flex-shrink-0" /><span className="text-[#E4E6EB]">{member.id_type?.replace('_', ' ')} - {member.id_number}</span></div>}
                                {member.address?.city && <div className="flex items-center gap-2 text-[#B0B3B8]"><MapPin className="w-3.5 h-3.5 flex-shrink-0" /><span className="text-[#E4E6EB]">{member.address.city}, {member.address.state}</span></div>}
                                {member.notes && <div className="flex items-start gap-2 text-[#B0B3B8]"><FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span className="text-[#E4E6EB]">{member.notes}</span></div>}
                                <div className="flex items-center gap-2 text-[#B0B3B8]"><Clock className="w-3.5 h-3.5 flex-shrink-0" /><span className="text-[#E4E6EB]">Joined {new Date(member.created_at).toLocaleDateString()}</span></div>
                            </div>

                            {/* Card Preview */}
                            {showCard ? (
                                <div className="flex flex-col items-center">
                                    <MemberCard member={member} venueName={venueName} qrCodeUrl={qrCodeUrl} />
                                    <button onClick={() => setShowCard(false)} className="mt-2 text-sm text-[#B0B3B8]">Hide Card</button>
                                </div>
                            ) : (
                                <button onClick={() => setShowCard(true)} className="w-full py-2.5 bg-[#3A3B3C] text-[#E4E6EB] rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                                    <Printer className="w-4 h-4" /> Show / Print Card
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
