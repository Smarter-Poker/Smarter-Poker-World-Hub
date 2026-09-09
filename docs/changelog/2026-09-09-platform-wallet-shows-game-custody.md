# Platform Wallet Shows Game Custody

Phase 4 live inspection found that the World Hub wallet still labeled spendable funds simply Diamonds and omitted in-play custody. It now labels Available Diamonds and displays Diamonds In Play from the existing authenticated fn_poker_diamond_custody_balance function. Errors remain unavailable rather than showing a false zero. Refresh follows available-balance changes, focus, visibility and auth changes. This is a read-only display; no funding writer or policy changes.

The atomic transfer release is already published as bddc1f2b45676cc6019f7001677b6d72515d0d50, verified through production health and its POST-only endpoint at 20:30 UTC on September 9. Live recipient selection opened successfully. This display change still requires normal CI, publication and live verification.
