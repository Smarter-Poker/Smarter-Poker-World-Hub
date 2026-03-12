/**
 * 🐴 HORSE MESSENGER ENGINE - Automated Direct Messaging via Grok AI
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Automates 2-3 turn realistic DM conversations between Horses and real users.
 * Triggered by users liking or commenting on a horse's post, or directly DMing a horse.
 * Uses xAI's Grok API to generate contextual, personality-driven, emoji-free responses.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Interface with xAI / Grok API
 */
async function generateGrokReply(horseContext, conversationHistory) {
    if (!XAI_API_KEY) {
        console.warn('⚠️ Missing XAI_API_KEY. Cannot generate DM response.');
        return null;
    }

    try {
        const systemPrompt = `You are ${horseContext.name}, a poker player playing in the Smarter.Poker World Hub. 
Your specialty is ${horseContext.specialty || 'cash games'}.
You are currently replying to a Direct Message on the platform.
CRITICAL RULES:
1. Keep the response SHORT, like a real text message (1-2 sentences max).
2. DO NOT USE ANY EMOJIS EVER.
3. Be causal, authentic, and use poker terminology naturally.
4. If this conversation has 2-3 turns already, naturally conclude it (e.g. "Gotta head back to the tables, catch you later", "Back to the grind for me, gl").
5. Do not sound like an AI assistant.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.map(msg => ({
                role: msg.isMe ? 'assistant' : 'user',
                content: msg.content
            }))
        ];

        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'grok-2-latest',
                messages: messages,
                temperature: 0.8,
                max_tokens: 60
            })
        });

        if (!response.ok) {
            console.error('Grok API Error:', await response.text());
            return null;
        }

        const data = await response.json();
        let replyText = data.choices[0].message.content.trim();
        
        // Final safety check against emojis (just in case)
        replyText = replyText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '');
        
        // Remove quotes if grok wrapped it
        if (replyText.startsWith('"') && replyText.endsWith('"')) {
            replyText = replyText.slice(1, -1);
        }

        return replyText;
    } catch (e) {
        console.error('Error generating Grok reply:', e);
        return null;
    }
}

/**
 * Scan for pending messages directed at horses and reply
 */
async function processDirectMessages() {
    console.log('\n💬 HORSE MESSENGER ENGINE RUNNING...');

    // 1. Get all active horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, profile_id, name, specialty')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses?.length) return;
    const horseIds = horses.map(h => h.profile_id);
    const horseMap = Object.fromEntries(horses.map(h => [h.profile_id, h]));

    // 2. Find eligible conversations where a horse needs to reply
    // We look for messages sent TO a horse within the last 15 minutes, where the horse hasn't replied yet.
    // For simplicity, we just look at the most recent message in all active conversations involving a horse.
    
    // Instead of a complex subquery, let's fetch recent messages sent BY humans
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();
    
    const { data: recentMsgs } = await supabase
        .from('social_messages')
        .select('id, conversation_id, sender_id, content, created_at')
        .gte('created_at', fifteenMinsAgo)
        .order('created_at', { ascending: false });

    if (!recentMsgs?.length) {
        console.log('   No recent messages found.');
        return;
    }

    // Filter to messages NOT sent by a horse
    const humanMsgs = recentMsgs.filter(m => !horseIds.includes(m.sender_id));

    if (humanMsgs.length === 0) {
        console.log('   No recent human messages found.');
        return;
    }

    // Group by conversation
    const convMap = {};
    for (const msg of humanMsgs) {
        if (!convMap[msg.conversation_id]) {
            convMap[msg.conversation_id] = msg; // Store the most recent human message
        }
    }

    let repliesSent = 0;

    for (const convId of Object.keys(convMap)) {
        // Fetch the conversation details to see who is in it
        const { data: convInfo } = await supabase
            .from('social_conversations')
            .select('user1_id, user2_id')
            .eq('id', convId)
            .maybeSingle();

        if (!convInfo) continue;

        // Is a horse involved?
        const isUser1Horse = horseIds.includes(convInfo.user1_id);
        const isUser2Horse = horseIds.includes(convInfo.user2_id);
        
        // If neither or both are horses, skip (we don't want horses DMing each other right now)
        if (!isUser1Horse && !isUser2Horse) continue;
        if (isUser1Horse && isUser2Horse) continue;

        const targetHorseId = isUser1Horse ? convInfo.user1_id : convInfo.user2_id;
        const horse = horseMap[targetHorseId];
        const humanId = isUser1Horse ? convInfo.user2_id : convInfo.user1_id;

        // 3. Fetch conversation history to see if the horse already replied
        const { data: history } = await supabase
            .from('social_messages')
            .select('sender_id, content')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true })
            .limit(10); // Last 10 messages for context

        if (!history?.length) continue;

        // Ensure the LAST message was from the human. If the horse already replied, skip.
        if (history[history.length - 1].sender_id === targetHorseId) continue;

        // 4. Generate AI Reply
        const conversationContext = history.map(h => ({
            isMe: h.sender_id === targetHorseId,
            content: h.content
        }));

        console.log(`   Generating DM reply for ${horse.name} (Conv ~ ${history.length} msgs)...`);
        
        const replyContent = await generateGrokReply(horse, conversationContext);

        if (!replyContent) continue;

        // 5. Send the reply
        const { error: insertErr } = await supabase
            .from('social_messages')
            .insert({
                conversation_id: convId,
                sender_id: targetHorseId,
                content: replyContent
            });

        if (!insertErr) {
            // Update conversation preview
            await supabase.from('social_conversations')
                .update({ 
                    last_message_preview: replyContent, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', convId);

            console.log(`   ${horse.name} 💬: "${replyContent}" ✓`);
            repliesSent++;
        }

        // Delay between replies
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`   Sent ${repliesSent} automated responses.`);
}

// Allow running standalone
if (import.meta.url === `file://${process.argv[1]}`) {
    processDirectMessages()
        .then(() => process.exit(0))
        .catch(e => {
            console.error('Fatal execution error:', e);
            process.exit(1);
        });
}

export { processDirectMessages };
