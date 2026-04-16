import{s as m,r as p}from"./index-Dug_if_k-v6.js";import"./vendor-react-ChGGaEAk-v6.js";import"./vendor-supabase-BLlQ2fJ4-v6.js";class N{async getHand(e){const{data:t,error:s}=await m.from("hands").select(`
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
            `).eq("id",e).maybeSingle();if(s||!t)return null;const o=(t.hand_players||[]).map(r=>r.user_id),d=await this.fetchProfileMap(o);return this.mapHandRecord(t,d)}async getPlayerHands(e,t=50){const{data:s,error:o}=await m.from("hand_history").select("id, created_at, table_id, hand_number, pot_size, community_cards, players, actions, winners, game_variant, small_blind, big_blind, rake_amount").contains("players",[{userId:e}]).order("created_at",{ascending:!1}).limit(t);if(o||!s)return o&&p(o,"HandHistoryService.getPlayerHands_hand_history_query"),[];const d=[];for(const i of s){for(const n of i.players||[])n!=null&&n.userId&&d.push(n.userId);for(const n of i.winners||[])n!=null&&n.userId&&d.push(n.userId)}const r=await this.fetchProfileMap(d);return s.map(i=>this.mapHandHistoryRow(i,e,r)).filter(i=>i!==null)}async getTableHands(e,t=100){const{data:s,error:o}=await m.from("hands").select(`
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
            `).eq("table_id",e).order("created_at",{ascending:!1}).limit(t);if(o||!s)return[];const d=s.flatMap(i=>(i.hand_players||[]).map(c=>c.user_id)),r=await this.fetchProfileMap(d);return s.map(i=>this.mapHandRecord(i,r)).filter(i=>i!==null)}async getRecentWinningHands(e,t=10){const{data:s,error:o}=await m.from("hand_players").select(`
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
            `).eq("user_id",e).eq("is_winner",!0).order("created_at",{ascending:!1}).limit(t);if(o||!s)return[];const d=s.flatMap(i=>{var c;return(((c=i.hands)==null?void 0:c.hand_players)||[]).map(u=>u.user_id)}),r=await this.fetchProfileMap(d);return s.map(i=>{const n=i;return this.mapHandRecord(n.hands,r)}).filter(i=>i!==null)}async searchHands(e){let t=m.from("hands").select(`
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
            `).order("created_at",{ascending:!1});if(e.tableId&&(t=t.eq("table_id",e.tableId)),e.startDate&&(t=t.gte("created_at",e.startDate)),e.endDate&&(t=t.lte("created_at",e.endDate)),e.minPot&&(t=t.gte("pot_size",e.minPot)),e.clubId){const{data:n}=await m.from("tables").select("id").eq("club_id",e.clubId),c=(n||[]).map(u=>u.id);if(c.length===0)return[];t=t.in("table_id",c)}t=t.limit(e.limit||50);const{data:s,error:o}=await t;if(o||!s)return[];const d=s.flatMap(n=>(n.hand_players||[]).map(u=>u.user_id)),r=await this.fetchProfileMap(d);return s.map(n=>this.mapHandRecord(n,r)).filter(n=>n!==null)}mapHandHistoryRow(e,t,s){var v;if(!(e!=null&&e.id))return null;const o=Array.isArray(e.players)?e.players:[],d=Array.isArray(e.actions)?e.actions:[],r=Array.isArray(e.winners)?e.winners:[],i=a=>{const _=d.filter(l=>(l==null?void 0:l.userId)===a&&typeof(l==null?void 0:l.amount)=="number"&&l.amount>0).reduce((l,b)=>l+Number(b.amount),0),y=r.filter(l=>(l==null?void 0:l.userId)===a&&typeof(l==null?void 0:l.amount)=="number").reduce((l,b)=>l+Number(b.amount),0);return Math.round((y-_)*100)/100},n=((v=o.find(a=>a==null?void 0:a.isButton))==null?void 0:v.seat)??1,c=o.length||1,u=o.map(a=>{var I,P;const _=(a==null?void 0:a.userId)||"",y=s.get(_),l=_===t,b=r.some(h=>(h==null?void 0:h.userId)===_);return{seat:Number(a==null?void 0:a.seat)||0,user_id:_,username:(y==null?void 0:y.username)||(a==null?void 0:a.username)||(_?_.slice(0,8):"Unknown"),avatar_url:(y==null?void 0:y.avatar_url)||null,position:this.getPositionName(Number(a==null?void 0:a.seat)||0,n,c),hole_cards:Array.isArray(a==null?void 0:a.cards)&&(l||b)?a.cards:[],final_hand:((P=(I=r.find(h=>(h==null?void 0:h.userId)===_))==null?void 0:I.hand)==null?void 0:P.name)||void 0,result:i(_),is_winner:b}}),f=d.map(a=>({player_id:(a==null?void 0:a.userId)||"",action:(a==null?void 0:a.action)||"fold",amount:typeof(a==null?void 0:a.amount)=="number"?a.amount:void 0,street:(a==null?void 0:a.stage)||"preflop",timestamp:typeof(a==null?void 0:a.timestamp)=="number"?a.timestamp:new Date(e.created_at).getTime()})),g=Number(e.small_blind)||0,H=Number(e.big_blind)||0,S=g>0&&H>0?`${g}/${H}`:"1/2";return{id:e.id,serial_number:e.id,table_id:e.table_id,table_name:"Table",played_at:e.created_at,hand_number:Number(e.hand_number)||1,total_hands:1,main_pot:Number(e.pot_size)||0,side_pots:[],community_cards:Array.isArray(e.community_cards)?e.community_cards:[],players:u,actions:f,game_type:(e.game_variant||"nlh").toUpperCase(),stakes:S}}mapHandRecord(e,t){if(!e)return null;const s=e.tables||{name:"Unknown",game_type:"NLH",stakes:"1/2"},o=(e.hand_players||[]).map(r=>{var n;const i=t==null?void 0:t.get(r.user_id);return{seat:r.seat,user_id:r.user_id,username:(i==null?void 0:i.username)||((n=r.user_id)==null?void 0:n.slice(0,8))||"Unknown",avatar_url:(i==null?void 0:i.avatar_url)||null,position:this.getPositionName(r.seat,e.button_seat||1,(e.hand_players||[]).length),hole_cards:r.hole_cards||[],final_hand:r.final_hand||void 0,result:r.result||0,is_winner:r.is_winner||!1}}),d=(e.hand_actions||[]).map(r=>({player_id:r.player_id,action:r.action,amount:r.amount||void 0,street:r.street,timestamp:new Date(r.created_at).getTime()}));return{id:e.id,serial_number:e.serial_number||e.id,table_id:e.table_id,table_name:s.name||"Unknown",played_at:e.created_at,hand_number:e.hand_number||1,total_hands:e.total_hands||1,main_pot:e.pot_size||0,side_pots:e.side_pots||[],community_cards:e.community_cards||[],players:o,actions:d,game_type:s.game_type||"NLH",stakes:s.stakes||"1/2"}}async fetchProfileMap(e){const t=new Map;if(e.length===0)return t;try{const s=[...new Set(e)],{data:o}=await m.from("profiles").select("id, username, avatar_url").in("id",s);for(const d of o||[])t.set(d.id,{username:d.username,avatar_url:d.avatar_url})}catch(s){p(s,"HandHistoryService.fetchProfileMap")}return t}getPositionName(e,t,s){const o=this.getPositionOrder(s),d=(e-t+s)%s;return o[d]||"MP"}async saveHandToSupabase(e,t){try{const{data:s,error:o}=await m.from("hands").insert({table_id:e,hand_number:t.handNumber,pot_size:t.pot,community_cards:t.communityCards,created_at:new Date().toISOString()}).select("id").maybeSingle();if(o||!s){o==null||o.message;return}const d=s.id,r=t.players.map(n=>{var c;return{hand_id:d,user_id:n.id,seat:n.seat,hole_cards:n.holeCards||[],result:n.result||0,is_winner:t.winners.some(u=>u.playerId===n.id),final_hand:((c=t.winners.find(u=>u.playerId===n.id))==null?void 0:c.hand)||null}});r.length>0&&await m.from("hand_players").insert(r);const i=t.actions.map((n,c)=>{const u=t.players.find(f=>f.seat===n.seat);return{hand_id:d,player_id:(u==null?void 0:u.id)||"",action:n.action,amount:n.amount||0,street:n.street,created_at:new Date(Date.now()+c).toISOString()}});i.length>0&&await m.from("hand_actions").insert(i),`${t.handNumber}${d}`}catch(s){p(s,"HandHistoryService.saveHandToSupabase")}}getPositionOrder(e){return e<=2?["BTN","BB"]:e<=3?["BTN","SB","BB"]:e<=6?["BTN","SB","BB","UTG","MP","CO"]:["BTN","SB","BB","UTG","UTG+1","MP","MP+1","HJ","CO"]}}const k=new N;export{k as default,k as handHistoryService};
