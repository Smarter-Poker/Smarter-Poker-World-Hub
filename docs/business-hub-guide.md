# Customer guide and Business Agent review

The maintained guide is `src/lib/businessHubGuide.mjs`, rendered at `/hub/help#start` and linked from the homepage/About catalogue. English and Spanish share destination IDs. Export reviewed agent knowledge with `node --input-type=module -e "import {businessHubKnowledge} from './src/lib/businessHubGuide.mjs'; console.log(businessHubKnowledge('en')); console.log(businessHubKnowledge('es'));"`.

Do not automatically publish exported text. Save a materially changed candidate in the existing Business Hub profile, fully reload its native preview, test changed topics, and use the supported publication action once eligible. Keep the prior agent live. Read the exact saved revision, unpublished-change flag and Live state after a full reload. A review-required result is an external dependency, not permission to resubmit unchanged text.

## Triggered review and focused regression

The guide contract runs in the existing pre-push hook and required source-contract gate. `business-hub-guide-review.json` seals the directly relevant Terms, Official Rules, public product catalogue and guide facts. A changed hash deliberately fails with the source path requiring review. Review feature, pricing, eligibility, payment, support and terms changes before refreshing only the reviewed hashes. This is a content-review trigger, not a scheduled job or a release bot.

For every changed topic check availability versus eligibility; optional purchases versus free play; chips/Diamonds versus cash; private club approval; venue activation; and safe account help. Confirm destinations, EN/ES parity and rendered mobile behavior. Test changed answers in a fully reloaded native preview. Reuse passing evidence for unchanged guidance. Record source version, exact hosted revision, tests and publication readback in the existing task handoff. Never request passwords, verification codes, government ID or financial credentials in a conversation.

## Measures and practical limits

Business Hub's native Insights are the authority for its reported mentions and clicks. They do not establish recommendations, placement, useful answers or completed onboarding. Record the displayed date range and definitions; do not combine unlike counters into a conversion rate.

The website guide uses only an already-loaded PostHog instance with explicit opt-in, no opt-out, no DNT and no GPC. It does not load an SDK or change consent. Events are `business_hub_guide_view`, `business_hub_destination_click` and `business_hub_feedback`; only fixed topic, language, source, destination ID and helpful boolean are accepted. No free text, query string or account data is collected by these events. Missing consent/SDK means unmeasured. SDK acceptance is not confirmed network delivery.

Compare helpful feedback with total submitted feedback and show the sample size; track correct destinations separately. A click establishes intent only. Session attribution may accompany existing downstream events, subject to the same consent. `signup` follows a provisioning attempt; `first_login` is an account-age heuristic; `bankroll_first_entry` is a best-effort callback. None alone proves full onboarding. Completed training requires the existing successful save-session RPC and linked completed, non-practice attempt. Venue onboarding and club approval require their owning flow's actual confirmed state; this guide cannot certify them.

Do not create fictitious conversion totals when outcome/attribution access is absent. No standalone public Business Agent link is exposed by the current management interface. Native preview tests are not public customer conversations. Publish/readback verifies publication separately from response behavior. Never promise search placement, recommendations, traffic, earnings, licensing or unverified security outcomes.

## Tool chooser and venue inquiry

The existing Help guide includes a goal selector backed by the same five product definitions. `businessHubJourney.mjs` adds reviewed access/availability explanations in English and Spanish. No account is required to read the chooser. A selected tool links directly to the official destination. Commander also links to `/hub/help#venue-inquiry`.

The venue composer requests only venue name, city/region and one fixed tool category. It prepares an encoded email to `support@smarter.poker`; the customer reviews and sends it using their email app. The page has no submission endpoint, sends no email itself, stores no typed fields, and never claims receipt or venue activation. A readable draft provides a fallback when mailto handling is unavailable. The whole inquiry section uses PostHog's `ph-no-capture` privacy class to block automatic DOM capture and session replay of typed fields and the email href. Explicit consented events contain only fixed values: `business_hub_goal_selected` and `business_hub_draft_prepared`. Both measure intent, not completed onboarding.

## Operator growth scorecard

Open `/admin/signup-health#growth-scorecard` through the existing operator account. The existing authenticated `auth-health-data?view=signup` endpoint supplies aggregate data; the same loader serves its secret-authenticated SSR path. No new privileges, credentials, database schema or public analytics endpoint are introduced.

The rolling seven-day half-open UTC window is displayed explicitly. Profile creation counts include all account types. Existing account activity uses the profile's latest activity timestamp and is not a retention cohort. Verified training rows require a materialized session linked to its own completed, non-practice attempt. First recorded actions deduplicate accounts across verified training and ledger history and exclude accounts with an earlier recorded action. Ledger records measure user-entered data, never money or financial transactions. These metrics cover all sources and cannot establish Business Hub attribution. Visitor qualification and received venue-email counts remain unavailable until their authoritative reporting sources are connected.

Histories are paginated, bounded to 10,000 rows per source and checked for complete/stable counts. Read errors, missing counts, changing snapshots and over-limit histories produce `Unavailable`, never zero or partial totals. No account identifiers or ledger amounts are returned. The scorecard reloads on demand; it has no timer or repair job.

## Factual update checklist

1. When a sealed product page, Terms, Official Rules or guide changes, identify the affected feature, access, pricing, launch and support statements.
2. Check availability separately from eligibility and membership. Preserve chips/payment/cash-out and safe-support boundaries.
3. Update the shared facts and both languages together. Verify the exact official destinations and the relevant chooser/inquiry behavior.
4. Refresh only reviewed source hashes and run the affected maintained tests. Refresh the native agent only when its facts or guidance actually change; preserve its Live version while a replacement is pending.
5. Publish through the maintained route, verify actual served identity and changed behavior, and record any measurement or platform limitation in the existing handoff.
