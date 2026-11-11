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
