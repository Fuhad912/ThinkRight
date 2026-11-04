const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {webcrypto}=require('node:crypto');
async function main(){
 let fail=false,persisted=false;
 const expected=new Uint8Array([1,2,3]).buffer;
 class Reader{readAsArrayBuffer(){queueMicrotask(()=>{if(fail)this.onerror();else{this.result=expected;this.onload();}});}}
 const window={addEventListener(){}};
 const source=readFileSync('js/lesson-video.js','utf8').replace('window.ThinkRightVideo = {','window.ThinkRightVideo = { readChunk,');
 runInNewContext(source,{window,document:{addEventListener(){},querySelectorAll(){return [];}},crypto:webcrypto,FileReader:Reader,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout,clearTimeout});
 const unreadable={arrayBuffer:async()=>{throw Object.assign(new Error('Permission denied'),{name:'NotReadableError'});}};
 assert.equal(await window.ThinkRightVideo.readChunk(unreadable),expected,'FileReader fallback preserves selected bytes');
 const direct={arrayBuffer:async()=>expected};
 assert.equal(await window.ThinkRightVideo.readChunk(direct),expected,'normal browser reads remain unchanged');
 fail=true;
 await assert.rejects(()=>window.ThinkRightVideo.readChunk(unreadable),/Save or download it to this device/);
 const file={name:'lesson.mp4',size:3,type:'video/mp4',slice:()=>unreadable};
 await assert.rejects(()=>window.ThinkRightVideo.upload(file,null,'lesson',async()=>{persisted=true;}),/select it again/);
 assert.equal(persisted,false,'unreadable file is detected before saving or uploading');
 assert.equal(window.ThinkRightVideo.busy(),false,'file-access errors release upload controls for retry');
 console.log('PASS: normal reads, permission fallback, unreadable-file recovery, and no network save before file validation.');
}
main().catch(error=>{console.error(error);process.exit(1);});
