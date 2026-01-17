#!/bin/bash
# Auto-apply 800px+zoom template to all remaining pages

echo "🎨 Applying 800px+zoom template to remaining pages..."

# Define the template
VIEWPORT_META='<meta name="viewport" content="width=800, user-scalable=no" />'
STYLE_BLOCK='<style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .__PAGE_CLASS__ { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .__PAGE_CLASS__ { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .__PAGE_CLASS__ { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .__PAGE_CLASS__ { zoom: 0.95; } }
                    @media (min-width: 901px) { .__PAGE_CLASS__ { zoom: 1.2; } }
                    @media (min-width: 1400px) { .__PAGE_CLASS__ { zoom: 1.5; } }
                `}</style>'

# Pages to update (remaining)
PAGES=(
  "messenger:messenger-page"
  "friends:friends-page"
  "notifications:notifications-page"
  "avatars:avatars-page"
  "reels:reels-page"
  "club-arena:club-arena-page"
  "diamond-arena:diamond-arena-page"
  "memory-games:memory-games-page"
)

echo "Total pages to update: ${#PAGES[@]}"
echo "Template will be applied to all remaining content pages"
echo "✅ Training page template (800px + CSS zoom breakpoints)"
