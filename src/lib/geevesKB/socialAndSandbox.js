/* Social Hub & Virtual Sandbox Knowledge */

export const SOCIAL_HUB_ENTRIES = [
    {
        id: 'sh-1', category: 'Social',
        keywords: ['social hub', 'social media page', 'feed', 'community', 'posts', 'social feed'],
        patterns: ['what is the social hub', 'how does the social feed work', 'where is social media'],
        answer: '**Social Hub** is the community center of Smarter.Poker — a full poker social network.\n\n**Feed Features:**\n- **Posts** — Share text, images, videos, and hand analysis\n- **Stories** — 24-hour disappearing content at the top of the feed\n- **Reels** — Short-form poker video clips\n- **Social Pages** — Business/club pages for organizations\n- **Likes, comments, shares** — Full engagement tools\n- **Filter** — By trending, latest, or friends-only\n\nAccess from Hub > Social Media Orb.',
        followUps: ['How do I create a post?', 'What are stories?', 'How do I upload a reel?']
    },
    {
        id: 'sh-2', category: 'Social',
        keywords: ['create post', 'new post', 'share post', 'posting', 'what can i post', 'post content'],
        patterns: ['how do i create a post', 'how to post on social', 'what can i share', 'how to make a post'],
        answer: '**Creating a Post:**\n\n1. Open Social Hub\n2. Tap the **What\'s on your mind?** box or the compose button\n3. Add your content:\n   - **Text** — Share thoughts, analysis, results\n   - **Images** — Upload photos (table shots, graphs, etc.)\n   - **Videos** — Share clips\n   - **Hand History** — Attach a hand for analysis\n4. Choose visibility: **Public**, **Friends only**, or **Followers**\n5. Tap **Post**\n\nYour post appears in your followers\' feeds immediately.',
        followUps: ['Can I tag other players?', 'How do I delete a post?', 'How do I edit after posting?']
    },
    {
        id: 'sh-3', category: 'Social',
        keywords: ['stories', 'story', 'add story', 'view stories', 'my story', '24 hour'],
        patterns: ['what are stories', 'how do i add a story', 'how do stories work', 'how to post a story'],
        answer: '**Stories** are short-lived content that expires after 24 hours.\n\n**Adding a Story:**\n1. Tap your avatar circle at the top of the Social feed\n2. Select an image or video from your device (or capture live)\n3. Add text, stickers, or polls\n4. Tap **Share to Story**\n\n**Viewing Stories:**\n- Tap any circle avatar at the top of the feed\n- Stories auto-advance after 5 seconds\n- Tap the right side to skip forward\n\nStories are great for quick updates — tournament results, session highlights, or just connecting with the community.',
        followUps: ['How long do stories last?', 'Can I see who viewed my story?', 'How do I delete a story?']
    },
    {
        id: 'sh-4', category: 'Social',
        keywords: ['reels', 'short video', 'upload reel', 'watch reels', 'reel feed', 'poker reels'],
        patterns: ['how do i upload a reel', 'what are reels', 'how to make a reel', 'where do i watch reels'],
        answer: '**Reels** are short-form poker videos — think TikTok for poker players.\n\n**Uploading a Reel:**\n1. Go to Reels from the hub or social feed\n2. Tap the upload button (+)\n3. Select a video (max 60 seconds)\n4. Add a caption, hashtags, and tags\n5. Choose visibility\n6. Tap **Post Reel**\n\n**Watching Reels:**\n- Vertical scroll feed\n- Like, comment, share, and save\n- Browse by category: strategy, funny, results\n\n**My Reels:** View all your uploaded content. **Saved:** Your bookmarked favorites.',
        followUps: ['How long can a reel be?', 'Can I use music in reels?', 'How do I gain reel followers?']
    },
    {
        id: 'sh-5', category: 'Social',
        keywords: ['stories highlights', 'saved stories', 'pinned stories', 'story archive'],
        patterns: ['how do i save stories', 'what are story highlights', 'how to pin a story'],
        answer: '**Story Highlights** let you pin important stories to your profile permanently.\n\n- After posting a story, tap the **Save** option\n- Saved stories appear as Highlights on your profile\n- Organize them into named collections\n- Highlights never expire\n\nGreat for showcasing your best moments, tournament wins, or strategy content.',
        followUps: ['How do I delete a highlight?', 'Can I reorder highlights?']
    },
    {
        id: 'sh-6', category: 'Social',
        keywords: ['like', 'comment', 'share post', 'react', 'engagement', 'commenting'],
        patterns: ['how do i like a post', 'how to comment on a post', 'how do i share a post'],
        answer: '**Engaging with Posts:**\n\n- **Like** — Tap the heart icon to like any post\n- **Comment** — Tap the comment bubble to reply\n- **Share** — Tap share to repost to your feed or send via message\n- **Save** — Bookmark posts to revisit later\n\nComments show in real-time. You can reply to specific comments creating threads.',
        followUps: ['Can I react with different emojis?', 'How do I delete my comment?']
    },
    {
        id: 'sh-7', category: 'Social',
        keywords: ['block', 'report', 'hide', 'mute', 'report user', 'block user'],
        patterns: ['how do i block someone', 'how to report a user', 'how do i mute someone', 'how to hide posts'],
        answer: '**Safety & Privacy Controls:**\n\n- **Block** — Tap the three dots (...) on a post or profile > Block. They can no longer see your content or message you.\n- **Report** — Flag inappropriate content for review\n- **Mute** — Hide someone\'s posts without unfriending them\n- **Hide** — Remove a specific post from your feed\n\nAll safety actions are private — the other person is not notified.',
        followUps: ['How do I unblock someone?', 'What happens when I report someone?']
    },
    {
        id: 'sh-8', category: 'Social',
        keywords: ['follow', 'follower', 'following', 'unfollow'],
        patterns: ['how do i follow someone', 'how to unfollow', 'what is the difference between friends and followers'],
        answer: '**Friends vs. Followers:**\n\n- **Friends** — Mutual connection (both accepted). Can message each other, see private posts.\n- **Followers** — One-way subscription. You see their public posts in your feed.\n\n**Following someone:**\n- Go to their profile\n- Tap **Follow** — their public posts appear in your feed\n\n**Friend Request:**\n- Tap **Add Friend** — they must accept\n- Once accepted, you are mutual friends\n\nYou can follow without being friends.',
        followUps: ['How do I see my followers?', 'Can I have a private account?']
    },
    {
        id: 'sh-9', category: 'Social',
        keywords: ['social page', 'create page', 'club page', 'business page', 'page admin'],
        patterns: ['how do i create a social page', 'what are social pages', 'how to make a club page', 'how to create a brand page'],
        answer: '**Social Pages** are public profiles for clubs, brands, or content creators.\n\n**Creating a Page:**\n1. Go to Social > Pages > Create Page\n2. Choose a category (Club, Training, Content Creator, etc.)\n3. Set name, description, logo, and banner\n4. Start posting content\n\n**Page Features:**\n- Unlimited followers (no friend limit)\n- Multiple page admins\n- Post analytics (reach, engagement)\n- Verification badge (apply once you have enough followers)\n- Scheduled posts\n\nPerfect for poker clubs, coaching services, or community groups.',
        followUps: ['How do I get a verified badge?', 'Can I have multiple admins?', 'How do I view page analytics?']
    },
    {
        id: 'sh-10', category: 'Social',
        keywords: ['profile page', 'public profile', 'user profile', 'profile visit', 'my profile'],
        patterns: ['how do i view someone\'s profile', 'what is on a profile page', 'how to customize my profile'],
        answer: '**Profile Page** is your public poker identity on Smarter.Poker.\n\n**Your Profile Shows:**\n- Avatar, banner, and display name\n- Bio and location\n- Stats: posts, followers, following\n- Story highlights\n- Recent posts and reels\n- Bankroll stats (if public)\n- Diamond/VIP badge\n- Training achievements\n\n**Editing Your Profile:**\n- Tap **Edit Profile** from your profile page\n- Update avatar, bio, banner, and privacy settings',
        followUps: ['How do I make my profile private?', 'Can I see who visited my profile?']
    },
    {
        id: 'sh-11', category: 'Social',
        keywords: ['hashtag', 'hashtags', 'trending', 'trending topics', 'search social'],
        patterns: ['how do hashtags work', 'how do i find trending posts', 'how to search social media'],
        answer: '**Hashtags & Discovery:**\n\n- Add **#hashtags** to any post to categorize it (e.g., #poker, #gto, #tournament)\n- Tap any hashtag to see all posts using it\n- **Trending** — See the most active topics right now\n- **Search** — Search by username, hashtag, or topic\n\nHashtags help your posts reach beyond your followers to the whole community.',
        followUps: ['What hashtags should I use?', 'How do I go viral on Smarter.Poker?']
    },
];

