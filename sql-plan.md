# SQL Upgrade Plan
Update `get_portfolio_stats` to accept:
- `p_days INT DEFAULT NULL`
- `p_market TEXT DEFAULT NULL`

Then in `pages/api/mlb/portfolio.ts`, read `req.query.days` and `req.query.market` and pass them to the RPC.
In `portfolio.tsx`, add filter buttons at the top of the page.
