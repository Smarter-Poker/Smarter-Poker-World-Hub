import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as contract from '../src/lib/store/vipGiftContract.mjs';
import * as guards from '../src/lib/store/vipPurchaseGuards.mjs';
import { settleVipGift, reverseVipGift, expireVipGift } from '../src/lib/store/vipGiftStripe.js';
const sender='10000000-0000-0000-0000-000000000001', recipient='10000000-0000-0000-0000-000000000002';
const catalog={ monthly:{price:19.99},yearly:{price:199.99},lifetime:{price:499} };
const gift={id:'10000000-0000-0000-0000-000000000003',sender_id:sender,recipient_id:recipient,amount:1999,plan:'monthly',method:'card',status:'pending',created_at:new Date().toISOString()};
const session={id:'cs_gift',url:'https://checkout.stripe.com/c/pay/cs_gift',mode:'payment',status:'open',currency:'usd',amount_total:1999,livemode:true,
 metadata:{type:'vip_gift',gift_id:gift.id,sender_id:sender,recipient_id:recipient,plan:'monthly'},payment_intent:'pi_gift',payment_status:'paid'};
const source=readFileSync(new URL('../pages/api/store/vip-gifts.js',import.meta.url),'utf8');
async function harness({user={id:sender,email_confirmed_at:'confirmed'},rpcResult={success:true,gift},runtime=true,record=gift,checkout=session}={}) {
 const calls={rpc:[],creates:[],refunds:[],queries:[],filters:[]};
 const db={rpc:async(name,args)=>{calls.rpc.push({name,args});return{data:typeof rpcResult==='function'?rpcResult(name,args):rpcResult,error:null}},from(table){
   calls.queries.push(table);
   const q={select(){return q},eq(){return q},or(filter){calls.filters.push(filter);return q},order(){return q},limit(){return q},is(){return q},update(){return q},in(){return q},
     maybeSingle:async()=>({data:table==='profiles'?{stripe_customer_id:null}:record,error:null}),
     then(resolve){resolve({data:table==='vip_gifts'?[gift]:[],error:null})}}; return q;
 }};
 const stripe={checkout:{sessions:{create:async(params,options)=>{calls.creates.push({params,options});return checkout},retrieve:async()=>checkout,list:async()=>({data:[]})}},
 refunds:{create:async(params,options)=>{calls.refunds.push({params,options});return {status:'succeeded'}}}};
 const context=vm.createContext({console:{error(){}},process:{env:{SUPABASE_SERVICE_ROLE_KEY:'fixture',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid'}},Date,Buffer,URL,
 require(name){if(name.endsWith('emailVerifiedGate'))return{requireEmailVerified:()=>({ok:true})};return{inspectStripeRuntime:()=>({ready:runtime}),isProductionRuntime:()=>true}}});
 const deps={'../../../src/lib/store/vipGiftStripe':{settleVipGift},stripe:{default:function Stripe(){return stripe}},'../../../src/lib/supabaseServerClient':{createClient:()=>db},
 '../../../src/lib/serverAuth':{getServerUserWithFallback:async()=>({user})},'../../../src/lib/apiRateLimit':{applyRateLimit:()=>true,LIMITS:{write:{}}},
 '../../../src/data/diamondStoreData':{VIP_MEMBERSHIP:catalog},'../../../src/lib/store/privateCommerceResponse':{setPrivateCommerceResponse:r=>r.setHeader('Cache-Control','private, no-store')},
 '../../../src/lib/store/vipGiftContract.mjs':contract,'../../../src/lib/store/vipPurchaseGuards.mjs':guards};
 const module=new vm.SourceTextModule(source,{context});
 await module.link(spec=>new vm.SyntheticModule(Object.keys(deps[spec]),function(){for(const [k,v]of Object.entries(deps[spec]))this.setExport(k,v)},{context}));
 await module.evaluate();
 return {calls,async request(body,method='POST') {const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(b){this.body=b;return this},end(){return this}};
 await module.namespace.default({method,body,headers:{authorization:'Bearer fixture'}},res);return res;}};
}
const payload=(plan='monthly',method='card')=>({action:'send',requestId:'gift-request-1',recipientId:recipient,plan,method,offerConfirmation:contract.vipGiftOffer(sender,recipient,plan,method,catalog)});

test('Gift terms bind both identities, all three exact prices and the payment method',()=>{
 for(const [plan,amount]of[['monthly',1999],['yearly',19999],['lifetime',49900]])for(const method of['card','diamonds']){
  const offer=contract.vipGiftOffer(sender,recipient,plan,method,catalog);assert.equal(offer.amount,amount);assert.ok(contract.sameGiftOffer({...offer},offer));
  assert.equal(contract.sameGiftOffer({...offer,recipientId:sender},offer),false);
  assert.equal(contract.sameGiftOffer({...offer,amount:1},offer),false);
 }
 assert.equal(contract.vipGiftOffer(sender,sender,'monthly','card',catalog),null);
 assert.equal(contract.vipGiftOffer(sender,recipient,'daily','card',catalog),null);
});
test('Only a verified exact Stripe checkout origin and immutable gift may redirect',()=>{
 assert.equal(contract.safeGiftCheckout(session,gift),true);
 for(const url of ['https://checkout.stripe.com.evil.test/pay','http://checkout.stripe.com/pay','https://someone@checkout.stripe.com/pay','https://checkout.stripe.com:444/pay'])assert.equal(contract.safeGiftCheckout({...session,url},gift),false);
 assert.equal(contract.safeGiftCheckout({...session,amount_total:1},gift),false);
 assert.equal(contract.safeGiftCheckout({...session,livemode:false},gift),false);
});
test('Route refuses unauthorized, tampered prices and non-friend RPC refusals without Stripe checkout',async()=>{
 const signedOut=await harness({user:null});assert.equal((await signedOut.request(payload())).statusCode,401);assert.equal(signedOut.calls.rpc.length,0);
 const h=await harness();const bad=payload();bad.offerConfirmation.amount=1;assert.equal((await h.request(bad)).statusCode,400);assert.equal(h.calls.rpc.length,0);
 const unfriended=await harness({rpcResult:{success:false,error:'friends_required'}});const response=await unfriended.request(payload());assert.equal(response.statusCode,409);assert.equal(unfriended.calls.creates.length,0);
 assert.match(response.headers['Cache-Control'],/no-store/);
});
test('Card admission uses verified sender, one-time payment, stable key and a verified response',async()=>{
 const h=await harness();const result=await h.request({...payload(),senderId:recipient});assert.equal(result.statusCode,200);
 assert.equal(h.calls.rpc[0].args.p_sender,sender);assert.equal(h.calls.rpc[0].args.p_recipient,recipient);
 const {params,options}=h.calls.creates[0];assert.equal(params.mode,'payment');assert.equal(params.line_items[0].price_data.unit_amount,1999);
 assert.equal(params.line_items[0].price_data.recurring,undefined);assert.equal(options.idempotencyKey,`vip-gift-checkout:${gift.id}`);
 assert.equal(result.body.offerConfirmation.accountId,sender);assert.equal(result.body.checkoutUrl,session.url);
});
test('Diamonds deliver only the authoritative committed gift and never call Stripe',async()=>{
 const h=await harness({rpcResult:{success:true,gift:{...gift,method:'diamonds',status:'available'}}});
 const result=await h.request(payload('monthly','diamonds'));assert.equal(result.body.gift.status,'available');assert.equal(h.calls.creates.length,0);
 assert.equal(h.calls.rpc[0].args.p_amount,1999);
});
test('An unavailable payment runtime refuses before creating a payable gift intent',async()=>{
 const h=await harness({runtime:false});assert.equal((await h.request(payload())).statusCode,503);assert.equal(h.calls.rpc.length,0);
});
test('Signed webhook grants only paid, exact gift terms, and propagates settlement failures',async()=>{
 const calls=[];const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:gift})}),rpc:async(name,args)=>{calls.push({name,args});return{data:{success:true}}}};
 assert.equal(await settleVipGift(db,{...session,payment_status:'unpaid'}),true);assert.equal(calls.length,0);
 await assert.rejects(settleVipGift(db,{...session,amount_total:1}),/terms/);
 await settleVipGift(db,session);assert.equal(calls[0].name,'settle_vip_gift_atomic');assert.equal(calls[0].args.p_amount,1999);
 await assert.rejects(settleVipGift({...db,rpc:async()=>({data:{success:false}})},session),/refused/);
});
test('Refund before paid-webhook delivery correlates the typed provider gift and refuses corrupt amounts',async()=>{
 const calls=[];let first=true;
 const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:first?(first=false,null):gift})}),rpc:async(name,args)=>{calls.push({name,args});return{data:{success:true}}}};
 const stripe={checkout:{sessions:{list:async()=>({data:[session]})}}};
 assert.equal(await reverseVipGift(db,stripe,{payment_intent:'pi_gift',amount:1999,amount_refunded:1999},'charge.refunded'),true);
 assert.equal(calls[0].args.p_refunded,1999);assert.equal(calls[0].args.p_gift,gift.id);
 await assert.rejects(reverseVipGift(db,stripe,{payment_intent:'pi_gift',amount:1,amount_refunded:1},'charge.refunded'),/amount/);
});
test('Maintained required checks execute API and native financial qualification',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/build-safety-gate.yml',import.meta.url),'utf8');assert.match(workflow,/node --test __tests__\/vip-gifts-postgres.test.mjs/);
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));assert.match(pkg.scripts['test:marketplace'],/vip-gifts.test.mjs/);
});

