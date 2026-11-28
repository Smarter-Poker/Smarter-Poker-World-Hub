import React from 'react';
import { createRoot } from 'react-dom/client';
import LocationAnalytics from '/home/claude/smarter-poker-world-hub/src/components/bankroll/LocationAnalytics.jsx';
import VarianceCalculator from '/home/claude/smarter-poker-world-hub/src/components/bankroll/VarianceCalculator.jsx';
import HistoricalComparison from '/home/claude/smarter-poker-world-hub/src/components/bankroll/HistoricalComparison.jsx';
const cats=['poker_cash','poker_mtt','casino_table','slots','sports'];
const venues=['Bellagio','Aria','Wynn','Horseshoe Hammond','Rivers Des Plaines','Hard Rock Gary'];
const rnd=(s=>()=>(s=(s*16807)%2147483647)/2147483647)(11);
const iso=d=>d.toISOString().slice(0,10); const now=Date.now();
const entries=[];
for(let i=0;i<60;i++){const v=Math.floor(rnd()*6);entries.push({id:'e'+i,entry_date:iso(new Date(now-Math.floor(rnd()*300)*864e5)),category:cats[Math.floor(rnd()*5)],net_result:Math.round((rnd()-0.5)*4000),gross_in:500,gross_out:500,location_id:'v'+v,location_name:venues[v],start_time:null,end_time:null,duration_hours:Math.round(rnd()*8*10)/10});}
const empty=[];
createRoot(document.getElementById('root')).render(<div style={{width:375}}>
<h4>Loaded</h4><LocationAnalytics entries={entries}/><VarianceCalculator entries={entries}/><HistoricalComparison entries={entries}/>
<h4>Empty</h4><LocationAnalytics entries={empty}/><VarianceCalculator entries={empty}/><HistoricalComparison entries={empty}/>
</div>);
