/**
 * Dynamic OpenGraph Venue Social Card Generator
 * GET /api/og/venue-card?id=3109&name=Grand+Victoria+Casino&city=Elgin&state=IL&type=casino&tables=8
 *
 * Generates an authoritative, branded 1200x630 social card using @vercel/og (Satori).
 * Formats venue identity, geo-location, table counts, and verified logo badges.
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
    const name = searchParams.get('name') || 'Poker Venue';
    const city = searchParams.get('city') || '';
    const state = searchParams.get('state') || '';
    const type = (searchParams.get('type') || 'poker_room').replace(/_/g, ' ').toUpperCase();
    const tables = searchParams.get('tables') || '';
    const logoParam = searchParams.get('logo') || (id ? `https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/venue-logos/${id}.png` : '');

    const location = [city, state].filter(Boolean).join(', ');
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
              background: 'radial-gradient(circle, rgba(0,212,255,0.18) 0%, rgba(0,212,255,0) 70%)',
              display: 'flex',
            }}
          />

          {/* Top Bar: Brand + Venue Type Badge */}
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
                POKER NEAR ME
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 14,
                fontWeight: 700,
                color: '#E4E6EB',
                padding: '6px 14px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.16)',
                letterSpacing: 1,
              }}
            >
              {type}
            </div>
          </div>

          {/* Main Center Content: Logo + Venue Details */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 20,
              marginBottom: 20,
            }}
          >
            {/* Logo / Monogram Circle */}
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                border: '4px solid rgba(0,212,255,0.5)',
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0e172a',
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
                    color: '#00D4FF',
                  }}
                >
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Venue Name & Location */}
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
                  fontSize: name.length > 32 ? 44 : 52,
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
                    fontSize: 26,
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

          {/* Bottom Bar: Key Highlights & Domain Verification */}
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
              {tables && tables !== '0' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginRight: 24,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 20,
                      fontWeight: 800,
                      color: '#00D4FF',
                      marginRight: 8,
                    }}
                  >
                    {tables}
                  </div>
                  <div style={{ display: 'flex', fontSize: 16, color: '#94A3B8' }}>
                    Poker Tables
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 16,
                  color: '#4ADE80',
                  fontWeight: 600,
                }}
              >
                ✓ Live Schedules & Cash Games
              </div>
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
              smarter.poker/hub/venues/{id || ''}
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
    return new Response(`Failed to generate venue card: ${err.message}`, { status: 500 });
  }
}
