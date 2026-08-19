# 2026-08-19 — Every "Blocked" deployment traced to commit author identity

## Symptom
Production deployments kept appearing in the Vercel dashboard as red
**Blocked**, repeatedly, across several hours and several agents' work. They
never built at all (`get_deployment_build_logs` returns "No build log events
found" — the build never started, so there is nothing to debug in the logs).

## Cause
Vercel refuses to build a commit whose GitHub author it cannot resolve to a
known user. The correlation is total, with no exceptions in the sampled window:

| Deployment | Author | Result |
|---|---|---|
| 7f71df4 | `Claude (Cowork) <smarterpoker45@gmail.com>` | BLOCKED |
| 706be70 | `Claude (Cowork) <smarterpoker45@gmail.com>` | BLOCKED |
| b44f88f | `Claude (Cowork) <smarterpoker45@gmail.com>` | BLOCKED |
| e0405913 | `Claude (Cowork) <smarterpoker45@gmail.com>` | BLOCKED |
| 1da2654 | `Smarter-Poker <...@users.noreply.github.com>` | READY |
| b5f0bb7 | `Smarter-Poker <...@users.noreply.github.com>` | READY |
| 55f8ce8 | `github-actions[bot] <...@users.noreply.github.com>` | READY |
| 296b7e5 | `github-actions[bot] <...@users.noreply.github.com>` | READY |

In the Vercel deployment metadata the blocked ones carry **no**
`githubCommitAuthorLogin` field; every READY one has it. `smarterpoker45@gmail.com`
is not attached to the GitHub account (the account uses the noreply alias), so
GitHub reports no author login and Vercel blocks the deployment.

This is a straight violation of **RULE 3** in `.agent/CLAUDE_AGENT_RULES.md`,
which already says: all commits use
`Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>`, and
"Never commit using a personal email (@gmail.com, ...)". The rule existed; the
agent passed `-c user.email=smarterpoker45@gmail.com` anyway.

## Why it was easy to miss
Blocked commits are not lost — they sit on `main`, and the next deployment that
*does* build (from a later, correctly-authored commit) includes them, because
git history is cumulative. So the work appears to ship, just late and via
someone else's build. The failure only becomes visible if a blocked commit is
the last one pushed, in which case its content stays undeployed indefinitely.

At the time of writing that had already happened to real code: `e0405913`
(shop admin route unification + limited-stock items, another agent's work) was
on `main` and had never been built.

## Fix
Commit with the RULE 3 identity. Concretely, never pass a `-c user.email` that
is not the noreply alias:

    git -c user.name="Smarter-Poker" \
        -c user.email="254329056+Smarter-Poker@users.noreply.github.com" \
        commit -m "..."

## How to check quickly
    # any recent commit with a personal email is a deploy that will block
    git log --format='%h %an <%ae> %s' origin/main -20 | grep -i gmail

    # or, from the Vercel side, a BLOCKED deployment with no build logs
    # is an author-identity block, not a build failure