test('Expired provider sessions close the original intent without a fresh checkout',async()=>{
 const h=await harness({rpcResult:{success:true,gift:{...gift,session_id:'cs_gift'}},checkout:{...session,status:'expired'}});
 const result=await h.request(payload());assert.equal(result.body.gift.status,'expired');assert.equal(h.calls.creates.length,0);
});
test('Card returns claim the unredeemed gift before the idempotent provider refund and reconcile afterward',async()=>{
 const h=await harness({record:{...gift,status:'available'},rpcResult:name=>name==='prepare_vip_gift_card_return'
  ?{success:true,paymentIntent:'pi_gift'}:{success:true}});
 const result=await h.request({action:'return',giftId:gift.id});assert.equal(result.statusCode,200);
 assert.equal(h.calls.rpc[0].name,'prepare_vip_gift_card_return');assert.equal(h.calls.rpc[1].name,'reverse_vip_gift_atomic');
 assert.equal(h.calls.refunds[0].options.idempotencyKey,`vip-gift-return:${gift.id}`);
 const blocked=await harness({record:{...gift,status:'redeemed'},rpcResult:{success:false,error:'gift_not_returnable'}});
 assert.equal((await blocked.request({action:'return',giftId:gift.id})).statusCode,409);assert.equal(blocked.calls.refunds.length,0);
});
test('Expiry/failure webhooks never erase paid or redeemed gifts',async()=>{
 const updates=[];const filters=[];const db={from:()=>({update(patch){updates.push(patch);return this},eq(k,v){filters.push([k,v]);return this},or(){return {error:null}}})};
 assert.equal(await expireVipGift(db,session),true);assert.equal(updates.length,0);
 assert.equal(await expireVipGift(db,{...session,payment_status:'unpaid'}),true);assert.equal(updates[0].status,'expired');
 assert.ok(filters.some(([k,v])=>k==='status'&&v==='pending'));assert.ok(filters.some(([k,v])=>k==='recipient_id'&&v===recipient));
});

test('Recipients see delivered cards; unpaid sender drafts remain private',async()=>{
 const h=await harness();const response=await h.request(undefined,'GET');assert.equal(response.statusCode,200);
 assert.equal(h.calls.filters[0],`sender_id.eq.${sender},and(recipient_id.eq.${sender},delivered_at.not.is.null)`);
});
