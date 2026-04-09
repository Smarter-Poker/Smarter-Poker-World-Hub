const fs = require('fs');
const p = 'src/components/poker-near-me/VenueCard.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/const formatMoney = \(amount\) => \{[\s\S]*?\};/, `const formatMoney = (amount) => {
    if (!amount) return '$0';
    const num = typeof amount === 'string' ? Number(amount.replace(/[^0-9.]/g, '')) : amount;
    if (isNaN(num)) return amount; // Fallback to raw string if completely unparseable
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
};`);

fs.writeFileSync(p, c);
