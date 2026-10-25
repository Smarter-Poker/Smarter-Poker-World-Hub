# All unread messages in the main Messenger feed

The default personal feed omitted unread club messages even though the Club Arena badge counted them. The main feed now combines personal history with unread conversations from every currently authorized club workspace, including visible private invoice discussions. Existing unread-first sorting and badges keep their actual unread counts. Read action-required invoices are not relabeled unread. Explicit club folders retain their scope.

Selecting a club item uses the existing authorized workspace resolver before opening it or updating read state. Superseded selections cannot accept delayed responses. Active membership and private invoice visibility remain authoritative; failures return unavailable rather than a partial feed.

The existing required workspace and conversation-link tests cover all-workspace ordering, read transitions, revoked membership, hidden invoices, authority failures and click routing. No engine changes or financial writes.
