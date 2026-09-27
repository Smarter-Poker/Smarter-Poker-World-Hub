import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessengerSendOperation as create, saveMessengerSendOperation as save,
    restoreMessengerSendOperations as restore, performMessengerSend as perform,
    messengerOperationMessage as row, acknowledgeMessengerSend as acknowledge,
    reconcileMessengerMessage as reconcile, mergeMessengerPendingMessages as merge } from '../src/lib/messengerSendOperation.mjs';

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor = uuid(1), conversation = uuid(2);
const operation = (extra={}) => create({ actorId:actor, conversationId:conversation, content:'Original Reply', requestId:uuid(3), metadata:{reply_to:uuid(5)}, ...extra });
function storage() {
    const data = new Map();
    return {get length(){return data.size},key:i=>[...data.keys()][i], getItem:k=>data.get(k)??null,
        setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
}
const response = op => ({ok:true,json:async()=>({success:true,msgId:uuid(6),requestId:op.requestId,content:JSON.parse(op.body).content})});
test('lost response retry retains exact sender, destination and original payload', async()=>{
    const op=operation(), disk=storage(), bodies=[];
    const deps={storage:disk,currentActor:()=>actor,changed:()=>{},send:async body=>{bodies.push(body);if(bodies.length===1)throw Error('response lost');return response(op)}};
    assert.equal(await perform(op,deps),null);
    const [recovered]=restore(disk,actor);
    assert.equal(recovered.status,'failed');
    assert.equal(await perform(recovered,deps).then(r=>r.id),uuid(6));
    assert.deepEqual(bodies,[op.body,op.body]); assert.equal(disk.length,0);
});
test('simultaneous explicit retries share one network operation',async()=>{
    const op=operation(),disk=storage();let release,sends=0;
    const deps={storage:disk,currentActor:()=>actor,changed:()=>{},send:async()=>{sends++;await new Promise(r=>release=r);return response(op)}};
    const a=perform(op,deps),b=perform(op,deps);await Promise.resolve();release();
    assert.equal(a,b);await Promise.all([a,b]);assert.equal(sends,1);
});
test('Realtime before failed HTTP supplies the authoritative receipt without duplicate row',async()=>{
    const op=operation(),disk=storage();let rows=[];
    const actual={...row(op),id:uuid(6),status:'sent'};
    const result=await perform(op,{storage:disk,currentActor:()=>actor,changed:o=>rows=reconcile(rows,o.receipt||row(o)),send:async()=>{
        acknowledge(op,actual,disk);rows=reconcile(rows,actual);throw Error('lost');
    }});
    assert.equal(result.id,actual.id);assert.equal(rows.length,1);assert.equal(rows[0].status,'sent');assert.equal(disk.length,0);
});
test('denied and malformed responses preserve retry record without claiming sent',async()=>{
    for(const reply of [{ok:false,json:async()=>({error:'denied'})},{ok:true,json:async()=>({success:true,msgId:uuid(6),requestId:uuid(99)})}]){
        const op=operation(),disk=storage();assert.equal(await perform(op,{storage:disk,currentActor:()=>actor,changed:()=>{},send:async()=>reply}),null);
        assert.equal(op.status,'failed');assert.equal(restore(disk,actor).length,1);
    }
});
test('account changes never send an operation as the new actor',async()=>{
    const op=operation(),disk=storage();let current=actor,calls=0;
    const result=perform(op,{storage:disk,currentActor:()=>current,changed:()=>{current=uuid(9)},send:async()=>{calls++;return response(op)}});
    assert.equal(await result,null);assert.equal(calls,0);assert.equal(restore(disk,uuid(9)).length,0);
});
test('storage failure prevents network send',()=>{
    const op=operation();let called=false;
    assert.throws(()=>perform(op,{storage:{getItem:()=>null,length:0,setItem:()=>{throw Error('quota')}},currentActor:()=>actor,changed:()=>{},send:()=>{called=true}}),/quota/);
    assert.equal(called,false);
});
test('receipt cleanup failure does not turn committed message into failure',async()=>{
    const op=operation(),disk=storage();disk.removeItem=()=>{throw Error('quota')};
    assert.equal((await perform(op,{storage:disk,currentActor:()=>actor,changed:()=>{},send:async()=>response(op)})).id,uuid(6));
    assert.equal(op.status,'sent');assert.equal(disk.length,1);
});
test('reload reconciliation and delayed receipt preserve one sent/read row',()=>{
    const op=operation(),actual={...row(op),id:uuid(6),status:'read'};
    let rows=merge([actual],[op],actor,conversation);assert.equal(rows.length,1);
    rows=reconcile(rows,{...actual,status:'sent'});assert.equal(rows[0].status,'read');
    rows=reconcile(rows,row(op));assert.equal(rows.length,1);assert.equal(rows[0].id,uuid(6));
    assert.equal(merge([], [op],uuid(9),conversation).length,0);
});
test('recovery rejects corrupted or cross-account operation identity',()=>{
    const disk=storage(),op=operation();save(disk,op);
    const key=disk.key(0),value=JSON.parse(disk.getItem(key));value.actorId=uuid(9);disk.setItem(key,JSON.stringify(value));
    assert.deepEqual(restore(disk,actor),[]);
    disk.setItem(key,'broken');assert.deepEqual(restore(disk,actor),[]);
});
test('pending limit refuses new work without evicting ambiguous sends',()=>{
    const disk=storage();for(let n=0;n<100;n++)save(disk,operation({requestId:uuid(100+n)}));
    assert.throws(()=>save(disk,operation()),/Resolve Pending/);assert.equal(disk.length,100);
    save(disk,operation({requestId:uuid(100)}));assert.equal(disk.length,100);
});
test('a server-rejected long reply retains its original text for recovery',async()=>{
    const content='[REPLY:Original] '+ 'a'.repeat(2000),op=operation({content}),disk=storage();
    assert.equal(await perform(op,{storage:disk,currentActor:()=>actor,changed:()=>{},
        send:async()=>({ok:false,json:async()=>({error:'Payload Too Large'})})}),null);
    const [restored]=restore(disk,actor);
    assert.equal(JSON.parse(restored.body).content,content);
    assert.equal(restored.status,'failed');
});
