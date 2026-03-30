# Context: Supabase RPC Functions in Use

**Audited:** 2026-03-29
**Source:** grep across pages/ directory

## RPC Inventory

| RPC Function | Usage Count | Category | Called From |
|---|---|---|---|
| `add_diamonds_to_balance` | 20+ | Financial | Trivia rewards, PvP, arcade, daily login, store webhooks, cron cleanup |
| `deduct_diamonds` | 1 | Financial | Diamond store purchases |
| `increment_post_count` | 4 | Social | Reels (views, likes, shares, comments) |
| `decrement_post_count` | 3 | Social | Reels (unlike, delete comment) |
| `fn_send_message` | 1 | Messenger | Hub messenger |
| `fn_get_or_create_conversation` | 1 | Messenger | Hub messenger |
| `fn_search_messages` | 1 | Messenger | Hub messenger |
| `fn_toggle_message_reaction` | 1 | Messenger | Hub messenger |
| `fn_delete_message` | 1 | Messenger | Hub messenger |
| `fn_update_presence` | 1 | Messenger | Hub messenger |
| `check_username_available` | 1 | Auth | Signup flow |
| `initialize_player_profile` | 1 | Auth | Signup flow |
| `get_daily_challenge` | 1 | Games | Memory games stats |
| `get_user_achievements` | 1 | Games | Memory games achievements |
| `get_arcade_leaderboard` | 1 | Games | Arcade leaderboard API |
| `check_duplicate_clips` | 1 | Admin | Admin clip checker |
| `increment_share_view` | 1 | Social | Sandbox share tracking |

## Critical RPCs

**`add_diamonds_to_balance`** is the most critical — used 20+ times across the platform for all diamond economy transactions. Parameters:
- `p_user_id` (UUID)
- `p_amount` (integer, can be negative for deductions via separate RPC)
- `p_type` (string: 'daily_login', 'pvp_win', 'pvp_refund', 'trivia_reward', 'arcade_reward', etc.)
- `p_description` (string: human-readable with emoji)
- `p_reference_id` (nullable string: match ID, etc.)

## Security Notes

- Client-side pages call RPCs directly via Supabase client (anon key) — RLS must protect these
- API routes use service role key via getSupabase() — bypasses RLS
- The `deduct_diamonds` RPC should have its own balance check to prevent negative balances
- Messenger RPCs (fn_*) should have RLS ensuring users can only access their own conversations
