const assert=require('node:assert/strict');
const {readFileSync,readdirSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {parseHTML}=require('linkedom');
const {webcrypto}=require('node:crypto');
async function main(){
 for(const file of readdirSync('.').filter(f=>f.endsWith('.html'))){
   const html=readFileSync(file,'utf8');
   if(!html.includes('js/teacher-workspace.js?')&&!html.includes('js/cohort.js?'))continue;
   assert.ok(html.indexOf('js/lesson-video.js?')>0,file+' loads video helper');
   const app=html.includes('js/teacher-workspace.js?')?'js/teacher-workspace.js?':'js/cohort.js?';
   assert.ok(html.indexOf('js/lesson-video.js?')<html.indexOf(app),file+' loads helper before app');
 }
 const {window}=parseHTML(readFileSync('tutor-class.html','utf8')),document=window.document;
 const identity={role:'teacher',status:'active',name:'Ada'};
 const body={title:'Physics class',subject_id:'physics',description:'Learn mechanics through worked examples.',start_date:'2026-10-05',lessons:[{id:'lesson',title:'Motion',syllabus_topic:'Mechanics',video_url:'https://youtube.com/watch?v=old'}]};
 const data={identity,subjects:[{id:'physics',name:'Physics',enrollment_price:1000}],tutors:[{id:'teacher',display_name:'Ada',subjects:['physics'],status:'active'}],classes:[{id:'class',tutor_id:'teacher',subject_id:'physics',title:body.title,published:true,status:'open',video_migration_required:true}],revisions:[{cohort_id:'class',body,state:'published',version:3}],students:[],enrollments:[],progress:[],lessons:[],posts:[],banks:[],earnings:[],payouts:[],audit:[]};
 const location={pathname:'/tutor-class.html',search:'?id=class',hash:'',replace(){throw Error('Unexpected redirect');}};
 Object.assign(window,{location,localStorage:{getItem(){return null;},setItem(){}},matchMedia:()=>({matches:false}),authInitialized:true,resolveWorkspaceIdentity:async()=>identity,supabase:{auth:{getUser:async()=>({data:{user:{id:'teacher'}}})},rpc:async()=>({data,error:null})}});
 const context={window,document,location,localStorage:window.localStorage,history:{replaceState(){}},URLSearchParams,URL,Intl,Date,structuredClone,console,crypto:webcrypto,confirm:()=>true,setTimeout:()=>1,clearTimeout(){},matchMedia:window.matchMedia};
 runInNewContext(readFileSync('js/lesson-video.js','utf8'),context);
 runInNewContext(readFileSync('js/teacher-workspace.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(document.querySelector('#class-editor'),'editor rendered: '+document.body.textContent);
 assert.match(document.querySelector('#workspace-main').textContent,/New enrollments are paused/);
 document.querySelector('[data-action=step][data-step="1"]').click();
 assert.ok(document.querySelector('input[type=file][data-video-lesson="lesson"]'),'direct upload control');
 assert.equal(document.querySelector('input[name=video_url]'),null,'no new YouTube URL field');
 assert.match(document.querySelector('#class-editor').textContent,/500 MB/);
 assert.match(document.querySelector('#class-editor').textContent,/very clear and easy to hear/);
 assert.doesNotMatch(document.querySelector('#class-editor').textContent,/H\.264|AAC|720p/);
 assert.match(document.querySelector('input[data-video-lesson]').getAttribute('accept'),/video\/\*/);
 assert.match(document.querySelector('#class-editor').textContent,/old video link/);
 const uploaded=window.ThinkRightVideo.editor({id:'id',video_asset_id:'asset',title:'<script>unsafe</script>'});
 const fragment=parseHTML(uploaded).document;
 assert.equal(fragment.querySelector('[data-video-preview]').dataset.videoPreview,'asset');
 assert.equal(fragment.querySelector('script'),null);
 // Player renewal preserves the position and avoids applying stale responses after a lesson switch.
 let resolveFirst, calls=0;
 window.supabase.functions={invoke:async()=>{calls++;if(calls===1)return await new Promise(resolve=>{resolveFirst=resolve;});return {data:{url:'https://video.test/new'}};}};
 const listeners=new Map();
 const player={currentTime:42,paused:true,isConnected:true,src:'',pause(){},load(){},removeAttribute(){this.src='';},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
 const first=window.ThinkRightVideo.mount(player,'first');
 const second=window.ThinkRightVideo.mount(player,'second');await second;
 resolveFirst({data:{url:'https://video.test/stale'}});await first;
 assert.equal(player.src,'https://video.test/new','old request must not replace a newly selected video');
 window.ThinkRightVideo.stop(player);assert.equal(player.src,'');
 console.log('Lesson video editor, script ordering, migration notice, preview controls and player race checks passed');
}
main().catch(error=>{console.error(error);process.exit(1);});
