# An unanswered welcome thread still opens for its sender (2026-11-19)

## Why

Club Arena migration `20261119015312` changes `fn_get_user_conversations`: a one-to-one thread that holds only the viewer's own club welcome messages is no longer listed in that viewer's inbox until somebody writes in it. On production on 2026-11-18 one club owner held 1,299 personal threads and 1,272 of them were welcome-only.

`getMessengerWorkspace` authorizes opening, reading, marking read, searching and sending in one conversation through that same reader (`workspace: 'resolve'`). A conversation the reader does not list falls to the empty-thread branch, which accepts only a thread with no message rows at all. A welcome-only thread has rows, so after the migration its sender would have received 404 Conversation Unavailable and could never write the first real message to a member they had welcomed.

## What changed

`src/lib/messengerWorkspace.mjs`: the fallback branch now also resolves a thread when every message row is a club welcome sent by the caller (`sender_id` is the caller and `media_metadata.club_welcome` is `true`). The earlier checks still run first: participation, club context, active membership and private accounting. A thread with any other row (a reply, an invoice, an unflagged message) is not resolved by this branch, because the reader had another reason to omit it. A welcome-only thread whose other person no longer exists stays unavailable, as does a group. The proof reads at most 200 rows and refuses a thread that reaches that bound.

Once the sender writes a message of their own, the reader lists the thread again and this branch is no longer involved.

## Order of release

This change is inert until the migration is installed, because today the reader lists these threads and the fallback is never reached for them. It must be live before the Club Arena migration is merged.

## Tests

`__tests__/messenger-workspace.test.mjs`: a welcome-only thread is absent from the social list and resolves for full, authorize-only and counts-only requests; threads with a reply, an unflagged own message, a false flag, a welcome from the other person, a string flag, a missing counterpart profile, or 200 rows stay 404; a non-participant gets 403. On the previous source the first of these fails with 404. The existing empty-thread outage test now stubs the new column list.
