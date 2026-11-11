import React, { useState } from 'react';
import { GUIDE_COPY } from '../../lib/businessHubGuide.mjs';
import { JOURNEY_COPY, VENUE_TOOLS, goalRecommendation, prepareVenueInquiry } from '../../lib/businessHubJourney.mjs';

const FIELD = 'mt-2 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
const BUTTON = 'inline-block min-h-11 rounded-lg border border-cyan-400 bg-cyan-950 px-4 py-3 text-sm text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300';

export default function BusinessHubJourney({ language = 'en', onEvent = () => {} }) {
  const copy = JOURNEY_COPY[language];
  const [goal, setGoal] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [tool, setTool] = useState('overview');
  const [prepared, setPrepared] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const recommendation = goalRecommendation(goal, language);
  const inquiry = prepared ? prepareVenueInquiry({ venue, city, tool, language }) : null;
  const edit = (setter, value) => { setter(value); setPrepared(false); setInvalid(false); };
  return <div className="my-6 space-y-6">
    <section aria-labelledby="goal-chooser-title" className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <label id="goal-chooser-title" htmlFor="guide-goal" className="text-lg font-semibold">{copy.choose}</label>
      <select id="guide-goal" className={FIELD} value={goal} onChange={event => {
        const selected = event.target.value;
        setGoal(selected);
        const next = goalRecommendation(selected, language);
        if (next) onEvent('goal_selected', { destination: next.destination, topic: next.topic });
      }}>
        <option value="">{copy.placeholder}</option>
        {GUIDE_COPY[language].tools.map(row => <option key={row[1]} value={row[1]}>{row[2]}</option>)}
      </select>
      <div aria-live="polite">
        {recommendation && <div className="mt-4 space-y-3">
          <h3 className="font-semibold text-cyan-200">{recommendation.name}</h3>
          <p className="text-sm leading-relaxed text-slate-300">{recommendation.next}</p>
          <h4 className="text-sm font-semibold">{copy.access}</h4>
          <p className="text-sm leading-relaxed text-slate-300">{recommendation.access}</p>
          <a href={recommendation.href} className={BUTTON} onClick={() => onEvent('destination_click', { destination: recommendation.destination, topic: recommendation.topic })}>{copy.open}</a>
          {goal === 'commander' && <a href="#venue-inquiry" className="ml-3 inline-block py-3 text-sm text-cyan-300 underline">{copy.venueLink}</a>}
        </div>}
      </div>
    </section>
    <section id="venue-inquiry" aria-labelledby="venue-inquiry-title" className="ph-no-capture scroll-mt-24 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h3 id="venue-inquiry-title" className="text-lg font-semibold">{copy.inquiry}</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{copy.intro}</p>
      <form className="mt-4 space-y-4" onSubmit={event => {
        event.preventDefault();
        const draft = prepareVenueInquiry({ venue, city, tool, language });
        setInvalid(!draft); setPrepared(!!draft);
        if (draft) onEvent('draft_prepared', { topic: 'venues' });
      }}>
        <label className="block text-sm" htmlFor="inquiry-venue">{copy.venue}<input id="inquiry-venue" className={FIELD} required maxLength={100} value={venue} onChange={event => edit(setVenue, event.target.value)} /></label>
        <label className="block text-sm" htmlFor="inquiry-city">{copy.city}<input id="inquiry-city" className={FIELD} required maxLength={100} value={city} onChange={event => edit(setCity, event.target.value)} /></label>
        <label className="block text-sm" htmlFor="inquiry-tool">{copy.tools}<select id="inquiry-tool" className={FIELD} value={tool} onChange={event => edit(setTool, event.target.value)}>
          {Object.entries(VENUE_TOOLS).map(([value, labels]) => <option key={value} value={value}>{labels[language]}</option>)}
        </select></label>
        <button type="submit" className={BUTTON}>{copy.prepare}</button>
        {invalid && <p role="alert" className="text-sm text-amber-200">{copy.invalid}</p>}
      </form>
      {inquiry && <div className="mt-5 space-y-3" role="status">
        <label className="block text-sm" htmlFor="venue-draft">{copy.draft}<textarea id="venue-draft" className={FIELD} rows={6} readOnly value={inquiry.body} /></label>
        <a href={inquiry.href} className={BUTTON} onClick={() => onEvent('destination_click', { destination: 'venue_onboarding', topic: 'venues' })}>{copy.send}</a>
      </div>}
      <p className="mt-4 text-sm leading-relaxed text-slate-300">{copy.notice}</p>
    </section>
  </div>;
}
