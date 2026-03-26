import{s as c}from"./index-B5fMbFtW.js";import"./vendor-react-ChGGaEAk.js";import"./vendor-supabase-BLlQ2fJ4.js";class u{async getHand(e){const{data:a,error:t}=await c.from("hands").select(`
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
            `).eq("id",e).maybeSingle();if(t||!a)return null;const o=(a.hand_players||[]).map(s=>s.user_id),i=await this.fetchProfileMap(o);return this.mapHandRecord(a,i)}async getPlayerHands(e,a=50){const{data:t,error:o}=await c.from("hand_players").select(`
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
            `).eq("user_id",e).order("created_at",{ascending:!1}).limit(a);if(o||!t)return[];const i=t.flatMap(n=>{var d;return(((d=n.hands)==null?void 0:d.hand_players)||[]).map(l=>l.user_id)}),s=await this.fetchProfileMap(i);return t.map(n=>{const r=n;return this.mapHandRecord(r.hands,s)}).filter(n=>n!==null)}async getTableHands(e,a=100){const{data:t,error:o}=await c.from("hands").select(`
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
            `).eq("table_id",e).order("created_at",{ascending:!1}).limit(a);if(o||!t)return[];const i=t.flatMap(n=>(n.hand_players||[]).map(d=>d.user_id)),s=await this.fetchProfileMap(i);return t.map(n=>this.mapHandRecord(n,s)).filter(n=>n!==null)}async getRecentWinningHands(e,a=10){const{data:t,error:o}=await c.from("hand_players").select(`
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
            `).eq("user_id",e).eq("is_winner",!0).order("created_at",{ascending:!1}).limit(a);if(o||!t)return[];const i=t.flatMap(n=>{var d;return(((d=n.hands)==null?void 0:d.hand_players)||[]).map(l=>l.user_id)}),s=await this.fetchProfileMap(i);return t.map(n=>{const r=n;return this.mapHandRecord(r.hands,s)}).filter(n=>n!==null)}async searchHands(e){let a=c.from("hands").select(`
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
            `).order("created_at",{ascending:!1});if(e.tableId&&(a=a.eq("table_id",e.tableId)),e.startDate&&(a=a.gte("created_at",e.startDate)),e.endDate&&(a=a.lte("created_at",e.endDate)),e.minPot&&(a=a.gte("pot_size",e.minPot)),e.clubId){const{data:r}=await c.from("tables").select("id").eq("club_id",e.clubId),d=(r||[]).map(l=>l.id);if(d.length===0)return[];a=a.in("table_id",d)}a=a.limit(e.limit||50);const{data:t,error:o}=await a;if(o||!t)return[];const i=t.flatMap(r=>(r.hand_players||[]).map(l=>l.user_id)),s=await this.fetchProfileMap(i);return t.map(r=>this.mapHandRecord(r,s)).filter(r=>r!==null)}mapHandRecord(e,a){if(!e)return null;const t=e.tables||{name:"Unknown",game_type:"NLH",stakes:"1/2"},o=(e.hand_players||[]).map(s=>{var r;const n=a==null?void 0:a.get(s.user_id);return{seat:s.seat,user_id:s.user_id,username:(n==null?void 0:n.username)||((r=s.user_id)==null?void 0:r.slice(0,8))||"Unknown",avatar_url:(n==null?void 0:n.avatar_url)||null,position:this.getPositionName(s.seat,e.button_seat||1,(e.hand_players||[]).length),hole_cards:s.hole_cards||[],final_hand:s.final_hand||void 0,result:s.result||0,is_winner:s.is_winner||!1}}),i=(e.hand_actions||[]).map(s=>({player_id:s.player_id,action:s.action,amount:s.amount||void 0,street:s.street,timestamp:new Date(s.created_at).getTime()}));return{id:e.id,serial_number:e.serial_number||e.id,table_id:e.table_id,table_name:t.name||"Unknown",played_at:e.created_at,hand_number:e.hand_number||1,total_hands:e.total_hands||1,main_pot:e.pot_size||0,side_pots:e.side_pots||[],community_cards:e.community_cards||[],players:o,actions:i,game_type:t.game_type||"NLH",stakes:t.stakes||"1/2"}}async fetchProfileMap(e){const a=new Map;if(e.length===0)return a;try{const t=[...new Set(e)],{data:o}=await c.from("profiles").select("id, username, avatar_url").in("id",t);for(const i of o||[])a.set(i.id,{username:i.username,avatar_url:i.avatar_url})}catch(t){console.error("[HandHistoryService] Error:",t instanceof Error?t.message:String(t))}return a}getPositionName(e,a,t){const o=this.getPositionOrder(t),i=(e-a+t)%t;return o[i]||"MP"}async saveHandToSupabase(e,a){try{const{data:t,error:o}=await c.from("hands").insert({table_id:e,hand_number:a.handNumber,pot_size:a.pot,community_cards:a.communityCards,created_at:new Date().toISOString()}).select("id").maybeSingle();if(o||!t){o==null||o.message;return}const i=t.id,s=a.players.map(r=>{var d;return{hand_id:i,user_id:r.id,seat:r.seat,hole_cards:r.holeCards||[],result:r.result||0,is_winner:a.winners.some(l=>l.playerId===r.id),final_hand:((d=a.winners.find(l=>l.playerId===r.id))==null?void 0:d.hand)||null}});s.length>0&&await c.from("hand_players").insert(s);const n=a.actions.map((r,d)=>{const l=a.players.find(_=>_.seat===r.seat);return{hand_id:i,player_id:(l==null?void 0:l.id)||"",action:r.action,amount:r.amount||0,street:r.street,created_at:new Date(Date.now()+d).toISOString()}});n.length>0&&await c.from("hand_actions").insert(n),`${a.handNumber}${i}`}catch(t){console.error("[HandHistory] Supabase save failed (non-critical):",t)}}getPositionOrder(e){return e<=2?["BTN","BB"]:e<=3?["BTN","SB","BB"]:e<=6?["BTN","SB","BB","UTG","MP","CO"]:["BTN","SB","BB","UTG","UTG+1","MP","MP+1","HJ","CO"]}}const y=new u;export{y as default,y as handHistoryService};
