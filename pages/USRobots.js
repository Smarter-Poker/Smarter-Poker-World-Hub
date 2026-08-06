import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';

const TOTAL = 12;

const SLIDES = [
  { id: 's1',  img: '/usrobots/slide01.jpg', overlay: 'linear-gradient(105deg,rgba(0,0,0,.82) 0%,rgba(5,13,40,.7) 40%,rgba(0,0,0,.25) 100%)',  cls: 'sc-left-center' },
  { id: 's2',  img: '/usrobots/slide02.jpg', overlay: 'linear-gradient(to right,rgba(0,0,0,.88),rgba(0,0,0,.6) 55%,rgba(0,0,0,.3))',              cls: 'sc-left-center' },
  { id: 's3',  img: '/usrobots/slide03.jpg', overlay: 'linear-gradient(to right,rgba(0,0,0,0) 40%,rgba(0,0,0,.9))',                                cls: 'sc-right-center' },
  { id: 's4',  img: '/usrobots/slide04.jpg', overlay: 'linear-gradient(to top,rgba(0,0,0,.92),rgba(0,0,0,.5) 55%,rgba(0,0,0,.2))',                 cls: 'sc-bottom-center' },
  { id: 's5',  img: '/usrobots/slide05.jpg', overlay: 'rgba(0,0,0,.58)',                                                                            cls: 'sc-center-center' },
  { id: 's6',  img: '/usrobots/slide06.jpg', overlay: 'linear-gradient(to right,rgba(0,0,0,.88),rgba(0,0,0,.5) 55%,rgba(0,0,0,.1))',               cls: 'sc-left-center' },
  { id: 's7',  img: '/usrobots/slide07.jpg', overlay: 'linear-gradient(to left,rgba(0,0,0,.88),rgba(0,0,0,.35) 60%,rgba(0,0,0,.05))',              cls: 'sc-right-center' },
  { id: 's8',  img: '/usrobots/slide08.jpg', overlay: 'linear-gradient(to top,rgba(0,0,0,.9),rgba(0,0,0,.5) 55%,rgba(0,0,0,.1))',                  cls: 'sc-bottom-center' },
  { id: 's9',  img: '/usrobots/slide09.jpg', overlay: 'rgba(0,0,0,.62)',                                                                            cls: 'sc-center-center' },
  { id: 's10', img: '/usrobots/slide10.jpg', overlay: 'linear-gradient(135deg,rgba(0,0,0,.9),rgba(10,5,0,.65))',                                    cls: 'sc-center-center' },
  { id: 's11', img: '/usrobots/slide11.jpg', overlay: 'rgba(0,0,0,.62)',                                                                            cls: 'sc-center-center' },
  { id: 's12', img: '/usrobots/slide12.jpg', overlay: 'linear-gradient(to left,rgba(0,0,0,.9),rgba(0,0,0,.45) 55%,rgba(0,0,0,.1))',                cls: 'sc-right-center' },
];

/* ── tiny helpers ─────────────────────────────────── */
const Tag   = ({ t, children }) => <div className={`tag tag-${t}`}>{children}</div>;
const BT    = ({ children })    => <div className="big-title">{children}</div>;
const Sub   = ({ children })    => <p className="sub">{children}</p>;
const Pill  = ({ children })    => <span className="glass-pill">{children}</span>;
const Hr    = ({ c })           => <div className={`divider-line divider-${c}`} />;
const CSm   = ({ children })    => <div className="glass-card-sm row-center">{children}</div>;

