import { createClient } from '@supabase/supabase-js';

/**
 * API Endpoint: Publish Daily Content
 * POST /api/system/publish-content
 * 
 * Publishes daily poker strategy content as the system account
 */

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

const CONTENT_LIBRARY = [
    {
        content: "🎯 Daily Strategy Tip: Position is power in poker. Playing more hands from the button gives you a massive informational advantage. You act last post-flop, seeing what everyone else does before making your decision.",
        content_type: "strategy_tip"
    },
    {
        content: "🧠 GTO Concept: Balanced ranges prevent exploitation. If you only bet strong hands, observant opponents will fold. Mix in bluffs at the right frequency to keep them guessing.",
        content_type: "gto_concept"
    },
    {
        content: "💎 Tournament Wisdom: ICM (Independent Chip Model) changes everything near the bubble. That chip you risk is worth more than the chip you could win. Play tight when others are desperate.",
        content_type: "tournament_tip"
    },
    {
        content: "🔥 Training Challenge: Can you identify the optimal bet size with top pair on a wet board? Head to the GTO Training Arena and test your skills across 10 progressive levels!",
        content_type: "training_challenge"
    },
    {
        content: "📊 Poker Math: You need to win 33% of the time to break even on a pot-sized bet. If villain bets $100 into a $100 pot, you're getting 2:1 odds. Know your pot odds!",
        content_type: "poker_math"
    },
    {
        content: "🎲 Hand Reading Tip: When a tight player suddenly gets aggressive, they usually have it. When a loose player gets aggressive, they could have anything. Adjust your ranges accordingly.",
        content_type: "hand_reading"
    },
    {
        content: "⚡ Quick Tip: Don't play every hand. Patience is a weapon. Wait for profitable spots and strike with precision. Your win rate will thank you.",
        content_type: "quick_tip"
    }
];

function getTodayContent() {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const index = dayOfYear % CONTENT_LIBRARY.length;
    return CONTENT_LIBRARY[index];
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Initialize Supabase with service role key
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Verify system account exists
        const { data: systemAccount, error: accountError } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', SYSTEM_UUID)
            .single();

        if (accountError || !systemAccount) {
            return res.status(404).json({
                success: false,
                error: 'System account not found. Run /api/system/setup-account first.'
            });
        }

        // Get today's content
        const todayContent = getTodayContent();

        // Create post
        const { data: post, error: postError } = await supabase
            .from('social_posts')
            .insert({
                author_id: SYSTEM_UUID,
                content: todayContent.content,
                content_type: todayContent.content_type,
                visibility: 'public',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (postError) {
            throw new Error(`Failed to create post: ${postError.message}`);
        }

        return res.status(200).json({
            success: true,
            message: 'Daily content published successfully',
            post: {
                id: post.id,
                content: post.content.substring(0, 100) + '...',
                content_type: post.content_type,
                created_at: post.created_at
            }
        });

    } catch (error) {
        console.error('Publish content error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
