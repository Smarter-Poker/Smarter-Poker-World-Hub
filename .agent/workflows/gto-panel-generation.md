---
description: Generate GTO Analysis Panel images using the locked-in template
---

# GTO Panel Image Generation Workflow

## Overview
This workflow generates GTO Analysis Panel images that match the EXACT locked-in template design. Each image displays dynamic poker strategy data while maintaining consistent visual styling.

## Locked-In Template Reference
The master template is stored at:
- **Artifacts:** `/Users/smarter.poker/.gemini/antigravity/brain/d3241bef-fe4e-47bc-bb72-43ec35334be7/gto_panel_centered_action_1770114061464.png`
- **Public:** `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/gto-panel-template.png`

## Template Design Elements (NEVER CHANGE)
- Jarvis humanoid avatar with visible brain (top-left)
- "Smarter Poker Data" badge (top-right)
- Action button with frequency badge (center header)
- Outer rounded metal frame with cyan bottom accent lights
- 4 vertically stacked content sections with beveled metal frames
- Chevron arrows on section headers
- Dark navy/black gradient background
- Cyan/green keyword highlighting

## Dynamic Data Fields
1. **Action**: RAISE, CALL, FOLD, CHECK, BET, 3-BET, 4-BET, ALL-IN
2. **Frequency**: Percentage (e.g., 85%)
3. **Explanation**: Text describing why this action is optimal
4. **GTO Approach**: Solver strategy explanation
5. **EV Value**: Expected value (e.g., +1.50bb, -0.25bb)
6. **EV Description**: Explanation of EV calculation
7. **Alternate Lines**: Array of {action, frequency, reason}

## Action Color Mapping
- FOLD: Red
- CHECK: Gray
- CALL: Yellow/Orange
- BET: Cyan
- RAISE: Green neon
- 3-BET: Green neon
- 4-BET: Purple
- ALL-IN: Magenta

## How to Generate a GTO Panel

### Step 1: Prepare the Data
Collect from PioSolver and/or Grok AI:
```javascript
{
  action: "RAISE",
  frequency: 85,
  explanation: "Based on solver data, RAISE is the optimal GTO action...",
  gtoApproach: "Solver-based strategy involves a balanced range...",
  evValue: "+1.50bb",
  evDescription: "This action yields an expected value of +1.50 big blinds...",
  alternateLines: [
    { action: "CALL", frequency: "10%", reason: "Balanced with drawing hands..." },
    { action: "FOLD", frequency: "5%", reason: "Against extremely tight opponents..." }
  ]
}
```

### Step 2: Generate the Image
Use the `generate_image` tool with:
1. **ImagePaths**: Include the locked-in template as reference
2. **Prompt**: Request exact recreation with ONLY the dynamic data changed

Example prompt format:
```
Recreate this EXACT poker GTO analysis panel design with the EXACT same layout, styling, and visual elements. Keep everything identical but change ONLY the dynamic text data:

- Action: "[ACTION]" (in [COLOR])
- Frequency: "[FREQUENCY]%"  
- Explanation text: "[EXPLANATION]"
- GTO Approach text: "[GTO_APPROACH]"
- EV Value: "[EV_VALUE]"
- EV Description: "[EV_DESCRIPTION]"
- Alternate Lines: [ALT_LINE_1], [ALT_LINE_2]

Keep the EXACT same:
- Jarvis avatar with brain visible in top-left
- Vertical stacked section layout
- Metal beveled frames
- Outer rounded frame with cyan bottom lights
- Chevron arrows on section headers
- All styling, fonts, colors, gradients
```

### Step 3: Upload to Supabase Storage
// turbo
```bash
# Upload generated image to gto-panels bucket
curl -X POST "https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/gto-panels/[FILENAME].png" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: image/png" \
  --data-binary "@[LOCAL_PATH]"
```

Or use the Supabase client:
```javascript
const { data, error } = await supabase.storage
  .from('gto-panels')
  .upload(`${cacheKey}.png`, imageBuffer, {
    contentType: 'image/png',
    upsert: true
  });
```

### Step 4: Return the Public URL
```javascript
const { data: urlData } = supabase.storage
  .from('gto-panels')
  .getPublicUrl(`${cacheKey}.png`);
  
// Returns: https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/gto-panels/[FILENAME].png
```

## Data Sources
- **PioSolver**: Provides action frequencies, EV values, and alternate line data
- **Grok AI**: Generates natural language explanations based on PioSolver data

## Storage Location
All generated GTO panels are cached in Supabase Storage:
- **Bucket**: `gto-panels`
- **Naming Convention**: `gto-panel-[hash].png`
- **Public URL Format**: `https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/gto-panels/[filename]`

## Important Notes
1. ALWAYS use the locked-in template as a reference image
2. NEVER modify the template design elements
3. ONLY change the dynamic text data fields
4. Cache generated images to avoid regeneration
5. Use consistent color mapping for actions
