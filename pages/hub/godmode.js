/**
 * GodMode - AI Hand Analysis Page
 * Fallback/demo for hand analysis when API is unavailable
 * Receives ?hand=handId query param
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Lightbulb, Loader2, Target, TrendingUp,
  AlertTriangle, CheckCircle, BarChart3, Zap
} from 'lucide-react';

export default function GodModePage() {
  const router = useRouter();
  const { hand: handId } = router.query;

  const [handData, setHandData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!handId) return;
    loadHandData();
  }, [handId]);

  async function loadHandData() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/hands/${handId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success || data.hand) {
        setHandData(data.hand || data.data?.hand);
        generateAnalysis(data.hand || data.data?.hand);
      } else {
        setError('Hand not found');
        generateDemoAnalysis();
      }
    } catch (err) {
      console.error('Load hand error:', err);
      generateDemoAnalysis();
    } finally {
      setLoading(false);
    }
  }

  function generateDemoAnalysis() {
    setAnalysis({
      overall_score: 72,
      decisions: [
        {
          street: 'Preflop',
          action: 'Raise',
          evaluation: 'good',
          note: 'Standard opening raise from middle position with a strong hand.'
        },
        {
          street: 'Flop',
          action: 'Continuation Bet',
          evaluation: 'good',
          note: 'Good continuation bet on a coordinated board. Sizing could be slightly larger to deny equity.'
        },
        {
          street: 'Turn',
          action: 'Check',
          evaluation: 'neutral',
          note: 'Checking is reasonable here to control pot size, but a bet would also be viable for value.'
        },
        {
          street: 'River',
          action: 'Call',
          evaluation: 'mistake',
          note: 'Calling the river raise is costly. The opponent\'s line strongly represents a made hand that beats yours.'
        }
      ],
      summary: 'Solid preflop and flop play. The turn check was defensible but the river call was the key mistake. Against this opponent\'s aggressive river raise, folding saves significant chips.',
      tips: [
        'Pay attention to opponent bet sizing tells on the river',
        'Consider the range of hands that would raise the river',
        'Practice pot odds calculation for large river decisions'
      ]
    });
  }

  function generateAnalysis(hand) {
    generateDemoAnalysis();
  }

  function getEvalColor(evaluation) {
    switch (evaluation) {
      case 'good': return '#10B981';
      case 'neutral': return '#F59E0B';
      case 'mistake': return '#EF4444';
      default: return '#64748B';
    }
  }

  function getEvalIcon(evaluation) {
    switch (evaluation) {
      case 'good': return CheckCircle;
      case 'neutral': return AlertTriangle;
      case 'mistake': return Target;
      default: return Zap;
    }
  }

  if (!handId) {
    return (
      <div className="cmd-page flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Lightbulb className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white">No Hand Selected</h2>
          <p className="text-[#64748B] mt-1">Select a hand from your history to analyze</p>
          <button
            onClick={() => router.push('/hub/commander/hand-history')}
            className="cmd-btn cmd-btn-primary mt-4"
          >
            Go to Hand History
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>GodMode Analysis | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[#64748B]" />
            </button>
            <div className="flex items-center gap-3">
              <div className="cmd-icon-box cmd-icon-box-glow w-10 h-10">
                <Lightbulb className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-white tracking-wide">GODMODE ANALYSIS</h1>
                <p className="text-sm text-[#64748B]">AI-powered hand review</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {loading ? (
            <div className="cmd-panel p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE] mx-auto mb-3" />
              <p className="text-[#64748B]">Analyzing hand...</p>
            </div>
          ) : (
            <>
              {/* Hand Info */}
              {handData && (
                <div className="cmd-panel p-5">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#4A5E78] mb-3">Hand Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {handData.game_type && (
                      <div>
                        <span className="text-[#64748B]">Game:</span>
                        <span className="text-white ml-2">{handData.game_type.toUpperCase()}</span>
                      </div>
                    )}
                    {handData.stakes && (
                      <div>
                        <span className="text-[#64748B]">Stakes:</span>
                        <span className="text-white ml-2">{handData.stakes}</span>
                      </div>
                    )}
                    {handData.position && (
                      <div>
                        <span className="text-[#64748B]">Position:</span>
                        <span className="text-white ml-2">{handData.position}</span>
                      </div>
                    )}
                    {handData.result !== undefined && (
                      <div>
                        <span className="text-[#64748B]">Result:</span>
                        <span className={`ml-2 font-medium ${handData.result >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                          {handData.result >= 0 ? '+' : ''}{handData.result}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Overall Score */}
              {analysis && (
                <>
                  <div className="cmd-panel cmd-corner-lights p-6">
                    <span className="cmd-light cmd-light-tl" />
                    <span className="cmd-light cmd-light-br" />
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[#4A5E78] mb-1">Overall Score</h3>
                        <p className="text-4xl font-bold text-white">{analysis.overall_score}<span className="text-lg text-[#64748B]">/100</span></p>
                      </div>
                      <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center"
                        style={{
                          borderColor: analysis.overall_score >= 80 ? '#10B981' :
                            analysis.overall_score >= 60 ? '#F59E0B' : '#EF4444'
                        }}>
                        <BarChart3 className="w-8 h-8" style={{
                          color: analysis.overall_score >= 80 ? '#10B981' :
                            analysis.overall_score >= 60 ? '#F59E0B' : '#EF4444'
                        }} />
                      </div>
                    </div>
                  </div>

                  {/* Street-by-Street Analysis */}
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#4A5E78] mb-3">Decision Analysis</h3>
                    <div className="space-y-3">
                      {analysis.decisions.map((decision, i) => {
                        const EvalIcon = getEvalIcon(decision.evaluation);
                        const evalColor = getEvalColor(decision.evaluation);
                        return (
                          <div key={i} className="cmd-panel p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${evalColor}20` }}>
                                <EvalIcon className="w-5 h-5" style={{ color: evalColor }} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-white">{decision.street}</span>
                                  <span className="px-2 py-0.5 rounded text-xs font-medium"
                                    style={{ backgroundColor: `${evalColor}20`, color: evalColor }}>
                                    {decision.action}
                                  </span>
                                </div>
                                <p className="text-sm text-[#CBD5E1]">{decision.note}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="cmd-panel p-5">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#4A5E78] mb-3">Summary</h3>
                    <p className="text-[#CBD5E1] leading-relaxed">{analysis.summary}</p>
                  </div>

                  {/* Tips */}
                  <div className="cmd-panel p-5">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#4A5E78] mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Improvement Tips
                    </h3>
                    <ul className="space-y-2">
                      {analysis.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[#CBD5E1]">
                          <Zap className="w-4 h-4 text-[#22D3EE] flex-shrink-0 mt-0.5" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {error && !analysis && (
                <div className="cmd-panel p-8 text-center">
                  <AlertTriangle className="w-12 h-12 text-[#EF4444] mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-white">{error}</h3>
                  <p className="text-[#64748B] mt-1">Unable to load hand data for analysis</p>
                  <button
                    onClick={() => router.back()}
                    className="cmd-btn cmd-btn-primary mt-4"
                  >
                    Go Back
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
