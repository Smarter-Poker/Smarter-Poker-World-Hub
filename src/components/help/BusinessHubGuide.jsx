import React, { useEffect, useRef, useState } from 'react';
import { GUIDE_COPY, GUIDE_DESTINATIONS } from '../../lib/businessHubGuide.mjs';
import { captureBusinessHubGuideEvent } from '../../lib/businessHubGuideActivity.mjs';
import BusinessHubJourney from './BusinessHubJourney';

const SOURCE_VALUES = new Set(['business_hub', 'help', 'direct']);
const DESTINATION_TOPICS = {
  training: 'training', poker_near_me: 'poker_near_me', bankroll: 'bankroll',
  club_arena: 'clubs', commander: 'venues', venue_onboarding: 'venues',
  signup: 'account', login: 'account', support: 'account',
};
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300';

export default function BusinessHubGuide() {
  const [language, setLanguage] = useState('en');
  const [feedback, setFeedback] = useState(null);
  const viewed = useRef(false);
  const source = useRef('direct');
  const copy = GUIDE_COPY[language];

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    const candidate = new URLSearchParams(window.location.search).get('source');
    source.current = SOURCE_VALUES.has(candidate) ? candidate : 'direct';
    captureBusinessHubGuideEvent('guide_view', { language: 'en', source: source.current });
  }, []);

  function destinationClick(destination, topic = DESTINATION_TOPICS[destination]) {
    captureBusinessHubGuideEvent('destination_click', {
      destination, topic, language, source: source.current,
    });
  }

  function submitFeedback(helpful) {
    const accepted = captureBusinessHubGuideEvent('feedback', {
      helpful, language, source: source.current,
    });
    setFeedback({ helpful, accepted });
  }

  function destinationLink(destination, label, topic) {
    return (
      <a
        href={GUIDE_DESTINATIONS[destination]}
        onClick={() => destinationClick(destination, topic)}
        className={`inline-block rounded text-cyan-300 underline decoration-cyan-700 underline-offset-4 hover:text-cyan-100 ${FOCUS}`}
      >
        {label}
      </a>
    );
  }

  return (
    <section id="start" lang={language} aria-labelledby="business-hub-guide-title" className="scroll-mt-24 rounded-2xl border border-cyan-900 bg-[#101419] p-4 text-slate-100 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 id="business-hub-guide-title" className="text-2xl font-semibold text-white">{copy.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{copy.intro}</p>
        </div>
        <div role="group" aria-label={language === 'es' ? 'Idioma De La Guía' : 'Guide Language'} className="flex gap-2">
          {['en', 'es'].map(value => (
            <button
              key={value}
              type="button"
              lang={value}
              aria-pressed={language === value}
              onClick={() => { setLanguage(value); setFeedback(null); }}
              className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${FOCUS} ${language === value ? 'border-cyan-400 bg-cyan-950 text-cyan-100' : 'border-slate-600 bg-slate-900 text-slate-200 hover:border-cyan-600'}`}
            >
              {value === 'en' ? 'English' : 'Español'}
            </button>
          ))}
        </div>
      </div>

      <div role="region" aria-labelledby="business-hub-comparison" tabIndex={0} className={`overflow-x-auto rounded-xl border border-slate-700 ${FOCUS}`}>
        <table className="w-full min-w-[620px] text-left text-sm">
          <caption id="business-hub-comparison" className="bg-slate-900 px-4 py-3 text-left text-lg font-semibold text-white">{copy.comparison}</caption>
          <thead className="border-y border-slate-700 bg-slate-900 text-slate-300">
            <tr>
              <th scope="col" className="w-1/4 px-4 py-3 font-medium">{copy.goal}</th>
              <th scope="col" className="w-1/4 px-4 py-3 font-medium">{copy.tool}</th>
              <th scope="col" className="px-4 py-3 font-medium">{copy.next}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {copy.tools.map(([topic, destination, goal, name, next]) => (
              <tr key={destination} className="align-top">
                <th scope="row" className="px-4 py-4 font-medium text-white">{goal}</th>
                <td className="px-4 py-4">{destinationLink(destination, name, topic)}</td>
                <td className="px-4 py-4 leading-relaxed text-slate-300">{next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BusinessHubJourney language={language} onEvent={(stage, properties) => captureBusinessHubGuideEvent(stage, { ...properties, language, source: source.current })} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {copy.sections.map(section => (
          <section key={section.id} aria-labelledby={`guide-${section.id}`}>
            <h3 id={`guide-${section.id}`} className="mb-3 text-lg font-semibold text-white">{section.title}</h3>
            <div className="space-y-2">
              {section.faqs.map(([question, answer, destination]) => (
                <details key={question} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  <summary className={`cursor-pointer rounded font-medium leading-relaxed text-slate-100 ${FOCUS}`}>{question}</summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{answer}</p>
                  {destination && (
                    <div className="mt-3 text-sm">
                      {destinationLink(destination, copy.tools.find(tool => tool[1] === destination)?.[3]
                        || (destination === 'venue_onboarding'
                          ? (language === 'es' ? 'Contactar Sobre La Incorporación' : 'Contact Venue Onboarding')
                          : (language === 'es' ? 'Contactar Con Soporte' : 'Contact Support')),
                      section.id === 'players' ? DESTINATION_TOPICS[destination] : section.id)}
                    </div>
                  )}
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-700 pt-5">
        <h3 className="font-semibold text-white">{copy.sources}</h3>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm">
          {[
            ['/terms', language === 'es' ? 'Términos De Servicio' : 'Terms Of Service'],
            ['/legal/official-rules', language === 'es' ? 'Reglas Oficiales' : 'Official Rules'],
            ['/privacy', language === 'es' ? 'Privacidad' : 'Privacy'],
          ].map(([href, label]) => (
            <li key={href}><a href={href} className={`rounded text-cyan-300 underline underline-offset-4 hover:text-cyan-100 ${FOCUS}`}>{label}</a></li>
          ))}
        </ul>
      </div>

      <div className="mt-6 border-t border-slate-700 pt-5">
        <p id="business-hub-feedback" className="text-sm font-medium">{copy.feedback}</p>
        <div role="group" aria-labelledby="business-hub-feedback" className="mt-3 flex gap-3">
          {[true, false].map(helpful => (
            <button
              key={String(helpful)} type="button"
              aria-pressed={feedback?.helpful === helpful}
              onClick={() => submitFeedback(helpful)}
              className={`min-h-11 rounded-lg border px-5 py-2 text-sm ${FOCUS} ${feedback?.helpful === helpful ? 'border-cyan-400 bg-cyan-950 text-cyan-100' : 'border-slate-600 bg-slate-900 hover:border-cyan-600'}`}
            >{helpful ? copy.yes : copy.no}</button>
          ))}
        </div>
        <p role="status" className="mt-3 min-h-5 text-sm leading-relaxed text-slate-300">{feedback ? (feedback.accepted ? copy.recorded : copy.unmeasured) : ''}</p>
      </div>
    </section>
  );
}
