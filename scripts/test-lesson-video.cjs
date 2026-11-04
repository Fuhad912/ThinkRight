// Isolated Edge Function tests. All R2, auth and database requests are mocked.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const ts = require('typescript');
const {webcrypto} = require('node:crypto');
function load(file, context={}) {
 const exports={};
 const source=ts.transpileModule(readFileSync(file,'utf8').replaceAll('import.meta.main','false'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(source,{exports,TextDecoder,Uint8Array,DataView,Number,Date,Math,console,URL,Response,Request,AbortSignal,crypto:webcrypto,...context});return exports;
}
function box(type,...payloads){const payload=Buffer.concat(payloads);const head=Buffer.alloc(8);head.writeUInt32BE(payload.length+8);head.write(type,4);return Buffer.concat([head,payload]);}
function movie(codec='avc1',audio='mp4a'){
 const mvhd=Buffer.alloc(24);mvhd.writeUInt32BE(1000,12);mvhd.writeUInt32BE(90000,16);
 const stsd=Buffer.alloc(8);stsd.writeUInt32BE(audio?2:1,4);
 const video=box(codec,Buffer.alloc(78),box('avcC',Buffer.from([1,66,0,30,255,225,0])));
 const sound=box(audio||'mp4a',Buffer.alloc(28),box('esds',Buffer.from([0,0,0,0,3,8,0,1,0,4,3,64,0,0])));
 return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('mdat',Buffer.alloc(32)),box('moov',box('mvhd',mvhd),box('trak',box('mdia',box('minf',box('stbl',box('stsd',stsd,video,...(audio?[sound]:[])))))))]);
}
async function main(){
 const mp4=load('supabase/functions/lesson-video/mp4.ts');
 for(const audio of ['mp4a','']){const bytes=movie('avc1',audio);let largest=0;const result=await mp4.inspectMP4(bytes.length,async(a,b)=>{largest=Math.max(largest,b-a+1);return new Uint8Array(bytes.subarray(a,b+1));});assert.equal(result.duration_seconds,90);assert.ok(largest<1024);}
 for(const bytes of [movie('hvc1'),movie('avc1','ac-3'),Buffer.from('fake video'),movie().subarray(0,40)])await assert.rejects(()=>mp4.inspectMP4(bytes.length,async(a,b)=>new Uint8Array(bytes.subarray(a,b+1))));
 const user='10000000-0000-4000-8000-000000000001',cid='20000000-0000-4000-8000-000000000001',lid='30000000-0000-4000-8000-000000000001';
 const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',R2_ACCOUNT_ID:'account',R2_VIDEO_BUCKET:'videos',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret',VIDEO_UPLOADS_ENABLED:'true',SITE_URL:'https://thinkright.test',VIDEO_CLEANUP_SECRET:'cleanup'};
 let assets=[],stored=movie(),completed=false,access=true,teacher=true,signed=0,partsOverride=null,failVerify=false;
 const names=['CreateMultipartUpload','UploadPart','ListParts','CompleteMultipartUpload','AbortMultipartUpload','HeadObject','GetObject','DeleteObject'];const sdk={};
 for(const name of names)sdk[name+'Command']=class{constructor(input){this.input=input;this.type=name;}};
 sdk.S3Client=class{async send(command){
   const {type}=command;
   if(type==='CreateMultipartUpload')return {UploadId:'multipart'};
   if(type==='ListParts'){if(completed)throw Object.assign(new Error('No upload'),{name:'NoSuchUpload'});return {Parts:partsOverride||[{PartNumber:1,Size:stored.length,ETag:'etag'}]};}
   if(type==='CompleteMultipartUpload'){completed=true;return {};}
   if(type==='HeadObject'){if(failVerify)throw new Error('Provider secret detail');return {ContentLength:stored.length,ContentType:'video/mp4'};}
   if(type==='GetObject'){const [,a,b]=command.input.Range.match(/bytes=(\d+)-(\d+)/);return {Body:{transformToByteArray:async()=>new Uint8Array(stored.subarray(Number(a),Number(b)+1))}};}
   return {};
 }};
 const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 async function fetch(url,options={}){
   const path=new URL(url),body=options.body?JSON.parse(options.body):null;
   if(path.pathname==='/auth/v1/user')return options.headers.authorization==='Bearer token'?json({id:user}):new Response('{}',{status:401});
   if(path.pathname.endsWith('/rpc/video_upload_allowed'))return json(teacher);
   if(path.pathname.endsWith('/rpc/video_playback_allowed'))return json(access);
   if(path.pathname.endsWith('/rpc/video_cleanup_claim'))return json([]);
   if(path.pathname.endsWith('/video_assets')){
     if(options.method==='POST'){assets.push({...body,state:'uploading',expires_at:new Date(Date.now()+86400000).toISOString()});return json([assets.at(-1)]);}
     const filtered=assets.filter(asset=>[...path.searchParams].every(([key,value])=>{
       if(['limit','select'].includes(key))return true;
       if(value.startsWith('eq.'))return String(asset[key])===value.slice(3);
       if(value.startsWith('gt.'))return Date.parse(asset[key])>Date.parse(value.slice(3));
       if(value.startsWith('in.('))return value.slice(4,-1).split(',').includes(asset[key]);return true;
     }));
     if(options.method==='PATCH')filtered.forEach(asset=>Object.assign(asset,body));
     if(options.method==='DELETE')assets=assets.filter(asset=>!filtered.includes(asset));
     return json(filtered);
   }
   throw new Error('Unexpected URL '+url);
 }
 const handler=load('supabase/functions/lesson-video/index.ts',{fetch,Deno:{env:{get:key=>env[key]},serve(){}},require:name=>name.includes('client-s3')?sdk:name.includes('s3-request-presigner')?{getSignedUrl:async()=>{signed++;return 'https://r2.test/signed';}}:mp4}).handler;
 async function request(body,token='token',origin=env.SITE_URL){const response=await handler(new Request('https://edge.test',{method:'POST',headers:{authorization:'Bearer '+token,origin},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}
 const init={action:'initiate',cohort_id:cid,lesson_id:lid,size_bytes:stored.length,content_type:'video/mp4',fingerprint:'a'.repeat(64),filename:'motion.mp4'};
 assert.equal((await request(init,'invalid')).status,401);
 assert.equal((await request(init,'token','https://evil.test')).status,403);
 assert.equal((await request({...init,size_bytes:524288001})).status,400);
 teacher=false;assert.equal((await request(init)).status,400);teacher=true;
 let result=await request(init);assert.equal(result.status,200);const assetId=result.body.asset_id;
 assert.equal((await request(init)).body.asset_id,assetId,'resume the same file');
 assert.equal((await request({action:'sign',asset_id:assetId,part_number:2})).status,400);
 assert.equal((await request({action:'sign',asset_id:assetId,part_number:1})).status,200);
 partsOverride=[];assert.equal((await request({action:'complete',asset_id:assetId})).status,400);partsOverride=null;
 failVerify=true;assert.equal((await request({action:'complete',asset_id:assetId})).status,400);assert.equal(assets[0].state,'verifying');failVerify=false;
 assert.equal((await request(init)).body.state,'verifying','resume metadata validation after a network error');
 result=await request({action:'complete',asset_id:assetId});assert.equal(result.status,200);assert.equal(result.body.state,'ready');
 assert.equal((await request({action:'complete',asset_id:assetId})).status,200,'idempotent completion');
 access=false;const before=signed;assert.equal((await request({action:'playback',asset_id:assetId})).status,400);assert.equal(signed,before);
 access=true;assert.equal((await request({action:'playback',asset_id:assetId})).status,200);
 env.VIDEO_UPLOADS_ENABLED='false';assert.equal((await request(init)).status,503);assert.equal((await request({action:'playback',asset_id:assetId})).status,200);
 assert.equal((await request({action:'cleanup'})).status,401);assert.equal((await request({action:'cleanup'},'cleanup')).status,200);
 console.log('Lesson video MP4 validation, upload/resume, authorization and playback API checks passed');
}
main().catch(error=>{console.error(error);process.exit(1);});
