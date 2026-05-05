const fs = require('fs');
const file = './src/components/store/DiamondWalletModal.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Change text
content = content.replace("Welcome To<br/>Smarter.Poker", "Diamond<br/>Wallet");

// 2. Add state
content = content.replace(
    "const [balance, setBalance] = useState(() => initialBalance ?? getCachedBalance());",
    "const [balance, setBalance] = useState(() => initialBalance ?? getCachedBalance());\n    const [vipExpirationDate, setVipExpirationDate] = useState(null);"
);

// 3. Set state in fetchTransactions
content = content.replace(
    "setTotal(tot);",
    "setTotal(tot);\n                setVipExpirationDate(data.vip_expiration_date || null);"
);

// 4. Update the VIP card text area to calculate and show real days
const vipLogic = `
                                    {(() => {
                                        let daysLeftText = '--';
                                        let isVipActive = false;
                                        if (vipExpirationDate) {
                                            const diff = new Date(vipExpirationDate).getTime() - new Date().getTime();
                                            if (diff > 0) {
                                                daysLeftText = Math.ceil(diff / (1000 * 60 * 60 * 24));
                                                isVipActive = true;
                                            } else {
                                                daysLeftText = '0';
                                            }
                                        }
                                        return (
                                            <>
                                                {isVipActive ? 'VIP Member' : '30-Day VIP Card'}<br/>
                                                <span style={{ color: '#a0c0e0', fontSize: 12, letterSpacing: '0.5px' }}>
                                                    {isVipActive ? \`Expires: \${daysLeftText} Days\` : 'Inactive'}
                                                </span>
                                            </>
                                        );
                                    })()}
`;

// Find the exact lines to replace for the VIP text
// It's lines 1461-1464 basically:
// 30-Day VIP Card<br/>
// <span style={{ color: '#a0c0e0', fontSize: 12, letterSpacing: '0.5px' }}>Expires: 30 Days</span>
const textToReplace = "30-Day VIP Card<br/>\\n                                    <span style={{ color: '#a0c0e0', fontSize: 12, letterSpacing: '0.5px' }}>Expires: 30 Days</span>";

content = content.replace("30-Day VIP Card<br/>\n                                    <span style={{ color: '#a0c0e0', fontSize: 12, letterSpacing: '0.5px' }}>Expires: 30 Days</span>", vipLogic.trim());

fs.writeFileSync(file, content);
console.log('Fixed DiamondWalletModal.jsx');
