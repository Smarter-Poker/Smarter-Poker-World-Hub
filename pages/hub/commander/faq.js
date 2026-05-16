/**
 * Player FAQ Page
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6, Step 6.4
 *
 * Frequently asked questions for players using Club Commander
 */
import { useState } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import CommanderPageShell from '../../../src/components/commander/CommanderPageShell';
import {
  ChevronLeft,
  ChevronDown,
  HelpCircle,
  Users,
  Bell,
  Trophy,
  Home,
  CreditCard,
  Shield,
  Smartphone,
  Search,
} from 'lucide-react';

const FAQ_CATEGORIES = [
  {
    id: 'waitlist',
    title: 'Waitlist',
    icon: Users,
    faqs: [
      {
        question: 'How do I join a waitlist?',
        answer: `You can join a waitlist in several ways:

1. **Through the app**: Navigate to a venue page and tap "Join Waitlist" for your desired game
2. **Via QR code**: Scan the QR code at the poker room to join instantly
3. **Walk-up**: Ask the brush to add you manually

Your position is determined by when you sign up, so joining early gets you a better spot.`,
      },
      {
        question: 'Can I be on multiple waitlists at once?',
        answer: `Yes! You can join waitlists for multiple games at the same venue. For example, you can be on both the 1/3 NLH and 2/5 NLH waitlists simultaneously.

When you get seated in one game, you'll automatically be removed from other waitlists at that venue unless you choose to stay on them.`,
      },
      {
        question: 'How accurate are the wait time predictions?',
        answer: `Our AI-powered predictions are based on historical data including:
- Time of day and day of week
- Current table turnover rate
- Typical session lengths for that game

Predictions are typically accurate within 10-15 minutes. They update in real-time as conditions change.`,
      },
      {
        question: 'What happens if I miss my call?',
        answer: `When it's your turn, you'll receive a notification. You have 5 minutes to respond or check in with the floor.

If you miss the call:
- First miss: You may be moved to the bottom of the list or removed (depends on venue policy)
- Some venues give a second call if you respond within a few minutes

Tip: Make sure your phone notifications are enabled to avoid missing your call!`,
      },
      {
        question: 'Can I leave the casino while on the waitlist?',
        answer: `Absolutely! That's one of the best features. You can:
- Grab food at a nearby restaurant
- Play in the tournament room
- Run errands
- Wait at home if you live nearby

Just make sure your notifications are enabled and you can get back to the poker room within 5-10 minutes of being called.`,
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: Bell,
    faqs: [
      {
        question: 'What notifications will I receive?',
        answer: `You'll be notified for:
- **Seat available**: When it's your turn to be seated
- **Position updates**: When your waitlist position changes significantly
- **Tournament reminders**: 30 minutes and 5 minutes before start
- **Promotions**: High hand wins, jackpots (if you've opted in)

You can customize which notifications you receive in Settings.`,
      },
      {
        question: "Why didn't I receive my notification?",
        answer: `Common reasons:
1. **Phone settings**: Ensure app notifications are enabled in your phone's settings
2. **Do Not Disturb**: Check that DND isn't blocking notifications
3. **SMS issues**: Verify your phone number is correct
4. **Opt-out**: You may have previously disabled notifications

To fix: Go to Profile > Settings > Notifications and verify your preferences.`,
      },
      {
        question: 'How do I change my phone number?',
        answer: `To update your phone number:
1. Go to Profile > Edit Profile
2. Update your phone number
3. You'll receive a verification code via SMS
4. Enter the code to confirm

All future notifications will go to your new number.`,
      },
      {
        question: 'Can I receive notifications via text instead of push?',
        answer: `Yes! You can choose your notification method:
- **Push notifications**: Fastest, requires app to be installed
- **SMS (text)**: Works without the app, may have carrier delays
- **Both**: Get notifications through both channels

Configure your preference in Settings > Notifications.`,
      },
    ],
  },
  {
    id: 'tournaments',
    title: 'Tournaments',
    icon: Trophy,
    faqs: [
      {
        question: 'How do I register for a tournament?',
        answer: `To register:
1. Find the tournament in the app (Browse > Tournaments or at a venue page)
2. Tap "Register"
3. Confirm your registration
4. Pay the buy-in (at the cage or online if available)

You'll receive confirmation and reminders before the tournament starts.`,
      },
      {
        question: 'Can I unregister from a tournament?',
        answer: `Cancellation policies vary by venue:
- **Before registration closes**: Usually free cancellation
- **After registration closes**: May forfeit buy-in or incur a fee

Check the specific tournament details for the cancellation policy, or contact the poker room directly.`,
      },
      {
        question: 'How do I view the tournament clock?',
        answer: `Once a tournament starts, you can view the live clock at:
- In the app: Tournament Details > Live Clock
- In the room: Display screens showing current level

The clock shows:
- Current blinds and antes
- Time remaining in level
- Next level preview
- Players remaining
- Average stack`,
      },
      {
        question: 'How are payouts calculated?',
        answer: `Payouts are determined by:
1. **Prize pool**: Total buy-ins minus house fee
2. **Payout structure**: Percentage or fixed amounts per place
3. **Players remaining**: Who finishes in the money

Final results and your payout (if you cashed) will be shown in your tournament history.`,
      },
    ],
  },
  {
    id: 'home-games',
    title: 'Home Games',
    icon: Home,
    faqs: [
      {
        question: 'How do I find home games near me?',
        answer: `To discover home games:
1. Go to Home Games in the app
2. Allow location access or enter your city
3. Browse public games or use an invite code for private games
4. Filter by game type, stakes, and date

Note: Some games are friends-only or require an invite code for privacy.`,
      },
      {
        question: 'How do I join a private home game?',
        answer: `For private games, you need an invite code:
1. Get the code from the host
2. Go to Home Games > Join with Code
3. Enter the code
4. Submit your RSVP request
5. Wait for host approval

Once approved, you'll see the full address and game details.`,
      },
      {
        question: 'Is my address visible to everyone?',
        answer: `No! Your privacy is protected:
- **Before approval**: Players only see city and general area
- **After approval**: Approved players see the full address
- **Declined players**: Never see your address

You control who attends your games through the approval process.`,
      },
      {
        question: 'What if a player no-shows at my game?',
        answer: `To prevent no-shows:
1. **Escrow option**: Require a deposit that's forfeited if they don't show
2. **Reviews**: Leave honest feedback that affects their reputation score
3. **Blocking**: Block problematic players from future games

Players with low reliability scores are flagged for hosts.`,
      },
    ],
  },
  {
    id: 'rewards',
    title: 'Rewards & Comps',
    icon: CreditCard,
    faqs: [
      {
        question: 'How do I earn comp dollars?',
        answer: `Comp dollars are earned automatically:
- **Cash games**: Based on time played (rate set by venue)
- **Tournaments**: Based on buy-in amount
- **Promotions**: Bonus comps for high hands, jackpots, etc.

Your current balance is shown in the app under Rewards.`,
      },
      {
        question: 'How do I redeem my comps?',
        answer: `To redeem:
1. Go to Rewards > Redeem
2. Browse available options (food, merchandise, etc.)
3. Select what you want
4. Show the redemption code at the appropriate location

Redemption options vary by venue.`,
      },
      {
        question: 'Do comps expire?',
        answer: `Expiration policies vary:
- Some venues have no expiration
- Others expire comps after 6-12 months of inactivity
- Check the venue's comp policy in their settings page

Using your account regularly keeps your comps active.`,
      },
      {
        question: 'Can I transfer comps to another player?',
        answer: `Generally, comps are non-transferable and tied to your account. However, some venues may allow exceptions for special circumstances. Contact the poker room directly to inquire.`,
      },
    ],
  },
  {
    id: 'responsible-gaming',
    title: 'Responsible Gaming',
    icon: Shield,
    faqs: [
      {
        question: 'How do I set spending or time limits?',
        answer: `To set limits:
1. Go to Profile > Responsible Gaming
2. Set your desired limits:
   - Daily/weekly/monthly spending
   - Session time limits
   - Loss limits
3. You'll receive alerts when approaching limits

These limits help you stay in control of your play.`,
      },
      {
        question: 'How does self-exclusion work?',
        answer: `Self-exclusion prevents you from playing:
1. Go to Profile > Responsible Gaming > Self-Exclude
2. Choose duration (temporary or permanent)
3. Choose scope (single venue or all venues)
4. Confirm your decision

Once active, you cannot:
- Join waitlists
- Register for tournaments
- Check in at participating venues

This cannot be undone early - take it seriously.`,
      },
      {
        question: 'Where can I get help for problem gambling?',
        answer: `Resources are available:
- **National Council on Problem Gambling**: 1-800-522-4700
- **Gamblers Anonymous**: www.gamblersanonymous.org
- **Local resources**: Check your state's gaming commission website

You can access these resources anytime from the app under Profile > Responsible Gaming > Get Help.`,
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & App',
    icon: Smartphone,
    faqs: [
      {
        question: 'How do I create an account?',
        answer: `To sign up:
1. Download the Smarter.Poker app or visit smarter.poker
2. Click "Sign Up"
3. Enter your email and create a password
4. Verify your email
5. Complete your profile with name and phone number

Your account works across all Club Commander venues.`,
      },
      {
        question: "I forgot my password. How do I reset it?",
        answer: `To reset your password:
1. On the login page, tap "Forgot Password"
2. Enter your email address
3. Check your email for a reset link
4. Click the link and create a new password

If you don't receive the email, check your spam folder.`,
      },
      {
        question: 'How do I update my profile picture?',
        answer: `To change your photo:
1. Go to Profile > Edit Profile
2. Tap on your current photo
3. Choose to take a new photo or select from gallery
4. Crop and confirm

Your photo appears to poker room staff and other players (if you choose to display it).`,
      },
      {
        question: 'How do I delete my account?',
        answer: `To delete your account:
1. Go to Profile > Settings > Account
2. Scroll to "Delete Account"
3. Confirm your decision

Warning: This permanently deletes:
- Your play history
- Comp balances
- All personal data

This action cannot be undone.`,
      },
    ],
  },
];

export default function PlayerFAQPage() {
  const [activeCategory, setActiveCategory] = useState('waitlist');
  const [expandedFAQ, setExpandedFAQ] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const toggleFAQ = (index) => {
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  // Filter FAQs based on search
  const filteredCategories = searchTerm
    ? FAQ_CATEGORIES.map((cat) => ({
        ...cat,
        faqs: cat.faqs.filter(
          (faq) =>
            faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
        ),
      })).filter((cat) => cat.faqs.length > 0)
    : FAQ_CATEGORIES;

  const currentCategory = searchTerm
    ? filteredCategories[0]
    : FAQ_CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <>
      <SEOHead
                title="Commander FAQ"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />

      <div className="cmd-page min-h-screen">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-20">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/hub/commander" className="text-[#64748B] hover:text-white">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                <HelpCircle className="w-6 h-6 text-[#22D3EE]" />
                <h1 className="text-xl font-bold text-white">FAQ</h1>
              </div>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <input
                type="text"
                placeholder="Search Questions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cmd-input w-full pl-10 h-9 text-sm"
              />
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Category Tabs */}
          {!searchTerm && (
            <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
              {FAQ_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <CommanderPageShell>
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setExpandedFAQ(null);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                      activeCategory === cat.id
                        ? 'bg-[#22D3EE] text-[#0F172A]'
                        : 'bg-[#1E293B] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{cat.title}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search Results Header */}
          {searchTerm && (
            <div className="mb-6">
              <p className="text-[#64748B]">
                {filteredCategories.reduce((sum, cat) => sum + cat.faqs.length, 0)} results for "
                {searchTerm}"
              </p>
            </div>
          )}

          {/* FAQ List */}
          {currentCategory && (
            <div className="space-y-4">
              {(searchTerm ? filteredCategories.flatMap((c) => c.faqs) : currentCategory.faqs).map(
                (faq, index) => (
                  <div key={index} className="cmd-panel overflow-hidden">
                    <button
                      onClick={() => toggleFAQ(index)}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <span className="font-medium text-white pr-4">{faq.question}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-[#64748B] flex-shrink-0 transition-transform ${
                          expandedFAQ === index ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {expandedFAQ === index && (
                      <div className="px-4 pb-4">
                        <div className="border-t border-[#374151] pt-4">
                          <div className="text-[#94A3B8] whitespace-pre-line text-sm leading-relaxed">
                            {faq.answer}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {/* No Results */}
          {searchTerm && filteredCategories.length === 0 && (
            <div className="text-center py-12">
              <HelpCircle className="w-12 h-12 text-[#4A5E78] mx-auto mb-4" />
              <p className="text-[#64748B]">No questions found matching "{searchTerm}"</p>
              <button
                onClick={() => setSearchTerm('')}
                className="text-[#22D3EE] hover:underline mt-2"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Contact Support */}
          <div className="mt-8 cmd-panel p-6 text-center">
            <h3 className="font-semibold text-white mb-2">Still Have Questions?</h3>
            <p className="text-[#64748B] mb-4">
              Contact the poker room staff or reach out to our support team.
            </p>
            <a
              href="mailto:support@smarter.poker"
              className="cmd-btn cmd-btn-primary inline-flex items-center gap-2"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </>
                  </CommanderPageShell>
  );
}
