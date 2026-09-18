/**
 * The meta description for a public home game page.
 *
 * WHY THIS EXISTS (2026-09-18). The page used the operator's own
 * description verbatim whenever they wrote one, and only fell back to a
 * generated sentence when they wrote nothing:
 *
 *   (group.description || page.description || `Join ${name}...`).slice(0, 160)
 *
 * /hub/home-games/saturday-night-poker-club was therefore published to
 * Google with a sixteen-character description, "Weekly home game", measured
 * live on 2026-09-18. A short operator note is not a bad description, it is
 * an incomplete one: the fix keeps their words and completes them with the
 * facts the record already has, instead of discarding either.
 *
 * MIN is the length the live SEO contract requires of an indexable page;
 * MAX is where Google truncates a snippet.
 */
export const DESCRIPTION_MIN = 60;
export const DESCRIPTION_MAX = 160;

const clean = (x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '');
const sentence = (x) => (/[.!?]$/.test(x) ? x : `${x}.`);

/**
 * @param {object} v
 * @param {string} v.name        the game's name
 * @param {string} [v.city]
 * @param {string} [v.state]
 * @param {string} [v.description] the operator's own words, any length
 * @param {string} [v.stakesLine]  e.g. "NLH 1/2"
 * @param {string} [v.schedule]    e.g. "Weekly · Saturday"
 * @returns {string} 60..160 characters wherever the record allows it
 */
export function homeGameDescription(v) {
  const name = clean(v?.name) || 'This poker home game';
  const place = clean(v?.city) ? `${clean(v.city)}${clean(v?.state) ? `, ${clean(v.state)}` : ''}` : clean(v?.state);
  const own = clean(v?.description);
  const stakes = clean(v?.stakesLine);
  const schedule = clean(v?.schedule);

  // The operator's words lead when they wrote any; otherwise the record does.
  let text = own ? sentence(own) : sentence(`${name} is a poker home game${place ? ` in ${place}` : ''}`);

  // Complete it with facts that are not already in it, longest-value first.
  const additions = [];
  if (own && place && !own.toLowerCase().includes(place.toLowerCase())) {
    additions.push(sentence(`${name} plays in ${place}`));
  } else if (own && !own.toLowerCase().includes(name.toLowerCase())) {
    additions.push(sentence(name));
  }
  if (stakes && !text.toLowerCase().includes(stakes.toLowerCase())) additions.push(sentence(stakes));
  if (schedule && !text.toLowerCase().includes(schedule.toLowerCase())) additions.push(sentence(schedule));
  additions.push('See the schedule, stakes and how to request a seat on Smarter.Poker.');

  for (const add of additions) {
    if (text.length >= DESCRIPTION_MIN && text.length + 1 + add.length > DESCRIPTION_MAX) continue;
    if (text.length + 1 + add.length > DESCRIPTION_MAX && text.length >= DESCRIPTION_MIN) continue;
    text = `${text} ${add}`;
    if (text.length >= DESCRIPTION_MIN && text.length > DESCRIPTION_MAX - 20) break;
  }
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : text;
}