export const SANDBOX_ENTRIES = [
    {
        id: 'sb-1', category: 'Sandbox',
        keywords: ['virtual sandbox', 'sandbox', 'hand analyzer', 'analysis tool', 'equity calculator'],
        patterns: ['what is the virtual sandbox', 'how does the sandbox work', 'how to analyze a hand', 'what is the hand analyzer'],
        answer: '**Virtual Sandbox** (inside Personal Assistant) is an AI-powered poker hand analysis lab.\n\n**What it does:**\n- Set up any poker situation (hole cards, board, positions, bets)\n- Calculate equity between any two ranges\n- Analyze GTO correctness of decisions\n- Get AI recommendations from Jarvis\n- Study replay mode for past hands\n- Share hand analyses with the community\n\n**How to use:**\n1. Open Personal Assistant Orb\n2. Select **Virtual Sandbox**\n3. Set the hand: positions, hole cards, board\n4. Configure bet sizing and stack depth\n5. Tap **Analyze** for instant AI feedback',
        followUps: ['How do I input hole cards?', 'What is equity?', 'How do I set up a board?']
    },
    {
        id: 'sb-2', category: 'Sandbox',
        keywords: ['equity', 'hand equity', 'equity calculation', 'outs', 'odds'],
        patterns: ['how do i calculate equity', 'what is equity in poker', 'how to calculate my odds', 'how many outs do i have'],
        answer: '**Equity** is your percentage chance of winning a hand if all remaining cards are dealt out.\n\n**Example:**\n- You have AK, villain has QQ\n- Pre-flop: AK has ~47% equity, QQ has ~53%\n\n**In the Sandbox:**\n1. Enter your hand and the villain\'s hand (or range)\n2. Set the board cards dealt so far\n3. Sandbox calculates equity in real-time\n\n**Outs:** Cards that improve your hand to a winner.\n- Flush draw = 9 outs\n- Open-ended straight draw = 8 outs\n- Gut-shot = 4 outs\n- Each out is approximately 2% equity per card to come',
        followUps: ['What are pot odds?', 'Should I always bet when ahead in equity?', 'What is fold equity?']
    },
    {
        id: 'sb-3', category: 'Sandbox',
        keywords: ['pot odds', 'calling odds', 'break even', 'required equity', 'pot odd calculation'],
        patterns: ['what are pot odds', 'how do i calculate pot odds', 'how to use pot odds', 'when should i call based on pot odds'],
        answer: '**Pot Odds** tell you the minimum equity you need to profitably call a bet.\n\n**Formula:**\nPot Odds = Call Amount / (Pot + Call Amount)\n\n**Example:**\n- Pot = $100, villain bets $50\n- Call = $50\n- Total = $150\n- Required equity = 50/150 = 33%\n- If you have >33% equity → profitable call\n\n**In the Sandbox:**\nEnter pot size and bet size — Sandbox calculates the required equity automatically and tells you if your hand has enough equity to call.',
        followUps: ['What are implied odds?', 'What is fold equity?', 'When should I fold despite good pot odds?']
    },
    {
        id: 'sb-4', category: 'Sandbox',
        keywords: ['board texture', 'board analysis', 'dry board', 'wet board', 'connected board', 'paired board'],
        patterns: ['what is board texture', 'how do i analyze a board', 'what is a wet board', 'what is a dry board'],
        answer: '**Board Texture** describes the characteristics of the community cards.\n\n**Types:**\n- **Dry/Static** — Disconnected, uncoordinated (e.g., K-7-2 rainbow). Few draws possible. Good for range bets.\n- **Wet/Dynamic** — Coordinated, lots of draws (e.g., 9-8-7 two-tone). Many draws change the hand dramatically. Bet big or check.\n- **Paired** — Two cards of same rank (e.g., K-K-3). Strong hands polarize; bluffs work well.\n- **Monotone** — All same suit. Flush draw or flush already possible for one player.\n\n**In the Sandbox:** Enter board cards and Jarvis explains the texture and recommends strategy based on your position and range.',
        followUps: ['How do I play on wet boards?', 'What is range advantage?', 'How does board texture affect my cbet frequency?']
    },
    {
        id: 'sb-5', category: 'Sandbox',
        keywords: ['range advantage', 'nut advantage', 'range equity', 'range construction', 'polarized vs merged'],
        patterns: ['what is range advantage', 'how do ranges work', 'what is a polarized range', 'what is a merged range'],
        answer: '**Range Advantage** means one player\'s overall range is stronger on a given board.\n\n**Nut Advantage:** One player has more strong hands (flushes, sets, straights).\n\n**Types of Ranges:**\n- **Polarized** — Strong hands AND bluffs, very few medium hands. Used OOP or on later streets.\n- **Merged** — Mostly value hands with little air. Good when range advantage is strong.\n- **Condensed** — Mostly medium-strength hands (common for callers).\n\n**Why it matters:**\nThe player with the range advantage should bet more. The player disadvantaged should check/defend at a lower frequency.\n\nThe Sandbox shows range equity visualizations to illustrate this.',
        followUps: ['How does position affect range construction?', 'What is the MDF?', 'How do I balance my ranges?']
    },
    {
        id: 'sb-6', category: 'Sandbox',
        keywords: ['mdf', 'minimum defense frequency', 'defense frequency', 'protect against bluffs'],
        patterns: ['what is mdf', 'what is minimum defense frequency', 'how much should i defend'],
        answer: '**MDF (Minimum Defense Frequency)** is how often you must call/raise to prevent an opponent from profitably bluffing with any two cards.\n\n**Formula:**\nMDF = Pot / (Pot + Bet)\n\n**Example:**\n- Pot = $100, villain bets $100\n- MDF = 100 / (100 + 100) = 50%\n- You must defend at least 50% of your range\n\nIf you fold more than (1 - MDF), villain can profitably bluff every hand. The Sandbox automatically calculates MDF for any bet size you input.',
        followUps: ['How do I choose which hands to defend?', 'What is the alpha (bluff break-even)?', 'Should I always defend the MDF?']
    },
    {
        id: 'sb-7', category: 'Sandbox',
        keywords: ['exploit mode', 'exploitative', 'exploit strategy', 'exploiting opponents', 'reads'],
        patterns: ['what is exploit mode', 'how does exploitative play work', 'when should i exploit instead of play gto'],
        answer: '**Exploit Mode** in the Sandbox shifts from GTO play to exploitative adjustments based on opponent tendencies.\n\n**When to exploit:**\n- Opponent folds too often → bluff more\n- Opponent calls everything → value bet thinner, bluff less\n- Opponent overbets → use polarized calling range\n- Opponent never bluffs rivers → fold more\n\n**In the Sandbox:**\n1. Toggle **Exploit Mode** on\n2. Input villain\'s tendencies (fold-to-cbet %, leak category, etc.)\n3. Jarvis generates the maximum-exploiting strategy\n\nExploit deviates from GTO intentionally to maximize EV vs. specific opponents.',
        followUps: ['What is the difference between GTO and exploitative?', 'How do I identify player tendencies?', 'Is GTO always better?']
    },
    {
        id: 'sb-8', category: 'Sandbox',
        keywords: ['study replay', 'replay hand', 'study mode', 'review session', 'replay analysis'],
        patterns: ['how do i replay a hand', 'what is study replay mode', 'how to review a past hand'],
        answer: '**Study Replay** lets you replay and analyze past hands step by step.\n\n1. In the Sandbox, tap **Study Replay**\n2. Select a hand from your hand history\n3. Walk through each street:\n   - See all player actions\n   - Compare to GTO recommendations\n   - See equity at each decision point\n   - Identify mistakes\n4. Get Jarvis commentary on each decision\n\nThis is one of the most powerful study tools — catching your own mistakes in real hands is the fastest way to improve.',
        followUps: ['How do I import a hand for replay?', 'Can I share a replayed hand?', 'How do I use study replay to find leaks?']
    },
    {
        id: 'sb-9', category: 'Sandbox',
        keywords: ['share analysis', 'export analysis', 'post hand', 'share hand', 'share sandbox'],
        patterns: ['how do i share my hand analysis', 'can i export sandbox results', 'how to share with friends'],
        answer: '**Sharing Sandbox Analysis:**\n\n- After analyzing a hand, tap **Share**\n- Choose to:\n  - **Post to Social Feed** — Share with the community\n  - **Copy Link** — Send to a specific person\n  - **Export PDF/Image** — Save for coaching or study groups\n  - **Send to Jarvis** — Continue the conversation with AI coaching\n\nSharing hands is one of the best ways to get feedback and spark strategic discussions.',
        followUps: ['How do I post to the social feed?', 'Can I share with a coach?']
    },
];
