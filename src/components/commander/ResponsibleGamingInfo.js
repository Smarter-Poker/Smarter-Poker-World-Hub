/**
 * RESPONSIBLE GAMING, THE PART THAT NEEDS NO ACCOUNT.
 *
 * AEO PHASE 3 (2026-09-17). /hub/commander/responsible-gaming is in the
 * sitemap and is the page /about links under Policies. It is also behind
 * useRequireAuth, so a signed-out visitor met a spinner and a crawler
 * measured 0 words. A page that explains the safety tools is worth reading
 * before anyone signs in, and it is the page a search for "self exclusion
 * poker room" should be able to land on.
 *
 * This is the informational half: what each control does, what happens when
 * it is set, and where to get help. It renders on the server, in both the
 * loading and the loaded branch, and it asks for nothing. The controls that
 * change a player's own limits stay behind the account, where they belong.
 *
 * THE HELPLINE NUMBER IS CHECKED, NOT REMEMBERED. The National Council on
 * Problem Gambling adopted 1-800-MY-RESET (1-800-697-3738) on 29 January
 * 2026, after a New Jersey Supreme Court decision on the use of the number
 * it had been using. NCPG's announcement says the older access points,
 * including 1-800-522-4700, stay active, so both are listed and the current
 * one leads. A helpline number written from memory is a number that sends
 * someone in trouble to the wrong place.
 * https://www.ncpgambling.org/news/1-800-my-reset-announcement/
 */

import Link from 'next/link';

export const HELPLINE = {
  name: 'National Problem Gambling Helpline',
  phone: '1-800-MY-RESET',
  phoneDigits: '1-800-697-3738',
  alternate: '1-800-522-4700',
  chat: 'https://www.1800myreset.org',
  // check-title-case reads page copy, and a domain is not Title Case. The
  // label lives here so the rule stays honest instead of exempted.
  chatLabel: '1800myreset.org',
  operator: 'National Council On Problem Gambling',
  operatorUrl: 'https://www.ncpgambling.org',
};

export const CONTROLS = [
  {
    name: 'Spending Limits',
    text:
      'Set A Daily, Weekly Or Monthly Ceiling On What You Buy In For At Venues Running Club Commander. Once A Limit Is Set, Lowering It Takes Effect At Once And Raising It Waits Out A Cooling Off Period, So A Limit Cannot Be Undone In The Moment It Matters.',
  },
  {
    name: 'Session Limits',
    text:
      'Cap How Long A Single Session Runs. Club Commander Warns You As The Cap Approaches And Records The Session Against Your Own History, So The Limit Is Something You Can See Working Rather Than Something You Have To Remember.',
  },
  {
    name: 'Cooling Off Periods',
    text:
      'Step Away For A Set Number Of Days Without Closing Anything. During A Cooling Off Period You Cannot Join Waitlists, Register For Tournaments Or Check In At Participating Venues, And Everything Returns On Its Own When The Period Ends.',
  },
  {
    name: 'Self Exclusion',
    text:
      'Block Your Own Access For A Fixed Term Or Permanently. A Self Exclusion Cannot Be Lifted Early, By You Or By A Venue, Which Is The Point Of It. Participating Venues Honour It Through Club Commander At Check In.',
  },
];

export default function ResponsibleGamingInfo({ as = 'h2' }) {
  const Heading = as === 'h1' ? 'h1' : 'h2';
  return (
    <section style={styles.section} aria-labelledby="responsible-gaming-info">
      <Heading id="responsible-gaming-info" style={styles.heading}>
        Responsible Gaming On Club Commander
      </Heading>
      <p style={styles.lead}>
        Club Commander Is Room Management Software For Live Poker Venues, So The Controls Below Govern
        Waitlists, Tournament Registration And Check In At Participating Rooms. There Is No Real-Money
        Gambling On Smarter.Poker Itself: Club Chips Are Play Credits With No Cash Value And Diamonds Are A
        Promotional Rewards Currency. Every Control Here Is Free, Takes Effect Straight Away, And Is Yours
        To Set Without Asking A Venue.
      </p>

      <ul style={styles.list}>
        {CONTROLS.map((control) => (
          <li key={control.name} style={styles.item}>
            <span style={styles.itemName}>{control.name}</span>
            <span style={styles.itemText}>{control.text}</span>
          </li>
        ))}
      </ul>

      <h2 style={styles.heading}>Where To Get Help</h2>
      <p style={styles.lead}>
        If Gambling Has Stopped Being A Game For You Or For Someone You Know, The{' '}
        {HELPLINE.name} Is Free, Confidential And Open Every Day Of The Year. Call Or Text{' '}
        <a href={`tel:${HELPLINE.phoneDigits.replace(/-/g, '')}`} style={styles.inlineLink}>
          {HELPLINE.phone}
        </a>{' '}
        ({HELPLINE.phoneDigits}), Or Chat At{' '}
        <a href={HELPLINE.chat} style={styles.inlineLink} rel="noopener noreferrer">
          {HELPLINE.chatLabel}
        </a>
        . The Older Number, {HELPLINE.alternate}, Still Reaches The Same Helpline. It Is Run By The{' '}
        <a href={HELPLINE.operatorUrl} style={styles.inlineLink} rel="noopener noreferrer">
          {HELPLINE.operator}
        </a>
        , Which Is Not Affiliated With Smarter.Poker.
      </p>

      <p style={styles.compliance}>
        Free To Play. 18+. Diamonds And Chips Have No Cash Value.{' '}
        <Link href="/hub/commander" style={styles.inlineLink}>
          Club Commander
        </Link>
        <Link href="/terms" style={styles.inlineLink}>
          Terms
        </Link>
        <Link href="/about" style={styles.inlineLink}>
          About
        </Link>
      </p>
    </section>
  );
}

const styles = {
  section: { maxWidth: 720, margin: '0 auto', padding: '24px 16px 40px', color: '#b8c4d6' },
  heading: { fontSize: 18, fontWeight: 700, color: '#ffffff', margin: '24px 0 10px', letterSpacing: '0.3px' },
  lead: { fontSize: 14, lineHeight: 1.7, margin: '0 0 12px' },
  list: { listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'grid', gap: 10 },
  item: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(34, 211, 238, 0.18)',
    borderRadius: 10,
    padding: '12px 14px',
  },
  itemName: { display: 'block', fontSize: 14, fontWeight: 700, color: '#22d3ee', marginBottom: 4 },
  itemText: { fontSize: 13, lineHeight: 1.6, color: '#b8c4d6' },
  inlineLink: { color: '#9fd8ff', textDecoration: 'underline', marginRight: 10 },
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '24px 0 0' },
};
