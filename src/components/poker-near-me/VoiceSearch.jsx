/**
 * VoiceSearch.jsx — Feature #11: Voice Search
 * Floating mic button using Web Speech API with natural language → filter mapping.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

// Phrases that mean "use my GPS position", not "search for a city by this name".
const NEAR_ME_TOKENS = new Set([
    'me', 'my location', 'my current location', 'my position',
    'here', 'my area', 'us', 'myself',
]);

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
    else if (/\bcard.?room\b/.test(lower)) result.filters.venueType = 'poker_club';
    else if (/\bclub\b|poker.?club/.test(lower)) result.filters.venueType = 'poker_club';
    else if (/\btour\b/.test(lower)) result.filters.venueType = 'poker_tour';

    // Extract city name (look for "in {city}" or "near {city}").
    // BUG FIX: "poker near me" / "casinos around me" used to capture the word
    // "me" as a city and run a text search for the literal string, which is the
    // single most natural phrase for this product. Those tokens now set the
    // GPS/radius flag instead of a search term.
    const cityMatch = lower.match(/(?:in|near|around)\s+([a-z\s]+?)(?:\s*$|,|\s+within|\s+\d)/);
    if (cityMatch) {
        const candidate = cityMatch[1].trim().replace(/\s+/g, ' ');
        if (NEAR_ME_TOKENS.has(candidate)) {
            result.filters.useMyLocation = true;
        } else {
            result.searchQuery = candidate;
        }
    }

    // Extract tournament keyword
    if (/\btournament|tourney|mtt\b/.test(lower)) result.filters.tab = 'daily';

    // If no specific filters extracted, use the whole transcript as search
    if (Object.keys(result.filters || {}).length === 0 && !result.searchQuery) {
        result.searchQuery = transcript.trim();
    }

    return result;
}

/**
 * VoiceSearch
 *
 * @param {function} onResult - receives the parsed query object
 * @param {'floating'|'embedded'} variant - 'embedded' renders static (non-fixed)
 *        markup for call sites that already wrap this in their own modal. The
 *        default floating variant is the bottom-left FAB plus popover.
 */
