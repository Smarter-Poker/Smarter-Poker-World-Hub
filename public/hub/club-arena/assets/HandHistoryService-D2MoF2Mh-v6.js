import{s as _,r as p}from"./index-CSyj5bqS-v6.js";import"./vendor-react-ChGGaEAk-v6.js";import"./vendor-supabase-BLlQ2fJ4-v6.js";class N{async getHand(e){const{data:t,error:s}=await _.from("hands").select(`
                *,
                hand_players (
                    seat,
                    user_id,
                    hole_cards,
                    final_hand,
                    result,
                    is_winner
                ),
                hand_actions (
                    player_id,
                    action,
                    amount,
                    street,
                    created_at
                ),
                tables (
                    name,
                    game_type,
                    stakes
                )
            `).eq("id",e).maybeSingle();if(s||!t)return null;const i=(t.hand_players||[]).map(r=>r.user_id),o=await this.fetchProfileMap(i);return this.mapHandRecord(t,o)}async getPlayerHands(e,t=50){const s=JSON.stringify([{userId:e}]),{data:i,error:o}=await _.from("hand_history").select("id, created_at, table_id, hand_number, pot_size, community_cards, players, actions, winners, game_variant, small_blind, big_blind, rake_amount").contains("players",s).order("created_at",{ascending:!1}).limit(t);if(o||!i)return o&&p(o,"HandHistoryService.getPlayerHands_hand_history_query"),[];const r=[];for(const a of i){for(const l of a.players||[])l!=null&&l.userId&&r.push(l.userId);for(const l of a.winners||[])l!=null&&l.userId&&r.push(l.userId)}const d=await this.fetchProfileMap(r);return i.map(a=>this.mapHandHistoryRow(a,e,d)).filter(a=>a!==null)}async getTableHands(e,t=100){const{data:s,error:i}=await _.from("hands").select(`
                *,
                hand_players (
                    seat,
                    user_id,
                    hole_cards,
                    final_hand,
                    result,
                    is_winner
                ),
                tables (
                    name,
                    game_type,
                    stakes
                )
            `).eq("table_id",e).order("created_at",{ascending:!1}).limit(t);if(i||!s)return[];const o=s.flatMap(d=>(d.hand_players||[]).map(l=>l.user_id)),r=await this.fetchProfileMap(o);return s.map(d=>this.mapHandRecord(d,r)).filter(d=>d!==null)}async getRecentWinningHands(e,t=10){const{data:s,error:i}=await _.from("hand_players").select(`
                hands (
                    *,
                    hand_players (
                        seat,
                        user_id,
                        hole_cards,
                        final_hand,
                        result,
                        is_winner
                    ),
                    tables (
                        name,
                        game_type,
                        stakes
                    )
                )
            `).eq("user_id",e).eq("is_winner",!0).order("created_at",{ascending:!1}).limit(t);if(i||!s)return[];const o=s.flatMap(d=>{var l;return(((l=d.hands)==null?void 0:l.hand_players)||[]).map(u=>u.user_id)}),r=await this.fetchProfileMap(o);return s.map(d=>{const a=d;return this.mapHandRecord(a.hands,r)}).filter(d=>d!==null)}async searchHands(e){let t=_.from("hands").select(`
                *,
                hand_players (
                    seat,
                    user_id,
                    hole_cards,
                    final_hand,
                    result,
                    is_winner
                ),
                tables (
                    name,
                    game_type,
                    stakes,
                    club_id
                )
            `).order("created_at",{ascending:!1});if(e.tableId&&(t=t.eq("table_id",e.tableId)),e.startDate&&(t=t.gte("created_at",e.startDate)),e.endDate&&(t=t.lte("created_at",e.endDate)),e.minPot&&(t=t.gte("pot_size",e.minPot)),e.clubId){const{data:a}=await _.from("tables").select("id").eq("club_id",e.clubId),l=(a||[]).map(u=>u.id);if(l.length===0)return[];t=t.in("table_id",l)}t=t.limit(e.limit||50);const{data:s,error:i}=await t;if(i||!s)return[];const o=s.flatMap(a=>(a.hand_players||[]).map(u=>u.user_id)),r=await this.fetchProfileMap(o);return s.map(a=>this.mapHandRecord(a,r)).filter(a=>a!==null)}mapHandHistoryRow(e,t,s){var v;if(!(e!=null&&e.id))return null;const i=Array.isArray(e.players)?e.players:[],o=Array.isArray(e.actions)?e.actions:[],r=Array.isArray(e.winners)?e.winners:[],d=n=>{const m=o.filter(c=>(c==null?void 0:c.userId)===n&&typeof(c==null?void 0:c.amount)=="number"&&c.amount>0).reduce((c,f)=>c+Number(f.amount),0),y=r.filter(c=>(c==null?void 0:c.userId)===n&&typeof(c==null?void 0:c.amount)=="number").reduce((c,f)=>c+Number(f.amount),0);return Math.round((y-m)*100)/100},a=((v=i.find(n=>n==null?void 0:n.isButton))==null?void 0:v.seat)??1,l=i.length||1,u=i.map(n=>{var I,P;const m=(n==null?void 0:n.userId)||"",y=s.get(m),c=m===t,f=r.some(h=>(h==null?void 0:h.userId)===m);return{seat:Number(n==null?void 0:n.seat)||0,user_id:m,username:(y==null?void 0:y.username)||(n==null?void 0:n.username)||(m?m.slice(0,8):"Unknown"),avatar_url:(y==null?void 0:y.avatar_url)||null,position:this.getPositionName(Number(n==null?void 0:n.seat)||0,a,l),hole_cards:Array.isArray(n==null?void 0:n.cards)&&(c||f)?n.cards:[],final_hand:((P=(I=r.find(h=>(h==null?void 0:h.userId)===m))==null?void 0:I.hand)==null?void 0:P.name)||void 0,result:d(m),is_winner:f}}),b=o.map(n=>({player_id:(n==null?void 0:n.userId)||"",action:(n==null?void 0:n.action)||"fold",amount:typeof(n==null?void 0:n.amount)=="number"?n.amount:void 0,street:(n==null?void 0:n.stage)||"preflop",timestamp:typeof(n==null?void 0:n.timestamp)=="number"?n.timestamp:new Date(e.created_at).getTime()})),g=Number(e.small_blind)||0,H=Number(e.big_blind)||0,S=g>0&&H>0?`${g}/${H}`:"1/2";return{id:e.id,serial_number:e.id,table_id:e.table_id,table_name:"Table",played_at:e.created_at,hand_number:Number(e.hand_number)||1,total_hands:1,main_pot:Number(e.pot_size)||0,side_pots:[],community_cards:Array.isArray(e.community_cards)?e.community_cards:[],players:u,actions:b,game_type:(e.game_variant||"nlh").toUpperCase(),stakes:S}}mapHandRecord(e,t){if(!e)return null;const s=e.tables||{name:"Unknown",game_type:"NLH",stakes:"1/2"},i=(e.hand_players||[]).map(r=>{var a;const d=t==null?void 0:t.get(r.user_id);return{seat:r.seat,user_id:r.user_id,username:(d==null?void 0:d.username)||((a=r.user_id)==null?void 0:a.slice(0,8))||"Unknown",avatar_url:(d==null?void 0:d.avatar_url)||null,position:this.getPositionName(r.seat,e.button_seat||1,(e.hand_players||[]).length),hole_cards:r.hole_cards||[],final_hand:r.final_hand||void 0,result:r.result||0,is_winner:r.is_winner||!1}}),o=(e.hand_actions||[]).map(r=>({player_id:r.player_id,action:r.action,amount:r.amount||void 0,street:r.street,timestamp:new Date(r.created_at).getTime()}));return{id:e.id,serial_number:e.serial_number||e.id,table_id:e.table_id,table_name:s.name||"Unknown",played_at:e.created_at,hand_number:e.hand_number||1,total_hands:e.total_hands||1,main_pot:e.pot_size||0,side_pots:e.side_pots||[],community_cards:e.community_cards||[],players:i,actions:o,game_type:s.game_type||"NLH",stakes:s.stakes||"1/2"}}async fetchProfileMap(e){const t=new Map;if(e.length===0)return t;try{const s=[...new Set(e)],{data:i}=await _.from("profiles").select("id, username, avatar_url").in("id",s);for(const o of i||[])t.set(o.id,{username:o.username,avatar_url:o.avatar_url})}catch(s){p(s,"HandHistoryService.fetchProfileMap")}return t}getPositionName(e,t,s){const i=this.getPositionOrder(s),o=(e-t+s)%s;return i[o]||"MP"}async saveHandToSupabase(e,t){try{const{data:s,error:i}=await _.from("hands").insert({table_id:e,hand_number:t.handNumber,pot_size:t.pot,community_cards:t.communityCards,created_at:new Date().toISOString()}).select("id").maybeSingle();if(i||!s){i==null||i.message;return}const o=s.id,r=t.players.map(a=>{var l;return{hand_id:o,user_id:a.id,seat:a.seat,hole_cards:a.holeCards||[],result:a.result||0,is_winner:t.winners.some(u=>u.playerId===a.id),final_hand:((l=t.winners.find(u=>u.playerId===a.id))==null?void 0:l.hand)||null}});r.length>0&&await _.from("hand_players").insert(r);const d=t.actions.map((a,l)=>{const u=t.players.find(b=>b.seat===a.seat);return{hand_id:o,player_id:(u==null?void 0:u.id)||"",action:a.action,amount:a.amount||0,street:a.street,created_at:new Date(Date.now()+l).toISOString()}});d.length>0&&await _.from("hand_actions").insert(d),`${t.handNumber}${o}`}catch(s){p(s,"HandHistoryService.saveHandToSupabase")}}getPositionOrder(e){return e<=2?["BTN","BB"]:e<=3?["BTN","SB","BB"]:e<=6?["BTN","SB","BB","UTG","MP","CO"]:["BTN","SB","BB","UTG","UTG+1","MP","MP+1","HJ","CO"]}}const k=new N;export{k as default,k as handHistoryService};
//# sourceMappingURL=HandHistoryService-D2MoF2Mh-v6.js.map
