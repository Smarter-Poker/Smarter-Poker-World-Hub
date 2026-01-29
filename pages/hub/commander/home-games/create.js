/**
 * Create Home Game Group Page
 * Allows players to create and host their own poker home games
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  Home,
  MapPin,
  Lock,
  Globe,
  DollarSign,
  Calendar,
  Loader2,
  Check,
  ChevronRight
} from 'lucide-react';
import CreateGameForm from '../../../../src/components/commander/home-games/CreateGameForm';

const GAME_TYPES = [
  { value: 'nlhe', label: "No Limit Hold'em" },
  { value: 'plo', label: 'Pot Limit Omaha' },
  { value: 'mixed', label: 'Mixed Games' },
  { value: 'tournament', label: 'Tournament' }
];

const STAKES_OPTIONS = [
  '$0.25/$0.50',
  '$0.50/$1',
  '$1/$2',
  '$1/$3',
  '$2/$5',
  '$5/$10',
  'Custom'
];

export default function CreateHomeGamePage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [createdGroup, setCreatedGroup] = useState(null);
  const [eventSubmitting, setEventSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    game_type: 'nlhe',
    stakes: '$1/$2',
    custom_stakes: '',
    min_buyin: 100,
    max_buyin: 500,
    max_players: 9,
    visibility: 'private',
    requires_approval: true,
    city: '',
    state: '',
    recurring: false,
    day_of_week: 'saturday',
    start_time: '19:00'
  });

  function updateField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      setError('Please enter a group name');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        router.push('/auth/login?redirect=/hub/commander/home-games/create');
        return;
      }

      const payload = {
        ...formData,
        stakes: formData.stakes === 'Custom' ? formData.custom_stakes : formData.stakes
      };

      const res = await fetch('/api/commander/home-games/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success || data.group) {
        setCreatedGroup(data.group);
        setStep(4);
      } else {
        setError(data.error?.message || 'Failed to create group');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Host a Home Game | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[#64748B]" />
            </button>
            <div>
              <h1 className="font-bold text-white">Host a Home Game</h1>
              <p className="text-sm text-[#64748B]">{step <= 3 ? `Step ${step} of 3` : 'Schedule First Game'}</p>
            </div>
          </div>
        </header>

        {/* Progress Bar */}
        <div className="bg-[#0F1C32] border-b border-[#4A5E78]">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`flex-1 h-1 ${s <= step ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Form Content */}
        <main className="max-w-2xl mx-auto px-4 py-6">
          {error && (
            <div className="mb-4 p-3 bg-[#EF4444]/10 rounded-lg">
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Home className="w-5 h-5 text-[#22D3EE]" />
                  Group Details
                </h2>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Group Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g., Friday Night Poker Club"
                    className="cmd-input w-full h-12 px-4"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Tell players about your game..."
                    rows={3}
                    className="cmd-input w-full px-4 py-3 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Visibility
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => updateField('visibility', 'private')}
                      className={`p-4 rounded-lg border text-left transition-colors ${
                        formData.visibility === 'private'
                          ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                          : 'border-[#4A5E78] hover:bg-[#132240]'
                      }`}
                    >
                      <Lock className={`w-5 h-5 mb-2 ${formData.visibility === 'private' ? 'text-[#22D3EE]' : 'text-[#64748B]'}`} />
                      <p className="font-medium text-white">Private</p>
                      <p className="text-sm text-[#64748B]">Invite only</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('visibility', 'public')}
                      className={`p-4 rounded-lg border text-left transition-colors ${
                        formData.visibility === 'public'
                          ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                          : 'border-[#4A5E78] hover:bg-[#132240]'
                      }`}
                    >
                      <Globe className={`w-5 h-5 mb-2 ${formData.visibility === 'public' ? 'text-[#22D3EE]' : 'text-[#64748B]'}`} />
                      <p className="font-medium text-white">Public</p>
                      <p className="text-sm text-[#64748B]">Anyone can find</p>
                    </button>
                  </div>
                </div>

                {formData.visibility === 'public' && (
                  <div className="flex items-center justify-between p-4 bg-[#0D192E] rounded-lg">
                    <div>
                      <p className="font-medium text-white">Require Approval</p>
                      <p className="text-sm text-[#64748B]">Review join requests before accepting</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField('requires_approval', !formData.requires_approval)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        formData.requires_approval ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        formData.requires_approval ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!formData.name.trim()}
                className="cmd-btn cmd-btn-primary w-full h-12 transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Game Setup */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#10B981]" />
                  Game Setup
                </h2>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Game Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {GAME_TYPES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateField('game_type', value)}
                        className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                          formData.game_type === value
                            ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                            : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Stakes
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {STAKES_OPTIONS.map((stake) => (
                      <button
                        key={stake}
                        type="button"
                        onClick={() => updateField('stakes', stake)}
                        className={`p-2 rounded-lg border text-sm font-medium transition-colors ${
                          formData.stakes === stake
                            ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                            : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                        }`}
                      >
                        {stake}
                      </button>
                    ))}
                  </div>
                  {formData.stakes === 'Custom' && (
                    <input
                      type="text"
                      value={formData.custom_stakes}
                      onChange={(e) => updateField('custom_stakes', e.target.value)}
                      placeholder="e.g., $2/$5/$10"
                      className="cmd-input mt-2 w-full h-10 px-4"
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Min Buy-in
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                      <input
                        type="number"
                        value={formData.min_buyin}
                        onChange={(e) => updateField('min_buyin', parseInt(e.target.value) || 0)}
                        className="cmd-input w-full h-10 pl-8 pr-4"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Max Buy-in
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                      <input
                        type="number"
                        value={formData.max_buyin}
                        onChange={(e) => updateField('max_buyin', parseInt(e.target.value) || 0)}
                        className="cmd-input w-full h-10 pl-8 pr-4"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Max Players
                  </label>
                  <div className="flex gap-2">
                    {[6, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => updateField('max_players', num)}
                        className={`flex-1 h-10 rounded-lg border font-medium transition-colors ${
                          formData.max_players === num
                            ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                            : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="cmd-btn cmd-btn-secondary flex-1 h-12 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="cmd-btn cmd-btn-primary flex-1 h-12 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Location & Schedule */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#EF4444]" />
                  Location
                </h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      placeholder="Las Vegas"
                      className="cmd-input w-full h-10 px-4"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      State
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => updateField('state', e.target.value)}
                      placeholder="NV"
                      maxLength={2}
                      className="cmd-input w-full h-10 px-4 uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#8B5CF6]" />
                  Schedule
                </h2>

                <div className="flex items-center justify-between p-4 bg-[#0D192E] rounded-lg">
                  <div>
                    <p className="font-medium text-white">Recurring Game</p>
                    <p className="text-sm text-[#64748B]">Set a regular schedule</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField('recurring', !formData.recurring)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      formData.recurring ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      formData.recurring ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {formData.recurring && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Day of Week
                      </label>
                      <select
                        value={formData.day_of_week}
                        onChange={(e) => updateField('day_of_week', e.target.value)}
                        className="cmd-input w-full h-10 px-4"
                      >
                        <option value="monday">Monday</option>
                        <option value="tuesday">Tuesday</option>
                        <option value="wednesday">Wednesday</option>
                        <option value="thursday">Thursday</option>
                        <option value="friday">Friday</option>
                        <option value="saturday">Saturday</option>
                        <option value="sunday">Sunday</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => updateField('start_time', e.target.value)}
                        className="cmd-input w-full h-10 px-4"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="cmd-btn cmd-btn-secondary flex-1 h-12 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="cmd-btn cmd-btn-primary flex-1 h-12 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Create Group
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          {/* Step 4: Group Created - Schedule First Event */}
          {step === 4 && createdGroup && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-[#10B981]/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-[#10B981]" />
                </div>
                <h2 className="text-xl font-bold text-white">Group Created</h2>
                <p className="text-[#64748B] mt-1">{createdGroup.name} is ready. Schedule your first game below or skip for now.</p>
              </div>

              <CreateGameForm
                groupId={createdGroup.id}
                isLoading={eventSubmitting}
                onSubmit={async (eventData) => {
                  setEventSubmitting(true);
                  try {
                    const token = localStorage.getItem('smarter-poker-auth');
                    const res = await fetch('/api/commander/home-games/events', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify(eventData)
                    });
                    const data = await res.json();
                    if (data.success || data.event) {
                      router.push(`/hub/commander/home-games/${createdGroup.id}`);
                    }
                  } catch (err) {
                    console.error('Schedule event error:', err);
                  } finally {
                    setEventSubmitting(false);
                  }
                }}
                onCancel={() => router.push(`/hub/commander/home-games/${createdGroup.id}`)}
              />

              <button
                onClick={() => router.push(`/hub/commander/home-games/${createdGroup.id}`)}
                className="w-full text-center text-sm text-[#64748B] hover:text-white transition-colors py-2 flex items-center justify-center gap-2"
              >
                Skip - Go to Group
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
