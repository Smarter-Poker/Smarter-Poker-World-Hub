-- Create a premium view for the Teams Terminal Page
-- Merges base profile (streaks/splits) with advanced Sabermetrics from agg_team

CREATE OR REPLACE VIEW v_team_terminal_stats AS
SELECT 
    vtp.team_id,
    vtp.name,
    vtp.abbr,
    vtp.streaks,
    vtp.splits,
    (
        SELECT row_to_json(a)
        FROM (
            SELECT 
                era, fip, xfip, siera, pitching_war,
                avg, obp, slg, ops, hr, sb, hitting_war,
                def, uzr, drs, oaa
            FROM agg_team agg
            WHERE agg.team_id = vtp.team_id
              AND agg.window_kind = 'season'
            ORDER BY agg.as_of DESC
            LIMIT 1
        ) a
    ) as adv_stats
FROM v_team_profile vtp;
