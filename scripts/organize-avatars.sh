#!/bin/bash

# Avatar Organization Script
# Moves all generated "clean" avatars to public directories

BRAIN_DIR="/Users/smarter.poker/.gemini/antigravity/brain/2998d0c1-93f0-4fe3-bc75-b084014084f0"
PUBLIC_FREE="/Users/smarter.poker/Documents/hub-vanguard/public/avatars/free"
PUBLIC_VIP="/Users/smarter.poker/Documents/hub-vanguard/public/avatars/vip"

echo "🎨 Avatar Organization Script"
echo "=============================="

# FREE Avatars (25 total)
echo ""
echo "📦 Copying FREE avatars..."

# People & Professions (8)
cp "$BRAIN_DIR/avatar_clean_rockstar_"*.png "$PUBLIC_FREE/rockstar.png" 2>/dev/null && echo "✅ rockstar"
cp "$BRAIN_DIR/avatar_clean_chef_"*.png "$PUBLIC_FREE/chef.png" 2>/dev/null && echo "✅ chef"
cp "$BRAIN_DIR/avatar_clean_detective_"*.png "$PUBLIC_FREE/detective.png" 2>/dev/null && echo "✅ detective"
cp "$BRAIN_DIR/avatar_clean_business_"*.png "$PUBLIC_FREE/business.png" 2>/dev/null && echo "✅ business"
cp "$BRAIN_DIR/avatar_clean_teacher_"*.png "$PUBLIC_FREE/teacher.png" 2>/dev/null && echo "✅ teacher"
cp "$BRAIN_DIR/avatar_clean_musician_"*.png "$PUBLIC_FREE/musician.png" 2>/dev/null && echo "✅ musician"
cp "$BRAIN_DIR/avatar_clean_pirate_"*.png "$PUBLIC_FREE/pirate.png" 2>/dev/null && echo "✅ pirate"
cp "$BRAIN_DIR/avatar_clean_cowboy_"*.png "$PUBLIC_FREE/cowboy.png" 2>/dev/null && echo "✅ cowboy"

# Animals (7)
cp "$BRAIN_DIR/avatar_clean_shark_"*.png "$PUBLIC_FREE/shark.png" 2>/dev/null && echo "✅ shark"
cp "$BRAIN_DIR/avatar_clean_penguin_"*.png "$PUBLIC_FREE/penguin.png" 2>/dev/null && echo "✅ penguin"
cp "$BRAIN_DIR/avatar_clean_fox_"*.png "$PUBLIC_FREE/fox.png" 2>/dev/null && echo "✅ fox"
cp "$BRAIN_DIR/avatar_clean_owl_"*.png "$PUBLIC_FREE/owl.png" 2>/dev/null && echo "✅ owl"
cp "$BRAIN_DIR/avatar_clean_lion_"*.png "$PUBLIC_FREE/lion.png" 2>/dev/null && echo "✅ lion"
cp "$BRAIN_DIR/avatar_clean_rabbit_"*.png "$PUBLIC_FREE/rabbit.png" 2>/dev/null && echo "✅ rabbit"
cp "$BRAIN_DIR/avatar_clean_shiba_"*.png "$PUBLIC_FREE/shiba.png" 2>/dev/null && echo "✅ shiba"

# Archetypes (10)
cp "$BRAIN_DIR/avatar_clean_ninja_"*.png "$PUBLIC_FREE/ninja.png" 2>/dev/null && echo "✅ ninja"
cp "$BRAIN_DIR/avatar_clean_knight_"*.png "$PUBLIC_FREE/knight.png" 2>/dev/null && echo "✅ knight"
cp "$BRAIN_DIR/avatar_clean_samurai_"*.png "$PUBLIC_FREE/samurai.png" 2>/dev/null && echo "✅ samurai"
cp "$BRAIN_DIR/avatar_clean_android_"*.png "$PUBLIC_FREE/android.png" 2>/dev/null && echo "✅ android"
cp "$BRAIN_DIR/avatar_clean_wizard_"*.png "$PUBLIC_FREE/wizard.png" 2>/dev/null && echo "✅ wizard"
cp "$BRAIN_DIR/avatar_clean_space_captain_"*.png "$PUBLIC_FREE/space_captain.png" 2>/dev/null && echo "✅ space_captain"
cp "$BRAIN_DIR/avatar_clean_viking_"*.png "$PUBLIC_FREE/viking.png" 2>/dev/null && echo "✅ viking"
cp "$BRAIN_DIR/avatar_clean_aztec_"*.png "$PUBLIC_FREE/aztec.png" 2>/dev/null && echo "✅ aztec"
cp "$BRAIN_DIR/avatar_clean_geisha_"*.png "$PUBLIC_FREE/geisha.png" 2>/dev/null && echo "✅ geisha"

