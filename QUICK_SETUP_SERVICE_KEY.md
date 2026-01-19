# Quick Setup: Add Service Role Key

**Current Blocker:** Missing `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

## 🔑 Get the Key (30 seconds)

1. Open: https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/settings/api
2. Scroll to "Project API keys"
3. Copy the **service_role** key (the secret one, not anon)

## ✏️ Add to .env.local

Open `/Users/smarter.poker/Documents/hub-vanguard/.env.local` and add:

```bash
SUPABASE_SERVICE_ROLE_KEY="paste-key-here"
```

## ⚡ Then I'll Auto-Execute

Once the key is added, I'll:
1. Start dev server (`npm run dev`)
2. Hit seed endpoint (`/api/poker/seed`)
3. Insert 30 venues + 77 tournaments
4. Run census verification
5. Report final numbers

**Total time:** 2 minutes
