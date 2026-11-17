import React from 'react';
import { createRoot } from 'react-dom/client';
import InvoicePaymentsPanel from '../../src/components/messenger/InvoicePaymentsPanel';
import StatementsPanel from '../../src/components/messenger/StatementsPanel';
import AccountingStatementCard from '../../src/components/messenger/AccountingStatementCard';
import DocumentDesigns from '../../pages/hub/messenger/document-designs';
const theme={card:'#242526',text:'#e4e6eb',textSec:'#aeb3bc',border:'#3a3b3e',blue:'#0084ff'};
const root=createRoot(document.getElementById('root'));
window.showFixture=(kind,key=0)=>root.render(kind==='large'?<div style={{padding:20}}><AccountingStatementCard theme={theme} document={{scope:'club',club_name:'Large figures',payload:{period_start:'2026-11-09T08:00Z',period_end:'2026-11-16T08:00Z',poker_net:-616565.50,rake_earned:511435.72,total_rake_funding:460292.14,total_paid_by_club:12345,retained_by_club:447947.14}}}/></div>:kind==='payments'?<InvoicePaymentsPanel key={key} clubId="11111111-1111-4111-8111-111111111111" userId="fixture" theme={theme}/>:kind==='statements'?<StatementsPanel key={key} club={{id:'11111111-1111-4111-8111-111111111111'}} userId="fixture" theme={theme} onBack={()=>{}} onOpen={()=>{}}/>:<DocumentDesigns/>);