export default function VoiceSearch({ onResult, variant = 'floating' }) {
    const embedded = variant === 'embedded';
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [supported, setSupported] = useState(true);
    const [isExpanded, setIsExpanded] = useState(embedded);
    const [animPhase, setAnimPhase] = useState(0);
    const recognitionRef = useRef(null);
    const animFrameRef = useRef(null);
    const transcriptRef = useRef('');

    // Cleanup on unmount — abort recognition & cancel animation
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) { console.warn('[App] Handled exception:', e); }
                recognitionRef.current = null;
            }
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
        };
    }, []);

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
        if (!supported) { setError('Speech Recognition Is Not Supported In This Browser'); return; }

        // Abort any in-flight instance first — rapid taps used to leak the
        // previous SpeechRecognition object (and its live microphone stream).
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            recognitionRef.current = null;
        }

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
            if (event.error === 'not-allowed') setError('Microphone Permission Denied');
            else if (event.error === 'no-speech') setError('No Speech Detected. Try Again.');
            else setError(`Voice Search Error: ${String(event.error || 'Unknown').replace(/(^|[\s-])([a-z])/g, (m, lead, ch) => lead + ch.toUpperCase())}`);
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
            if (!embedded) setIsExpanded(false);
        }
    }, [result, onResult, embedded]);

    // In embedded mode the host modal owns open/close, so the panel is always shown.
    const panelOpen = embedded || isExpanded;

    // Generate waveform bars
    const waveformBars = Array.from({ length: 20 }, (_, i) => {
        const height = listening
            ? 8 + Math.abs(Math.sin((animPhase + i * 18) * Math.PI / 180)) * 24
            : 4;
        return height;
    });

    return (
        <div className={'voice-search-root' + (embedded ? ' embedded' : '')}>
            {/* Start / stop control on a painted action plate: a floating plate by
                default, inline when embedded. The label is its accessible name. */}
            <button
                type="button"
                className={'voice-fab' + (listening ? ' listening' : '')}
                onClick={() => {
                    if (listening) stopListening();
                    else if (!embedded && isExpanded) setIsExpanded(false);
                    else startListening();
                }}
                aria-label={listening ? 'Stop Listening' : (embedded ? 'Start Listening' : 'Voice Search')}
            >
                <span className="voice-fab__label">{listening ? 'Stop Listening' : (embedded ? 'Start Listening' : 'Voice Search')}</span>
            </button>

            {/* Expanded panel: printed straight onto the host console when
                embedded, on the painted result-panel chassis when floating. */}
            {panelOpen && (
                <VoicePanelFrame embedded={embedded}>
                    {!embedded && (
                        <div className="voice-panel-header">
                            <h3>Voice Search</h3>
                            <button type="button" className="voice-panel-close" onClick={() => setIsExpanded(false)} aria-label="Close Voice Search">
                                <PokerNearMeConsoleIcon name="close" />
                            </button>
                        </div>
                    )}

                    {/* Live input level: the one thing the art does not paint. */}
                    {listening && (
                        <div className="voice-waveform" aria-hidden="true">
                            {waveformBars.map((h, i) => (
                                <div key={i} className="voice-bar" style={{ height: h }} />
                            ))}
                        </div>
                    )}

                    {/* Status */}
                    <div className="voice-status" role="status" aria-live="polite">
                        {listening && <span className="voice-status-text voice-status-text--live">Listening, Speak Now</span>}
                        {!listening && !result && !error && <span className="voice-status-text">{embedded ? 'Tap Start Listening, Then Speak' : 'Tap Voice Search, Then Speak'}</span>}
                        {error && <span className="voice-error" role="alert">{error}</span>}
                    </div>

                    {/* Transcript */}
                    {transcript && (
                        <div className="voice-transcript">
                            <span className="voice-transcript-label">You Said</span>
                            <p className="voice-transcript-text">&quot;{transcript}&quot;</p>
                        </div>
                    )}

                    {/* Parsed result */}
                    {result && (
                        <div className="voice-result">
                            <span className="voice-result-label">Understood</span>
                            <div className="voice-filter-tags">
                                {result.filters.gameType && <span className="voice-tag">{result.filters.gameType}</span>}
                                {result.filters.stakes && <span className="voice-tag">{result.filters.stakes}</span>}
                                {result.filters.radius && <span className="voice-tag">{result.filters.radius} Mi</span>}
                                {result.filters.venueType && <span className="voice-tag voice-tag--words">{result.filters.venueType.replace('_', ' ')}</span>}
                                {result.filters.minBuyin && <span className="voice-tag">Min ${result.filters.minBuyin}</span>}
                                {result.filters.maxBuyin && <span className="voice-tag">Max ${result.filters.maxBuyin}</span>}
                                {result.filters.useMyLocation && <span className="voice-tag">Near My Location</span>}
                                {result.searchQuery && <span className="voice-tag voice-tag--words">Search: {result.searchQuery}</span>}
                            </div>
                            <button type="button" className="voice-apply-btn" onClick={applyResult}>
                                <span className="voice-apply-btn__label">Apply Filters</span>
                            </button>
                        </div>
                    )}

                    {/* Not supported fallback */}
                    {!supported && (
                        <div className="voice-unsupported">
                            <p>Speech Recognition Is Not Supported In This Browser.</p>
                            <p>Try Chrome, Edge, Or Safari.</p>
                        </div>
                    )}

                    {/* Examples */}
                    <div className="voice-examples">
                        <span className="voice-examples-label">Try Saying</span>
                        <div className="voice-example-list">
                            <button type="button" className="voice-example" onClick={() => { setTranscript('Find me a 2/5 NLH game within 30 miles'); setResult(parseVoiceQuery('Find me a 2/5 NLH game within 30 miles')); }}>
                                <span className="voice-example__text">&quot;Find Me A 2/5 NLH Game Within 30 Miles&quot;</span>
                            </button>
                            <button type="button" className="voice-example" onClick={() => { setTranscript('PLO tournaments near Las Vegas'); setResult(parseVoiceQuery('PLO tournaments near Las Vegas')); }}>
                                <span className="voice-example__text">&quot;PLO Tournaments Near Las Vegas&quot;</span>
                            </button>
                            <button type="button" className="voice-example" onClick={() => { setTranscript('Casinos within 50 miles'); setResult(parseVoiceQuery('Casinos within 50 miles')); }}>
                                <span className="voice-example__text">&quot;Casinos Within 50 Miles&quot;</span>
                            </button>
                        </div>
                    </div>
                </VoicePanelFrame>
            )}

            {/* Painted controls only: the plates, wells and holders are console
                art (painted-controls-v1); no gradients, pills or hover states. */}
            <style dangerouslySetInnerHTML={{ __html: `
        /* Above the app footer (mobile standard: never hardcode 56). The plate
           is 348 x 114; 100 x 44 keeps a 44px target around it. */
        .voice-fab { position: fixed; bottom: calc(var(--sp-bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px); left: 16px; z-index: 900; display: grid; place-items: center; width: 112px; height: 44px; min-width: 44px; min-height: 44px; padding: 0; border: 0; border-radius: 0; background: transparent url('/images/pnm-console/painted-controls-v1/button-primary.png') center / contain no-repeat; box-shadow: none; color: #f4f7fb; font: 800 12px/1 var(--font-rajdhani), Rajdhani, Inter, sans-serif; font-size: 12px !important; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; touch-action: manipulation; }
        .voice-fab.listening { background-image: url('/images/pnm-console/painted-controls-v1/button-secondary.png'); color: #ff5b6e; }
        .voice-fab:active .voice-fab__label { filter: brightness(1.3); }
        .voice-fab:focus-visible { outline: 2px solid #8fd4ff; outline-offset: 2px; box-shadow: none; }
        .voice-popover { position: fixed; bottom: calc(var(--sp-bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 72px); left: 16px; z-index: 899; width: 340px; max-width: calc(100vw - 40px); }
        .voice-popover .voice-panel-body { padding-block: 4px 8px; }
        .voice-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .voice-panel-header h3 { margin: 0; color: #e4e7ec; font: 800 16px/1.2 var(--font-rajdhani), Rajdhani, Inter, sans-serif; font-size: 16px !important; letter-spacing: 0.08em; text-transform: uppercase; }
        .voice-panel-close { display: grid; place-items: center; width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 0; border: 0; background: none; cursor: pointer; touch-action: manipulation; }
        .voice-panel-close:focus-visible { outline: 2px solid #8fd4ff; outline-offset: 2px; box-shadow: none; }
        .voice-waveform { display: flex; align-items: center; justify-content: center; gap: 3px; height: 40px; margin-bottom: 12px; }
        .voice-bar { width: 4px; background: #45adff; transition: height 0.1s ease; }
        .voice-status { margin-bottom: 12px; text-align: center; }
        .voice-status-text { color: #9aa5b3; font: 600 13px/1.4 var(--font-inter), Inter, sans-serif; }
        .voice-status-text--live { color: #c8ffd2; }
        .voice-error { color: #ff5b6e; font: 600 13px/1.4 var(--font-inter), Inter, sans-serif; }
        .voice-transcript, .voice-result { margin-bottom: 12px; }
        .voice-transcript-label, .voice-result-label, .voice-examples-label { display: block; color: #45adff; font: 700 12px/1.2 var(--font-rajdhani), Rajdhani, Inter, sans-serif; letter-spacing: 0.14em; text-transform: uppercase; }
        .voice-transcript-text { margin: 6px 0 0; color: #e4e7ec; font: 600 15px/1.4 var(--font-inter), Inter, sans-serif; text-transform: capitalize; }
        .voice-filter-tags { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 8px 0 10px; }
        .voice-tag { color: #e4e7ec; font: 700 13px/1.3 var(--font-inter), Inter, sans-serif; }
        .voice-tag--words { text-transform: capitalize; }
        .voice-apply-btn { display: grid; place-items: center; width: 174px; height: 57px; margin: 0 auto; padding: 0; border: 0; border-radius: 0; background: transparent url('/images/pnm-console/painted-controls-v1/button-primary.png') center / contain no-repeat; box-shadow: none; color: #f4f7fb; font: 800 14px/1 var(--font-rajdhani), Rajdhani, Inter, sans-serif; font-size: 14px !important; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; touch-action: manipulation; }
        .voice-apply-btn:active .voice-apply-btn__label { filter: brightness(1.3); }
        .voice-apply-btn:focus-visible { outline: 2px solid #8fd4ff; outline-offset: 2px; box-shadow: none; }
        .voice-unsupported { padding: 12px 0; text-align: center; }
        .voice-unsupported p { margin: 0 0 4px; color: #9aa5b3; font: 500 13px/1.5 var(--font-inter), Inter, sans-serif; }
        .voice-examples { margin-top: 12px; }
        .voice-example-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .voice-example { --voice-row-w: 100%; display: flex; align-items: center; width: 100%; min-width: 0; box-sizing: border-box; aspect-ratio: 1829 / 313; margin: 0; padding: calc(var(--voice-row-w) * 0.0241) calc(var(--voice-row-w) * 0.08) calc(var(--voice-row-w) * 0.0498) calc(var(--voice-row-w) * 0.085); border: 0; border-radius: 0; background: transparent url('/images/pnm-console/painted-controls-v1/search-well.webp') center / contain no-repeat; box-shadow: none; color: #d7dee7; font: 600 13px/1.2 var(--font-inter), Inter, sans-serif; font-size: 13px !important; text-align: left; cursor: pointer; touch-action: manipulation; }
        .voice-example__text { display: -webkit-box; min-width: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .voice-example:active .voice-example__text { filter: brightness(1.3); }
        .voice-example:focus-visible { outline: 2px solid #8fd4ff; outline-offset: -4px; box-shadow: none; }
        .voice-search-root.embedded { display: block; width: 100%; }
        .voice-search-root.embedded .voice-fab { position: static; width: 174px; height: 57px; margin: 0 auto 14px; font-size: 13px !important; }
        .voice-search-root.embedded .voice-panel-body { width: 100%; }
      ` }} />
        </div>
    );
}

// The floating popover is the compact three-slice result panel from the console
// kit. Embedded, the host (the lobby's Voice Search console) is already the
// frame, so the content prints directly on its glass: never a frame on a frame.
function VoicePanelFrame({ embedded, children }) {
    if (embedded) return <div className="voice-panel-body">{children}</div>;
    return (
        <PokerNearMePanelShell as="div" className="voice-popover" bodyClassName="voice-panel-body">
            {children}
        </PokerNearMePanelShell>
    );
}
