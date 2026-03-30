# Smarter.Poker Custom Icon Set (SP40)
## Master Manifest — All Agents Must Reference This File

> **Location:** `public/icons/sp40/`
> **Usage:** `<img src="/icons/sp40/sp40_trophy.png" width="24" height="24" />`
> **React:** `<img src="/icons/sp40/sp40_trophy.png" width={size} height={size} alt="Trophy" />`

---

## 🚫 RULES
1. **NEVER use DollarSign ($) icons anywhere on Smarter.Poker** — permanently blocked.
2. **NEVER use purple** in the Smarter.Poker color scheme. Brand colors: **Blue, Silver, Black, White**.
3. These icons replace Lucide React icons. When a custom SP40 icon exists, **USE IT instead of the Lucide equivalent**.
4. For icons not yet in this set, continue using `lucide-react` as fallback.
5. All icons are **transparent-background PNGs**, forward-facing, no text.

---

## ✅ COMPLETED ICONS (20 of 40)

| # | Filename | Replaces (Lucide) | Colors | Uses |
|---|---|---|---|---|
| 1 | `sp40_x_close.png` | `X` | Silver/white | 23 |
| 2 | `sp40_clock.png` | `Clock` | Silver/ice blue | 23 |
| 3 | `sp40_gem.png` | `Gem` | Ice blue/crystal | 17 |
| 4 | `sp40_users.png` | `Users` | Silver/blue glow | 15 |
| 5 | `sp40_trophy.png` | `Trophy` | Polished gold | 14 |
| 6 | `sp40_user.png` | `User` | Silver chrome | 12 |
| 7 | `sp40_loader.png` | `Loader2` | Silver/blue | 11 |
| 8 | `sp40_zap.png` | `Zap` | Electric yellow | 10 |
| 9 | `sp40_calendar.png` | `Calendar` | Silver/blue | 10 |
| 10 | `sp40_alert_triangle.png` | `AlertTriangle` | Amber/orange | 10 |
| 11 | `sp40_target.png` | `Target` | Red/silver | 9 |
| 12 | `sp40_star.png` | `Star` | Polished gold | 8 |
| 13 | `sp40_chevron_right.png` | `ChevronRight` | Silver chrome | 8 |
| 14 | `sp40_check.png` | `Check` | Emerald green | 8 |
| 15 | `sp40_check_circle.png` | `CheckCircle` | Emerald/chrome | 7 |
| 16 | `sp40_camera.png` | `Camera` | Gunmetal/blue lens | 7 |
| 17 | `sp40_play.png` | `Play` | Ice blue/white | 6 |
| 18 | `sp40_crown.png` | `Crown` | Gold/blue sapphires | 6 |
| 19 | `sp40_trash.png` | `Trash2` | Dark red/gunmetal | 5 |
| 20 | `sp40_search.png` | `Search` | Silver/blue lens | 5 |

---

## ⏳ REMAINING ICONS (20 more needed)

| # | Target Filename | Replaces (Lucide) | Planned Colors | Uses |
|---|---|---|---|---|
| 21 | `sp40_refresh.png` | `RefreshCw` | Blue/silver | 5 |
| 22 | `sp40_plus.png` | `Plus` | White/green accent | 5 |
| 23 | `sp40_map_pin.png` | `MapPin` | Red metallic | 5 |
| 24 | `sp40_gift.png` | `Gift` | Blue/silver ribbon | 5 |
| 25 | `sp40_award.png` | `Award` | Gold/bronze | 5 |
| 26 | `sp40_x_circle.png` | `XCircle` | Red/dark | 4 |
| 27 | `sp40_user_plus.png` | `UserPlus` | Silver/green | 4 |
| 28 | `sp40_trending_up.png` | `TrendingUp` | Green arrow | 4 |
| 29 | `sp40_swords.png` | `Swords` | Silver steel | 4 |
| 30 | `sp40_shield.png` | `Shield` | Blue/chrome | 4 |
| 31 | `sp40_flame.png` | `Flame` | Orange/red/yellow | 4 |
| 32 | `sp40_chevron_up.png` | `ChevronUp` | Silver chrome | 4 |
| 33 | `sp40_chevron_down.png` | `ChevronDown` | Silver chrome | 4 |
| 34 | `sp40_timer.png` | `Timer` | Silver/red | 3 |
| 35 | `sp40_send.png` | `Send` | Blue/white | 3 |
| 36 | `sp40_link.png` | `Link2` | Blue/silver | 3 |
| 37 | `sp40_eye.png` | `Eye` | Blue/white | 3 |
| 38 | `sp40_brain.png` | `Brain` | Blue/pink neural | 3 |
| 39 | `sp40_bell.png` | `Bell` | Gold/silver | 3 |
| 40 | `sp40_share.png` | `Share2` | Blue/white | 2 |

---

## ❌ PERMANENTLY BLOCKED ICONS
- `DollarSign` — Money signs are **NEVER** used on Smarter.Poker
- Any icon with text/words baked in
- Any icon using purple in the color scheme

---

## 🎨 DESIGN SPEC FOR GENERATING NEW ICONS

Use this prompt template when generating remaining icons:

```
A high-quality custom icon on a completely transparent background, no background
whatsoever. Design a [ICON NAME] icon [DESCRIPTION]. Forward-facing, centered.
Style: [SPECIFIC STYLE AND COLORS]. Premium, futuristic game-UI aesthetic.
No text, no words, no frame. Just the icon isolated on transparent background.
Suitable for 24-64px inline rendering in a dark UI app.
```

### Rules:
- Forward-facing ONLY (no angled/tilted)
- Transparent background (native, no cropping)
- No text, words, numbers, or labels
- Natural color palette per icon (not forced to one scheme)
- Premium metallic/futuristic aesthetic
- Consistent with existing SP40 icons
