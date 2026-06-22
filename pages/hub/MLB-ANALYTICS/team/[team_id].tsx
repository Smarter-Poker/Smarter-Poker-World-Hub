// Path alias for older links. The standings + teams-list pages historically linked to the
// singular /hub/MLB-ANALYTICS/team/<id>, but the canonical route is /teams/[team_id] (plural),
// so those links hit the catch-all 404. Re-export the same client dashboard component here so
// the singular path renders the full team page. The component reads `team_id` from
// router.query, and this dynamic segment is also named [team_id], so the id resolves identically.
export { default } from '../teams/[team_id]';
