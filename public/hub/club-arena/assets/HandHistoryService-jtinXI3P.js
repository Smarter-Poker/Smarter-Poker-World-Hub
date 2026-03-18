import{j as f}from"./vendor-react-COzHOE6B.js";import{s as u}from"./index-GAUO3e9a.js";(function(){try{var d=typeof window<"u"?window:typeof global<"u"?global:typeof globalThis<"u"?globalThis:typeof self<"u"?self:{};d.SENTRY_RELEASE={id:"club-arena@1.0.1"};var e=new d.Error().stack;e&&(d._sentryDebugIds=d._sentryDebugIds||{},d._sentryDebugIds[e]="dbf8b7bb-6bdc-4097-a9a4-b8449bd84077",d._sentryDebugIdIdentifier="sentry-dbid-dbf8b7bb-6bdc-4097-a9a4-b8449bd84077")}catch{}})();const h={h:"hearts",d:"diamonds",c:"clubs",s:"spades",hearts:"hearts",diamonds:"diamonds",clubs:"clubs",spades:"spades"},y={2:"2",3:"3",4:"4",5:"5",6:"6",7:"7",8:"8",9:"9",T:"10",J:"j",Q:"q",K:"k",A:"a",10:"10",j:"j",q:"q",k:"k",a:"a",t:"10"};function w(d,e="4color"){const a=h[d.suit],s=y[d.rank];if(!a||!s){console.warn(`[CardImage] Unknown card format: rank="${d.rank}" suit="${d.suit}"`);const n=a||"spades",t=s||"a";return`${typeof window<"u"&&window.location.hostname!=="localhost"?"https://club-arena.vercel.app/hub/club-arena/":"/hub/club-arena/"}cards/${e}/${n}_${t}.png`}return`${typeof window<"u"&&window.location.hostname!=="localhost"?"https://club-arena.vercel.app/hub/club-arena/":"/hub/club-arena/"}cards/${e}/${a}_${s}.png`}const p={xs:"card-image--xs",sm:"card-image--sm",md:"card-image--md",lg:"card-image--lg",xl:"card-image--xl"};function v({card:d,deckStyle:e="4color",size:a="md",isHighlighted:s=!1,isFolded:i=!1,className:o=""}){const n=w(d,e),r=["card-image",p[a],s?"card-image--highlighted":"",i?"card-image--folded":"",o].filter(Boolean).join(" ");return f.jsx("div",{className:r,children:f.jsx("img",{loading:"lazy",decoding:"async",src:n,alt:`${d.rank} of ${h[d.suit]||d.suit}`,className:"card-image__img",draggable:!1,onError:l=>{const c=l.currentTarget;c.style.display="none";const m=c.parentElement;if(m&&!m.querySelector(".card-image__fallback")){const _=document.createElement("div");_.className="card-image__fallback";const b={h:"♥",d:"♦",c:"♣",s:"♠",hearts:"♥",diamonds:"♦",clubs:"♣",spades:"♠"},g={h:"#ef4444",d:"#3b82f6",c:"#22c55e",s:"#1e293b",hearts:"#ef4444",diamonds:"#3b82f6",clubs:"#22c55e",spades:"#1e293b"};_.style.cssText=`width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;border-radius:inherit;font-weight:800;color:${g[d.suit]||"#000"}`,_.innerHTML=`<span style="font-size:0.7em;line-height:1">${d.rank}</span><span style="font-size:0.6em;line-height:1">${b[d.suit]||"?"}</span>`,m.appendChild(_)}}})})}function I({style:d="classic_red",size:e="md",className:a=""}){const i=["card-image","card-image--back",p[e],a].filter(Boolean).join(" ");return f.jsx("div",{className:i,children:f.jsx("div",{className:`card-back card-back--${d}`})})}class H{async getHand(e){const{data:a,error:s}=await u.from("hands").select(`
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
            `).eq("id",e).maybeSingle();if(s||!a)return null;const i=(a.hand_players||[]).map(n=>n.user_id),o=await this.fetchProfileMap(i);return this.mapHandRecord(a,o)}async getPlayerHands(e,a=50){const{data:s,error:i}=await u.from("hand_players").select(`
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
            `).eq("user_id",e).order("created_at",{ascending:!1}).limit(a);if(i||!s)return[];const o=s.flatMap(t=>{var l;return(((l=t.hands)==null?void 0:l.hand_players)||[]).map(c=>c.user_id)}),n=await this.fetchProfileMap(o);return s.map(t=>{const r=t;return this.mapHandRecord(r.hands,n)}).filter(t=>t!==null)}async getTableHands(e,a=100){const{data:s,error:i}=await u.from("hands").select(`
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
            `).eq("table_id",e).order("created_at",{ascending:!1}).limit(a);if(i||!s)return[];const o=s.flatMap(t=>(t.hand_players||[]).map(l=>l.user_id)),n=await this.fetchProfileMap(o);return s.map(t=>this.mapHandRecord(t,n)).filter(t=>t!==null)}async getRecentWinningHands(e,a=10){const{data:s,error:i}=await u.from("hand_players").select(`
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
            `).eq("user_id",e).eq("is_winner",!0).order("created_at",{ascending:!1}).limit(a);if(i||!s)return[];const o=s.flatMap(t=>{var l;return(((l=t.hands)==null?void 0:l.hand_players)||[]).map(c=>c.user_id)}),n=await this.fetchProfileMap(o);return s.map(t=>{const r=t;return this.mapHandRecord(r.hands,n)}).filter(t=>t!==null)}async searchHands(e){let a=u.from("hands").select(`
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
            `).order("created_at",{ascending:!1});e.tableId&&(a=a.eq("table_id",e.tableId)),e.startDate&&(a=a.gte("created_at",e.startDate)),e.endDate&&(a=a.lte("created_at",e.endDate)),e.minPot&&(a=a.gte("pot_size",e.minPot)),a=a.limit(e.limit||50);const{data:s,error:i}=await a;if(i||!s)return[];const o=s.flatMap(r=>(r.hand_players||[]).map(c=>c.user_id)),n=await this.fetchProfileMap(o);let t=s.map(r=>this.mapHandRecord(r,n)).filter(r=>r!==null);return e.clubId&&(t=t.filter(r=>{var l;return((l=r._table)==null?void 0:l.club_id)===e.clubId})),t}mapHandRecord(e,a){if(!e)return null;const s=e.tables||{name:"Unknown",game_type:"NLH",stakes:"1/2"},i=(e.hand_players||[]).map(n=>{var r;const t=a==null?void 0:a.get(n.user_id);return{seat:n.seat,user_id:n.user_id,username:(t==null?void 0:t.username)||((r=n.user_id)==null?void 0:r.slice(0,8))||"Unknown",avatar_url:(t==null?void 0:t.avatar_url)||null,position:this.getPositionName(n.seat,e.button_seat||1,(e.hand_players||[]).length),hole_cards:n.hole_cards||[],final_hand:n.final_hand||void 0,result:n.result||0,is_winner:n.is_winner||!1}}),o=(e.hand_actions||[]).map(n=>({player_id:n.player_id,action:n.action,amount:n.amount||void 0,street:n.street,timestamp:new Date(n.created_at).getTime()}));return{id:e.id,serial_number:e.serial_number||e.id,table_id:e.table_id,table_name:s.name||"Unknown",played_at:e.created_at,hand_number:e.hand_number||1,total_hands:e.total_hands||1,main_pot:e.pot_size||0,side_pots:e.side_pots||[],community_cards:e.community_cards||[],players:i,actions:o,game_type:s.game_type||"NLH",stakes:s.stakes||"1/2"}}async fetchProfileMap(e){const a=new Map;if(e.length===0)return a;try{const s=[...new Set(e)],{data:i}=await u.from("profiles").select("id, username, avatar_url").in("id",s);for(const o of i||[])a.set(o.id,{username:o.username,avatar_url:o.avatar_url})}catch(s){console.error("[HandHistoryService] Error:",s instanceof Error?s.message:String(s))}return a}getPositionName(e,a,s){const i=this.getPositionOrder(s),o=(e-a+s)%s;return i[o]||"MP"}async saveHandToSupabase(e,a){try{const{data:s,error:i}=await u.from("hands").insert({table_id:e,hand_number:a.handNumber,pot_size:a.pot,community_cards:a.communityCards,created_at:new Date().toISOString()}).select("id").maybeSingle();if(i||!s){console.error("[HandHistory] Failed to save hand:",i==null?void 0:i.message);return}const o=s.id,n=a.players.map(r=>{var l;return{hand_id:o,user_id:r.id,seat:r.seat,hole_cards:r.holeCards||[],result:r.result||0,is_winner:a.winners.some(c=>c.playerId===r.id),final_hand:((l=a.winners.find(c=>c.playerId===r.id))==null?void 0:l.hand)||null}});n.length>0&&await u.from("hand_players").insert(n);const t=a.actions.map((r,l)=>{const c=a.players.find(m=>m.seat===r.seat);return{hand_id:o,player_id:(c==null?void 0:c.id)||"",action:r.action,amount:r.amount||0,street:r.street,created_at:new Date(Date.now()+l).toISOString()}});t.length>0&&await u.from("hand_actions").insert(t),`${a.handNumber}${o}`}catch(s){console.error("[HandHistory] Supabase save failed (non-critical):",s)}}getPositionOrder(e){return e<=2?["BTN","BB"]:e<=3?["BTN","SB","BB"]:e<=6?["BTN","SB","BB","UTG","MP","CO"]:["BTN","SB","BB","UTG","UTG+1","MP","MP+1","HJ","CO"]}}const k=new H,M=Object.freeze(Object.defineProperty({__proto__:null,handHistoryService:k},Symbol.toStringTag,{value:"Module"}));export{I as C,M as H,v as a,k as h};
//# sourceMappingURL=HandHistoryService-jtinXI3P.js.map