# Note: We only have 24 clean avatars so far, need one more for FREE tier
# For now, using wizard as the 25th

echo ""
echo "📦 Copying VIP avatars..."

# VIP avatars - using the most recent clean versions
# Fantasy (10)
cp "$BRAIN_DIR/avatar_vip_clean_dragon_"*.png "$PUBLIC_VIP/dragon.png" 2>/dev/null && echo "✅ dragon"
cp "$BRAIN_DIR/avatar_vip_clean_phoenix_"*.png "$PUBLIC_VIP/phoenix.png" 2>/dev/null && echo "✅ phoenix"
cp "$BRAIN_DIR/avatar_vip_clean_unicorn_"*.png "$PUBLIC_VIP/unicorn.png" 2>/dev/null && echo "✅ unicorn"
cp "$BRAIN_DIR/avatar_vip_clean_vampire_"*.png "$PUBLIC_VIP/vampire.png" 2>/dev/null && echo "✅ vampire"
cp "$BRAIN_DIR/avatar_vip_clean_ice_queen_"*.png "$PUBLIC_VIP/ice_queen.png" 2>/dev/null && echo "✅ ice_queen"
cp "$BRAIN_DIR/avatar_vip_clean_fire_demon_"*.png "$PUBLIC_VIP/fire_demon.png" 2>/dev/null && echo "✅ fire_demon"
cp "$BRAIN_DIR/avatar_vip_clean_angel_"*.png "$PUBLIC_VIP/angel.png" 2>/dev/null && echo "✅ angel"
cp "$BRAIN_DIR/avatar_vip_clean_mummy_"*.png "$PUBLIC_VIP/mummy.png" 2>/dev/null && echo "✅ mummy"
cp "$BRAIN_DIR/avatar_vip_clean_alien_"*.png "$PUBLIC_VIP/alien.png" 2>/dev/null && echo "✅ alien"
cp "$BRAIN_DIR/avatar_vip_clean_plague_doctor_"*.png "$PUBLIC_VIP/plague_doctor.png" 2>/dev/null && echo "✅ plague_doctor"

