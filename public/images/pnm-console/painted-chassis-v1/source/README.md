# Poker Near Me painted chassis v1

This directory vendors the exact raster chassis used by the approved local
Club Arena console implementation and adds one Poker Near Me locator crest.
The upstream Club Arena files were untracked in that checkout when vendored;
the path and hashes below, rather than its repository commit, are the source
of truth.

## Base chassis provenance

Source root:
`/Users/smarter.poker/Documents/club-arena/public/assets/club-buttons/console/spade-console-v1/`

| File | Size | SHA-256 |
| --- | ---: | --- |
| `top.png` | 1000 x 348 | `9593ef2a932c64595dfd920628e27eee70e0f1b88cc2b09788026796a263b564` |
| `top-flat.png` | 1000 x 348 | `87f93a62ed1c577d9c6ede7259ea023dbbefc498ec133733eded310fa33ec7ed` |
| `top-club.png` | 1000 x 348 | `13fd37e6fa2a586ea14688b2cf9d44aa40a1adaa15be6e151e4d006f9941d7cc` |
| `top-diamond.png` | 1000 x 348 | `a80f9e8b6f0ad9def41979a112c4e75ec0135dd70251514d899674f9bbfdbcf7` |
| `top-vip.png` | 1000 x 348 | `a1462f725ba00a43b94e5f23b7f4e36446ad30cf430fd7761df0cf3fe5cce0ae` |
| `mid.png` | 1000 x 8 | `3643e1688ff20e0383d8c14acf17e848731765b8fd38f69af5afa4d57e4fa6e3` |
| `bottom-foot.png` | 1000 x 72 | `9e68d4067af5b1caaa69d73de2dd14d28c9301d41ee17f56b83af686e7d4e138` |
| `bottom-plates.png` | 1000 x 277 | `ef5934068adbb2327351f9cf21c192106af83d9252a8c0a0f3f77fbd4d547fa7` |

The three retained upstream crest sources are transparent 1024 x 1024 PNGs:

| File | SHA-256 |
| --- | --- |
| `crest-club.png` | `5cdf5aa79d257f475ac4a8bf7e54391d2842ba5f1129fccf97ef1cf746c334b8` |
| `crest-diamond.png` | `9eb1cfd32f5c426ff78549079d3efeeeecb2d3a8dcbedd91043af640c1e0ade9` |
| `crest-vip.png` | `0673890defaf184a34fcf91c49e420bd1c081d08a744254e9680059c3ce17b68` |

## Locator crest

`crest-locator.png` is a transparent 1254 x 1254 PNG created with the built-in
OpenAI image-generation tool in high-quality reference mode. Output SHA-256:
`bbe8a6c4644f8270c52e8e3b731703f7813405af13aa80df3ea63ff3d9456a09`.

Final prompt summary: create one front-facing Poker Near Me locator crest in
the approved SpadeConsole material language: a unique thin hexagonal chrome
holder, dimensional chrome map pin containing a spade, black quilted face,
restrained blue LED bounce, complete unbroken rails, transparent background,
no words, flat vectors, thick bezel, detached ornament, or cropped edge.

It is seated into the master with the checked-in script and exact command:

```text
python3 scripts/art/seat-pnm-console-crest.py \
  public/images/pnm-console/painted-chassis-v1/source/crest-locator.png \
  locator 150 10 208
```

The resulting `top-locator.png` is 1000 x 348 RGBA with SHA-256
`81b5db170585dd6881b0f54f98b48c030f95da213829b1eaa9aaadc0889a5be7`.
Outside the crest window, the script carries the master rails to the new
holder so no disconnected lines or pasted-on frame remain.

No venue name, count, date, availability, or other live value is baked into
these assets. Those values are printed as accessible HTML in measured zones.
