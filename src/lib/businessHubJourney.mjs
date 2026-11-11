import { GUIDE_COPY, GUIDE_DESTINATIONS } from './businessHubGuide.mjs';

export const JOURNEY_COPY = {
  en: {
    choose: 'What Would You Like To Do?', placeholder: 'Choose Your Goal', access: 'Access And Availability', open: 'Open The Official Tool',
    inquiry: 'Plan Your Venue Onboarding', intro: 'Tell Support Which Venue And Tools You Want To Discuss. Review The Draft And Send It From Your Own Email App. This Does Not Activate Commander.',
    venue: 'Venue Name', city: 'City And State Or Region', tools: 'Requested Tools', prepare: 'Prepare Email Draft', send: 'Open Email App', draft: 'Review Your Draft',
    notice: 'No Message Has Been Sent. If Your Email App Does Not Open, Send The Draft To Support@Smarter.Poker. Never Include Passwords, Verification Codes, Government ID Or Financial Credentials.',
    invalid: 'Enter A Venue Name And City, Then Choose A Tool. Use One Line Per Field.', venueLink: 'Prepare A Venue Inquiry',
    availability: {
      training: 'Public Study Resources Are Available. Sign In To Save Personal Progress. Training Does Not Guarantee Results.',
      poker_near_me: 'Browse Public Room Information. Confirm Current Schedules And Entry Requirements With The Venue; A Listing Is Not A Reservation.',
      bankroll: 'Sign In To Record Your Own Sessions. Records Depend On Your Entries; This Is Not A Bank Or Cash-Out Service.',
      club_arena: 'An Account And Club Invitation Or Application May Be Required. Club Approval And Game Availability Are Separate. Funded Diamond Games Are Not Open For Play Yet.',
      commander: 'Venue Tools And Staff Access Must Be Confirmed During Onboarding. Creating A Social Page Does Not Activate Commander.',
    },
  },
  es: {
    choose: '¿Qué Quieres Hacer?', placeholder: 'Elige Tu Objetivo', access: 'Acceso Y Disponibilidad', open: 'Abrir La Herramienta Oficial',
    inquiry: 'Prepara La Incorporación De Tu Local', intro: 'Indica A Soporte El Local Y Las Herramientas Que Te Interesan. Revisa El Borrador Y Envíalo Desde Tu Aplicación De Correo. Esto No Activa Commander.',
    venue: 'Nombre Del Local', city: 'Ciudad Y Estado O Región', tools: 'Herramientas Solicitadas', prepare: 'Preparar Borrador', send: 'Abrir Aplicación De Correo', draft: 'Revisa Tu Borrador',
    notice: 'No Se Ha Enviado Ningún Mensaje. Si No Se Abre Tu Aplicación, Envía El Borrador A Support@Smarter.Poker. Nunca Incluyas Contraseñas, Códigos De Verificación, Identificación Oficial Ni Credenciales Financieras.',
    invalid: 'Introduce El Nombre Y La Ciudad Del Local Y Elige Una Herramienta. Usa Una Línea Por Campo.', venueLink: 'Preparar Una Consulta Del Local',
    availability: {
      training: 'Hay Recursos Públicos De Estudio. Inicia Sesión Para Guardar Tu Progreso. El Entrenamiento No Garantiza Resultados.',
      poker_near_me: 'Consulta Información Pública De Salas. Confirma Horarios Y Requisitos Con El Local; Una Ficha No Reserva Asientos.',
      bankroll: 'Inicia Sesión Para Registrar Tus Sesiones. Los Informes Dependen De Tus Datos; No Es Un Banco Ni Un Servicio De Retiro.',
      club_arena: 'Puede Requerir Cuenta E Invitación O Solicitud. La Aprobación Del Club No Garantiza Disponibilidad. Los Juegos Financiados Con Diamantes Aún No Están Abiertos.',
      commander: 'Confirma Las Herramientas Y El Acceso Del Personal Durante La Incorporación. Una Página Social No Activa Commander.',
    },
  },
};

export const VENUE_TOOLS = {
  waitlists: { en: 'Waitlists And Seat Alerts', es: 'Listas De Espera Y Avisos' },
  tables: { en: 'Table Tracking', es: 'Seguimiento De Mesas' },
  tournaments: { en: 'Tournament Clocks', es: 'Relojes De Torneos' },
  overview: { en: 'Discuss Available Venue Tools', es: 'Consultar Las Herramientas Disponibles' },
};

export function goalRecommendation(destination, language = 'en') {
  const lang = language === 'es' ? 'es' : 'en';
  const row = GUIDE_COPY[lang].tools.find(tool => tool[1] === destination);
  return row ? { topic: row[0], destination, name: row[3], next: row[4], href: GUIDE_DESTINATIONS[destination], access: JOURNEY_COPY[lang].availability[destination] } : null;
}

// No network request or storage. Only a customer-reviewed email draft.
export function prepareVenueInquiry({ venue, city, tool, language = 'en' } = {}) {
  const clean = (value, max) => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
  const venueName = clean(venue, 100);
  const venueCity = clean(city, 100);
  if (!venueName || !venueCity || !Object.hasOwn(VENUE_TOOLS, tool)) return null;
  const lang = language === 'es' ? 'es' : 'en';
  const copy = JOURNEY_COPY[lang];
  const body = `${copy.venue}: ${venueName}\n${copy.city}: ${venueCity}\n${copy.tools}: ${VENUE_TOOLS[tool][lang]}\n\n${lang === 'es' ? 'Quiero Consultar Los Requisitos De Incorporación Y Las Funciones Disponibles.' : 'Please Confirm Onboarding Requirements And Supported Features For Our Venue.'}`;
  return { body, href: `mailto:support@smarter.poker?subject=Venue%20Onboarding&body=${encodeURIComponent(body)}` };
}
