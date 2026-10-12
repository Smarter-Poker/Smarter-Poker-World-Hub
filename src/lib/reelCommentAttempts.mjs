const MAX_ATTEMPTS=32;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const namespace=owner=>`smarter-reel-comment-attempts:v1:${encodeURIComponent(owner)}`;
function read(owner){
 const raw=globalThis.sessionStorage.getItem(namespace(owner));
 const value=raw?JSON.parse(raw):{};
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Comment retry storage is invalid.');
 return Object.fromEntries(Object.entries(value).filter(([key,id])=>/^[a-f0-9]{64}$/.test(key)&&UUID.test(id)).slice(0,MAX_ATTEMPTS));
}
async function keyFor(payload){
 const normalized=[payload.author_id,payload.post_id,String(payload.content||'').trim(),payload.parent_id||null,payload.media_url||null,payload.media_type||null];
 const bytes=new TextEncoder().encode(JSON.stringify(normalized));
 const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
/** Session-scoped UUIDs survive reload, without retaining plaintext comment drafts. */
export async function getOrCreateReelCommentAttempt(payload){
 if(!UUID.test(payload?.author_id||'')||!UUID.test(payload?.post_id||''))throw new Error('Comment identity is invalid.');
 const key=await keyFor(payload);const values=read(payload.author_id);
 if(values[key])return{id:values[key],key,ownerId:payload.author_id,reused:true};
 if(Object.keys(values).length>=MAX_ATTEMPTS)throw new Error('Unconfirmed comments are still pending. Refresh comments before posting more.');
 const id=globalThis.crypto.randomUUID();values[key]=id;
 globalThis.sessionStorage.setItem(namespace(payload.author_id),JSON.stringify(values));
 if(read(payload.author_id)[key]!==id)throw new Error('Comment retry identity could not be retained.');
 return{id,key,ownerId:payload.author_id,reused:false};
}
export function forgetReelCommentAttempt(attempt){
 if(!attempt)return;
 const values=read(attempt.ownerId);if(values[attempt.key]!==attempt.id)return;
 delete values[attempt.key];globalThis.sessionStorage.setItem(namespace(attempt.ownerId),JSON.stringify(values));
}
export function shouldRestoreReelCommentDraft(draft){return !draft?.text?.trim()&&!draft?.mediaUrl&&!draft?.reply;}
