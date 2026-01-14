# 🌍 Global Poker Livestream Expansion Plan

## Objective
Expand the Horse video content library from just Hustler Casino Live (HCL) to include **100+ global poker livestreams**, ensuring diverse, authentic, and engaging content from around the world.

---

## 📺 Major Poker Livestream Sources

### 🇺🇸 **United States**
| Stream | YouTube Channel | Description |
|--------|-----------------|-------------|
| Hustler Casino Live (HCL) | @HustlerCasinoLive | Los Angeles high stakes, Garrett Adelstein, ninja |
| The Lodge Poker Club | @TheLodgePokerClub | Doug Polk's Austin club |
| Live at the Bike | @liveatthebike | Commerce Casino staple |
| TCH Live | @TCHLivePoker | Texas Card House chain |
| PokerGO | @PokerGO | Super High Roller Bowl, WSOP |
| Run It Up (RIU) | @RunItUp | Jason Somerville productions |
| Stones Live | @StonesLive | Sacramento stream |
| Seminole Hard Rock | @SemHardRockPoker | Florida high stakes |
| Turning Stone | @TurningStoneResort | New York poker room |
| Wynn | @WynnLasVegas | Las Vegas premium room |
| Bellagio | @BellagioLV | Bobby's Room footage |
| Aria | @ARIALasVegas | Las Vegas main room |

### 🇬🇧 **United Kingdom / Europe**
| Stream | YouTube Channel | Description |
|--------|-----------------|-------------|
| Triton Poker | @TritonPoker | Super high roller series |
| PartyPoker Live | @partypokerTV | European tour stops |
| 888poker TV | @888pokerTV | European action |
| PokerStars Live | @PokerStars | EPT and other tours |
| Grosvenor Casinos | @GrosvenorPoker | UK live poker |
| Aspers Casino | @AspersPoker | London games |
| Kings Casino Rozvadov | @KingsCasinoPoker | Czech Republic |
| Holland Casino | @HollandCasino | Netherlands poker |
| Casino Barcelona | @CasinoBarcelona | Spain EPT events |

### 🇦🇺 **Australia / Asia Pacific**
| Stream | YouTube Channel | Description |
|--------|-----------------|-------------|
| Crown Melbourne | @CrownMelbourne | Aussie Millions |
| Star Sydney | @TheStarSydney | Australian poker |
| Macau Poker | Various | Asian high stakes |
| APPT (Asia Pacific Poker Tour) | @PokerStars | Regional tour |
| Jeju Korea | Various | Korean poker rooms |
| Japan Poker | @JapanOpenPoker | Tokyo Poker events |

### 🇧🇷 **Latin America**
| Stream | YouTube Channel | Description |
|--------|-----------------|-------------|
| BSOP (Brazilian Series of Poker) | @BSOPBrasil | Brazil's premier tour |
| LAPT (Latin American Poker Tour) | @PokerStars | Regional events |
| Enjoy Poker Live | @EnjoyPoker | Chile poker |
| WPT Uruguay | @WPT | Uruguayan stops |

### 📱 **Twitch Streamers (High-Profile)**
| Streamer | Platform | Description |
|----------|----------|-------------|
| Doug Polk | Twitch/YouTube | Pro player commentary |
| Mariano (LATB) | YouTube | Iconic commentator |
| Jnandez | Twitch | PLO specialist |
| Jeff Boski | Twitch | Cash game grinder |
| LexVeldhuis | Twitch | PokerStars ambassador |
| Kevin Martin | Twitch | Tournament specialist |
| Andrew Neeme | YouTube | Vlog-style content |
| Brad Owen | YouTube | Vegas cash games |
| Rampage Poker | YouTube | Tournament grinder |
| Haralabos Voulgaris | YouTube | High stakes player |

---

## 🔧 Implementation Tasks

### Phase 1: Expand ClipLibrary.js (Priority: HIGH)
**Time Estimate: 2-3 hours**

1. **Add 50+ new video IDs** from diverse sources
2. **Categorize by stream source** for balanced selection
3. **Add metadata** for each clip:
   - `source`: Which stream/channel
   - `players_featured`: Notable players in clip
   - `pot_size`: Estimated pot for context
   - `clip_type`: bluff, value, cooler, bad_beat, commentary, hero_call

```javascript
const GLOBAL_CLIPS = {
  HCL: [...], // Existing
  LODGE: [...], // Doug Polk's club
  LATB: [...], // Live at the Bike
  TRITON: [...], // Triton high rollers
  TCH: [...], // Texas Card House
  POKERGO: [...], // WSOP and Super High Roller
  // ...etc
};
```

### Phase 2: Auto-Discovery System (Priority: MEDIUM)
**Time Estimate: 4-6 hours**

1. **RSS Feed Integration** for new uploads
2. **YouTube API polling** for Shorts/Clips
3. **Keyword filtering** for viral potential:
   - "all in", "bluff", "hero call", "cooler", "insane"
4. **Auto-queue** promising clips for review

### Phase 3: Clip Quality Scoring (Priority: MEDIUM)
**Time Estimate: 3-4 hours**

1. **Engagement metrics** (views, likes on source)
2. **Content analysis** (action level, stakes)
3. **Player recognition** (featuring known pros)
4. **Recency bonus** (newer = more relevant)

---

## 📝 Immediate Next Steps

### Step 1: Populate More Video IDs
Add at least **10 clips per source** for the top 10 streams:

1. Hustler Casino Live ✅ (already have 20)
2. The Lodge Poker Club
3. Live at the Bike
4. Triton Poker
5. TCH Live
6. PokerGO
7. PokerStars (EPT)
8. Doug Polk YouTube
9. Brad Owen / Andrew Neeme
10. Rampage Poker

### Step 2: Update ClipLibrary Structure
```javascript
// Enhanced clip structure
{
  videoId: 'abc123',
  source: 'LODGE',
  title: 'Doug Polk DESTROYS with Quads',
  category: 'hero_call',
  players: ['Doug Polk'],
  stakes: '5/10 NL',
  captionTemplates: [...],
  virality_score: 95
}
```

### Step 3: Implement Source Rotation
Ensure horses don't post from the same stream twice in a row:
```javascript
function selectClipWithSourceRotation(horseId, recentSources) {
  // Avoid repeating same source for this horse
  const availableSources = ALL_SOURCES.filter(s => !recentSources.includes(s));
  // Pick random source, then random clip from that source
}
```

---

## 🎯 Success Metrics

| Metric | Target |
|--------|--------|
| Unique stream sources | 20+ |
| Total clips in library | 200+ |
| Clip categories | 8+ |
| Featured players | 50+ |
| Geographic diversity | 5+ continents |

---

## ⚠️ Considerations

1. **Copyright**: Use clips that appear to be fair use (short, transformative)
2. **Quality**: Only high-definition source material
3. **Relevance**: Focus on action-packed moments
4. **Freshness**: Prioritize recent uploads (last 6 months)
5. **Attribution**: Consider adding source watermarks

---

## 🚀 Ready to Execute?

Approve this plan and I'll:
1. Immediately add 50+ new clips from diverse sources
2. Update the clip selection logic for source rotation
3. Test the expanded library with a new horse unleash cycle
