![Build Safety Gate](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/workflows/build-safety-gate.yml/badge.svg)

# 🌐 Smarter.Poker — World Hub

> **The command center for the Smarter.Poker ecosystem** — a Next.js application serving as the main entry point at [smarter.poker](https://smarter.poker).

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![React](https://img.shields.io/badge/React-19-blue)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-green)

## Architecture

The World Hub hosts multiple "orbs" (feature modules) as sub-routes:

| Orb | Route | Description |
|-----|-------|-------------|
| Club Arena | `/hub/club-arena` | Private poker clubs |
| GTO Training | `/hub/training` | Solver-backed training |
| Trivia Hub | `/hub/trivia` | Poker trivia games |
| Bankroll | `/hub/bankroll` | Financial tracking |
| Poker Near Me | `/hub/poker-near-me` | Venue intelligence |
| Personal Assistant | `/hub/assistant` | AI coaching |

## Development

```bash
npm install
npm run dev        # Start local dev server
npm run build      # Production Next.js build
```

## CI/CD Pipeline

All deployments are gated by the **Build Safety Gate** workflow:

1. **6 Pre-Deploy Checks** — Static analysis, Supabase query safety, hook import validation
2. **Next.js Compilation** — Full production build with 4GB heap
3. **Vercel Deploy** — Only after all checks pass
4. **Post-Deploy Verification** — Live security header verification on smarter.poker

### Manual Deploy

Use the **Manual Deploy** workflow in GitHub Actions for emergency or preview deploys.

## Security Headers

All responses include 5 hardened security headers (configured in `vercel.json`):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-XSS-Protection: 1; mode=block`

## CODEOWNERS

Critical paths (CI, security, API routes) require admin review — see `.github/CODEOWNERS`.

