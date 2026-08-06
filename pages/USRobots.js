import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';

const SLIDES = [
  {
    id: 's1', img: '/usrobots/slide01.jpg',
    overlay: 'linear-gradient(105deg, rgba(0,0,0,0.82) 0%, rgba(5,13,40,0.7) 40%, rgba(0,0,0,0.25) 100%)',
    contentStyle: { justifyContent: 'center', padding: '100px 80px' },
  },
  {
    id: 's2', img: '/usrobots/slide02.jpg',
    overlay: 'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.3) 100%)',
    contentStyle: { justifyContent: 'center', padding: '100px 80px' },
  },
  {
    id: 's3', img: '/usrobots/slide03.jpg',
    overlay: 'linear-gradient(to right, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.85) 100%)',
    contentStyle: { justifyContent: 'center', alignItems: 'flex-end', padding: '100px 80px' },
  },
  {
    id: 's4', img: '/usrobots/slide04.jpg',
    overlay: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.2) 100%)',
    contentStyle: { justifyContent: 'flex-end', alignItems: 'center', padding: '0 40px 90px' },
  },
  {
    id: 's5', img: '/usrobots/slide05.jpg',
    overlay: 'rgba(0,0,0,0.55)',
    contentStyle: { justifyContent: 'center', alignItems: 'center', padding: '100px 60px' },
  },
  {
    id: 's6', img: '/usrobots/slide06.jpg',
    overlay: 'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.1) 100%)',
    contentStyle: { justifyContent: 'center', padding: '100px 80px' },
  },
  {
    id: 's7', img: '/usrobots/slide07.jpg',
    overlay: 'linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.05) 100%)',
    contentStyle: { justifyContent: 'center', alignItems: 'flex-end', padding: '100px 80px' },
  },
  {
    id: 's8', img: '/usrobots/slide08.jpg',
    overlay: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.1) 100%)',
    contentStyle: { justifyContent: 'flex-end', alignItems: 'center', padding: '0 60px 90px' },
  },
  {
    id: 's9', img: '/usrobots/slide09.jpg',
    overlay: 'rgba(0,0,0,0.6)',
    contentStyle: { justifyContent: 'center', alignItems: 'center', padding: '90px 60px' },
  },
  {
    id: 's10', img: '/usrobots/slide10.jpg',
    overlay: 'linear-gradient(135deg, rgba(0,0,0,0.88) 0%, rgba(10,5,0,0.6) 100%)',
    contentStyle: { justifyContent: 'center', alignItems: 'center', padding: '90px 60px' },
  },
  {
    id: 's11', img: '/usrobots/slide11.jpg',
    overlay: 'rgba(0,0,0,0.6)',
    contentStyle: { justifyContent: 'center', alignItems: 'center', padding: '90px 60px' },
  },
  {
    id: 's12', img: '/usrobots/slide12.jpg',
    overlay: 'linear-gradient(to left, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.1) 100%)',
    contentStyle: { justifyContent: 'center', alignItems: 'flex-end', padding: '100px 80px' },
  },
];

const TOTAL = SLIDES.length;

