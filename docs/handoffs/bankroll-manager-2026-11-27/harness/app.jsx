import React from 'react';
import { createRoot } from 'react-dom/client';
import BankrollTrendChart from '/home/claude/smarter-poker-world-hub/src/components/bankroll/BankrollTrendChart.jsx';
const cats=['poker_cash','poker_mtt','casino_table','slots','sports'];
const rnd=(s=>()=>(s=(s*16807)%2147483647)/2147483647)(7);
const today=new Date(); const iso=d=>d.toISOString().slice(0,10);
const entries=[];
for(let i=0;i<60;i++){const d=new Date(today.getTime()-Math.floor(rnd()*290)*864e5);entries.push({id:'e'+i,entry_date:iso(d),category:cats[Math.floor(rnd()*5)],net_result:Math.round((rnd()-0.5)*4000),gross_in:500});}
entries.push({id:'x1',entry_date:iso(new Date(today-20*864e5)),category:'expense',net_result:-150});
const modes=['line','bar','donut','stacked','histogram','heatmap'];
const params=new URLSearchParams(location.search); const tf=params.get('tf')||'All Time';
createRoot(document.getElementById('root')).render(<div style={{width:375}}>{modes.map(m=><div key={m} id={m}><BankrollTrendChart entries={entries} chartType={m} timeFilter={tf}/></div>)}</div>);
