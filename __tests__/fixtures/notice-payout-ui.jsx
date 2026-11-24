import React from 'react';
import { createRoot } from 'react-dom/client';
import NoticeBoard from '../../src/components/messenger/NoticeBoard';
import CashoutRequestActions from '../../src/components/messenger/CashoutRequestActions';
import { broadcastSync } from '../../src/lib/broadcastSync';
const root=createRoot(document.getElementById('root'));
const theme={text:'#e4e6eb',textSec:'#b0b3b8',border:'#393a3b',blue:'#0084ff',bg:'#242526'};
const club={id:'10000000-0000-4000-8000-000000000001',name:'Fixture Club'};
const userId='10000000-0000-4000-8000-000000000002';
window.__markedRead=[];
window.__messagedMembers=[];
window.showFixture=(view,key=0,actorId=userId)=>root.render(
    view==='private'
        ?<CashoutRequestActions key={key} cashoutId="20000000-0000-4000-8000-000000000001" currentUserId={actorId} theme={theme}/>
        :<div style={{height:'100vh',display:'flex'}}>
            <NoticeBoard
                key={key}
                club={club}
                userId={actorId}
                theme={theme}
                onBack={()=>{}}
                onMarkRead={cid=>{window.__markedRead.push(cid);broadcastSync('smarter_poker_unread_sync','refresh_unread');}}
                onMessageMember={(member,prefill)=>{window.__messagedMembers.push({member,prefill});}}
            />
        </div>
);
window.showFixture('private');
