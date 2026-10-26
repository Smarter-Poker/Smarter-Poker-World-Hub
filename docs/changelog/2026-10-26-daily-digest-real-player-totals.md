# Real Player Totals in the daily operations digest

Owner request, 2026-10-25: the daily report shows what every real player did that Central day. A Real Player Totals card now follows Month To Date in the email, the plain-text version and the signed online view.

The card opens with the day's totals: real players who played, hands and time played, what the players won or lost split between cash games and tournaments, rake paid for cash games, for tournaments and in total, and the chip wallets of those players at the end of the day. Diamond Arena results are shown in diamonds on their own line and never added to chip totals.

Each player then gets a block, biggest winner first: their result, time played and hands, rake paid split cash and tournament, chip wallet and diamonds at the end of the day, and every game they played with its own result, hands, time and rake. A recurring tournament is one line with a count.

The numbers come from Club Arena's `fn_sp_digest_player_totals` (migration 20261026033215, installed 2026-10-26), read only and service-role only. Real players are the digest's existing real-player set. If the totals cannot be built, the digest still sends and the card says so. No delivery, schedule or financial behavior changes.