function SlideContent({ index }) {
  const Tag = ({ type, children }) => <div className={`tag tag-${type}`}>{children}</div>;
  const BigTitle = ({ style, children }) => <div className="big-title" style={style}>{children}</div>;
  const Sub = ({ style, children }) => <div className="sub" style={style}>{children}</div>;
  const Pill = ({ children }) => <span className="glass-pill">{children}</span>;
  const Divider = ({ color }) => <div className={`divider-line divider-${color}`}></div>;
  const GlassCardSm = ({ children }) => <div className="glass-card-sm" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>{children}</div>;

  switch (index) {
    case 0: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
        <Tag type="cyan">Smarter Software Inc. · Exclusive Proposal for US Robots</Tag>
        <BigTitle style={{ fontSize: 'clamp(64px,9vw,120px)' }}><span className="cyan">JAR</span><span style={{ color: '#fff' }}>VIS</span></BigTitle>
        <BigTitle style={{ fontSize: 'clamp(18px,2.4vw,32px)', letterSpacing: '0px', fontWeight: '600', opacity: '0.9', fontFamily: "'Outfit',sans-serif" }}>AI-Powered Personal Assistant</BigTitle>
        <Sub style={{ maxWidth: '560px' }}>The world's first AI home assistant that looks and feels like a real person — living inside a premium floor-standing display, with a companion app always in your pocket.</Sub>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Pill>🖥️ 49" · 55" · 65" Displays</Pill>
          <Pill>🤖 AI Video Avatar</Pill>
          <Pill>📱 iOS + Android App</Pill>
          <Pill>⏱️ 90-Day Delivery</Pill>
        </div>
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '14px', padding: '18px 24px', width: 'fit-content' }}>
          <span style={{ fontSize: '10px', letterSpacing: '3px', color: '#fbbf24', textTransform: 'uppercase', fontWeight: '700' }}>Total Investment</span>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: '40px', fontWeight: '900', color: '#fbbf24', lineHeight: '1' }}>$100,000</span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>4 payments of $25,000 · First due on signing</span>
        </div>
      </div>
    );

    case 1: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
        <Tag type="white">The Problem</Tag>
        <BigTitle style={{ fontSize: 'clamp(38px,5.5vw,72px)' }}>Your Life Is<br /><span className="cyan">Scattered</span><br />Everywhere</BigTitle>
        <Divider color="cyan" />
        <Sub>The average person juggles <strong style={{ color: '#fff' }}>14+ apps</strong> daily. Emails pile up. Appointments are missed. Reminders get ignored. Your digital life is chaos — and no single product has solved it.</Sub>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <GlassCardSm><span style={{ fontSize: '24px' }}>📱</span><div><div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>14+ apps to manage your life</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Email, Calendar, Tasks, Smart Home, Music, Fitness…</div></div></GlassCardSm>
          <GlassCardSm><span style={{ fontSize: '24px' }}>🔔</span><div><div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>100+ notifications per day</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Most go unread. Important things get buried.</div></div></GlassCardSm>
          <GlassCardSm><span style={{ fontSize: '24px' }}>🤖</span><div><div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>No AI assistant feels human</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Alexa and Siri are voices in a box. JARVIS is a person.</div></div></GlassCardSm>
        </div>
        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '18px', fontWeight: '700', color: '#00d4ff' }}>JARVIS solves all of this. In one product.</div>
      </div>
    );

    case 2: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '560px', textAlign: 'right', alignItems: 'flex-end' }}>
        <Tag type="cyan">The AI Avatar</Tag>
        <BigTitle style={{ fontSize: 'clamp(36px,5vw,68px)' }}>She Looks,<br />Talks, and<br /><span className="cyan">Feels Real</span></BigTitle>
        <Divider color="cyan" />
        <Sub style={{ textAlign: 'right' }}>JARVIS features a photorealistic AI avatar — beautiful, voice-activated, lip-synced, and emotionally intelligent. She knows your schedule, your habits, and your name.</Sub>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <Pill>🎤 Wake Word Detection</Pill>
          <Pill>💬 Real-Time Lip Sync</Pill>
          <Pill>🧠 GPT-4o Conversational AI</Pill>
          <Pill>🔊 ElevenLabs Hyper-Realistic Voice</Pill>
        </div>
      </div>
    );

    case 3: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', width: '100%' }}>
        <Tag type="white">The Hardware</Tag>
        <BigTitle style={{ fontSize: 'clamp(34px,4.5vw,60px)' }}>Three Premium Sizes.<br />One <span className="cyan">Powerful Platform</span>.</BigTitle>
        <Divider color="white" />
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[{ size: '49"', sub: 'Model A · Standard', desc: 'Android · HD LCD · Built-in Speaker\nTempered Glass · Anti-collision Base', price: '$391', c: '#00d4ff', pop: null },
            { size: '55"', sub: 'Model B · Pro', desc: 'Android · HD LCD · Speaker\nTempered Glass · Heat Release', price: '$457', c: '#00d4ff', pop: '⭐ Most Popular' },
            { size: '65"', sub: 'Model C · Elite', desc: 'Android · HD LCD · High-Quality Speaker\nTempered Glass · Dust-Proof · Anti-static', price: '$652', c: '#fbbf24', pop: null }].map(h => (
            <div key={h.size} className="glass-card" style={{ textAlign: 'center', minWidth: '200px', ...(h.pop ? { borderColor: 'rgba(0,212,255,0.35)', background: 'rgba(0,212,255,0.06)' } : {}) }}>
              {h.pop && <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '2px', color: '#00d4ff', textTransform: 'uppercase', marginBottom: '6px' }}>{h.pop}</div>}
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '48px', fontWeight: '900', color: h.c, lineHeight: '1' }}>{h.size}</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '6px 0 14px' }}>{h.sub}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '12px', whiteSpace: 'pre-line' }}>{h.desc}</div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '24px', fontWeight: '700', color: '#fbbf24' }}>{h.price}<span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: "'Outfit',sans-serif", fontWeight: '400' }}>/unit</span></div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Hardware sourced from manufacturer · JARVIS software pre-loaded by Smarter Software Inc. · Import & logistics responsibility of US Robots</div>
      </div>
    );

    case 4: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', width: '100%' }}>
        <Tag type="cyan">The Connected Universe</Tag>
        <BigTitle style={{ fontSize: 'clamp(32px,4.5vw,62px)' }}>JARVIS Connects to<br /><span className="cyan">Everything You Use</span></BigTitle>
        <Divider color="cyan" />
        <div className="int-grid">
          {['📨 Gmail','📅 Google Calendar','🔵 Outlook','🍎 Apple Mail','✅ Todoist','📝 Notion','🏠 Amazon Alexa','🔊 Google Home','🏡 Apple HomeKit','🎵 Spotify','🎶 Apple Music','🚗 Uber','🍔 DoorDash','📦 Amazon Tracking','💪 Fitbit','❤️ Apple Health','🏃 Garmin','🌤️ Weather','📰 News Feed','💰 Finance Alerts','📸 Family Photos','🔒 Smart Locks','💡 Smart Lights','📺 Smart TV','🌡️ Thermostat'].map(s => (
            <div key={s} className="int-pill">{s}</div>
          ))}
        </div>
        <Sub style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)' }}>25+ integrations at launch. One intelligent hub. Zero friction.</Sub>
      </div>
    );

    case 5: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '560px' }}>
        <Tag type="cyan">Smart Home Control</Tag>
        <BigTitle style={{ fontSize: 'clamp(34px,5vw,66px)' }}>Your Home.<br /><span className="cyan">Your Command.</span></BigTitle>
        <Divider color="cyan" />
        <Sub>Just say it. JARVIS controls every smart device in your home — lights, locks, temperature, TV, cameras — all through natural voice conversation.</Sub>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[{ icon: '💡', h: 'Lighting Control', p: '"JARVIS, set the living room to movie mode." Done.' }, { icon: '🔒', h: 'Security & Locks', p: 'Lock/unlock doors, check cameras, arm/disarm systems by voice.' }, { icon: '🌡️', h: 'Climate & Energy', p: 'Smart thermostat control. JARVIS learns your comfort preferences.' }].map(f => (
            <div key={f.h} className="feat-item"><div className="feat-icon">{f.icon}</div><div><h4 style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '3px' }}>{f.h}</h4><p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.5' }}>{f.p}</p></div></div>
          ))}
        </div>
        <Pill>Compatible: Alexa · Google Home · HomeKit · SmartThings</Pill>
      </div>
    );

    case 6: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '520px', alignItems: 'flex-end', textAlign: 'right' }}>
        <Tag type="purple">Mobile Companion App</Tag>
        <BigTitle style={{ fontSize: 'clamp(32px,4.8vw,64px)' }}>JARVIS Goes<br /><span className="purple">Everywhere</span><br />You Do</BigTitle>
        <div className="divider-line divider-purple" style={{ marginLeft: 'auto' }}></div>
        <Sub style={{ textAlign: 'right' }}>Leave the house and JARVIS comes with you. The iOS + Android companion app keeps you fully connected — same AI, same intelligence, everywhere.</Sub>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <Pill>🔔 Real-Time Push Notifications</Pill>
          <Pill>🔁 Instant Kiosk Sync</Pill>
          <Pill>🎤 Voice Commands On-The-Go</Pill>
          <Pill>🔐 Face ID · Fingerprint Login</Pill>
          <Pill>📍 Location-Aware Smart Alerts</Pill>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}><Pill>🍎 iOS App Store</Pill><Pill>🤖 Google Play</Pill></div>
      </div>
    );

    case 7: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
        <Tag type="purple">Exclusive Feature</Tag>
        <BigTitle style={{ fontSize: 'clamp(32px,5vw,68px)' }}>Virtual <span className="purple">Collaborative</span><br />Painting Studio</BigTitle>
        <div className="divider-line divider-purple" style={{ margin: '0 auto' }}></div>
        <Sub style={{ textAlign: 'center', maxWidth: '680px' }}>Up to 8 users paint together simultaneously across any device — kiosk or phone — with real-time sync, AI art generation, and full time-lapse replay. No other product has this.</Sub>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pill>🎨 Real-Time Multi-User Canvas</Pill>
          <Pill>🤖 AI Art Generation by Voice</Pill>
          <Pill>⏯️ Time-Lapse Replay Mode</Pill>
          <Pill>✏️ Full Brush + Layer Toolkit</Pill>
          <Pill>🖼️ Gallery + Social Sharing</Pill>
          <Pill>📱 Cross-Device Sync</Pill>
        </div>
      </div>
    );

    case 8: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', width: '100%' }}>
        <Tag type="gold">90-Day Roadmap</Tag>
        <BigTitle style={{ fontSize: 'clamp(30px,4.5vw,60px)' }}>From Signing to <span className="gold">Launch</span><br />in 90 Days</BigTitle>
        <Divider color="gold" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', maxWidth: '1000px', width: '100%' }}>
          {[
            { n: '1', c: '#00d4ff', d: 'Days 1–20', t: 'Foundation', p: 'Cloud infra · Android setup · AI APIs · Auth system · DB schema', pay: '💳 $25K due on signing' },
            { n: '2', c: '#60a5fa', d: 'Days 21–45', t: 'AI Engine', p: 'Avatar · Voice · Email/Calendar · Notifications · Display UI', pay: '💳 $25K — Avatar live on kiosk' },
            { n: '3', c: '#a78bfa', d: 'Days 46–70', t: 'Mobile + Features', p: 'iOS/Android app · Integrations · Painting Studio · Beta testing', pay: '💳 $25K — Mobile beta live' },
            { n: '4', c: '#fbbf24', d: 'Days 71–90', t: 'Polish & Launch', p: 'QA · App Store approval · Security audit · Production go-live', pay: '💳 $25K — Final delivery' },
          ].map(ph => (
            <div key={ph.n} className="phase-pill" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '32px', fontWeight: '900', color: ph.c }}>{ph.n}</div>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '10px', fontWeight: '700', color: ph.c, marginLeft: 'auto' }}>{ph.d}</div>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>{ph.t}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.5' }}>{ph.p}</div>
              </div>
              <div style={{ fontSize: '10px', color: ph.c, fontWeight: '700' }}>{ph.pay}</div>
            </div>
          ))}
        </div>
      </div>
    );

    case 9: return (
      <div style={{ display: 'flex', gap: '60px', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '1100px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: '1', maxWidth: '540px' }}>
          <Tag type="gold">Investment & Payment Schedule</Tag>
          <BigTitle style={{ fontSize: 'clamp(28px,3.8vw,52px)' }}>Four Milestone-<br />Based <span className="gold">Payments</span></BigTitle>
          <Divider color="gold" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { n: '01', c: '#00d4ff', t: 'Contract Signing', p: 'Due immediately upon execution · Initiates all work' },
              { n: '02', c: '#60a5fa', t: 'AI Avatar Milestone', p: 'Working JARVIS on kiosk display · Day 45' },
              { n: '03', c: '#a78bfa', t: 'Mobile Beta Milestone', p: 'iOS + Android beta delivered · Day 70' },
              { n: '04', c: '#fbbf24', t: 'Final Delivery', p: 'Launch-ready product · App stores live · Day 90' },
            ].map(p => (
              <div key={p.n} className="pmt-row" style={{ borderLeftColor: p.c }}>
                <div className="pmt-num-label" style={{ color: p.c }}>{p.n}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>{p.t}</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{p.p}</div></div>
                <div className="pmt-amount">$25,000</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '280px' }}>
          <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '20px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', letterSpacing: '3px', color: '#fbbf24', textTransform: 'uppercase', fontWeight: '700', marginBottom: '8px' }}>Total Contract Value</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '56px', fontWeight: '900', color: '#fbbf24', lineHeight: '1', marginBottom: '20px' }}>$100K</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
              {[['Duration', '90 Days'], ['Platforms', 'Kiosk + iOS + Android'], ['Cloud Infra', '90 Days Included'], ['Support', '30 Days Post-Launch'], ['IP Ownership', 'Full Transfer']].map(([k, v], i) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.07)' : 'none', fontSize: '12px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.45)' }}>{k}</span>
                  <span style={{ fontWeight: '700', color: k === 'IP Ownership' ? '#00d4ff' : '#fff' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

    case 10: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', width: '100%' }}>
        <Tag type="cyan">Technology + Market</Tag>
        <BigTitle style={{ fontSize: 'clamp(28px,4.2vw,58px)' }}>Enterprise-Grade Stack.<br /><span className="cyan">Massive Market Opportunity.</span></BigTitle>
        <Divider color="cyan" />
        <div className="tech-grid">
          {[
            { l: 'AI Brain', n: 'GPT-4o + Gemini', d: 'Dual-engine LLM with persona memory' },
            { l: 'Avatar', n: 'D-ID / Synthesia', d: 'Photorealistic lip-sync pipeline' },
            { l: 'Voice', n: 'Whisper + ElevenLabs', d: 'Real-time ASR + ultra-human TTS' },
            { l: 'Mobile', n: 'React Native', d: 'Single codebase · iOS + Android' },
            { l: 'Kiosk OS', n: 'Android (AOSP)', d: 'Custom ROM for always-on display' },
            { l: 'Backend', n: 'Node.js + Fastify', d: 'REST + GraphQL API layer' },
            { l: 'Cloud', n: 'AWS', d: '99.9% SLA · Auto-scaling · CDN' },
            { l: 'Real-Time', n: 'WebSockets', d: 'Instant kiosk ↔ phone sync' },
          ].map(t => (
            <div key={t.n} className="tech-item"><div className="tech-layer">{t.l}</div><div className="tech-name">{t.n}</div><div className="tech-desc">{t.d}</div></div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { v: '$157B', l: 'Smart Home Market by 2029', c: 'rgba(0,212,255,0.2)', vc: '#00d4ff' },
            { v: '85M+', l: 'US Smart Home Households', c: 'rgba(245,158,11,0.2)', vc: '#fbbf24' },
            { v: '0', l: 'Direct Competitors (This Exact Product)', c: 'rgba(167,139,250,0.2)', vc: '#a78bfa' },
          ].map(s => (
            <div key={s.v} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)', border: `1px solid ${s.c}`, borderRadius: '12px', padding: '16px 28px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '32px', fontWeight: '900', color: s.vc }}>{s.v}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    );

    case 11: return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '560px', alignItems: 'flex-end', textAlign: 'right' }}>
        <Tag type="gold">Let's Build the Future</Tag>
        <BigTitle style={{ fontSize: 'clamp(30px,4.5vw,62px)' }}>Ready to <span className="gold">Sign</span> and<br />Change the World?</BigTitle>
        <div className="divider-line divider-gold" style={{ marginLeft: 'auto' }}></div>
        <Sub style={{ textAlign: 'right' }}>This proposal is addressed exclusively to <strong style={{ color: '#fff' }}>Michael Yorga, US Robots</strong>. Smarter Software Inc. is ready to begin immediately upon contract execution and receipt of Payment 1.</Sub>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <Pill>📋 Contract: SSI-USR-2026-001</Pill>
          <Pill>📅 Proposed Start: Upon Signing</Pill>
          <Pill>📧 Schonesanfleet@yahoo.com</Pill>
          <Pill>🎯 90-Day Delivery · $100,000 Total</Pill>
        </div>
        <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-end' }}>
          <button className="btn-primary">✍️ Sign & Get Started</button>
          <button className="btn-outline">📞 Schedule a Call</button>
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'right', lineHeight: '1.8' }}>
          Smarter Software Inc. · Prepared August 6, 2026<br />
          Confidential — For US Robots · Michael Yorga Use Only
        </div>
      </div>
    );

    default: return null;
  }
}

