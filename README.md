# Smarter.Poker World Hub

The world's most immersive poker training and discovery platform.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- **Frontend:** Next.js 14, React 18, Tailwind CSS
- **3D/Animation:** Three.js, Framer Motion, GSAP
- **State:** Zustand
- **Backend:** Supabase (PostgreSQL + Auth)
- **Deployment:** Vercel

## Project Structure

```
├── pages/              # Next.js pages and API routes
├── src/
│   ├── components/     # React components
│   ├── stores/         # Zustand state stores
│   ├── services/       # Business logic
│   └── engine/         # Training game engine
├── scripts/            # Data pipeline and automation
├── supabase/           # Database migrations
├── public/             # Static assets
└── docs/               # Architecture documentation
```

## Key Features

- **Training Hub** - GTO poker training with 100+ games
- **Poker Near Me** - Find venues and tournaments (777 US venues)
- **Social Hub** - Community feed and content

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

## Documentation

See `docs/architecture/` for detailed architectural guidelines.
