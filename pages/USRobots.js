import Head from 'next/head';

export default function USRobots() {
  return (
    <>
      <Head>
        <title>JARVIS AI Personal Assistant — Proposal for US Robots | Smarter Software Inc.</title>
        <meta name="description" content="Official proposal from Smarter Software Inc. to US Robots for the JARVIS AI-Powered Personal Assistant — 90-day development, $100,000 investment." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100;200;300;400;500;600;700;800;900&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { overflow: hidden; height: 100%; background: #000; }
        #__next { height: 100%; }

        body { font-family: 'Outfit', sans-serif; user-select: none; }

        #deck { width: 100vw; height: 100vh; position: relative; }

        .slide { position: absolute; inset: 0; opacity: 0; pointer-events: none; transition: opacity 0.9s ease; overflow: hidden; }
        .slide.active { opacity: 1; pointer-events: all; }

        .slide-bg {
          position: absolute; inset: 0;
          background-size: cover; background-position: center; background-repeat: no-repeat;
          transform: scale(1.04); transition: transform 8s ease-out;
        }
        .slide.active .slide-bg { transform: scale(1); }

        .overlay { position: absolute; inset: 0; pointer-events: none; }
        .slide-content { position: absolute; inset: 0; display: flex; flex-direction: column; z-index: 2; }

        .animate-in { opacity: 0; transform: translateY(24px); transition: opacity 0.7s ease, transform 0.7s ease; }
        .slide.active .animate-in { opacity: 1; transform: translateY(0); }
        .slide.active .animate-in:nth-child(1) { transition-delay: 0.2s; }
        .slide.active .animate-in:nth-child(2) { transition-delay: 0.4s; }
        .slide.active .animate-in:nth-child(3) { transition-delay: 0.55s; }
        .slide.active .animate-in:nth-child(4) { transition-delay: 0.7s; }
        .slide.active .animate-in:nth-child(5) { transition-delay: 0.85s; }
        .slide.active .animate-in:nth-child(6) { transition-delay: 1.0s; }

        #navbar {
          position: fixed; bottom: 0; left: 0; right: 0; height: 72px;
          display: flex; align-items: center; justify-content: center; gap: 20px;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%);
          z-index: 1000; padding: 0 40px;
        }
        .nav-arrow {
          width: 44px; height: 44px; border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.08); backdrop-filter: blur(10px);
          color: #fff; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; flex-shrink: 0;
        }
        .nav-arrow:hover { background: rgba(0,212,255,0.25); border-color: rgba(0,212,255,0.6); box-shadow: 0 0 20px rgba(0,212,255,0.3); }

        .dots-row { display: flex; gap: 6px; align-items: center; }
        .dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.25); cursor: pointer; transition: all 0.3s; flex-shrink: 0; }
        .dot.active { background: #00d4ff; width: 22px; border-radius: 3.5px; box-shadow: 0 0 10px rgba(0,212,255,0.6); }

        .slide-num { font-family: 'Orbitron', monospace; font-size: 11px; color: rgba(255,255,255,0.45); letter-spacing: 2px; min-width: 44px; text-align: center; flex-shrink: 0; }

        #topbar {
          position: fixed; top: 0; left: 0; right: 0; height: 58px;
          display: flex; align-items: center; padding: 0 36px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%);
          z-index: 1000; gap: 16px;
        }
        .tb-logo { font-family: 'Orbitron', monospace; font-size: 14px; font-weight: 800; color: #00d4ff; letter-spacing: 3px; text-shadow: 0 0 20px rgba(0,212,255,0.5); }
        .tb-sep { color: rgba(255,255,255,0.15); margin: 0 4px; }
        .tb-meta { font-size: 12px; color: rgba(255,255,255,0.4); letter-spacing: 1px; margin-left: auto; }
        .tb-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: blink 2s infinite; margin-left: 10px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

        .tag { display: inline-block; padding: 5px 16px; border-radius: 100px; font-size: 10px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; border: 1px solid; width: fit-content; }
        .tag-cyan { border-color: rgba(0,212,255,0.6); color: #00d4ff; background: rgba(0,212,255,0.12); }
        .tag-gold { border-color: rgba(245,158,11,0.6); color: #fbbf24; background: rgba(245,158,11,0.12); }
        .tag-purple { border-color: rgba(167,139,250,0.6); color: #a78bfa; background: rgba(124,58,237,0.15); }
        .tag-white { border-color: rgba(255,255,255,0.4); color: #fff; background: rgba(255,255,255,0.08); }

        .big-title { font-family: 'Orbitron', monospace; font-weight: 900; letter-spacing: -2px; line-height: 0.95; color: #fff; text-shadow: 0 2px 40px rgba(0,0,0,0.8); }
        .sub { font-size: clamp(14px, 1.6vw, 20px); color: rgba(255,255,255,0.85); line-height: 1.6; font-weight: 400; text-shadow: 0 1px 20px rgba(0,0,0,0.9); max-width: 680px; }
        .cyan { color: #00d4ff; } .gold { color: #fbbf24; } .purple { color: #a78bfa; }

        .divider-line { width: 60px; height: 3px; border-radius: 2px; }
        .divider-cyan { background: linear-gradient(90deg, #00d4ff, #0a6fff); }
        .divider-gold { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
        .divider-purple { background: linear-gradient(90deg, #a78bfa, #7c3aed); }
        .divider-white { background: linear-gradient(90deg, #fff, rgba(255,255,255,0.3)); }

        .glass-pill { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; background: rgba(0,0,0,0.45); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.12); border-radius: 100px; color: rgba(255,255,255,0.9); font-size: 13px; font-weight: 500; }
        .glass-card { background: rgba(0,0,0,0.5); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 22px 24px; }
        .glass-card-sm { background: rgba(0,0,0,0.45); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px 18px; }

        .int-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 900px; }
        .int-pill { padding: 8px 16px; border-radius: 100px; background: rgba(0,0,0,0.55); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .int-pill:hover { border-color: rgba(0,212,255,0.5); background: rgba(0,212,255,0.12); }

        .feat-item { display: flex; align-items: flex-start; gap: 14px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .feat-item:last-child { border-bottom: none; }
        .feat-icon { font-size: 22px; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; background: rgba(0,212,255,0.1); }
        .feat-text h4 { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 3px; }
        .feat-text p { font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.5; }

        .phase-pill { display: flex; align-items: center; gap: 14px; padding: 16px 22px; background: rgba(0,0,0,0.55); backdrop-filter: blur(20px); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); transition: all 0.3s; }
        .phase-pill:hover { border-color: rgba(0,212,255,0.4); background: rgba(0,0,0,0.7); }

        .pmt-row { display: flex; align-items: center; gap: 18px; padding: 16px 22px; background: rgba(0,0,0,0.5); backdrop-filter: blur(16px); border-radius: 12px; border-left: 3px solid; border-top: 1px solid rgba(255,255,255,0.08); border-right: 1px solid rgba(255,255,255,0.08); border-bottom: 1px solid rgba(255,255,255,0.08); }
        .pmt-num-label { font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 700; width: 30px; }
        .pmt-info-col { flex: 1; }
        .pmt-title { font-size: 15px; font-weight: 700; color: #fff; }
        .pmt-trigger { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; }
        .pmt-amount { font-family: 'Orbitron', monospace; font-size: 22px; font-weight: 900; color: #fbbf24; }

        .tech-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; max-width: 900px; }
        .tech-item { background: rgba(0,0,0,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 16px; transition: all 0.2s; }
        .tech-item:hover { border-color: rgba(0,212,255,0.4); background: rgba(0,212,255,0.06); }
        .tech-layer { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #00d4ff; margin-bottom: 4px; }
        .tech-name { font-size: 13px; font-weight: 700; color: #fff; }
        .tech-desc { font-size: 10px; color: rgba(255,255,255,0.45); margin-top: 3px; line-height: 1.4; }

        .btn-primary { display: inline-flex; align-items: center; gap: 10px; padding: 16px 36px; border-radius: 100px; background: linear-gradient(135deg, #00d4ff, #0a6fff); color: #000; font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; border: none; cursor: pointer; transition: all 0.3s; box-shadow: 0 0 40px rgba(0,212,255,0.35); font-family: 'Outfit', sans-serif; }
        .btn-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 50px rgba(0,212,255,0.55); }
        .btn-outline { display: inline-flex; align-items: center; gap: 10px; padding: 16px 36px; border-radius: 100px; background: rgba(255,255,255,0.07); backdrop-filter: blur(10px); color: #fff; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; transition: all 0.3s; font-family: 'Outfit', sans-serif; }
        .btn-outline:hover { border-color: rgba(0,212,255,0.6); color: #00d4ff; transform: translateY(-3px); }

        #progress-bar { position: fixed; top: 0; left: 0; height: 3px; background: linear-gradient(90deg, #00d4ff, #0a6fff, #a78bfa); transition: width 0.4s ease; z-index: 2000; box-shadow: 0 0 12px rgba(0,212,255,0.6); }

        #particles { position: fixed; inset: 0; pointer-events: none; z-index: 500; overflow: hidden; }
        .p { position: absolute; border-radius: 50%; animation: pf linear infinite; opacity: 0; }
        @keyframes pf { 0% { transform: translateY(100vh) scale(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-50px) scale(1); opacity: 0; } }

        /* Slide-specific overlays */
        #s1 .overlay { background: linear-gradient(105deg, rgba(0,0,0,0.82) 0%, rgba(5,13,40,0.7) 40%, rgba(0,0,0,0.25) 100%); }
        #s1 .slide-content { justify-content: center; padding: 100px 80px; }
        #s2 .overlay { background: linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.3) 100%); }
        #s2 .slide-content { justify-content: center; padding: 100px 80px; }
        #s3 .overlay { background: linear-gradient(to right, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.85) 100%); }
        #s3 .slide-content { justify-content: center; align-items: flex-end; padding: 100px 80px; }
        #s4 .overlay { background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.2) 100%); }
        #s4 .slide-content { justify-content: flex-end; align-items: center; padding: 0 40px 90px; }
        #s5 .overlay { background: rgba(0,0,0,0.55); }
        #s5 .slide-content { justify-content: center; align-items: center; padding: 100px 60px; }
        #s6 .overlay { background: linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.1) 100%); }
        #s6 .slide-content { justify-content: center; padding: 100px 80px; }
        #s7 .overlay { background: linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.05) 100%); }
        #s7 .slide-content { justify-content: center; align-items: flex-end; padding: 100px 80px; }
        #s8 .overlay { background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.1) 100%); }
        #s8 .slide-content { justify-content: flex-end; align-items: center; padding: 0 60px 90px; }
        #s9 .overlay { background: rgba(0,0,0,0.6); }
        #s9 .slide-content { justify-content: center; align-items: center; padding: 90px 60px; }
        #s10 .overlay { background: linear-gradient(135deg, rgba(0,0,0,0.88) 0%, rgba(10,5,0,0.6) 100%); }
        #s10 .slide-content { justify-content: center; align-items: center; padding: 90px 60px; }
        #s11 .overlay { background: rgba(0,0,0,0.6); }
        #s11 .slide-content { justify-content: center; align-items: center; padding: 90px 60px; }
        #s12 .overlay { background: linear-gradient(to left, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.1) 100%); }
        #s12 .slide-content { justify-content: center; align-items: flex-end; padding: 100px 80px; }
      `}</style>

      <div id="progress-bar" style={{width:'8.33%'}}></div>
      <div id="particles"></div>

      {/* TOP BAR */}
      <div id="topbar">
        <span className="tb-logo">⬡ JARVIS</span>
        <span className="tb-sep">·</span>
        <span style={{fontSize:'12px',color:'rgba(255,255,255,0.35)',letterSpacing:'1px'}}>Smarter Software Inc. × US Robots</span>
        <span className="tb-meta">Prepared for Michael Yorga · SSI-USR-2026-001</span>
        <div className="tb-dot"></div>
      </div>

      <div id="deck">

        {/* SLIDE 1: COVER */}
        <div className="slide active" id="s1">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide01.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',maxWidth:'640px'}}>
              <div className="tag tag-cyan animate-in">Smarter Software Inc. · Exclusive Proposal for US Robots</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(64px,9vw,120px)'}}>
                <span className="cyan">JAR</span><span style={{color:'#fff'}}>VIS</span>
              </div>
              <div className="big-title animate-in" style={{fontSize:'clamp(18px,2.4vw,32px)',letterSpacing:'0px',fontWeight:'600',opacity:'0.9',fontFamily:"'Outfit',sans-serif"}}>
                AI-Powered Personal Assistant
              </div>
              <div className="sub animate-in" style={{maxWidth:'560px'}}>
                The world's first AI home assistant that looks and feels like a real person — living inside a premium floor-standing display, with a companion app always in your pocket.
              </div>
              <div className="animate-in" style={{display:'flex',gap:'12px',flexWrap:'wrap',marginTop:'4px'}}>
                <span className="glass-pill">🖥️ 49" · 55" · 65" Displays</span>
                <span className="glass-pill">🤖 AI Video Avatar</span>
                <span className="glass-pill">📱 iOS + Android App</span>
                <span className="glass-pill">⏱️ 90-Day Delivery</span>
              </div>
              <div className="animate-in" style={{display:'inline-flex',flexDirection:'column',gap:'4px',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.35)',borderRadius:'14px',padding:'18px 24px',marginTop:'4px',width:'fit-content'}}>
                <span style={{fontSize:'10px',letterSpacing:'3px',color:'#fbbf24',textTransform:'uppercase',fontWeight:'700'}}>Total Investment</span>
                <span style={{fontFamily:"'Orbitron',monospace",fontSize:'40px',fontWeight:'900',color:'#fbbf24',lineHeight:'1'}}>$100,000</span>
                <span style={{fontSize:'12px',color:'rgba(255,255,255,0.5)'}}>4 payments of $25,000 · First due on signing</span>
              </div>
            </div>
          </div>
        </div>

        {/* SLIDE 2: PROBLEM */}
        <div className="slide" id="s2">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide02.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',maxWidth:'600px'}}>
              <div className="tag tag-white animate-in">The Problem</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(38px,5.5vw,72px)'}}>Your Life Is<br/><span className="cyan">Scattered</span><br/>Everywhere</div>
              <div className="divider-line divider-cyan animate-in"></div>
              <div className="sub animate-in">The average person juggles <strong style={{color:'#fff'}}>14+ apps</strong> daily. Emails pile up. Appointments are missed. Reminders get ignored. Your digital life is chaos — and no single product has solved it.</div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px',marginTop:'8px'}} className="animate-in">
                <div className="glass-card-sm" style={{display:'flex',alignItems:'center',gap:'12px'}}><span style={{fontSize:'24px'}}>📱</span><div><div style={{fontSize:'13px',fontWeight:'700',color:'#fff'}}>14+ apps to manage your life</div><div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)'}}>Email, Calendar, Tasks, Smart Home, Music, Fitness…</div></div></div>
                <div className="glass-card-sm" style={{display:'flex',alignItems:'center',gap:'12px'}}><span style={{fontSize:'24px'}}>🔔</span><div><div style={{fontSize:'13px',fontWeight:'700',color:'#fff'}}>100+ notifications per day</div><div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)'}}>Most go unread. Important things get buried.</div></div></div>
                <div className="glass-card-sm" style={{display:'flex',alignItems:'center',gap:'12px'}}><span style={{fontSize:'24px'}}>🤖</span><div><div style={{fontSize:'13px',fontWeight:'700',color:'#fff'}}>No AI assistant feels human</div><div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)'}}>Alexa and Siri are voices in a box. JARVIS is a person.</div></div></div>
              </div>
              <div className="animate-in"><div style={{fontFamily:"'Orbitron',monospace",fontSize:'18px',fontWeight:'700',color:'#00d4ff'}}>JARVIS solves all of this. In one product.</div></div>
            </div>
          </div>
        </div>

        {/* SLIDE 3: AVATAR */}
        <div className="slide" id="s3">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide03.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',maxWidth:'560px',textAlign:'right',alignItems:'flex-end'}}>
              <div className="tag tag-cyan animate-in">The AI Avatar</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(36px,5vw,68px)'}}>She Looks,<br/>Talks, and<br/><span className="cyan">Feels Real</span></div>
              <div className="divider-line divider-cyan animate-in" style={{marginLeft:'auto'}}></div>
              <div className="sub animate-in" style={{textAlign:'right'}}>JARVIS features a photorealistic AI avatar — beautiful, voice-activated, lip-synced, and emotionally intelligent. She knows your schedule, your habits, and your name.</div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px',alignItems:'flex-end'}} className="animate-in">
                <span className="glass-pill">🎤 Wake Word Detection</span>
                <span className="glass-pill">💬 Real-Time Lip Sync</span>
                <span className="glass-pill">🧠 GPT-4o Conversational AI</span>
                <span className="glass-pill">🔊 ElevenLabs Hyper-Realistic Voice</span>
              </div>
            </div>
          </div>
        </div>

        {/* SLIDE 4: HARDWARE */}
        <div className="slide" id="s4">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide04.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',alignItems:'center',textAlign:'center',width:'100%'}}>
              <div className="tag tag-white animate-in">The Hardware</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(34px,4.5vw,60px)'}}>Three Premium Sizes.<br/>One <span className="cyan">Powerful Platform</span>.</div>
              <div className="divider-line divider-white animate-in" style={{margin:'0 auto'}}></div>
              <div style={{display:'flex',gap:'20px',justifyContent:'center',flexWrap:'wrap'}} className="animate-in">
                <div className="glass-card" style={{textAlign:'center',minWidth:'200px'}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:'48px',fontWeight:'900',color:'#00d4ff',lineHeight:'1'}}>49"</div>
                  <div style={{fontSize:'13px',color:'rgba(255,255,255,0.6)',margin:'6px 0 14px'}}>Model A · Standard</div>
                  <div style={{fontSize:'12px',color:'rgba(255,255,255,0.45)',marginBottom:'12px'}}>Android · HD LCD · Built-in Speaker<br/>Tempered Glass · Anti-collision Base</div>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:'24px',fontWeight:'700',color:'#fbbf24'}}>$391<span style={{fontSize:'12px',color:'rgba(255,255,255,0.4)',fontFamily:"'Outfit',sans-serif",fontWeight:'400'}}>/unit</span></div>
                </div>
                <div className="glass-card" style={{textAlign:'center',minWidth:'200px',borderColor:'rgba(0,212,255,0.35)',background:'rgba(0,212,255,0.06)'}}>
                  <div style={{fontSize:'9px',fontWeight:'700',letterSpacing:'2px',color:'#00d4ff',textTransform:'uppercase',marginBottom:'6px'}}>⭐ Most Popular</div>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:'48px',fontWeight:'900',color:'#00d4ff',lineHeight:'1'}}>55"</div>
                  <div style={{fontSize:'13px',color:'rgba(255,255,255,0.6)',margin:'6px 0 14px'}}>Model B · Pro</div>
                  <div style={{fontSize:'12px',color:'rgba(255,255,255,0.45)',marginBottom:'12px'}}>Android · HD LCD · Speaker<br/>Tempered Glass · Heat Release</div>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:'24px',fontWeight:'700',color:'#fbbf24'}}>$457<span style={{fontSize:'12px',color:'rgba(255,255,255,0.4)',fontFamily:"'Outfit',sans-serif",fontWeight:'400'}}>/unit</span></div>
                </div>
                <div className="glass-card" style={{textAlign:'center',minWidth:'200px'}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:'48px',fontWeight:'900',color:'#fbbf24',lineHeight:'1'}}>65"</div>
                  <div style={{fontSize:'13px',color:'rgba(255,255,255,0.6)',margin:'6px 0 14px'}}>Model C · Elite</div>
                  <div style={{fontSize:'12px',color:'rgba(255,255,255,0.45)',marginBottom:'12px'}}>Android · HD LCD · High-Quality Speaker<br/>Tempered Glass · Dust-Proof · Anti-static</div>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:'24px',fontWeight:'700',color:'#fbbf24'}}>$652<span style={{fontSize:'12px',color:'rgba(255,255,255,0.4)',fontFamily:"'Outfit',sans-serif",fontWeight:'400'}}>/unit</span></div>
                </div>
              </div>
              <div style={{fontSize:'11px',color:'rgba(255,255,255,0.3)'}} className="animate-in">Hardware sourced from manufacturer · JARVIS software pre-loaded by Smarter Software Inc. · Import & logistics responsibility of US Robots</div>
            </div>
          </div>
        </div>

        {/* SLIDE 5: CONNECTIONS */}
        <div className="slide" id="s5">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide05.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',alignItems:'center',textAlign:'center',width:'100%'}}>
              <div className="tag tag-cyan animate-in">The Connected Universe</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(32px,4.5vw,62px)'}}>JARVIS Connects to<br/><span className="cyan">Everything You Use</span></div>
              <div className="divider-line divider-cyan animate-in" style={{margin:'0 auto'}}></div>
              <div className="int-grid animate-in">
                {['📨 Gmail','📅 Google Calendar','🔵 Outlook','🍎 Apple Mail','✅ Todoist','📝 Notion','🏠 Amazon Alexa','🔊 Google Home','🏡 Apple HomeKit','🎵 Spotify','🎶 Apple Music','🚗 Uber','🍔 DoorDash','📦 Amazon Tracking','💪 Fitbit','❤️ Apple Health','🏃 Garmin','🌤️ Weather','📰 News Feed','💰 Finance Alerts','📸 Family Photos','🔒 Smart Locks','💡 Smart Lights','📺 Smart TV','🌡️ Thermostat'].map(s => (
                  <div key={s} className="int-pill">{s}</div>
                ))}
              </div>
              <div className="sub animate-in" style={{fontSize:'15px',color:'rgba(255,255,255,0.7)'}}>25+ integrations at launch. One intelligent hub. Zero friction.</div>
            </div>
          </div>
        </div>

        {/* SLIDE 6: SMART HOME */}
        <div className="slide" id="s6">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide06.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',maxWidth:'560px'}}>
              <div className="tag tag-cyan animate-in">Smart Home Control</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(34px,5vw,66px)'}}>Your Home.<br/><span className="cyan">Your Command.</span></div>
              <div className="divider-line divider-cyan animate-in"></div>
              <div className="sub animate-in">Just say it. JARVIS controls every smart device in your home — lights, locks, temperature, TV, cameras — all through natural voice conversation.</div>
              <div style={{display:'flex',flexDirection:'column',gap:'0px'}} className="animate-in">
                <div className="feat-item"><div className="feat-icon">💡</div><div className="feat-text"><h4>Lighting Control</h4><p>"JARVIS, set the living room to movie mode." Done.</p></div></div>
                <div className="feat-item"><div className="feat-icon">🔒</div><div className="feat-text"><h4>Security & Locks</h4><p>Lock/unlock doors, check cameras, arm/disarm systems by voice.</p></div></div>
                <div className="feat-item"><div className="feat-icon">🌡️</div><div className="feat-text"><h4>Climate & Energy</h4><p>Smart thermostat control. JARVIS learns your comfort preferences.</p></div></div>
              </div>
              <div className="animate-in"><span className="glass-pill">Compatible: Alexa · Google Home · HomeKit · SmartThings</span></div>
            </div>
          </div>
        </div>

        {/* SLIDE 7: MOBILE */}
        <div className="slide" id="s7">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide07.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',maxWidth:'520px',alignItems:'flex-end',textAlign:'right'}}>
              <div className="tag tag-purple animate-in">Mobile Companion App</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(32px,4.8vw,64px)'}}>JARVIS Goes<br/><span className="purple">Everywhere</span><br/>You Do</div>
              <div className="divider-line divider-purple animate-in" style={{marginLeft:'auto'}}></div>
              <div className="sub animate-in" style={{textAlign:'right'}}>Leave the house and JARVIS comes with you. The iOS + Android companion app keeps you fully connected — same AI, same intelligence, everywhere.</div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px',alignItems:'flex-end'}} className="animate-in">
                <span className="glass-pill">🔔 Real-Time Push Notifications</span>
                <span className="glass-pill">🔁 Instant Kiosk Sync</span>
                <span className="glass-pill">🎤 Voice Commands On-The-Go</span>
                <span className="glass-pill">🔐 Face ID · Fingerprint Login</span>
                <span className="glass-pill">📍 Location-Aware Smart Alerts</span>
              </div>
              <div className="animate-in" style={{display:'flex',gap:'12px'}}><span className="glass-pill">🍎 iOS App Store</span><span className="glass-pill">🤖 Google Play</span></div>
            </div>
          </div>
        </div>

        {/* SLIDE 8: PAINTING */}
        <div className="slide" id="s8">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide08.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',alignItems:'center',textAlign:'center',width:'100%',maxWidth:'900px',margin:'0 auto'}}>
              <div className="tag tag-purple animate-in">Exclusive Feature</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(32px,5vw,68px)'}}>Virtual <span className="purple">Collaborative</span><br/>Painting Studio</div>
              <div className="divider-line divider-purple animate-in" style={{margin:'0 auto'}}></div>
              <div className="sub animate-in" style={{textAlign:'center',maxWidth:'680px'}}>Up to 8 users paint together simultaneously across any device — kiosk or phone — with real-time sync, AI art generation, and full time-lapse replay. No other product has this.</div>
              <div style={{display:'flex',gap:'14px',flexWrap:'wrap',justifyContent:'center'}} className="animate-in">
                <span className="glass-pill">🎨 Real-Time Multi-User Canvas</span>
                <span className="glass-pill">🤖 AI Art Generation by Voice</span>
                <span className="glass-pill">⏯️ Time-Lapse Replay Mode</span>
                <span className="glass-pill">✏️ Full Brush + Layer Toolkit</span>
                <span className="glass-pill">🖼️ Gallery + Social Sharing</span>
                <span className="glass-pill">📱 Cross-Device Sync</span>
              </div>
            </div>
          </div>
        </div>

        {/* SLIDE 9: TIMELINE */}
        <div className="slide" id="s9">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide09.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',alignItems:'center',textAlign:'center',width:'100%'}}>
              <div className="tag tag-gold animate-in">90-Day Roadmap</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(30px,4.5vw,60px)'}}>From Signing to <span className="gold">Launch</span><br/>in 90 Days</div>
              <div className="divider-line divider-gold animate-in" style={{margin:'0 auto'}}></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'14px',maxWidth:'1000px',width:'100%'}} className="animate-in">
                {[
                  {n:'1',c:'#00d4ff',d:'Days 1–20',t:'Foundation',p:'Cloud infra · Android setup · AI APIs · Auth system · DB schema',pay:'💳 $25K due on signing'},
                  {n:'2',c:'#60a5fa',d:'Days 21–45',t:'AI Engine',p:'Avatar · Voice · Email/Calendar · Notifications · Display UI',pay:'💳 $25K — Avatar live on kiosk'},
                  {n:'3',c:'#a78bfa',d:'Days 46–70',t:'Mobile + Features',p:'iOS/Android app · Integrations · Painting Studio · Beta testing',pay:'💳 $25K — Mobile beta live'},
                  {n:'4',c:'#fbbf24',d:'Days 71–90',t:'Polish & Launch',p:'QA · App Store approval · Security audit · Production go-live',pay:'💳 $25K — Final delivery'},
                ].map(ph => (
                  <div key={ph.n} className="phase-pill" style={{flexDirection:'column',alignItems:'flex-start',gap:'10px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',width:'100%'}}>
                      <div style={{fontFamily:"'Orbitron',monospace",fontSize:'32px',fontWeight:'900',color:ph.c,width:'44px',textAlign:'center'}}>{ph.n}</div>
                      <div style={{fontFamily:"'Orbitron',monospace",fontSize:'10px',fontWeight:'700',color:ph.c,marginLeft:'auto'}}>{ph.d}</div>
                    </div>
                    <div>
                      <h4 style={{fontSize:'13px',fontWeight:'700',color:'#fff',marginBottom:'6px'}}>{ph.t}</h4>
                      <p style={{fontSize:'11px',color:'rgba(255,255,255,0.5)',lineHeight:'1.5'}}>{ph.p}</p>
                    </div>
                    <div style={{fontSize:'10px',color:ph.c,fontWeight:'700'}}>{ph.pay}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SLIDE 10: PAYMENT */}
        <div className="slide" id="s10">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide10.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',gap:'60px',alignItems:'center',justifyContent:'center',width:'100%',maxWidth:'1100px'}}>
              <div style={{display:'flex',flexDirection:'column',gap:'14px',flex:'1',maxWidth:'540px'}}>
                <div className="tag tag-gold animate-in">Investment & Payment Schedule</div>
                <div className="big-title animate-in" style={{fontSize:'clamp(28px,3.8vw,52px)'}}>Four Milestone-<br/>Based <span className="gold">Payments</span></div>
                <div className="divider-line divider-gold animate-in"></div>
                <div style={{display:'flex',flexDirection:'column',gap:'10px'}} className="animate-in">
                  {[
                    {n:'01',c:'#00d4ff',t:'Contract Signing',p:'Due immediately upon execution · Initiates all work'},
                    {n:'02',c:'#60a5fa',t:'AI Avatar Milestone',p:'Working JARVIS on kiosk display · Day 45'},
                    {n:'03',c:'#a78bfa',t:'Mobile Beta Milestone',p:'iOS + Android beta delivered · Day 70'},
                    {n:'04',c:'#fbbf24',t:'Final Delivery',p:'Launch-ready product · App stores live · Day 90'},
                  ].map(p => (
                    <div key={p.n} className="pmt-row" style={{borderLeftColor:p.c}}>
                      <div className="pmt-num-label" style={{color:p.c}}>{p.n}</div>
                      <div className="pmt-info-col"><div className="pmt-title">{p.t}</div><div className="pmt-trigger">{p.p}</div></div>
                      <div className="pmt-amount">$25,000</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'16px',minWidth:'280px'}} className="animate-in">
                <div style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(20px)',border:'1px solid rgba(245,158,11,0.35)',borderRadius:'20px',padding:'32px',textAlign:'center'}}>
                  <div style={{fontSize:'10px',letterSpacing:'3px',color:'#fbbf24',textTransform:'uppercase',fontWeight:'700',marginBottom:'8px'}}>Total Contract Value</div>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:'56px',fontWeight:'900',color:'#fbbf24',lineHeight:'1',marginBottom:'20px'}}>$100K</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'8px',textAlign:'left'}}>
                    {[['Duration','90 Days'],['Platforms','Kiosk + iOS + Android'],['Cloud Infra','90 Days Included'],['Support','30 Days Post-Launch'],['IP Ownership','Full Transfer']].map(([k,v],i) => (
                      <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<4?'1px solid rgba(255,255,255,0.07)':'none',fontSize:'12px'}}>
                        <span style={{color:'rgba(255,255,255,0.45)'}}>{k}</span>
                        <span style={{fontWeight:'700',color:k==='IP Ownership'?'#00d4ff':'#fff'}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SLIDE 11: MARKET + TECH */}
        <div className="slide" id="s11">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide11.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'20px',alignItems:'center',textAlign:'center',width:'100%'}}>
              <div className="tag tag-cyan animate-in">Technology + Market</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(28px,4.2vw,58px)'}}>Enterprise-Grade Stack.<br/><span className="cyan">Massive Market Opportunity.</span></div>
              <div className="divider-line divider-cyan animate-in" style={{margin:'0 auto'}}></div>
              <div className="tech-grid animate-in">
                {[
                  {l:'AI Brain',n:'GPT-4o + Gemini',d:'Dual-engine LLM with persona memory'},
                  {l:'Avatar',n:'D-ID / Synthesia',d:'Photorealistic lip-sync pipeline'},
                  {l:'Voice',n:'Whisper + ElevenLabs',d:'Real-time ASR + ultra-human TTS'},
                  {l:'Mobile',n:'React Native',d:'Single codebase · iOS + Android'},
                  {l:'Kiosk OS',n:'Android (AOSP)',d:'Custom ROM for always-on display'},
                  {l:'Backend',n:'Node.js + Fastify',d:'REST + GraphQL API layer'},
                  {l:'Cloud',n:'AWS',d:'99.9% SLA · Auto-scaling · CDN'},
                  {l:'Real-Time',n:'WebSockets',d:'Instant kiosk ↔ phone sync'},
                ].map(t => (
                  <div key={t.n} className="tech-item"><div className="tech-layer">{t.l}</div><div className="tech-name">{t.n}</div><div className="tech-desc">{t.d}</div></div>
                ))}
              </div>
              <div style={{display:'flex',gap:'20px',flexWrap:'wrap',justifyContent:'center'}} className="animate-in">
                {[
                  {v:'$157B',l:'Smart Home Market by 2029',c:'rgba(0,212,255,0.2)',vc:'#00d4ff'},
                  {v:'85M+',l:'US Smart Home Households',c:'rgba(245,158,11,0.2)',vc:'#fbbf24'},
                  {v:'0',l:'Direct Competitors (This Exact Product)',c:'rgba(167,139,250,0.2)',vc:'#a78bfa'},
                ].map(s => (
                  <div key={s.v} style={{background:'rgba(0,0,0,0.6)',backdropFilter:'blur(16px)',border:`1px solid ${s.c}`,borderRadius:'12px',padding:'16px 28px',textAlign:'center'}}>
                    <div style={{fontFamily:"'Orbitron',monospace",fontSize:'32px',fontWeight:'900',color:s.vc}}>{s.v}</div>
                    <div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)',marginTop:'4px'}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SLIDE 12: CTA */}
        <div className="slide" id="s12">
          <div className="slide-bg" style={{backgroundImage:"url('/usrobots/slide12.jpg')"}}></div>
          <div className="overlay"></div>
          <div className="slide-content">
            <div style={{display:'flex',flexDirection:'column',gap:'22px',maxWidth:'560px',alignItems:'flex-end',textAlign:'right'}}>
              <div className="tag tag-gold animate-in">Let's Build the Future</div>
              <div className="big-title animate-in" style={{fontSize:'clamp(30px,4.5vw,62px)'}}>Ready to <span className="gold">Sign</span> and<br/>Change the World?</div>
              <div className="divider-line divider-gold animate-in" style={{marginLeft:'auto'}}></div>
              <div className="sub animate-in" style={{textAlign:'right'}}>This proposal is addressed exclusively to <strong style={{color:'#fff'}}>Michael Yorga, US Robots</strong>. Smarter Software Inc. is ready to begin immediately upon contract execution and receipt of Payment 1.</div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px',alignItems:'flex-end'}} className="animate-in">
                <span className="glass-pill">📋 Contract: SSI-USR-2026-001</span>
                <span className="glass-pill">📅 Proposed Start: Upon Signing</span>
                <span className="glass-pill">📧 Schonesanfleet@yahoo.com</span>
                <span className="glass-pill">🎯 90-Day Delivery · $100,000 Total</span>
              </div>
              <div style={{display:'flex',gap:'14px',justifyContent:'flex-end'}} className="animate-in">
                <button className="btn-primary">✍️ Sign & Get Started</button>
                <button className="btn-outline">📞 Schedule a Call</button>
              </div>
              <div style={{fontSize:'11px',color:'rgba(255,255,255,0.3)',textAlign:'right',lineHeight:'1.8'}} className="animate-in">
                Smarter Software Inc. · Prepared August 6, 2026<br/>
                Confidential — For US Robots · Michael Yorga Use Only
              </div>
            </div>
          </div>
        </div>

      </div>{/* /deck */}

      {/* NAV */}
      <div id="navbar">
        <button className="nav-arrow" id="btn-prev">←</button>
        <div className="dots-row" id="dots"></div>
        <button className="nav-arrow" id="btn-next">→</button>
        <div className="slide-num" id="slide-num">1 / 12</div>
      </div>

      <script dangerouslySetInnerHTML={{__html:`
        (function(){
          const TOTAL = 12;
          let current = 1, animating = false;
          const dotsEl = document.getElementById('dots');
          for(let i=1;i<=TOTAL;i++){
            const d=document.createElement('div');
            d.className='dot'+(i===1?' active':'');
            d.onclick=()=>goTo(i);
            dotsEl.appendChild(d);
          }
          function slide(n){return document.getElementById('s'+n);}
          function dot(n){return dotsEl.children[n-1];}
          function goTo(n){
            if(animating||n===current||n<1||n>TOTAL)return;
            animating=true;
            slide(current).classList.remove('active');
            dot(current).classList.remove('active');
            current=n;
            slide(current).classList.add('active');
            dot(current).classList.add('active');
            document.getElementById('slide-num').textContent=current+' / '+TOTAL;
            document.getElementById('progress-bar').style.width=(current/TOTAL*100)+'%';
            setTimeout(()=>animating=false,600);
          }
          function navigate(d){goTo(current+d);}
          document.getElementById('btn-prev').onclick=()=>navigate(-1);
          document.getElementById('btn-next').onclick=()=>navigate(1);
          document.addEventListener('keydown',e=>{
            const fwd=['ArrowRight','ArrowDown','PageDown',' ','Enter'];
            const bwd=['ArrowLeft','ArrowUp','PageUp'];
            if(fwd.includes(e.key)){e.preventDefault();navigate(1);}
            else if(bwd.includes(e.key)){e.preventDefault();navigate(-1);}
          });
          let tx=0;
          document.addEventListener('touchstart',e=>tx=e.touches[0].clientX,{passive:true});
          document.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50)navigate(dx<0?1:-1);},{passive:true});
          const pC=document.getElementById('particles');
          function mkP(){
            const p=document.createElement('div');p.className='p';
            const colors=['rgba(0,212,255,0.4)','rgba(10,111,255,0.4)','rgba(167,139,250,0.35)','rgba(255,255,255,0.25)'];
            const sz=1+Math.random()*2.5;
            p.style.cssText='left:'+Math.random()*100+'vw;width:'+sz+'px;height:'+sz+'px;background:'+colors[Math.floor(Math.random()*colors.length)]+';animation-duration:'+(10+Math.random()*14)+'s;animation-delay:'+Math.random()*6+'s;box-shadow:0 0 '+(sz*3)+'px rgba(0,212,255,0.5);';
            pC.appendChild(p);setTimeout(()=>p.remove(),24000);
          }
          setInterval(mkP,600);
          for(let i=0;i<12;i++)mkP();
        })();
      `}} />
    </>
  );
}