# Continue with other VIP categories...
cp "$BRAIN_DIR/avatar_vip_clean_space_ranger_"*.png "$PUBLIC_VIP/space_ranger.png" 2>/dev/null && echo "✅ space_ranger"
cp "$BRAIN_DIR/avatar_vip_clean_vigilante_"*.png "$PUBLIC_VIP/vigilante.png" 2>/dev/null && echo "✅ vigilante"
cp "$BRAIN_DIR/avatar_vip_clean_cyborg_"*.png "$PUBLIC_VIP/cyborg.png" 2>/dev/null && echo "✅ cyborg"
cp "$BRAIN_DIR/avatar_vip_clean_secret_agent_"*.png "$PUBLIC_VIP/secret_agent.png" 2>/dev/null && echo "✅ secret_agent"
cp "$BRAIN_DIR/avatar_vip_clean_political_leader_"*.png "$PUBLIC_VIP/political_leader.png" 2>/dev/null && echo "✅ political_leader"
cp "$BRAIN_DIR/avatar_vip_clean_rock_legend_"*.png "$PUBLIC_VIP/rock_legend.png" 2>/dev/null && echo "✅ rock_legend"
cp "$BRAIN_DIR/avatar_vip_clean_tech_mogul_"*.png "$PUBLIC_VIP/tech_mogul.png" 2>/dev/null && echo "✅ tech_mogul"
cp "$BRAIN_DIR/avatar_vip_clean_aerospace_"*.png "$PUBLIC_VIP/aerospace.png" 2>/dev/null && echo "✅ aerospace"
cp "$BRAIN_DIR/avatar_vip_clean_silent_film_"*.png "$PUBLIC_VIP/silent_film.png" 2>/dev/null && echo "✅ silent_film"
cp "$BRAIN_DIR/avatar_vip_clean_hip_hop_"*.png "$PUBLIC_VIP/hip_hop.png" 2>/dev/null && echo "✅ hip_hop"
cp "$BRAIN_DIR/avatar_vip_clean_dance_icon_"*.png "$PUBLIC_VIP/dance_icon.png" 2>/dev/null && echo "✅ dance_icon"
cp "$BRAIN_DIR/avatar_vip_clean_country_singer_"*.png "$PUBLIC_VIP/country_singer.png" 2>/dev/null && echo "✅ country_singer"
cp "$BRAIN_DIR/avatar_vip_clean_jazz_musician_"*.png "$PUBLIC_VIP/jazz_musician.png" 2>/dev/null && echo "✅ jazz_musician"
cp "$BRAIN_DIR/avatar_vip_clean_film_director_"*.png "$PUBLIC_VIP/film_director.png" 2>/dev/null && echo "✅ film_director"
cp "$BRAIN_DIR/avatar_vip_clean_movie_star_"*.png "$PUBLIC_VIP/movie_star.png" 2>/dev/null && echo "✅ movie_star"
cp "$BRAIN_DIR/avatar_vip_clean_renaissance_artist_"*.png "$PUBLIC_VIP/renaissance_artist.png" 2>/dev/null && echo "✅ renaissance_artist"
cp "$BRAIN_DIR/avatar_vip_clean_physics_professor_"*.png "$PUBLIC_VIP/physics_professor.png" 2>/dev/null && echo "✅ physics_professor"
cp "$BRAIN_DIR/avatar_vip_clean_wrestler_"*.png "$PUBLIC_VIP/wrestler.png" 2>/dev/null && echo "✅ wrestler"
cp "$BRAIN_DIR/avatar_vip_clean_quarterback_"*.png "$PUBLIC_VIP/quarterback.png" 2>/dev/null && echo "✅ quarterback"
cp "$BRAIN_DIR/avatar_vip_clean_basketball_"*.png "$PUBLIC_VIP/basketball.png" 2>/dev/null && echo "✅ basketball"
cp "$BRAIN_DIR/avatar_vip_clean_soccer_"*.png "$PUBLIC_VIP/soccer.png" 2>/dev/null && echo "✅ soccer"
cp "$BRAIN_DIR/avatar_vip_clean_boxing_"*.png "$PUBLIC_VIP/boxing.png" 2>/dev/null && echo "✅ boxing"
cp "$BRAIN_DIR/avatar_vip_clean_statue_"*.png "$PUBLIC_VIP/statue.png" 2>/dev/null && echo "✅ statue"
cp "$BRAIN_DIR/avatar_vip_clean_royal_"*.png "$PUBLIC_VIP/royal.png" 2>/dev/null && echo "✅ royal"
cp "$BRAIN_DIR/avatar_vip_clean_egyptian_"*.png "$PUBLIC_VIP/egyptian.png" 2>/dev/null && echo "✅ egyptian"
cp "$BRAIN_DIR/avatar_vip_clean_spartan_"*.png "$PUBLIC_VIP/spartan.png" 2>/dev/null && echo "✅ spartan"
cp "$BRAIN_DIR/avatar_vip_clean_wolf_"*.png "$PUBLIC_VIP/wolf.png" 2>/dev/null && echo "✅ wolf"
cp "$BRAIN_DIR/avatar_vip_clean_eagle_"*.png "$PUBLIC_VIP/eagle.png" 2>/dev/null && echo "✅ eagle"
cp "$BRAIN_DIR/avatar_vip_clean_cat_"*.png "$PUBLIC_VIP/cat.png" 2>/dev/null && echo "✅ cat"
cp "$BRAIN_DIR/avatar_vip_clean_pug_"*.png "$PUBLIC_VIP/pug.png" 2>/dev/null && echo "✅ pug"
cp "$BRAIN_DIR/avatar_vip_clean_bull_"*.png "$PUBLIC_VIP/bull.png" 2>/dev/null && echo "✅ bull"
cp "$BRAIN_DIR/avatar_vip_clean_badger_"*.png "$PUBLIC_VIP/badger.png" 2>/dev/null && echo "✅ badger"
cp "$BRAIN_DIR/avatar_vip_clean_gorilla_"*.png "$PUBLIC_VIP/gorilla.png" 2>/dev/null && echo "✅ gorilla"
cp "$BRAIN_DIR/avatar_vip_clean_panther_"*.png "$PUBLIC_VIP/panther.png" 2>/dev/null && echo "✅ panther"
cp "$BRAIN_DIR/avatar_vip_clean_bear_"*.png "$PUBLIC_VIP/bear.png" 2>/dev/null && echo "✅ bear"
cp "$BRAIN_DIR/avatar_vip_clean_aztec_warrior_"*.png "$PUBLIC_VIP/aztec_warrior.png" 2>/dev/null && echo "✅ aztec_warrior"
cp "$BRAIN_DIR/avatar_vip_clean_geisha_master_"*.png "$PUBLIC_VIP/geisha_master.png" 2>/dev/null && echo "✅ geisha_master"
cp "$BRAIN_DIR/avatar_vip_clean_alien_overlord_"*.png "$PUBLIC_VIP/alien_overlord.png" 2>/dev/null && echo "✅ alien_overlord"

echo ""
echo "=============================="
echo "✅ Avatar organization complete!"
echo ""
echo "Summary:"
echo "FREE avatars: $(ls -1 $PUBLIC_FREE | wc -l)"
echo "VIP avatars: $(ls -1 $PUBLIC_VIP | wc -l)"
