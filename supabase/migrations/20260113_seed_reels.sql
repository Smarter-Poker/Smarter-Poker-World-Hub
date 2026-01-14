-- ═══════════════════════════════════════════════════════════════════════════
-- SEED REELS - 20 Sample Reels for Feed (Using Pexels Free Stock Videos)
-- These are royalty-free videos from Pexels with CC0 license
-- ═══════════════════════════════════════════════════════════════════════════

-- First, ensure we have a system/bot author for seeded content
-- We'll use existing bot profiles or create placeholder content

-- Insert seed reels with Pexels free stock videos
-- Videos selected: poker/casino, sports, gaming, and lifestyle themes

DO $$
DECLARE
    v_author_id UUID;
BEGIN
    -- Get a random existing user to attribute reels to (or use system)
    SELECT id INTO v_author_id FROM profiles ORDER BY created_at ASC LIMIT 1;
    
    -- If no users exist, skip seeding
    IF v_author_id IS NULL THEN
        RAISE NOTICE 'No users found, skipping reel seeding';
        RETURN;
    END IF;
    
    -- Insert 20 sample reels with Pexels video URLs
    -- These are direct CDN links to royalty-free videos
    
    -- Reel 1: Poker chips
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/6594245/6594245-uhd_1440_2560_25fps.mp4', 
    '♠️ The grind never stops! What''s your favorite poker hand? 🃏', 2847, 156, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 2: Casino vibes
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/6594377/6594377-uhd_1440_2560_25fps.mp4', 
    '🎰 Casino night vibes! Who else loves the atmosphere? ✨', 3421, 234, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 3: Cards shuffling
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/8759355/8759355-uhd_1440_2560_25fps.mp4', 
    '🃏 Shuffle up and deal! Tournament time 🏆', 1892, 98, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 4: Night city gaming
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/5377700/5377700-uhd_2560_1440_25fps.mp4', 
    '🌃 Late night grind session. Who''s still awake? 🎮', 4521, 312, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 5: Money/success aesthetic
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/7578544/7578544-uhd_1440_2560_25fps.mp4', 
    '💰 That winning feeling hits different! 🔥', 5789, 421, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 6: Desktop gaming setup
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/5377684/5377684-uhd_2560_1440_25fps.mp4', 
    '🎮 The setup is ready. Time to crush! 💪', 2134, 143, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 7: Celebration/victory
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/6554174/6554174-uhd_2560_1440_25fps.mp4', 
    '🎉 Final table energy! Let''s gooo! 🏆', 6234, 534, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 8: Focus/concentration
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/5377689/5377689-uhd_2560_1440_25fps.mp4', 
    '🧠 The mental game is everything. Stay focused! 🎯', 1876, 87, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 9: Vegas vibes
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/3773486/3773486-uhd_2560_1440_25fps.mp4', 
    '🎰 Vegas baby! Who''s ready for WSOP? 🌴', 8432, 678, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 10: Night atmosphere
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/4434242/4434242-uhd_2560_1440_24fps.mp4', 
    '🌙 Those late night sessions hit different 💫', 3215, 198, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 11: Success mindset
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/8089121/8089121-uhd_1440_2560_25fps.mp4', 
    '📈 The grind pays off. Trust the process! 💯', 4567, 345, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 12: Tech/gaming aesthetic
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/5377696/5377696-uhd_2560_1440_25fps.mp4', 
    '🖥️ Multi-tabling like a boss! 🎯', 2891, 167, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 13: Party/celebration
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/4769494/4769494-uhd_2560_1440_25fps.mp4', 
    '🍾 When you bink the tournament! Celebration time! 🎊', 7892, 612, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 14: Coffee/grind aesthetic
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/5537792/5537792-uhd_2560_1440_25fps.mp4', 
    '☕ Fuel for the grind. How many tables are you playing? 🎮', 1654, 89, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 15: Urban night life
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_25fps.mp4', 
    '🏙️ City lights and tournament nights 🌃', 5234, 398, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 16: Focus/zone
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/6893958/6893958-uhd_1440_2560_25fps.mp4', 
    '🎯 In the zone. Nothing but the game matters! 🔥', 3421, 234, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 17: Lifestyle
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/4778855/4778855-uhd_2560_1440_25fps.mp4', 
    '✨ Living the dream! Poker pro life 🌴', 6789, 521, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 18: Cards/dealer
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/8759346/8759346-uhd_1440_2560_25fps.mp4', 
    '🃏 Dealer, hit me! Who loves live poker? ♠️', 4123, 287, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 19: Trophy/winning
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/6554178/6554178-uhd_2560_1440_25fps.mp4', 
    '🏆 Another one! Never give up on your dreams! 💪', 9234, 823, true)
    ON CONFLICT DO NOTHING;
    
    -- Reel 20: Night gaming
    INSERT INTO social_reels (author_id, video_url, caption, view_count, like_count, is_public)
    VALUES (v_author_id, 'https://videos.pexels.com/video-files/5377695/5377695-uhd_2560_1440_25fps.mp4', 
    '🎮 Who else grinds until sunrise? 🌅', 2567, 178, true)
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Successfully seeded 20 sample reels!';
END;
$$;
