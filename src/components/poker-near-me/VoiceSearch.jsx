/**
 * VoiceSearch.jsx — Feature #11: Voice Search
 * Floating mic button using Web Speech API with natural language → filter mapping.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';

// Parse natural language into filter object
function parseVoiceQuery(transcript) {
    const lower = transcript.toLowerCase().trim();
    const result = { raw: transcript, filters: {}, searchQuery: '' };

    // Extract game types
    if (/\bnlh\b|no.?limit hold.?em|holdem/.test(lower)) result.filters.gameType = 'NLH';
    else if (/\bplo\b|pot.?limit omaha/.test(lower)) result.filters.gameType = 'PLO';
    else if (/\bmixed\b/.test(lower)) result.filters.gameType = 'Mixed';
    else if (/\bomaha\b/.test(lower)) result.filters.gameType = 'PLO';
    else if (/\bstud\b/.test(lower)) result.filters.gameType = 'Stud';

    // Extract stakes (e.g., "2/5", "1/2", "5/10")
    const stakesMatch = lower.match(/(\d+)\s*[\/\\]\s*(\d+)/);
    if (stakesMatch) result.filters.stakes = `${stakesMatch[1]}/${stakesMatch[2]}`;

    // Extract distance (e.g., "within 30 miles", "50 mi")
    const distMatch = lower.match(/(?:within\s+)?(\d+)\s*(?:miles?|mi)\b/);
    if (distMatch) result.filters.radius = parseInt(distMatch[1]);

    // Extract buy-in range
    const buyinMatch = lower.match(/\$\s*(\d+)/g);
    if (buyinMatch) {
        const amounts = buyinMatch.map(m => parseInt(m.replace('$', '')));
        if (amounts.length >= 2) {
            result.filters.minBuyin = Math.min(...amounts);
            result.filters.maxBuyin = Math.max(...amounts);
        } else if (amounts.length === 1) {
            result.filters.maxBuyin = amounts[0];
        }
    }

    // Extract venue type
    if (/\bcasino\b/.test(lower)) result.filters.venueType = 'casino';
    else if (/\bcard.?room\b/.test(lower)) result.filters.venueType = 'card_room';
    else if (/\bclub\b|poker.?club/.test(lower)) result.filters.venueType = 'poker_club';

    // Extract city name (look for "in {city}" or "near {city}")
    const cityMatch = lower.match(/(?:in|near|around)\s+([a-z\s]+?)(?:\s*$|,|\s+within|\s+\d)/);
    if (cityMatch) {
        result.searchQuery = cityMatch[1].trim();
    }

    // Extract tournament keyword
    if (/\btournament|tourney|mtt\b/.test(lower)) result.filters.tab = 'daily';

    // If no specific filters extracted, use the whole transcript as search
    if (Object.keys(result.filters).length === 0 && !result.searchQuery) {
        result.searchQuery = transcript.trim();
    }

    return result;
}

// Highlight matched keywords in transcript
function highlightText(text, filters) {
    let highlighted = text;
    const keywords = [];

    if (filters.gameType) keywords.push(filters.gameType.toLowerCase(), ...['nlh', 'plo', 'mixed', 'holdem', 'omaha'].filter(k => text.toLowerCase().includes(k)));
    if (filters.stakes) keywords.push(filters.stakes);
    if (filters.radius) keywords.push(`${filters.radius}`);
    if (filters.venueType) keywords.push(filters.venueType.replace('_', ' '));
    if (filters.minBuyin) keywords.push(`$${filters.minBuyin}`);
    if (filters.maxBuyin) keywords.push(`$${filters.maxBuyin}`);

    return { text, keywords: [...new Set(keywords)] };
}

export default function VoiceSearch({ onResult, isListening: externalListening }) {
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [supported, setSupported] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const [animPhase, setAnimPhase] = useState(0);
    const recognitionRef = useRef(null);
    const animFrameRef = useRef(null);
    const transcriptRef = useRef('');
    const onResultRef = useRef(onResult);

    // Keep refs in sync
    useEffect(() => { onResultRef.current = onResult; }, [onResult]);

    // Check browser support
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        setSupported(!!SpeechRecognition);
    }, []);

    // Waveform animation
    useEffect(() => {
        if (!listening) return;
        const tick = () => {
            setAnimPhase(p => (p + 1) % 360);
            animFrameRef.current = requestAnimationFrame(tick);
        };
        animFrameRef.current = requestAnimationFrame(tick);
        return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
    }, [listening]);

    const startListening = useCallback(() => {
        if (!supported) { setError('Speech recognition not supported in this browser'); return; }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setListening(true);
            setError(null);
            setResult(null);
            setTranscript('');
            transcriptRef.current = '';
            setIsExpanded(true);
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalTranscript += t;
                else interimTranscript += t;
            }
            const text = finalTranscript || interimTranscript;
            setTranscript(text);
            transcriptRef.current = text;
        };

        recognition.onend = () => {
            setListening(false);
            const finalText = transcriptRef.current || '';
            if (finalText.trim()) {
                const parsed = parseVoiceQuery(finalText);
                setResult(parsed);
            }
        };

        recognition.onerror = (event) => {
            setListening(false);
            if (event.error === 'not-allowed') setError('Microphone permission denied');
            else if (event.error === 'no-speech') setError('No speech detected. Try again.');
            else setError(`Error: ${event.error}`);
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, [supported]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    }, []);

    // Apply parsed result filters
    const applyResult = useCallback(() => {
        if (result && onResult) {
            onResult(result);
            setIsExpanded(false);
        }
    }, [result, onResult]);

    // Generate waveform bars
    const waveformBars = Array.from({ length: 20 }, (_, i) => {
        const height = listening
            ? 8 + Math.abs(Math.sin((animPhase + i * 18) * Math.PI / 180)) * 24
            : 4;
        return height;
    });

    return (
        <>
            {/* Floating mic button */}
            <button
                className={'voice-fab' + (listening ? ' listening' : '')}
                onClick={() => {
                    if (listening) stopListening();
                    else if (isExpanded) setIsExpanded(false);
                    else startListening();
                }}
                aria-label="Voice Search"
            >
                {listening ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                        <rect x="6" y="6" width="12" height="12" rx="2" fill="#fff" stroke="none" />
                    </svg>
                ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                        <path d="M19 10v2a7 7 0 01-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                )}
                {listening && <span className="voice-fab-ring" />}
            </button>

            {/* Expanded panel */}
            {isExpanded && (
                <div className="voice-panel">
                    <div className="voice-panel-header">
                        <h3>Voice Search</h3>
                        <button className="voice-panel-close" onClick={() => setIsExpanded(false)}>×</button>
                    </div>

                    {/* Waveform visualization */}
                    {listening && (
                        <div className="voice-waveform">
                            {waveformBars.map((h, i) => (
                                <div key={i} className="voice-bar" style={{ height: h, background: `hsl(${40 + i * 2}, 70%, ${50 + Math.sin(animPhase * 0.02 + i) * 10}%)` }} />
                            ))}
                        </div>
                    )}

                    {/* Status */}
                    <div className="voice-status">
                        {listening && <span className="voice-status-text">🎤 Listening... Speak now</span>}
                        {!listening && !result && !error && <span className="voice-status-text">Tap the mic button to speak</span>}
                        {error && <span className="voice-error">{error}</span>}
                    </div>

                    {/* Transcript */}
                    {transcript && (
                        <div className="voice-transcript">
                            <span className="voice-transcript-label">You said:</span>
                            <p className="voice-transcript-text">"{transcript}"</p>
                        </div>
                    )}

                    {/* Parsed result */}
                    {result && (
                        <div className="voice-result">
                            <span className="voice-result-label">Understood:</span>
                            <div className="voice-filter-tags">
                                {result.filters.gameType && <span className="voice-tag game">{result.filters.gameType}</span>}
                                {result.filters.stakes && <span className="voice-tag stakes">{result.filters.stakes}</span>}
                                {result.filters.radius && <span className="voice-tag radius">{result.filters.radius} mi</span>}
                                {result.filters.venueType && <span className="voice-tag type">{result.filters.venueType.replace('_', ' ')}</span>}
                                {result.filters.minBuyin && <span className="voice-tag buyin">Min ${result.filters.minBuyin}</span>}
                                {result.filters.maxBuyin && <span className="voice-tag buyin">Max ${result.filters.maxBuyin}</span>}
                                {result.searchQuery && <span className="voice-tag search">🔍 {result.searchQuery}</span>}
                            </div>
                            <button className="voice-apply-btn" onClick={applyResult}>Apply Filters</button>
                        </div>
                    )}

                    {/* Not supported fallback */}
                    {!supported && (
                        <div className="voice-unsupported">
                            <p>Speech recognition is not supported in this browser.</p>
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Try Chrome, Edge, or Safari.</p>
                        </div>
                    )}

                    {/* Examples */}
                    <div className="voice-examples">
                        <span className="voice-examples-label">Try saying:</span>
                        <div className="voice-example-list">
                            <button className="voice-example" onClick={() => { setTranscript('Find me a 2/5 NLH game within 30 miles'); setResult(parseVoiceQuery('Find me a 2/5 NLH game within 30 miles')); }}>
                                "Find me a 2/5 NLH game within 30 miles"
                            </button>
                            <button className="voice-example" onClick={() => { setTranscript('PLO tournaments near Las Vegas'); setResult(parseVoiceQuery('PLO tournaments near Las Vegas')); }}>
                                "PLO tournaments near Las Vegas"
                            </button>
                            <button className="voice-example" onClick={() => { setTranscript('Casinos within 50 miles'); setResult(parseVoiceQuery('Casinos within 50 miles')); }}>
                                "Casinos within 50 miles"
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
        .voice-fab { position: fixed; bottom: 90px; right: 20px; z-index: 9999; width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #d4a853, #b8860b); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 20px rgba(212,168,83,0.4); transition: all 0.3s; }
        .voice-fab:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(212,168,83,0.5); }
        .voice-fab.listening { background: linear-gradient(135deg, #ef4444, #dc2626); animation: fabPulse 1.5s ease-in-out infinite; }
        .voice-fab-ring { position: absolute; inset: -6px; border-radius: 50%; border: 2px solid rgba(239,68,68,0.5); animation: ringExpand 1.5s ease-out infinite; }
        @keyframes fabPulse { 0%, 100% { box-shadow: 0 4px 20px rgba(239,68,68,0.4); } 50% { box-shadow: 0 4px 30px rgba(239,68,68,0.6); } }
        @keyframes ringExpand { from { transform: scale(1); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
        .voice-panel { position: fixed; bottom: 160px; right: 20px; z-index: 9998; width: 340px; max-width: calc(100vw - 40px); background: rgba(15,23,42,0.97); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 20px; box-shadow: 0 8px 40px rgba(0,0,0,0.5); animation: panelSlideUp 0.3s ease-out; }
        @keyframes panelSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .voice-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .voice-panel-header h3 { font-size: 16px; font-weight: 600; color: #fff; margin: 0; }
        .voice-panel-close { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 22px; cursor: pointer; }
        .voice-waveform { display: flex; align-items: center; justify-content: center; gap: 2px; height: 40px; margin-bottom: 12px; }
        .voice-bar { width: 4px; border-radius: 2px; transition: height 0.1s ease; }
        .voice-status { text-align: center; margin-bottom: 12px; }
        .voice-status-text { font-size: 13px; color: rgba(255,255,255,0.5); }
        .voice-error { font-size: 13px; color: #ef4444; }
        .voice-transcript { padding: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; margin-bottom: 12px; }
        .voice-transcript-label { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }
        .voice-transcript-text { font-size: 15px; color: #fff; margin: 6px 0 0; font-style: italic; }
        .voice-result { padding: 12px; background: rgba(212,168,83,0.06); border: 1px solid rgba(212,168,83,0.2); border-radius: 10px; margin-bottom: 12px; }
        .voice-result-label { font-size: 11px; color: rgba(212,168,83,0.7); text-transform: uppercase; letter-spacing: 0.5px; }
        .voice-filter-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
        .voice-tag { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; }
        .voice-tag.game { background: rgba(99,102,241,0.2); color: #818cf8; }
        .voice-tag.stakes { background: rgba(34,197,94,0.15); color: #22c55e; }
        .voice-tag.radius { background: rgba(59,130,246,0.15); color: #3b82f6; }
        .voice-tag.type { background: rgba(245,158,11,0.15); color: #f59e0b; }
        .voice-tag.buyin { background: rgba(168,85,247,0.15); color: #a855f7; }
        .voice-tag.search { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); }
        .voice-apply-btn { width: 100%; padding: 10px; background: linear-gradient(135deg, #d4a853, #b8860b); border: none; border-radius: 8px; color: #000; font-size: 13px; font-weight: 600; cursor: pointer; }
        .voice-unsupported { text-align: center; padding: 20px; }
        .voice-unsupported p { color: rgba(255,255,255,0.4); }
        .voice-examples { margin-top: 12px; }
        .voice-examples-label { font-size: 11px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.5px; }
        .voice-example-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .voice-example { text-align: left; padding: 8px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: rgba(255,255,255,0.5); font-size: 12px; cursor: pointer; font-style: italic; transition: all 0.2s; }
        .voice-example:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); }
      `}</style>
        </>
    );
}
