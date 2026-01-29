/**
 * Create Squad Page
 * Create a new group waitlist entry
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ChevronLeft,
  Users,
  MapPin,
  Search,
  Plus,
  X,
  Check,
  Loader2
} from 'lucide-react';

const GAME_TYPES = [
  { value: 'nlhe', label: 'No Limit Hold\'em' },
  { value: 'plo', label: 'Pot Limit Omaha' },
  { value: 'mixed', label: 'Mixed Games' },
  { value: 'other', label: 'Other' }
];

export default function CreateSquadPage() {
  const router = useRouter();
  const { venue_id } = router.query;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState([]);
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    venue_id: venue_id || '',
    game_type: 'nlhe',
    stakes: '',
    prefer_same_table: true,
    accept_split: false,
    members: []
  });

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/captain/squads/create');
      return;
    }
    fetchVenues();
    fetchFriends();
  }, [router]);

  async function fetchVenues() {
    try {
      const res = await fetch('/api/captain/venues?captain_enabled=true');
      const data = await res.json();
      if (data.success) {
        setVenues(data.data?.venues || []);
      }
    } catch (err) {
      console.error('Failed to fetch venues:', err);
      setVenues([]);
    }
  }

  async function fetchFriends() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setFriends(data.data?.friends || []);
      }
    } catch (err) {
      console.error('Failed to fetch friends:', err);
      setFriends([]);
    }
  }

  function handleAddMember(friend) {
    if (!formData.members.find(m => m.id === friend.id)) {
      setFormData(prev => ({
        ...prev,
        members: [...prev.members, friend]
      }));
    }
  }

  function handleRemoveMember(friendId) {
    setFormData(prev => ({
      ...prev,
      members: prev.members.filter(m => m.id !== friendId)
    }));
  }

  async function handleSubmit() {
    if (!formData.venue_id || !formData.stakes || formData.members.length === 0) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/squads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          member_ids: formData.members.map(m => m.id)
        })
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/hub/captain/squads/${data.data?.squad?.id || ''}`);
      } else {
        setErrorMessage(data.error?.message || 'Failed to create squad');
        setTimeout(() => setErrorMessage(null), 4000);
      }
    } catch (err) {
      console.error('Create failed:', err);
      setErrorMessage('Failed to create squad. Please try again.');
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setLoading(false);
    }
  }

  const selectedVenue = venues.find(v => v.id === formData.venue_id);
  const filteredFriends = friends.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Head>
        <title>Create Squad | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cap-page">
        {/* Error Banner */}
        {errorMessage && (
          <div className="fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium bg-[#EF4444]">
            {errorMessage}
          </div>
        )}

        {/* Header */}
        <header className="cap-header-bar sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <h1 className="text-xl font-bold text-white">Create Squad</h1>
            </div>
          </div>
        </header>

        {/* Progress */}
        <div className="bg-[#0F1C32] border-b border-[#4A5E78]">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex gap-2">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={`flex-1 h-1 rounded-full ${
                    s <= step ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'
                  }`}
                />
              ))}
            </div>
            <p className="text-sm text-[#64748B] mt-2">
              Step {step} of 3: {step === 1 ? 'Choose Venue' : step === 2 ? 'Game Details' : 'Invite Members'}
            </p>
          </div>
        </div>

        <main className="max-w-lg mx-auto px-4 py-6">
          {/* Step 1: Choose Venue */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-white">Where do you want to play?</h2>
              <div className="space-y-2">
                {venues.map(venue => (
                  <button
                    key={venue.id}
                    onClick={() => setFormData(prev => ({ ...prev, venue_id: venue.id }))}
                    className={`w-full p-4 rounded-xl border text-left transition-colors ${
                      formData.venue_id === venue.id
                        ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                        : 'border-[#4A5E78] bg-[#132240] hover:border-[#22D3EE]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{venue.name}</p>
                        <p className="text-sm text-[#64748B] flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {venue.city}
                        </p>
                      </div>
                      {formData.venue_id === venue.id && (
                        <Check className="w-5 h-5 text-[#22D3EE]" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={!formData.venue_id}
                className="cap-btn cap-btn-primary w-full h-14 text-lg"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Game Details */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="cap-panel p-4">
                <p className="text-sm text-[#64748B]">Playing at</p>
                <p className="font-medium text-white">{selectedVenue?.name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Squad Name (optional)
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Friday Night Crew"
                  className="w-full h-12 px-4 cap-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Game Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {GAME_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({ ...prev, game_type: type.value }))}
                      className={`p-3 rounded-xl border text-sm font-medium transition-colors ${
                        formData.game_type === type.value
                          ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                          : 'border-[#4A5E78] text-[#64748B] hover:border-[#22D3EE]'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Stakes
                </label>
                <input
                  type="text"
                  value={formData.stakes}
                  onChange={(e) => setFormData(prev => ({ ...prev, stakes: e.target.value }))}
                  placeholder="e.g., $1/$3, $2/$5"
                  className="w-full h-12 px-4 cap-input"
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-4 cap-panel">
                  <input
                    type="checkbox"
                    checked={formData.prefer_same_table}
                    onChange={(e) => setFormData(prev => ({ ...prev, prefer_same_table: e.target.checked }))}
                    className="w-5 h-5 rounded border-[#4A5E78] text-[#22D3EE] focus:ring-[#22D3EE]"
                  />
                  <div>
                    <p className="font-medium text-white">Prefer same table</p>
                    <p className="text-sm text-[#64748B]">Wait longer to sit together</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 cap-panel">
                  <input
                    type="checkbox"
                    checked={formData.accept_split}
                    onChange={(e) => setFormData(prev => ({ ...prev, accept_split: e.target.checked }))}
                    className="w-5 h-5 rounded border-[#4A5E78] text-[#22D3EE] focus:ring-[#22D3EE]"
                  />
                  <div>
                    <p className="font-medium text-white">Accept split if needed</p>
                    <p className="text-sm text-[#64748B]">Get seated faster at different tables</p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="cap-btn cap-btn-secondary flex-1 h-14 text-lg"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!formData.stakes}
                  className="cap-btn cap-btn-primary flex-1 h-14 text-lg"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Invite Members */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="cap-panel p-4">
                <p className="text-sm text-[#64748B]">{selectedVenue?.name}</p>
                <p className="font-medium text-white">{formData.stakes} {formData.game_type?.toUpperCase()}</p>
              </div>

              {/* Selected Members */}
              {formData.members.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Squad Members ({formData.members.length + 1})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <div className="px-3 py-2 bg-[#22D3EE]/10 text-[#22D3EE] rounded-lg text-sm font-medium">
                      You (Leader)
                    </div>
                    {formData.members.map(member => (
                      <div
                        key={member.id}
                        className="flex items-center gap-2 px-3 py-2 bg-[#0D192E] rounded-lg text-sm"
                      >
                        <span className="text-white">{member.name}</span>
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-[#64748B] hover:text-[#EF4444]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Friends */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Invite Friends
                </label>
                <div className="relative mb-3">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5E78]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search friends..."
                    className="w-full h-12 pl-12 pr-4 cap-input"
                  />
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {filteredFriends.map(friend => {
                    const isSelected = formData.members.find(m => m.id === friend.id);
                    return (
                      <button
                        key={friend.id}
                        onClick={() => isSelected ? handleRemoveMember(friend.id) : handleAddMember(friend)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                          isSelected
                            ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                            : 'border-[#4A5E78] hover:border-[#22D3EE]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#0D192E] rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-[#64748B]" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-white">{friend.name}</p>
                            <p className="text-sm text-[#64748B]">@{friend.username}</p>
                          </div>
                        </div>
                        {isSelected ? (
                          <Check className="w-5 h-5 text-[#22D3EE]" />
                        ) : (
                          <Plus className="w-5 h-5 text-[#64748B]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="cap-btn cap-btn-secondary flex-1 h-14 text-lg"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || formData.members.length === 0}
                  className="cap-btn cap-btn-primary flex-1 h-14 text-lg flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Users className="w-5 h-5" />
                      Create Squad
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
