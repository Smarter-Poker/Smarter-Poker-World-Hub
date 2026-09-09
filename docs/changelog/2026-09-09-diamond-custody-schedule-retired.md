# Diamond Custody Schedule Retired

Production migrations `20260909164740` and `20260909164847` seal the old custody entry points and replace release with one atomic transaction. They remove `fn_poker_diamond_recover_releases`, `fn_poker_diamond_reconcile`, and `poker_diamond_obligations`.

The proposed every-minute recovery schedule and its worker mapping are withdrawn before publication. No recurring caller should target those retired functions. This change preserves the remaining Open Claw jobs and alerts. The corresponding worker endpoint retirement is published through the workers repository.

Phase 3 custody UI publication and live acceptance remain separate, uncompleted release gates.
