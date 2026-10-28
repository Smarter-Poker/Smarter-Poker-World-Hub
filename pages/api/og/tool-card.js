/**
 * Dynamic OpenGraph Tool & Calculator Social Card Generator
 * GET /api/og/tool-card?tool=odds&title=Poker+Odds+Calculator&subtitle=Multiway+Equity+Simulation
 *
 * Generates an authoritative, branded 1200x630 social card using @vercel/og (Satori)
 * for Smarter.Poker calculators, preflop range matrices, and strategy utilities.
 * Every JSX element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tool = (searchParams.get('tool') || 'tool').toLowerCase();
    const isFreerolls = tool === 'freerolls';
    const isCompare = tool === 'compare';

    const defaultTitle = isFreerolls
      ? '$2,000 In Daily Poker Freerolls'
      : isCompare
        ? 'Free Poker Software & Platform Alternatives'
        : 'Smarter.Poker Strategy Tool';

    const defaultSubtitle = isFreerolls
      ? 'Daily Free Entry Tournaments • Real Cash Prizes • Zero Deposit Required'
      : isCompare
        ? 'Compare Free GTO Solvers, Odds Calculators & Freerolls vs. Paid Tools'
        : 'Free Interactive GTO Preflop Charts, Multiway Equity & ICM Calculators';

    const defaultStatLabel = isFreerolls
      ? 'DAILY PRIZE GUARANTEE'
      : isCompare
        ? 'ANNUAL SUBSCRIPTION COST'
        : 'SIMULATION ENGINE';

    const defaultStatValue = isFreerolls
      ? '$2,000+ DAILY'
      : isCompare
        ? '$0 (100% FREE)'
        : '100% FREE';

    const title = searchParams.get('title') || defaultTitle;
    const subtitle = searchParams.get('subtitle') || defaultSubtitle;
    const statLabel = searchParams.get('statLabel') || defaultStatLabel;
    const statValue = searchParams.get('statValue') || defaultStatValue;

    const defaultBadge = isFreerolls
      ? 'DAILY $2,000 FREEROLLS'
      : isCompare
        ? 'SOFTWARE COMPARISON'
        : tool === 'odds'
          ? 'EQUITY CALCULATOR'
          : tool === 'ranges'
            ? 'GTO PREFLOP MATRIX'
            : tool === 'icm'
              ? 'ICM PAYOUT SOLVER'
              : tool === 'glossary'
                ? 'POKER GLOSSARY'
                : tool === 'about'
                  ? 'ABOUT SMARTER.POKER'
                  : tool === 'embeds'
                    ? 'WEBMASTER EMBEDS'
                    : 'POKER STRATEGY TOOL';

    const badge = (searchParams.get('badge') || defaultBadge).toUpperCase();

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #070913 0%, #0d1527 50%, #060810 100%)',
            fontFamily: 'sans-serif',
            padding: '56px 64px',
            position: 'relative',
          }}
        >
          {/* Subtle Accent Glow */}
          <div
            style={{
              position: 'absolute',
              top: -80,
              right: -80,
              width: 380,
              height: 380,
              borderRadius: 190,
              background: isFreerolls
                ? 'radial-gradient(circle, rgba(255,215,0,0.2) 0%, rgba(255,215,0,0) 70%)'
                : 'radial-gradient(circle, rgba(0,212,255,0.18) 0%, rgba(0,212,255,0) 70%)',
              display: 'flex',
            }}
          />

          {/* Top Bar: Brand + Tool Category Badge */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 26,
                  fontWeight: 900,
                  color: '#FFD700',
                  letterSpacing: 2,
                }}
              >
                SMARTER.POKER
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#00D4FF',
                  marginLeft: 14,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(0,212,255,0.12)',
                  border: '1px solid rgba(0,212,255,0.3)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                {badge}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                borderRadius: 999,
                background: isFreerolls
                  ? 'rgba(255,215,0,0.12)'
                  : 'rgba(57,233,165,0.12)',
                border: isFreerolls
                  ? '1px solid rgba(255,215,0,0.35)'
                  : '1px solid rgba(57,233,165,0.35)',
                color: isFreerolls ? '#FFD700' : '#39E9A5',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 0.8,
              }}
            >
              {isFreerolls
                ? 'ZERO DEPOSIT REQUIRED'
                : isCompare
                  ? '100% FREE ALTERNATIVES'
                  : 'ZERO ACCOUNT SETUP'}
            </div>
          </div>

          {/* Center Hero Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              marginTop: 12,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 54,
                fontWeight: 900,
                color: '#FFFFFF',
                lineHeight: 1.12,
                letterSpacing: -1,
                maxWidth: 980,
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 24,
                fontWeight: 500,
                color: '#94AFCC',
                lineHeight: 1.4,
                marginTop: 18,
                maxWidth: 920,
              }}
            >
              {subtitle}
            </div>
          </div>

          {/* Bottom Bar: Metric Card + Domain */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              paddingTop: 24,
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 20px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#8B949E',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {statLabel}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 22,
                    fontWeight: 800,
                    color: isFreerolls ? '#FFD700' : '#00D4FF',
                    marginTop: 4,
                  }}
                >
                  {statValue}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 20,
                fontWeight: 700,
                color: '#E6EDF3',
                letterSpacing: 0.5,
              }}
            >
              {isFreerolls
                ? 'Smarter.Poker/Freerolls'
                : isCompare
                  ? 'Smarter.Poker/Compare'
                  : 'Smarter.Poker/Tools'}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (err) {
    return new Response('Failed to generate tool social card', { status: 500 });
  }
}