export default function USRobots() {
  const [current, setCurrent] = useState(0);

  const goTo = useCallback((n) => {
    if (n < 0 || n >= TOTAL) return;
    setCurrent(n);
  }, []);

  const prev = useCallback(() => goTo(current - 1), [current, goTo]);
  const next = useCallback(() => goTo(current + 1), [current, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handle = (e) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); setCurrent(c => Math.min(c + 1, TOTAL - 1)); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); setCurrent(c => Math.max(c - 1, 0)); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  // Touch swipe
  useEffect(() => {
    let tx = 0;
    const ts = (e) => { tx = e.touches[0].clientX; };
    const te = (e) => {
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 50) setCurrent(c => dx < 0 ? Math.min(c + 1, TOTAL - 1) : Math.max(c - 1, 0));
    };
    window.addEventListener('touchstart', ts, { passive: true });
    window.addEventListener('touchend', te, { passive: true });
    return () => { window.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te); };
  }, []);

  const pct = ((current + 1) / TOTAL * 100).toFixed(2) + '%';

  return (
    <>
      <Head>
        <title>JARVIS AI Personal Assistant — Proposal for US Robots | Smarter Software Inc.</title>
        <meta name="description" content="Official proposal from Smarter Software Inc. to US Robots for the JARVIS AI-Powered Personal Assistant." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100;400;500;600;700;800;900&family=Orbitron:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { overflow: hidden; height: 100%; background: #000; }
        #__next { height: 100%; }
        body { font-family: 'Outfit', sans-serif; user-select: none; -webkit-font-smoothing: antialiased; }

        .tag { display: inline-block; padding: 5px 16px; border-radius: 100px; font-size: 10px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; border: 1px solid; width: fit-content; }
        .tag-cyan  { border-color: rgba(0,212,255,0.6); color: #00d4ff; background: rgba(0,212,255,0.12); }
        .tag-gold  { border-color: rgba(245,158,11,0.6); color: #fbbf24; background: rgba(245,158,11,0.12); }
        .tag-purple{ border-color: rgba(167,139,250,0.6); color: #a78bfa; background: rgba(124,58,237,0.15); }
        .tag-white { border-color: rgba(255,255,255,0.4); color: #fff; background: rgba(255,255,255,0.08); }

        .big-title { font-family: 'Orbitron', monospace; font-weight: 900; letter-spacing: -2px; line-height: 0.95; color: #fff; text-shadow: 0 2px 40px rgba(0,0,0,0.8); }
        .sub { font-size: clamp(14px,1.6vw,20px); color: rgba(255,255,255,0.85); line-height: 1.6; font-weight: 400; text-shadow: 0 1px 20px rgba(0,0,0,0.9); max-width: 680px; }
        .cyan   { color: #00d4ff; }
        .gold   { color: #fbbf24; }
        .purple { color: #a78bfa; }

        .divider-line   { width: 60px; height: 3px; border-radius: 2px; }
        .divider-cyan   { background: linear-gradient(90deg, #00d4ff, #0a6fff); }
        .divider-gold   { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
        .divider-purple { background: linear-gradient(90deg, #a78bfa, #7c3aed); }
        .divider-white  { background: linear-gradient(90deg, #fff, rgba(255,255,255,0.3)); }

        .glass-pill { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; background: rgba(0,0,0,0.45); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.12); border-radius: 100px; color: rgba(255,255,255,0.9); font-size: 13px; font-weight: 500; }
        .glass-card { background: rgba(0,0,0,0.5); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 22px 24px; }
        .glass-card-sm { background: rgba(0,0,0,0.45); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px 18px; }

        .int-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 900px; }
        .int-pill { padding: 8px 16px; border-radius: 100px; background: rgba(0,0,0,0.55); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; }

        .feat-item { display: flex; align-items: flex-start; gap: 14px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .feat-item:last-child { border-bottom: none; }
        .feat-icon { font-size: 22px; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; background: rgba(0,212,255,0.1); }

        .phase-pill { display: flex; align-items: center; gap: 14px; padding: 16px 22px; background: rgba(0,0,0,0.55); backdrop-filter: blur(20px); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); }

        .pmt-row { display: flex; align-items: center; gap: 18px; padding: 16px 22px; background: rgba(0,0,0,0.5); backdrop-filter: blur(16px); border-radius: 12px; border-left: 3px solid; border-top: 1px solid rgba(255,255,255,0.08); border-right: 1px solid rgba(255,255,255,0.08); border-bottom: 1px solid rgba(255,255,255,0.08); }
        .pmt-num-label { font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 700; width: 30px; }
        .pmt-amount { font-family: 'Orbitron', monospace; font-size: 22px; font-weight: 900; color: #fbbf24; }

        .tech-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; max-width: 900px; }
        .tech-item { background: rgba(0,0,0,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 16px; }
        .tech-layer { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #00d4ff; margin-bottom: 4px; }
        .tech-name  { font-size: 13px; font-weight: 700; color: #fff; }
        .tech-desc  { font-size: 10px; color: rgba(255,255,255,0.45); margin-top: 3px; line-height: 1.4; }

        .btn-primary { display: inline-flex; align-items: center; gap: 10px; padding: 16px 36px; border-radius: 100px; background: linear-gradient(135deg, #00d4ff, #0a6fff); color: #000; font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; border: none; cursor: pointer; font-family: 'Outfit', sans-serif; }
        .btn-outline { display: inline-flex; align-items: center; gap: 10px; padding: 16px 36px; border-radius: 100px; background: rgba(255,255,255,0.07); backdrop-filter: blur(10px); color: #fff; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; font-family: 'Outfit', sans-serif; }

        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes pf { 0%{transform:translateY(100vh) scale(0);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(-50px) scale(1);opacity:0} }
        .p { position: absolute; border-radius: 50%; animation: pf linear infinite; opacity: 0; }
      `}</style>

      {/* Progress bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, height: '3px', width: pct, background: 'linear-gradient(90deg, #00d4ff, #0a6fff, #a78bfa)', transition: 'width 0.4s ease', zIndex: 2000, boxShadow: '0 0 12px rgba(0,212,255,0.6)' }} />

      {/* Top bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '58px', display: 'flex', alignItems: 'center', padding: '0 36px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)', zIndex: 1000, gap: '16px' }}>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: '14px', fontWeight: '800', color: '#00d4ff', letterSpacing: '3px', textShadow: '0 0 20px rgba(0,212,255,0.5)' }}>⬡ JARVIS</span>
        <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4px' }}>·</span>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', letterSpacing: '1px' }}>Smarter Software Inc. × US Robots</span>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', marginLeft: 'auto' }}>Prepared for Michael Yorga · SSI-USR-2026-001</span>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'blink 2s infinite', marginLeft: '10px' }} />
      </div>

      {/* Deck */}
      <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
        {SLIDES.map((slide, i) => (
          <div key={slide.id} style={{ position: 'absolute', inset: 0, opacity: i === current ? 1 : 0, pointerEvents: i === current ? 'all' : 'none', transition: 'opacity 0.9s ease', overflow: 'hidden' }}>
            {/* BG image */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${slide.img}')`, backgroundSize: 'cover', backgroundPosition: 'center', transform: i === current ? 'scale(1)' : 'scale(1.04)', transition: 'transform 8s ease-out' }} />
            {/* Overlay */}
            <div style={{ position: 'absolute', inset: 0, background: slide.overlay }} />
            {/* Content */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', zIndex: 2, ...slide.contentStyle }}>
              <SlideContent index={i} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)', zIndex: 1000, padding: '0 40px' }}>
        <button onClick={prev} style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>←</button>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => goTo(i)} style={{ width: i === current ? '22px' : '7px', height: '7px', borderRadius: i === current ? '3.5px' : '50%', background: i === current ? '#00d4ff' : 'rgba(255,255,255,0.25)', cursor: 'pointer', transition: 'all 0.3s', boxShadow: i === current ? '0 0 10px rgba(0,212,255,0.6)' : 'none', flexShrink: 0 }} />
          ))}
        </div>
        <button onClick={next} style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>→</button>
        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '11px', color: 'rgba(255,255,255,0.45)', letterSpacing: '2px', minWidth: '44px', textAlign: 'center', flexShrink: 0 }}>{current + 1} / {TOTAL}</div>
      </div>
    </>
  );
}
