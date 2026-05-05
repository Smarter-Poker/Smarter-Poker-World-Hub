const fs = require('fs');
let content = fs.readFileSync('pages/api/live/gift.js', 'utf8');

// Fix 1: sumPaginatedTransactions order
content = content.replace(
    /const { data, error } = await queryBuilderFn\(\)\.range\(page \* pageSize, \(page \+ 1\) \* pageSize - 1\);/g,
    `const { data, error } = await queryBuilderFn()
            .order('created_at', { ascending: false })
            .order('id')
            .range(page * pageSize, (page + 1) * pageSize - 1);`
);

// Fix 2: The getLiveGiftSourceCapAvailable function
const regex = /async function getLiveGiftSourceCapAvailable\(userId\) \{[\s\S]*?\n\}/g;
const replacement = `async function getLiveGiftSourceCapAvailable(userId) {
    const { data, error } = await supabase.rpc('get_source_tier_available', { p_user_id: userId });
    if (error || !data) {
        console.warn('[getLiveGiftSourceCapAvailable] RPC failed:', error);
        return 0;
    }
    return data.purchasedWonAvailable || 0;
}`;
content = content.replace(regex, replacement);

fs.writeFileSync('pages/api/live/gift.js', content);
