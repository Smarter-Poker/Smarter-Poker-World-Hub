// Reviewed customer-facing facts. Website and Business Agent handoff share this source.
export const GUIDE_VERSION = '2026-11-11.1';
export const GUIDE_DESTINATIONS = {
  training: '/hub/training', poker_near_me: '/hub/poker-near-me/lobby',
  bankroll: '/hub/bankroll-manager', club_arena: '/hub/club-arena',
  commander: '/hub/commander', venue_onboarding: 'mailto:support@smarter.poker?subject=Venue%20Onboarding',
  signup: '/auth/signup', login: '/auth/login', support: 'mailto:support@smarter.poker',
};
export const GUIDE_COPY = {
  en: {
    title: 'Find Your Next Step', intro: 'Choose The Tool For Your Goal. Free To Play, For Adults 18+. Feature Access And Eligibility Are Shown In Each Official Flow.',
    comparison: 'Which Tool Should I Use?', goal: 'Your Goal', tool: 'Official Tool', next: 'Next Step',
    tools: [
      ['training', 'training', 'Study Poker Decisions', 'GTO Training', 'Choose A Format And Practice A Scenario. Training Does Not Guarantee Results.'],
      ['poker_near_me', 'poker_near_me', 'Find A Live Poker Room', 'Poker Near Me', 'Search By Location. Confirm Schedules, Seats And Entry Rules With The Venue.'],
      ['bankroll', 'bankroll', 'Track Your Sessions', 'Bankroll Manager', 'Sign In And Add Your Own Session Records. This Is A Ledger, Not A Bank Or Cash-Out Service.'],
      ['clubs', 'club_arena', 'Play With A Private Club', 'Poker Arena', 'Sign In And Follow Your Club Invitation Or Application. Club Approval And Game Availability Apply.'],
      ['venues', 'commander', 'Manage A Live Venue', 'Club Commander', 'Review Venue Tools, Then Contact Support For Venue Onboarding. A Social Page Does Not Activate Commander.'],
    ],
    sections: [
      { id: 'players', title: 'For Players', faqs: [
        ['Can I Start Without An Account?', 'Public Calculators And Guides Can Be Read Without Signing In. Saved Training Progress, Private Clubs And Personal Session Records May Require An Account. Follow The Requirements Shown In The Tool.', 'training'],
        ['Does Poker Near Me Reserve A Seat?', 'It Helps You Discover Rooms And Schedules. A Listing Is Not A Reservation Or A Guarantee That A Game Is Running. Confirm Current Details Directly With The Venue.', 'poker_near_me'],
        ['Can I Cash Out Chips Or Diamonds?', 'Chips And Diamonds Have No Cash Value And Are Not Redeemable For Cash. The Platform Does Not Offer Real-Money Gambling. Optional Purchases Are Separate From Free Play; Payment Does Not Increase Reward Chances. Any Promotion Has Its Own Official Rules And Eligibility.', null],
        ['Is Diamond Arena Open?', 'Funded Diamond Games Are Not Open For Play Yet. Do Not Treat A Marketing Page, Menu Or Calendar Entry As Proof Of Launch. Current Terms And Official Rules Govern Availability And Eligibility.', null],
      ] },
      { id: 'clubs', title: 'For Private Club Owners', faqs: [
        ['How Do Members Join?', 'Use The Official Poker Arena Club Flow And Share Your Club Invitation Through Your Own Channels. Joining May Require An Account And Club Approval. This Guide Cannot Admit Members Or Change Club Balances.', 'club_arena'],
        ['Do Club Tools Handle Outside Payments?', 'Club Management And Play Credits Do Not Establish A Cash-Out, Deposit Or Licensed Gambling Service. Do Not Send Payment Credentials In Chat. Ask Support About A Specific Official Feature Before Relying On It.', 'support'],
      ] },
      { id: 'venues', title: 'For Venue Operators', faqs: [
        ['How Do I Start With Commander?', 'Commander Provides Venue Management Tools Such As Waitlists, Tables And Tournament Clocks. Review The Official Page, Then Email Support With Your Venue Name, City And Requested Tools. Activation, Staff Access And Supported Features Must Be Confirmed During Onboarding.', 'venue_onboarding'],
        ['How Do I Correct A Room Listing?', 'Send Support The Official Venue Website, City And A Clear Description Of The Correction. A Directory Listing And A Social Business Page Are Separate From Activated Commander Staff Access.', 'support'],
      ] },
      { id: 'account', title: 'Account Help', faqs: [
        ['What Should I Send To Support?', 'Describe The Problem, Page And Approximate Time. Never Send Passwords, Verification Codes, Government ID Or Financial Credentials In Conversation. Use The Official Sign-In Or Recovery Screen For Authentication; Share Sensitive Verification Material Only In The Designated Secure Provider Flow.', 'support'],
      ] },
    ],
    sources: 'Official Sources', feedback: 'Did This Guide Help You Find Your Next Step?', yes: 'Yes', no: 'No',
    recorded: 'Thanks. Feedback Was Offered To The Consented Analytics Service.', unmeasured: 'Thanks. Feedback Was Not Sent Because Consented Analytics Is Unavailable.',
  },
  es: {
    title: 'Encuentra Tu Próximo Paso', intro: 'Elige La Herramienta Para Tu Objetivo. Juego Gratuito Para Mayores De 18 Años. Cada Flujo Oficial Indica Sus Requisitos De Acceso Y Elegibilidad.',
    comparison: '¿Qué Herramienta Debo Usar?', goal: 'Tu Objetivo', tool: 'Herramienta Oficial', next: 'Próximo Paso',
    tools: [
      ['training', 'training', 'Estudiar Decisiones De Póker', 'GTO Training', 'Elige Un Formato Y Practica Un Escenario. El Entrenamiento No Garantiza Resultados.'],
      ['poker_near_me', 'poker_near_me', 'Encontrar Una Sala Presencial', 'Poker Near Me', 'Busca Por Ubicación. Confirma Horarios, Asientos Y Requisitos Con El Local.'],
      ['bankroll', 'bankroll', 'Registrar Tus Sesiones', 'Bankroll Manager', 'Inicia Sesión Y Añade Tus Propios Registros. Es Un Registro, No Un Banco Ni Un Servicio De Retiro.'],
      ['clubs', 'club_arena', 'Jugar En Un Club Privado', 'Poker Arena', 'Inicia Sesión Y Sigue La Invitación O Solicitud Del Club. Se Aplican Su Aprobación Y La Disponibilidad De Juegos.'],
      ['venues', 'commander', 'Gestionar Un Local', 'Club Commander', 'Revisa Las Herramientas Y Contacta Con Soporte Para La Incorporación. Una Página Social No Activa Commander.'],
    ],
    sections: [
      { id: 'players', title: 'Para Jugadores', faqs: [
        ['¿Necesito Una Cuenta?', 'Las Calculadoras Y Guías Públicas No Requieren Iniciar Sesión. Guardar Progreso, Acceder A Clubs Privados Y Registrar Sesiones Puede Requerir Una Cuenta. Sigue Los Requisitos De Cada Herramienta.', 'training'],
        ['¿Poker Near Me Reserva Asientos?', 'Ayuda A Encontrar Salas Y Horarios. Una Ficha No Es Una Reserva Ni Garantiza Un Juego En Curso. Confirma Los Datos Actuales Con El Local.', 'poker_near_me'],
        ['¿Puedo Retirar Fichas O Diamantes?', 'Las Fichas Y Los Diamantes No Tienen Valor Monetario Ni Son Canjeables Por Dinero. La Plataforma No Ofrece Apuestas Con Dinero Real. Las Compras Opcionales Son Independientes Del Juego Gratuito; Pagar No Aumenta Las Probabilidades De Recompensa. Cada Promoción Tiene Reglas Y Requisitos Propios.', null],
        ['¿Está Abierto Diamond Arena?', 'Los Juegos Financiados Con Diamantes Aún No Están Abiertos. Una Página Promocional, Menú O Calendario No Demuestra Su Lanzamiento. Los Términos Y Las Reglas Oficiales Determinan Disponibilidad Y Elegibilidad.', null],
      ] },
      { id: 'clubs', title: 'Para Propietarios De Clubs', faqs: [
        ['¿Cómo Se Unen Los Miembros?', 'Usa El Flujo Oficial De Clubs De Poker Arena Y Comparte Tu Invitación Por Tus Propios Canales. Puede Requerir Cuenta Y Aprobación Del Club. Esta Guía No Admite Miembros Ni Cambia Saldos.', 'club_arena'],
        ['¿Las Herramientas Gestionan Pagos Externos?', 'La Gestión Del Club Y Los Créditos De Juego No Constituyen Un Servicio De Depósitos, Retiros O Apuestas Autorizadas. No Envíes Credenciales Financieras Por Chat. Consulta Una Función Oficial Específica Con Soporte.', 'support'],
      ] },
      { id: 'venues', title: 'Para Operadores De Locales', faqs: [
        ['¿Cómo Empiezo Con Commander?', 'Commander Ofrece Herramientas Como Listas De Espera, Mesas Y Relojes De Torneos. Revisa La Página Oficial Y Envía A Soporte El Nombre Del Local, Ciudad Y Herramientas Solicitadas. Confirma Activación, Acceso Del Personal Y Funciones Durante La Incorporación.', 'venue_onboarding'],
        ['¿Cómo Corrijo Una Ficha?', 'Envía A Soporte La Web Oficial Del Local, La Ciudad Y La Corrección. Una Ficha Del Directorio Y Una Página Social Son Distintas Del Acceso Activado Del Personal A Commander.', 'support'],
      ] },
      { id: 'account', title: 'Ayuda Con La Cuenta', faqs: [
        ['¿Qué Envío A Soporte?', 'Describe El Problema, La Página Y La Hora Aproximada. Nunca Envíes Contraseñas, Códigos De Verificación, Identificación Oficial Ni Credenciales Financieras En Conversación. Usa Las Pantallas Oficiales De Acceso O Recuperación Y El Flujo Seguro Del Proveedor Para Verificaciones Sensibles.', 'support'],
      ] },
    ],
    sources: 'Fuentes Oficiales', feedback: '¿Esta Guía Te Ayudó A Encontrar Tu Próximo Paso?', yes: 'Sí', no: 'No',
    recorded: 'Gracias. Se Ofreció Tu Opinión Al Servicio De Analítica Con Consentimiento.', unmeasured: 'Gracias. No Se Envió Tu Opinión Porque La Analítica Con Consentimiento No Está Disponible.',
  },
};

export function businessHubKnowledge(language = 'en') {
  const copy = GUIDE_COPY[language] || GUIDE_COPY.en;
  return [`Guide ${GUIDE_VERSION}: https://smarter.poker/hub/help?source=business_hub#start`, copy.intro,
    ...copy.tools.map(([, dest, goal, name, next]) => `${goal}: ${name}. ${next} ${GUIDE_DESTINATIONS[dest].startsWith('/') ? 'https://smarter.poker' : ''}${GUIDE_DESTINATIONS[dest]}`),
    ...copy.sections.flatMap(section => section.faqs.map(([q, a]) => `${q} ${a}`)),
    'Official sources: https://smarter.poker/terms https://smarter.poker/legal/official-rules https://smarter.poker/privacy',
  ].join('\n\n');
}
