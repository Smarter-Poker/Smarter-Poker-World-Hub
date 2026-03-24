import{s as u}from"./index-DwHniqwZ.js";import{j as h}from"./vendor-react-ChGGaEAk.js";class y{async getHand(e){const{data:a,error:s}=await u.from("hands").select(`
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
            `).eq("id",e).maybeSingle();if(s||!a)return null;const i=(a.hand_players||[]).map(t=>t.user_id),o=await this.fetchProfileMap(i);return this.mapHandRecord(a,o)}async getPlayerHands(e,a=50){const{data:s,error:i}=await u.from("hand_players").select(`
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
            `).eq("user_id",e).order("created_at",{ascending:!1}).limit(a);if(i||!s)return[];const o=s.flatMap(r=>{var d;return(((d=r.hands)==null?void 0:d.hand_players)||[]).map(l=>l.user_id)}),t=await this.fetchProfileMap(o);return s.map(r=>{const n=r;return this.mapHandRecord(n.hands,t)}).filter(r=>r!==null)}async getTableHands(e,a=100){const{data:s,error:i}=await u.from("hands").select(`
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
            `).eq("table_id",e).order("created_at",{ascending:!1}).limit(a);if(i||!s)return[];const o=s.flatMap(r=>(r.hand_players||[]).map(d=>d.user_id)),t=await this.fetchProfileMap(o);return s.map(r=>this.mapHandRecord(r,t)).filter(r=>r!==null)}async getRecentWinningHands(e,a=10){const{data:s,error:i}=await u.from("hand_players").select(`
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
            `).eq("user_id",e).eq("is_winner",!0).order("created_at",{ascending:!1}).limit(a);if(i||!s)return[];const o=s.flatMap(r=>{var d;return(((d=r.hands)==null?void 0:d.hand_players)||[]).map(l=>l.user_id)}),t=await this.fetchProfileMap(o);return s.map(r=>{const n=r;return this.mapHandRecord(n.hands,t)}).filter(r=>r!==null)}async searchHands(e){let a=u.from("hands").select(`
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
            `).order("created_at",{ascending:!1});if(e.tableId&&(a=a.eq("table_id",e.tableId)),e.startDate&&(a=a.gte("created_at",e.startDate)),e.endDate&&(a=a.lte("created_at",e.endDate)),e.minPot&&(a=a.gte("pot_size",e.minPot)),e.clubId){const{data:n}=await u.from("tables").select("id").eq("club_id",e.clubId),d=(n||[]).map(l=>l.id);if(d.length===0)return[];a=a.in("table_id",d)}a=a.limit(e.limit||50);const{data:s,error:i}=await a;if(i||!s)return[];const o=s.flatMap(n=>(n.hand_players||[]).map(l=>l.user_id)),t=await this.fetchProfileMap(o);return s.map(n=>this.mapHandRecord(n,t)).filter(n=>n!==null)}mapHandRecord(e,a){if(!e)return null;const s=e.tables||{name:"Unknown",game_type:"NLH",stakes:"1/2"},i=(e.hand_players||[]).map(t=>{var n;const r=a==null?void 0:a.get(t.user_id);return{seat:t.seat,user_id:t.user_id,username:(r==null?void 0:r.username)||((n=t.user_id)==null?void 0:n.slice(0,8))||"Unknown",avatar_url:(r==null?void 0:r.avatar_url)||null,position:this.getPositionName(t.seat,e.button_seat||1,(e.hand_players||[]).length),hole_cards:t.hole_cards||[],final_hand:t.final_hand||void 0,result:t.result||0,is_winner:t.is_winner||!1}}),o=(e.hand_actions||[]).map(t=>({player_id:t.player_id,action:t.action,amount:t.amount||void 0,street:t.street,timestamp:new Date(t.created_at).getTime()}));return{id:e.id,serial_number:e.serial_number||e.id,table_id:e.table_id,table_name:s.name||"Unknown",played_at:e.created_at,hand_number:e.hand_number||1,total_hands:e.total_hands||1,main_pot:e.pot_size||0,side_pots:e.side_pots||[],community_cards:e.community_cards||[],players:i,actions:o,game_type:s.game_type||"NLH",stakes:s.stakes||"1/2"}}async fetchProfileMap(e){const a=new Map;if(e.length===0)return a;try{const s=[...new Set(e)],{data:i}=await u.from("profiles").select("id, username, avatar_url").in("id",s);for(const o of i||[])a.set(o.id,{username:o.username,avatar_url:o.avatar_url})}catch(s){console.error("[HandHistoryService] Error:",s instanceof Error?s.message:String(s))}return a}getPositionName(e,a,s){const i=this.getPositionOrder(s),o=(e-a+s)%s;return i[o]||"MP"}async saveHandToSupabase(e,a){try{const{data:s,error:i}=await u.from("hands").insert({table_id:e,hand_number:a.handNumber,pot_size:a.pot,community_cards:a.communityCards,created_at:new Date().toISOString()}).select("id").maybeSingle();if(i||!s){i==null||i.message;return}const o=s.id,t=a.players.map(n=>{var d;return{hand_id:o,user_id:n.id,seat:n.seat,hole_cards:n.holeCards||[],result:n.result||0,is_winner:a.winners.some(l=>l.playerId===n.id),final_hand:((d=a.winners.find(l=>l.playerId===n.id))==null?void 0:d.hand)||null}});t.length>0&&await u.from("hand_players").insert(t);const r=a.actions.map((n,d)=>{const l=a.players.find(m=>m.seat===n.seat);return{hand_id:o,player_id:(l==null?void 0:l.id)||"",action:n.action,amount:n.amount||0,street:n.street,created_at:new Date(Date.now()+d).toISOString()}});r.length>0&&await u.from("hand_actions").insert(r),`${a.handNumber}${o}`}catch(s){console.error("[HandHistory] Supabase save failed (non-critical):",s)}}getPositionOrder(e){return e<=2?["BTN","BB"]:e<=3?["BTN","SB","BB"]:e<=6?["BTN","SB","BB","UTG","MP","CO"]:["BTN","SB","BB","UTG","UTG+1","MP","MP+1","HJ","CO"]}}const w=new y,v=Object.freeze(Object.defineProperty({__proto__:null,handHistoryService:w},Symbol.toStringTag,{value:"Module"})),f={h:"hearts",d:"diamonds",c:"clubs",s:"spades",hearts:"hearts",diamonds:"diamonds",clubs:"clubs",spades:"spades"},H={2:"2",3:"3",4:"4",5:"5",6:"6",7:"7",8:"8",9:"9",T:"10",J:"j",Q:"q",K:"k",A:"a",10:"10",j:"j",q:"q",k:"k",a:"a",t:"10"};function k(c,e="4color"){const a=f[c.suit],s=H[c.rank];return!a||!s?(console.warn(`[CardImage] Unknown card format: rank="${c.rank}" suit="${c.suit}"`),`/hub/club-arena/cards/${e}/${a||"spades"}_${s||"a"}.png`):`/hub/club-arena/cards/${e}/${a}_${s}.png`}const p={xs:"card-image--xs",sm:"card-image--sm",md:"card-image--md",lg:"card-image--lg",xl:"card-image--xl"};function M({card:c,deckStyle:e="4color",size:a="md",isHighlighted:s=!1,isFolded:i=!1,className:o=""}){const t=k(c,e),n=["card-image",p[a],s?"card-image--highlighted":"",i?"card-image--folded":"",o].filter(Boolean).join(" ");return h.jsx("div",{className:n,children:h.jsx("img",{loading:"lazy",decoding:"async",src:t,alt:`${c.rank} of ${f[c.suit]||c.suit}`,className:"card-image__img",draggable:!1,onError:d=>{const l=d.currentTarget;l.style.display="none";const m=l.parentElement;if(m&&!m.querySelector(".card-image__fallback")){const _=document.createElement("div");_.className="card-image__fallback";const g={h:"♥",d:"♦",c:"♣",s:"♠",hearts:"♥",diamonds:"♦",clubs:"♣",spades:"♠"},b={h:"#ef4444",d:"#3b82f6",c:"#22c55e",s:"#1e293b",hearts:"#ef4444",diamonds:"#3b82f6",clubs:"#22c55e",spades:"#1e293b"};_.style.cssText=`width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;border-radius:inherit;font-weight:800;color:${b[c.suit]||"#000"}`,_.innerHTML=`<span style="font-size:0.7em;line-height:1">${c.rank}</span><span style="font-size:0.6em;line-height:1">${g[c.suit]||"?"}</span>`,m.appendChild(_)}}})})}function I({style:c="classic_red",size:e="md",className:a=""}){const i=["card-image","card-image--back",p[e],a].filter(Boolean).join(" ");return h.jsx("div",{className:i,children:h.jsx("div",{className:`card-back card-back--${c}`})})}export{I as C,v as H,M as a,w as h};