/* ── slide content by index ──────────────────────── */
function SlideContent({ idx }) {
  switch (idx) {

    /* SLIDE 1 — Cover */
    case 0: return (
      <div className="sc-block mw640">
        <Tag t="cyan">Smarter Software Inc. · Exclusive Proposal for US Robots</Tag>
        <div className="big-title hero-title"><span className="cyan">JAR</span>VIS</div>
        <div className="hero-sub-title">AI-Powered Personal Assistant</div>
        <Sub>The world's first AI home assistant that looks and feels like a real person — inside a premium floor-standing display, with a companion app always in your pocket.</Sub>
        <div className="pill-row">
          <Pill>🖥️ 49" · 55" · 65" Displays</Pill>
          <Pill>🤖 AI Video Avatar</Pill>
          <Pill>📱 iOS + Android App</Pill>
          <Pill>⏱️ 90-Day Delivery</Pill>
        </div>
        <div className="invest-box">
          <span className="invest-label">Total Investment</span>
          <span className="invest-num">$100,000</span>
          <span className="invest-note">4 payments of $25,000 · First due on signing</span>
        </div>
      </div>
    );

    /* SLIDE 2 — Problem */
    case 1: return (
      <div className="sc-block mw580">
        <Tag t="white">The Problem</Tag>
        <BT>Your Life Is<br/><span className="cyan">Scattered</span><br/>Everywhere</BT>
        <Hr c="cyan"/>
        <Sub>The average person juggles <strong style={{color:'#fff'}}>14+ apps</strong> daily. Emails pile up. Appointments are missed. Your digital life is chaos — and no single product has solved it.</Sub>
        <div className="col-stack">
          <CSm><span className="feat-icon-sm">📱</span><div><b className="feat-h">14+ apps to manage your life</b><div className="feat-p">Email, Calendar, Tasks, Smart Home, Music, Fitness…</div></div></CSm>
          <CSm><span className="feat-icon-sm">🔔</span><div><b className="feat-h">100+ notifications per day</b><div className="feat-p">Most go unread. Important things get buried.</div></div></CSm>
          <CSm><span className="feat-icon-sm">🤖</span><div><b className="feat-h">No AI assistant feels human</b><div className="feat-p">Alexa and Siri are voices in a box. JARVIS is a person.</div></div></CSm>
        </div>
        <div className="orbitron cyan fs18">JARVIS solves all of this. In one product.</div>
      </div>
    );

    /* SLIDE 3 — Avatar */
    case 2: return (
      <div className="sc-block sc-block-right mw520">
        <Tag t="cyan">The AI Avatar</Tag>
        <BT>She Looks,<br/>Talks, and<br/><span className="cyan">Feels Real</span></BT>
        <Hr c="cyan"/>
        <Sub>JARVIS features a photorealistic AI avatar — beautiful, voice-activated, lip-synced, and emotionally intelligent. She knows your schedule, your habits, and your name.</Sub>
        <div className="pill-col">
          <Pill>🎤 Wake Word Detection</Pill>
          <Pill>💬 Real-Time Lip Sync</Pill>
          <Pill>🧠 GPT-4o Conversational AI</Pill>
          <Pill>🔊 ElevenLabs Hyper-Realistic Voice</Pill>
        </div>
      </div>
    );

    /* SLIDE 4 — Hardware */
    case 3: return (
      <div className="sc-block sc-block-center mw-full">
        <Tag t="white">The Hardware</Tag>
        <BT>Three Premium Sizes.<br/>One <span className="cyan">Powerful Platform</span>.</BT>
        <Hr c="white"/>
        <div className="hw-cards">
          {[
            {sz:'49"',sub:'Model A · Standard',desc:'Android · HD LCD · Built-in Speaker\nTempered Glass · Anti-collision Base',price:'$391',c:'#00d4ff',pop:null},
            {sz:'55"',sub:'Model B · Pro',desc:'Android · HD LCD · Speaker\nTempered Glass · Heat Release',price:'$457',c:'#00d4ff',pop:'⭐ Most Popular'},
            {sz:'65"',sub:'Model C · Elite',desc:'Android · HD LCD · High-Quality Speaker\nTempered Glass · Dust-Proof',price:'$652',c:'#fbbf24',pop:null},
          ].map(h=>(
            <div key={h.sz} className={`glass-card hw-card${h.pop?' hw-card-pop':''}`}>
              {h.pop && <div className="hw-pop">{h.pop}</div>}
              <div className="orbitron fs48" style={{color:h.c}}>{h.sz}</div>
              <div className="hw-sub">{h.sub}</div>
              <div className="hw-desc">{h.desc}</div>
              <div className="orbitron fs24 gold">{h.price}<span className="hw-unit">/unit</span></div>
            </div>
          ))}
        </div>
        <div className="hw-note">Hardware sourced from manufacturer · JARVIS software pre-loaded · Import & logistics: US Robots</div>
      </div>
    );

    /* SLIDE 5 — Connections */
    case 4: return (
      <div className="sc-block sc-block-center mw-full">
        <Tag t="cyan">The Connected Universe</Tag>
        <BT>JARVIS Connects to<br/><span className="cyan">Everything You Use</span></BT>
        <Hr c="cyan"/>
        <div className="int-grid">
          {['📨 Gmail','📅 Google Calendar','🔵 Outlook','🍎 Apple Mail','✅ Todoist','📝 Notion','🏠 Amazon Alexa','🔊 Google Home','🏡 Apple HomeKit','🎵 Spotify','🎶 Apple Music','🚗 Uber','🍔 DoorDash','📦 Amazon Tracking','💪 Fitbit','❤️ Apple Health','🏃 Garmin','🌤️ Weather','📰 News Feed','💰 Finance Alerts','📸 Family Photos','🔒 Smart Locks','💡 Smart Lights','📺 Smart TV','🌡️ Thermostat'].map(s=>(
            <div key={s} className="int-pill">{s}</div>
          ))}
        </div>
        <Sub>25+ integrations at launch. One intelligent hub. Zero friction.</Sub>
      </div>
    );

    /* SLIDE 6 — Smart Home */
    case 5: return (
      <div className="sc-block mw560">
        <Tag t="cyan">Smart Home Control</Tag>
        <BT>Your Home.<br/><span className="cyan">Your Command.</span></BT>
        <Hr c="cyan"/>
        <Sub>Just say it. JARVIS controls every smart device in your home — lights, locks, temperature, TV, cameras — all through natural voice conversation.</Sub>
        <div className="feat-list">
          {[
            {icon:'💡',h:'Lighting Control',p:'"JARVIS, set the living room to movie mode." Done.'},
            {icon:'🔒',h:'Security & Locks',p:'Lock/unlock doors, check cameras, arm/disarm by voice.'},
            {icon:'🌡️',h:'Climate & Energy',p:'Smart thermostat control. JARVIS learns your comfort preferences.'},
          ].map(f=>(
            <div key={f.h} className="feat-item">
              <div className="feat-icon">{f.icon}</div>
              <div><b className="feat-h">{f.h}</b><div className="feat-p">{f.p}</div></div>
            </div>
          ))}
        </div>
        <Pill>Compatible: Alexa · Google Home · HomeKit · SmartThings</Pill>
      </div>
    );

    /* SLIDE 7 — Mobile App */
    case 6: return (
      <div className="sc-block sc-block-right mw520">
        <Tag t="purple">Mobile Companion App</Tag>
        <BT>JARVIS Goes<br/><span className="purple">Everywhere</span><br/>You Do</BT>
        <Hr c="purple"/>
        <Sub>Leave the house and JARVIS comes with you. iOS + Android keeps you fully connected — same AI, same intelligence, everywhere.</Sub>
        <div className="pill-col">
          <Pill>🔔 Real-Time Push Notifications</Pill>
          <Pill>🔁 Instant Kiosk Sync</Pill>
          <Pill>🎤 Voice Commands On-The-Go</Pill>
          <Pill>🔐 Face ID · Fingerprint Login</Pill>
          <Pill>📍 Location-Aware Smart Alerts</Pill>
        </div>
        <div className="pill-row"><Pill>🍎 iOS App Store</Pill><Pill>🤖 Google Play</Pill></div>
      </div>
    );

    /* SLIDE 8 — Painting */
    case 7: return (
      <div className="sc-block sc-block-center mw860">
        <Tag t="purple">Exclusive Feature</Tag>
        <BT>Virtual <span className="purple">Collaborative</span><br/>Painting Studio</BT>
        <Hr c="purple"/>
        <Sub>Up to 8 users paint together simultaneously — kiosk or phone — with real-time sync, AI art generation, and full time-lapse replay. No other product has this.</Sub>
        <div className="pill-row pill-row-center">
          <Pill>🎨 Real-Time Multi-User Canvas</Pill>
          <Pill>🤖 AI Art Generation by Voice</Pill>
          <Pill>⏯️ Time-Lapse Replay Mode</Pill>
          <Pill>✏️ Full Brush + Layer Toolkit</Pill>
          <Pill>🖼️ Gallery + Social Sharing</Pill>
          <Pill>📱 Cross-Device Sync</Pill>
        </div>
      </div>
    );

    /* SLIDE 9 — Timeline */
    case 8: return (
      <div className="sc-block sc-block-center mw-full">
        <Tag t="gold">90-Day Roadmap</Tag>
        <BT>From Signing to <span className="gold">Launch</span><br/>in 90 Days</BT>
        <Hr c="gold"/>
        <div className="phase-grid">
          {[
            {n:'1',c:'#00d4ff',d:'Days 1–20',t:'Foundation',p:'Cloud infra · Android setup · AI APIs · Auth system',pay:'💳 $25K due on signing'},
            {n:'2',c:'#60a5fa',d:'Days 21–45',t:'AI Engine',p:'Avatar · Voice · Email/Calendar · Notifications · Display UI',pay:'💳 $25K — Avatar live'},
            {n:'3',c:'#a78bfa',d:'Days 46–70',t:'Mobile + Features',p:'iOS/Android · Integrations · Painting Studio · Beta',pay:'💳 $25K — Mobile beta'},
            {n:'4',c:'#fbbf24',d:'Days 71–90',t:'Polish & Launch',p:'QA · App Store · Security audit · Production go-live',pay:'💳 $25K — Final delivery'},
          ].map(ph=>(
            <div key={ph.n} className="phase-card">
              <div className="phase-top">
                <span className="orbitron fs32" style={{color:ph.c}}>{ph.n}</span>
                <span className="orbitron fs10 phase-days" style={{color:ph.c}}>{ph.d}</span>
              </div>
              <b className="feat-h">{ph.t}</b>
              <div className="feat-p mt4">{ph.p}</div>
              <div className="phase-pay" style={{color:ph.c}}>{ph.pay}</div>
            </div>
          ))}
        </div>
      </div>
    );

    /* SLIDE 10 — Payment */
    case 9: return (
      <div className="sc-block sc-block-center mw-full">
        <Tag t="gold">Investment & Payment Schedule</Tag>
        <BT>Four Milestone-Based <span className="gold">Payments</span></BT>
        <Hr c="gold"/>
        <div className="pmt-layout">
          <div className="pmt-rows">
            {[
              {n:'01',c:'#00d4ff',t:'Contract Signing',p:'Due immediately upon execution · Initiates all work'},
              {n:'02',c:'#60a5fa',t:'AI Avatar Milestone',p:'Working JARVIS on kiosk display · Day 45'},
              {n:'03',c:'#a78bfa',t:'Mobile Beta Milestone',p:'iOS + Android beta delivered · Day 70'},
              {n:'04',c:'#fbbf24',t:'Final Delivery',p:'Launch-ready · App stores live · Day 90'},
            ].map(p=>(
              <div key={p.n} className="pmt-row" style={{borderLeftColor:p.c}}>
                <span className="orbitron fs11" style={{color:p.c,minWidth:'28px'}}>{p.n}</span>
                <div className="pmt-info"><div className="feat-h">{p.t}</div><div className="feat-p">{p.p}</div></div>
                <span className="orbitron fs20 gold">$25K</span>
              </div>
            ))}
          </div>
          <div className="pmt-summary">
            <div className="invest-label mb4">Total Contract Value</div>
            <div className="orbitron fs52 gold lh1 mb16">$100K</div>
            {[['Duration','90 Days'],['Platforms','Kiosk + iOS + Android'],['Cloud Infra','90 Days Included'],['Support','30 Days Post-Launch'],['IP Ownership','Full Transfer']].map(([k,v],i)=>(
              <div key={k} className={`pmt-detail-row${i<4?' pmt-detail-border':''}`}><span className="dim">{k}</span><span className={k==='IP Ownership'?'cyan':'white-bold'}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    );

    /* SLIDE 11 — Tech + Market */
    case 10: return (
      <div className="sc-block sc-block-center mw-full">
        <Tag t="cyan">Technology + Market</Tag>
        <BT>Enterprise-Grade Stack.<br/><span className="cyan">Massive Market Opportunity.</span></BT>
        <Hr c="cyan"/>
        <div className="tech-grid">
          {[
            {l:'AI Brain',n:'GPT-4o + Gemini',d:'Dual-engine LLM with persona memory'},
            {l:'Avatar',n:'D-ID / Synthesia',d:'Photorealistic lip-sync pipeline'},
            {l:'Voice',n:'Whisper + ElevenLabs',d:'Real-time ASR + ultra-human TTS'},
            {l:'Mobile',n:'React Native',d:'Single codebase · iOS + Android'},
            {l:'Kiosk OS',n:'Android (AOSP)',d:'Custom ROM for always-on display'},
            {l:'Backend',n:'Node.js + Fastify',d:'REST + GraphQL API layer'},
            {l:'Cloud',n:'AWS',d:'99.9% SLA · Auto-scaling · CDN'},
            {l:'Real-Time',n:'WebSockets',d:'Instant kiosk ↔ phone sync'},
          ].map(t=>(
            <div key={t.n} className="tech-item">
              <div className="tech-layer">{t.l}</div>
              <div className="tech-name">{t.n}</div>
              <div className="tech-desc">{t.d}</div>
            </div>
          ))}
        </div>
        <div className="stat-row">
          {[
            {v:'$157B',l:'Smart Home Market by 2029',c:'rgba(0,212,255,.2)',vc:'#00d4ff'},
            {v:'85M+',l:'US Smart Home Households',c:'rgba(245,158,11,.2)',vc:'#fbbf24'},
            {v:'0',l:'Direct Competitors (This Exact Product)',c:'rgba(167,139,250,.2)',vc:'#a78bfa'},
          ].map(s=>(
            <div key={s.v} className="stat-box" style={{border:`1px solid ${s.c}`}}>
              <div className="orbitron fs28" style={{color:s.vc}}>{s.v}</div>
              <div className="stat-label">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    );

    /* SLIDE 12 — CTA */
    case 11: return (
      <div className="sc-block sc-block-right mw560">
        <Tag t="gold">Let's Build the Future</Tag>
        <BT>Ready to <span className="gold">Sign</span> and<br/>Change the World?</BT>
        <Hr c="gold"/>
        <Sub>This proposal is addressed exclusively to <strong style={{color:'#fff'}}>Michael Yorga, US Robots</strong>. Smarter Software Inc. is ready to begin immediately upon contract execution and receipt of Payment 1.</Sub>
        <div className="pill-col">
          <Pill>📋 Contract: SSI-USR-2026-001</Pill>
          <Pill>📅 Proposed Start: Upon Signing</Pill>
          <Pill>📧 Schonesanfleet@yahoo.com</Pill>
          <Pill>🎯 90-Day Delivery · $100,000 Total</Pill>
        </div>
        <div className="btn-row">
          <button className="btn-primary">✍️ Sign & Get Started</button>
          <button className="btn-outline">📞 Schedule a Call</button>
        </div>
        <div className="cta-note">Smarter Software Inc. · August 6, 2026<br/>Confidential — For US Robots · Michael Yorga Use Only</div>
      </div>
    );

    default: return null;
  }
}

/* ═══════════════════════════════ PAGE ═══════════════════════════════ */
export default function USRobots() {
  const [current, setCurrent] = useState(0);

  const goTo = useCallback((n) => {
    if (n < 0 || n >= TOTAL) return;
    setCurrent(n);
  }, []);

  // Keyboard
  useEffect(() => {
    const h = (e) => {
      if (['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(e.key)) { e.preventDefault(); setCurrent(c => Math.min(c+1, TOTAL-1)); }
      if (['ArrowLeft','ArrowUp','PageUp'].includes(e.key)) { e.preventDefault(); setCurrent(c => Math.max(c-1, 0)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Swipe
  useEffect(() => {
    let tx = 0;
    const ts = (e) => { tx = e.touches[0].clientX; };
    const te = (e) => {
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 40) setCurrent(c => dx < 0 ? Math.min(c+1,TOTAL-1) : Math.max(c-1,0));
    };
    window.addEventListener('touchstart', ts, {passive:true});
    window.addEventListener('touchend',   te, {passive:true});
    return () => { window.removeEventListener('touchstart',ts); window.removeEventListener('touchend',te); };
  }, []);

  const pct = ((current+1)/TOTAL*100).toFixed(2)+'%';

  return (
    <>
      <Head>
        <title>JARVIS AI — Proposal for US Robots | Smarter Software Inc.</title>
        <meta name="description" content="Official proposal from Smarter Software Inc. to US Robots for the JARVIS AI-Powered Personal Assistant." />
        <meta name="robots" content="noindex,nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Orbitron:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html, body { overflow:hidden; height:100%; background:#000; }
        #__next { height:100%; }
        body { font-family:'Outfit',sans-serif; user-select:none; -webkit-font-smoothing:antialiased; }

        /* ── TOKENS ── */
        :root {
          --cyan:   #00d4ff;
          --gold:   #fbbf24;
          --purple: #a78bfa;
          --pad-x:  80px;
          --pad-y:  90px;
          --topbar: 54px;
          --navbar: 68px;
        }
        @media(max-width:768px){
          :root { --pad-x:20px; --pad-y:70px; --topbar:48px; --navbar:62px; }
        }
        @media(max-width:480px){
          :root { --pad-x:16px; --pad-y:64px; }
        }

        /* ── SLIDE ENGINE ── */
        .deck { position:relative; width:100vw; height:100vh; overflow:hidden; }
        .slide { position:absolute; inset:0; opacity:0; pointer-events:none; transition:opacity .85s ease; overflow:hidden; }
        .slide.active { opacity:1; pointer-events:all; }
        .slide-bg { position:absolute; inset:0; background-size:cover; background-position:center; transform:scale(1.04); transition:transform 8s ease-out; }
        .slide.active .slide-bg { transform:scale(1); }
        .overlay { position:absolute; inset:0; }

        /* ── CONTENT WRAPPERS ── */
        .slide-content {
          position:absolute; inset:0; z-index:2; display:flex; flex-direction:column;
          padding: var(--topbar) var(--pad-x) var(--navbar);
          overflow-y:auto; overflow-x:hidden;
          /* custom scrollbar hidden */
          scrollbar-width:none;
        }
        .slide-content::-webkit-scrollbar { display:none; }

        /* Alignment variants */
        .sc-left-center   { justify-content:center; align-items:flex-start; }
        .sc-right-center  { justify-content:center; align-items:flex-end; }
        .sc-center-center { justify-content:center; align-items:center; }
        .sc-bottom-center { justify-content:flex-end; align-items:center; padding-bottom:calc(var(--navbar) + 12px); }

        /* On mobile all right-aligned slides become left-aligned for readability */
        @media(max-width:640px) {
          .sc-right-center { align-items:flex-start; }
          .slide-content   { justify-content:flex-start !important; padding-top:calc(var(--topbar) + 10px); }
          .sc-bottom-center{ justify-content:flex-start; }
        }

        /* ── CONTENT BLOCKS ── */
        .sc-block { display:flex; flex-direction:column; gap:14px; }
        .sc-block-right { align-items:flex-end; text-align:right; }
        .sc-block-center{ align-items:center;   text-align:center; }
        @media(max-width:640px){
          .sc-block-right  { align-items:flex-start; text-align:left; }
          .sc-block-center { align-items:flex-start; text-align:left; }
        }

        .mw640  { max-width:640px; }
        .mw580  { max-width:580px; }
        .mw560  { max-width:560px; }
        .mw520  { max-width:520px; }
        .mw860  { max-width:860px; }
        .mw-full{ max-width:100%; width:100%; }
        @media(max-width:640px){ .mw640,.mw580,.mw560,.mw520,.mw860{ max-width:100%; } }

        /* ── TYPOGRAPHY ── */
        .big-title { font-family:'Orbitron',monospace; font-weight:900; letter-spacing:-1px; line-height:1; color:#fff; text-shadow:0 2px 40px rgba(0,0,0,.8); font-size:clamp(30px,6vw,72px); }
        .hero-title { font-size:clamp(56px,10vw,120px); letter-spacing:-3px; }
        .hero-sub-title { font-family:'Orbitron',monospace; font-size:clamp(14px,2.2vw,28px); font-weight:600; color:rgba(255,255,255,.9); }
        .sub { font-size:clamp(13px,1.5vw,18px); color:rgba(255,255,255,.85); line-height:1.65; font-weight:400; text-shadow:0 1px 20px rgba(0,0,0,.9); }
        .orbitron { font-family:'Orbitron',monospace; font-weight:900; }
        .fs10 { font-size:10px; } .fs11 { font-size:11px; } .fs18 { font-size:clamp(14px,2vw,18px); }
        .fs20 { font-size:clamp(16px,2.2vw,20px); } .fs24 { font-size:clamp(18px,2.5vw,24px); }
        .fs28 { font-size:clamp(22px,3vw,28px); } .fs32 { font-size:clamp(24px,3.5vw,32px); }
        .fs48 { font-size:clamp(32px,5vw,48px); } .fs52 { font-size:clamp(36px,5.5vw,52px); }
        .cyan   { color:var(--cyan); }
        .gold   { color:var(--gold); }
        .purple { color:var(--purple); }
        .dim    { color:rgba(255,255,255,.45); font-size:12px; }
        .white-bold { font-weight:700; color:#fff; font-size:12px; }
        .lh1 { line-height:1; }
        .mb4  { margin-bottom:4px; }
        .mb16 { margin-bottom:16px; }
        .mt4  { margin-top:4px; }

        /* ── TAGS ── */
        .tag { display:inline-block; padding:4px 14px; border-radius:100px; font-size:9px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; border:1px solid; width:fit-content; }
        .tag-cyan   { border-color:rgba(0,212,255,.6);  color:var(--cyan);   background:rgba(0,212,255,.12); }
        .tag-gold   { border-color:rgba(245,158,11,.6); color:var(--gold);   background:rgba(245,158,11,.12); }
        .tag-purple { border-color:rgba(167,139,250,.6);color:var(--purple); background:rgba(124,58,237,.15); }
        .tag-white  { border-color:rgba(255,255,255,.4);color:#fff;          background:rgba(255,255,255,.08); }

        /* ── DIVIDERS ── */
        .divider-line   { width:50px; height:3px; border-radius:2px; flex-shrink:0; }
        .divider-cyan   { background:linear-gradient(90deg,var(--cyan),#0a6fff); }
        .divider-gold   { background:linear-gradient(90deg,var(--gold),#f59e0b); }
        .divider-purple { background:linear-gradient(90deg,var(--purple),#7c3aed); }
        .divider-white  { background:linear-gradient(90deg,#fff,rgba(255,255,255,.3)); }

        /* ── GLASS ── */
        .glass-pill { display:inline-flex; align-items:center; gap:7px; padding:8px 16px; background:rgba(0,0,0,.45); backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,.12); border-radius:100px; color:rgba(255,255,255,.9); font-size:clamp(11px,1.3vw,13px); font-weight:500; white-space:nowrap; }
        .glass-card { background:rgba(0,0,0,.5); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,.1); border-radius:14px; padding:18px 20px; }
        .glass-card-sm { background:rgba(0,0,0,.45); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:13px 16px; }
        .row-center { display:flex; align-items:center; gap:12px; }

        /* ── PILLS ── */
        .pill-row { display:flex; flex-wrap:wrap; gap:8px; }
        .pill-row-center { justify-content:center; }
        .pill-col { display:flex; flex-direction:column; gap:7px; }
        @media(max-width:640px){ .pill-col { flex-direction:row; flex-wrap:wrap; } }

        /* ── INVEST BOX ── */
        .invest-box { display:inline-flex; flex-direction:column; gap:3px; background:rgba(245,158,11,.1); border:1px solid rgba(245,158,11,.35); border-radius:14px; padding:16px 22px; width:fit-content; }
        .invest-label { font-size:9px; letter-spacing:3px; color:var(--gold); text-transform:uppercase; font-weight:700; }
        .invest-num   { font-family:'Orbitron',monospace; font-size:clamp(28px,5vw,44px); font-weight:900; color:var(--gold); line-height:1; }
        .invest-note  { font-size:11px; color:rgba(255,255,255,.5); }

        /* ── FEATURES ── */
        .feat-list { display:flex; flex-direction:column; }
        .feat-item { display:flex; align-items:flex-start; gap:12px; padding:12px 0; border-bottom:1px solid rgba(255,255,255,.07); }
        .feat-item:last-child { border-bottom:none; }
        .feat-icon { font-size:20px; width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:10px; flex-shrink:0; background:rgba(0,212,255,.1); }
        .feat-icon-sm { font-size:22px; flex-shrink:0; }
        .feat-h  { font-size:clamp(12px,1.4vw,14px); font-weight:700; color:#fff; display:block; margin-bottom:2px; }
        .feat-p  { font-size:clamp(10px,1.2vw,12px); color:rgba(255,255,255,.55); line-height:1.5; }
        .col-stack { display:flex; flex-direction:column; gap:8px; }

        /* ── HARDWARE CARDS ── */
        .hw-cards { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; width:100%; }
        .hw-card  { text-align:center; flex:1; min-width:160px; max-width:220px; }
        .hw-card-pop { border-color:rgba(0,212,255,.35) !important; background:rgba(0,212,255,.06) !important; }
        .hw-pop  { font-size:9px; font-weight:700; letter-spacing:2px; color:var(--cyan); text-transform:uppercase; margin-bottom:6px; }
        .hw-sub  { font-size:12px; color:rgba(255,255,255,.6); margin:5px 0 12px; }
        .hw-desc { font-size:11px; color:rgba(255,255,255,.4); margin-bottom:12px; white-space:pre-line; line-height:1.5; }
        .hw-unit { font-size:11px; color:rgba(255,255,255,.4); font-family:'Outfit',sans-serif; font-weight:400; }
        .hw-note { font-size:10px; color:rgba(255,255,255,.28); text-align:center; margin-top:4px; }
        @media(max-width:600px){ .hw-card { min-width:140px; max-width:none; flex:1 1 140px; } }
        @media(max-width:420px){ .hw-cards { flex-direction:column; align-items:center; } .hw-card { max-width:100%; min-width:0; width:100%; } }

        /* ── INTEGRATIONS ── */
        .int-grid { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; max-width:860px; }
        .int-pill { padding:7px 14px; border-radius:100px; background:rgba(0,0,0,.55); backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,.12); color:rgba(255,255,255,.85); font-size:clamp(10px,1.2vw,12px); font-weight:600; display:flex; align-items:center; gap:5px; }

        /* ── PHASE GRID ── */
        .phase-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; width:100%; max-width:960px; }
        .phase-card { background:rgba(0,0,0,.55); backdrop-filter:blur(20px); border-radius:12px; border:1px solid rgba(255,255,255,.1); padding:14px 16px; display:flex; flex-direction:column; gap:6px; }
        .phase-top  { display:flex; align-items:center; gap:8px; margin-bottom:2px; }
        .phase-days { margin-left:auto; letter-spacing:1px; }
        .phase-pay  { font-size:10px; font-weight:700; margin-top:4px; }
        @media(max-width:720px){ .phase-grid { grid-template-columns:repeat(2,1fr); } }
        @media(max-width:420px){ .phase-grid { grid-template-columns:1fr; } }

        /* ── PAYMENT ── */
        .pmt-layout { display:flex; gap:40px; align-items:flex-start; width:100%; max-width:960px; }
        .pmt-rows   { display:flex; flex-direction:column; gap:9px; flex:1; }
        .pmt-row    { display:flex; align-items:center; gap:14px; padding:13px 18px; background:rgba(0,0,0,.5); backdrop-filter:blur(16px); border-radius:12px; border-left:3px solid; border-top:1px solid rgba(255,255,255,.08); border-right:1px solid rgba(255,255,255,.08); border-bottom:1px solid rgba(255,255,255,.08); }
        .pmt-info   { flex:1; }
        .pmt-summary{ background:rgba(0,0,0,.65); backdrop-filter:blur(20px); border:1px solid rgba(245,158,11,.35); border-radius:18px; padding:24px; min-width:240px; }
        .pmt-detail-row   { display:flex; justify-content:space-between; padding:7px 0; }
        .pmt-detail-border{ border-bottom:1px solid rgba(255,255,255,.07); }
        @media(max-width:720px){
          .pmt-layout { flex-direction:column; }
          .pmt-summary{ min-width:0; width:100%; }
        }

        /* ── TECH GRID ── */
        .tech-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; max-width:900px; width:100%; }
        .tech-item  { background:rgba(0,0,0,.6); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:12px 14px; }
        .tech-layer { font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:var(--cyan); margin-bottom:3px; }
        .tech-name  { font-size:clamp(11px,1.3vw,13px); font-weight:700; color:#fff; }
        .tech-desc  { font-size:10px; color:rgba(255,255,255,.4); margin-top:3px; line-height:1.4; }
        @media(max-width:720px){ .tech-grid { grid-template-columns:repeat(2,1fr); } }
        @media(max-width:380px){ .tech-grid { grid-template-columns:1fr 1fr; gap:6px; } }

        /* ── STAT ROW ── */
        .stat-row { display:flex; gap:14px; flex-wrap:wrap; justify-content:center; width:100%; }
        .stat-box  { flex:1; min-width:120px; background:rgba(0,0,0,.6); backdrop-filter:blur(16px); border-radius:12px; padding:14px 20px; text-align:center; }
        .stat-label{ font-size:10px; color:rgba(255,255,255,.5); margin-top:4px; line-height:1.4; }

        /* ── BUTTONS ── */
        .btn-row { display:flex; gap:12px; flex-wrap:wrap; }
        .btn-primary { display:inline-flex; align-items:center; gap:8px; padding:13px 28px; border-radius:100px; background:linear-gradient(135deg,var(--cyan),#0a6fff); color:#000; font-size:12px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; border:none; cursor:pointer; font-family:'Outfit',sans-serif; }
        .btn-outline  { display:inline-flex; align-items:center; gap:8px; padding:13px 28px; border-radius:100px; background:rgba(255,255,255,.07); backdrop-filter:blur(10px); color:#fff; font-size:12px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; border:1px solid rgba(255,255,255,.2); cursor:pointer; font-family:'Outfit',sans-serif; }
        @media(max-width:480px){ .btn-row { flex-direction:column; } .btn-primary,.btn-outline { justify-content:center; } }

        /* ── CTA NOTE ── */
        .cta-note { font-size:10px; color:rgba(255,255,255,.3); line-height:1.8; }

        /* ── TOP BAR ── */
        #topbar { position:fixed; top:0; left:0; right:0; height:var(--topbar); display:flex; align-items:center; padding:0 20px; background:linear-gradient(to bottom,rgba(0,0,0,.72),transparent); z-index:1000; gap:10px; }
        .tb-logo { font-family:'Orbitron',monospace; font-size:14px; font-weight:800; color:var(--cyan); letter-spacing:3px; text-shadow:0 0 20px rgba(0,212,255,.5); flex-shrink:0; }
        .tb-sep  { color:rgba(255,255,255,.15); flex-shrink:0; }
        .tb-brand{ font-size:11px; color:rgba(255,255,255,.35); letter-spacing:1px; flex-shrink:0; }
        .tb-meta { font-size:11px; color:rgba(255,255,255,.4); letter-spacing:.5px; margin-left:auto; }
        .tb-dot  { width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 8px #22c55e; animation:blink 2s infinite; margin-left:8px; flex-shrink:0; }
        @media(max-width:600px){ .tb-meta { display:none; } .tb-brand { display:none; } }
        @media(max-width:380px){ .tb-sep  { display:none; } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

        /* ── NAVBAR ── */
        #navbar { position:fixed; bottom:0; left:0; right:0; height:var(--navbar); display:flex; align-items:center; justify-content:center; gap:14px; background:linear-gradient(to top,rgba(0,0,0,.85),transparent); z-index:1000; padding:0 16px; }
        .nav-arrow { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(255,255,255,.3); background:rgba(255,255,255,.08); backdrop-filter:blur(10px); color:#fff; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all .2s; }
        .nav-arrow:hover,.nav-arrow:active { background:rgba(0,212,255,.25); border-color:rgba(0,212,255,.6); }
        .dots-row { display:flex; gap:5px; align-items:center; overflow-x:auto; max-width:calc(100vw - 140px); scrollbar-width:none; }
        .dots-row::-webkit-scrollbar { display:none; }
        .dot { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.25); cursor:pointer; transition:all .3s; flex-shrink:0; }
        .dot.active { background:var(--cyan); width:20px; border-radius:3px; box-shadow:0 0 8px rgba(0,212,255,.6); }
        .slide-num { font-family:'Orbitron',monospace; font-size:10px; color:rgba(255,255,255,.4); letter-spacing:2px; min-width:40px; text-align:center; flex-shrink:0; }

        /* ── PROGRESS ── */
        #progress-bar { position:fixed; top:0; left:0; height:3px; background:linear-gradient(90deg,var(--cyan),#0a6fff,var(--purple)); transition:width .4s ease; z-index:2000; box-shadow:0 0 10px rgba(0,212,255,.6); }
      `}</style>

      {/* Progress bar */}
      <div id="progress-bar" style={{width: pct}} />

      {/* Top bar */}
      <div id="topbar">
        <span className="tb-logo">⬡ JARVIS</span>
        <span className="tb-sep">·</span>
        <span className="tb-brand">Smarter Software Inc. × US Robots</span>
        <span className="tb-meta">Prepared for Michael Yorga · SSI-USR-2026-001</span>
        <div className="tb-dot" />
      </div>

      {/* Deck */}
      <div className="deck">
        {SLIDES.map((slide, i) => (
          <div key={slide.id} className={`slide${i === current ? ' active' : ''}`}>
            <div className="slide-bg" style={{backgroundImage:`url('${slide.img}')`}} />
            <div className="overlay" style={{background: slide.overlay}} />
            <div className={`slide-content ${slide.cls}`}>
              <SlideContent idx={i} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div id="navbar">
        <button className="nav-arrow" onClick={() => goTo(current - 1)} aria-label="Previous">←</button>
        <div className="dots-row">
          {SLIDES.map((_, i) => (
            <div key={i} className={`dot${i === current ? ' active' : ''}`} onClick={() => goTo(i)} />
          ))}
        </div>
        <button className="nav-arrow" onClick={() => goTo(current + 1)} aria-label="Next">→</button>
        <div className="slide-num">{current + 1} / {TOTAL}</div>
      </div>
    </>
  );
}
