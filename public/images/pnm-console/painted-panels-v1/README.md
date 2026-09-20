# Poker Near Me painted panels v1

These three discrete raster slices are the compact result-card chassis for
Poker Near Me. They are derived mechanically from the approved Club Arena
console master vendored in `../painted-chassis-v1/`:

- `panel-head.png` is the intact top 112 rows of `top-flat.png`; it owns the
  complete upper rail and both upper corners.
- `panel-mid.png` is the master 1000 x 8 repeating body rail; it repeats only
  inside the content body box.
- `panel-foot.png` is the complete 1000 x 72 closing foot; it owns both lower
  corners and the uninterrupted lower rail.

Exact derivation command:

```text
magick public/images/pnm-console/painted-chassis-v1/top-flat.png \
  -crop 1000x112+0+0 +repage \
  public/images/pnm-console/painted-panels-v1/panel-head.png
```

| File | Size | SHA-256 |
| --- | ---: | --- |
| `panel-head.png` | 1000 x 112 | `e457613763aa85109cf163cf98fd7de0c472c67f2408f717bda7a865d6be863e` |
| `panel-mid.png` | 1000 x 8 | `3643e1688ff20e0383d8c14acf17e848731765b8fd38f69af5afa4d57e4fa6e3` |
| `panel-foot.png` | 1000 x 72 | `9e68d4067af5b1caaa69d73de2dd14d28c9301d41ee17f56b83af686e7d4e138` |

The files contain no names, counts, dates, schedules, availability, or other
dynamic information. All changing values remain accessible DOM content.
