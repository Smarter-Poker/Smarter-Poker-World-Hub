const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../pages/hub/MLB-ANALYTICS/portfolio.tsx');
let content = fs.readFileSync(file, 'utf8');

// Remove static import
content = content.replace("import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';", "");

// Add dynamic import
const dynamicImport = `import dynamic from 'next/dynamic';

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });`;

content = content.replace("import useSWR from 'swr';", "import useSWR from 'swr';\n" + dynamicImport);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed recharts imports');
