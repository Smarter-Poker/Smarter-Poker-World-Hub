/**
 * Dynamic OpenGraph Poker Tournament Series Social Card Generator
 * GET /api/og/series-card?id=468&name=2026+WSOP+Circuit&venue=Horseshoe+Las+Vegas&city=Las+Vegas&state=NV&events=18&buyin=1700&guarantee=1000000&dates=Feb+25+-+Mar+31
 *
 * Generates an authoritative, branded 1200x630 social card using @vercel/og (Satori).
 * Formats series identity, dates, buy-in, guarantees, event counts, and tour branding.
 * Every JSX element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const LOGO_TYPES = /^image\/(png|jpe?g|gif|webp)\b/i;
const LOGO_MAX_BYTES = 2_000_000;

async function embeddableLogo(url) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !LOGO_TYPES.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > LOGO_MAX_BYTES) return null;
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return `data:${type.split(';')[0].trim()};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    const name = searchParams.get('name') || 'Poker Tournament Series';
    const venue = searchParams.get('venue') || '';
    const city = searchParams.get('city') || '';
    const state = searchParams.get('state') || '';
    const events = searchParams.get('events') || '';
    const buyin = searchParams.get('buyin') || '';
    const guarantee = searchParams.get('guarantee') || '';
    const dates = searchParams.get('dates') || '';
    const logoParam = searchParams.get('logo') || '';

    const location = [venue, city, state].filter(Boolean).join(' • ');
    const logo = await embeddableLogo(logoParam);

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #090a18 0%, #151636 50%, #080914 100%)',
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
              background: 'radial-gradient(circle, rgba(255,215,0,0.18) 0%, rgba(255,215,0,0) 70%)',
              display: 'flex',
            }}
          />

          {/* Top Bar: Brand + Category */}
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
                  color: '#FFD700',
                  marginLeft: 14,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,215,0,0.12)',
                  border: '1px solid rgba(255,215,0,0.3)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                TOURNAMENT SERIES
              </div>
            </div>

            {dates && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#FFFFFF',
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  letterSpacing: 0.5,
                }}
              >
                📅 {dates}
              </div>
            )}
          </div>

          {/* Main Content: Logo + Series Name & Venue */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 20,
              marginBottom: 20,
            }}
          >
            {/* Logo / Trophy Emblem */}
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                border: '4px solid rgba(255,215,0,0.5)',
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#13182b',
                display: 'flex',
                marginRight: 36,
                flexShrink: 0,
              }}
            >
              {logo ? (
                <img
                  src={logo}
                  width={140}
                  height={140}
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    fontSize: 64,
                    fontWeight: 900,
                    color: '#FFD700',
                  }}
                >
                  🏆
                </div>
              )}
            </div>

            {/* Series Title and Location */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: name.length > 34 ? 42 : 50,
                  fontWeight: 900,
                  color: '#FFFFFF',
                  lineHeight: 1.15,
                  letterSpacing: -0.5,
                }}
              >
                {name}
              </div>

              {location && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 24,
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginTop: 10,
                  }}
                >
                  📍 {location}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Bar: Key Tournament Highlights */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: 24,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {events && events !== '0' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginRight: 28,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 22,
                      fontWeight: 800,
                      color: '#FFD700',
                      marginRight: 8,
                    }}
                  >
                    {events}
                  </div>
                  <div style={{ display: 'flex', fontSize: 16, color: '#94A3B8' }}>
                    Events
                  </div>
                </div>
              )}

              {buyin && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginRight: 28,
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 16, color: '#94A3B8', marginRight: 6 }}>
                    Main Buy-In:
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 20,
                      fontWeight: 800,
                      color: '#FFFFFF',
                    }}
                  >
                    ${Number(buyin).toLocaleString('en-US')}
                  </div>
                </div>
              )}

              {guarantee && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginRight: 28,
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 16, color: '#94A3B8', marginRight: 6 }}>
                    GTD:
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 20,
                      fontWeight: 800,
                      color: '#4ADE80',
                    }}
                  >
                    ${Number(guarantee).toLocaleString('en-US')}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 18,
                fontWeight: 700,
                color: '#64748B',
                letterSpacing: 0.5,
              }}
            >
              smarter.poker/hub/series/{id || ''}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    return new Response(`Failed to generate series card: ${err.message}`, { status: 500 });
  }
}
