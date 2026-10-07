# V31 Heads-Up Postflop Position Order

Pio player zero is out of position and acts first postflop. At a heads-up
table the Big Blind is OOP and the Small Blind/Button is IP, regardless of
which player raised preflop. Multiway dealt tables retain SB-before-BB order.

Manifest validation now refuses physical positions that contradict that
order. The existing input preparer inherits this check through load_manifest;
direct target-context construction independently refuses the same mismatch.
No input is silently swapped, since its licensed ranges, aggressor and model
identities must remain attached to the actual physical player.

Previously approved reversed-HU manifests and their artifacts remain
inactive and unqualified. This change does not rewrite or certify them.
Future corrected immutable inputs need genuine correctly bound ranges and
fresh preparation, approval, solves and unchanged quality qualification.

The focused regression failed before the source correction. Hermetic
pipeline tests cover HU limped, SRP, three-bet and four-bet aggressor bindings
and the contrasting multiway blind order. No new licensed solve or database
operation was performed for this source change.
