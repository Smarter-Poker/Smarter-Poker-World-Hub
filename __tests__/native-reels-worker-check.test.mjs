import test from 'node:test';import assert from 'node:assert/strict';
import {REMOTE_INSPECTION,validateWorkerInspection} from '../scripts/ci/native-reels-worker-check.mjs';
test('worker observation remains allowlisted read-only metadata and cannot certify native processing',()=>{
 const hash='a'.repeat(64);const output=`active=active\nenabled=enabled\npid=12\nexec_match=yes\ncwd_match=yes\nhash=${hash}\n`;
 const result=validateWorkerInspection(output,hash);assert.equal(result.loadedSourceBytesProven,false);assert.equal(result.freshNativeProcessingProven,false);
 assert.throws(()=>validateWorkerInspection(output.replace('active=active','active=inactive'),hash));
 assert.throws(()=>validateWorkerInspection(output.replace(hash,'b'.repeat(64)),hash));
 assert.doesNotMatch(REMOTE_INSPECTION,/Environment|journalctl|restart|daemon-reload|source |cat |deploy|curl/);
});
