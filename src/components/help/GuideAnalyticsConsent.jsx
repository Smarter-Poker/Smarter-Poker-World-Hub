import React, { useEffect, useState } from 'react';
import { guideConsent, enableGuideAnalytics, disableGuideAnalytics } from '../../lib/guideAnalyticsConsent.mjs';
import { captureBusinessHubGuideEvent } from '../../lib/businessHubGuideActivity.mjs';

export default function GuideAnalyticsConsent({ language, source }) {
  const [state, setState] = useState('off');
  const es = language === 'es';
  useEffect(() => {
    window.smarterGuideConsentRequired = true;
    window.smarterGuideConsentGranted = guideConsent() && !!window.smarterGuideAnalytics;
    if (guideConsent()) void allow();
  }, []);
  async function allow() {
    setState('loading');
    const candidate = new URLSearchParams(window.location.search).get('source');
    source.current = ['business_hub', 'help', 'direct'].includes(candidate) ? candidate : 'direct';
    const ready = await enableGuideAnalytics();
    if (ready) captureBusinessHubGuideEvent('guide_view', { language, source: source.current });
    setState(ready ? 'on' : 'unavailable');
  }
  return <div className="ph-no-capture my-5 rounded-lg border border-slate-700 p-4 text-sm">
    <p>{es ? 'Analítica Opcional De La Guía: PostHog Recibe Interacciones Con Las Herramientas Y Un Identificador Aleatorio De Sesión. Sin Datos Del Formulario, Grabación Ni Identificación De Tu Cuenta.' : 'Optional Guide Analytics: PostHog Receives Tool Interactions And A Random Session Identifier. No Form Contents, Recording Or Account Identification.'}</p>
    <button type="button" disabled={state === 'loading'} className="mt-3 min-h-11 rounded border border-cyan-700 px-4 py-2" onClick={() => {
      if (state === 'on') { disableGuideAnalytics(); setState('off'); } else void allow();
    }}>{state === 'on' ? (es ? 'Desactivar Analítica' : 'Turn Off Guide Analytics') : (es ? 'Permitir Analítica En Esta Sesión' : 'Allow Guide Analytics For This Session')}</button>
    <p role="status" className="mt-2">{state === 'on' ? (es ? 'Activada Para Esta Sesión.' : 'Enabled For This Session.') : state === 'loading' ? (es ? 'Conectando…' : 'Connecting…') : state === 'unavailable' ? (es ? 'No Disponible. La Guía Sigue Funcionando.' : 'Unavailable. The Guide Still Works.') : (es ? 'Desactivada. Tu Elección No Afecta El Acceso.' : 'Off. Your Choice Does Not Affect Access.')}</p>
  </div>;
}
