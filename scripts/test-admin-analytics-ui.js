const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {parseHTML}=require('linkedom');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
async function checkAdminNavigation(){
 const {document,window}=parseHTML(readFileSync('admin.html','utf8'));
 const identity={role:'admin',status:'active',name:'Admin'};
 const data={identity,subjects:[],tutors:[],classes:[],revisions:[],students:[],enrollments:[],progress:[],lessons:[],posts:[],banks:[],earnings:[],payouts:[],audit:[]};
 const location={pathname:'/admin.html',search:'',hash:'',replace:()=>{throw Error('Unexpected redirect');}};
 const localStorage={getItem:()=>null,setItem(){}};
 const matchMedia=()=>({matches:true});
 Object.assign(window,{location,localStorage,matchMedia,authInitialized:true,resolveWorkspaceIdentity:async()=>identity,supabase:{auth:{getUser:async()=>({data:{user:{id:'admin',email:'admin@example.com'}}})},rpc:async()=>({data,error:null})}});
 vm.runInNewContext(readFileSync('js/teacher-workspace.js','utf8'),{window,document,location,localStorage,history:{replaceState(){}},URLSearchParams,URL,Intl,Date,structuredClone,console,confirm:()=>true,setTimeout:()=>1,clearTimeout(){},matchMedia});
 await flush();
 assert.ok(document.querySelector('.tw-header a[href="admin-analytics.html"]'));
 assert.ok(document.querySelector('.tw-header [data-action="logout"]'));
}
async function setup(role='admin',error=false){
 const {document}=parseHTML(readFileSync('admin-analytics.html','utf8'));
 // linkedom does not implement the browser's select.value setter.
 for(const el of document.querySelectorAll('select')){let value=el.id==='period'?'30':'';Object.defineProperty(el,'value',{get:()=>value,set:v=>{value=v;},configurable:true});}
 const dialog=document.getElementById('person');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new document.defaultView.Event('close'));};
 const calls=[],redirects=[];
 const totals={new_students:1,active_learners:1,tests:2,lessons:1,average_score:80,enrollments:1,revenue_kobo:500000};
 const data={current:totals,previous:totals,daily:[{day:'2026-10-01',tests:2,lessons:1}],subjects:[{id:'physics',name:'Physics'}],people:[{id:'10000000-0000-4000-8000-000000000002',name:'<script>unsafe</script>',tests:2,average_score:80,lessons:1,enrollments:1,last_activity:null,status:'active',classes:1,earnings_kobo:200000}],people_count:26,attention:{pending_teachers:1,pending_classes:2,teachers_without_classes:0,stopped_practising:3},generated_at:'2026-10-01T12:00:00Z'};
 const window={resolveWorkspaceIdentity:async()=>({user:role==='guest'?null:{id:'admin'},role}),logout:async()=>{},supabase:{rpc:async(name,args)=>{calls.push({name,args});if(error) return {error:{message:'admin_analytics_report not found in schema cache'}};return {data:name==='admin_analytics_person'?{events:[{kind:'test',title:'<img src=x onerror=alert(1)>',score:80,occurred_at:'2026-10-01T12:00:00Z'}]}:data};}}};
 vm.runInNewContext(readFileSync('js/admin-analytics.js','utf8'),{document,window,location:{replace:v=>redirects.push(v)},Intl,Date,Number,String,Math,console});
 document.dispatchEvent(new document.defaultView.Event('DOMContentLoaded'));await flush();
 return {document,calls,redirects};
}
(async()=>{
 await checkAdminNavigation();
 let app=await setup();let d=app.document;
 assert.equal(d.getElementById('report').hidden,false);assert.equal(app.calls[0].name,'admin_analytics_report');
 assert.equal(d.querySelectorAll('#people script').length,0);assert.ok(d.getElementById('people').textContent.includes('<script>unsafe</script>'));
 d.getElementById('next').onclick();await flush();assert.equal(app.calls.at(-1).args.p_page,1);
 d.querySelector('[data-kind="teacher"]').onclick();await flush();assert.equal(app.calls.at(-1).args.p_kind,'teacher');assert.equal(app.calls.at(-1).args.p_page,0);
 d.getElementById('search').value='Tutor';d.getElementById('search-form').onsubmit({preventDefault(){}});await flush();assert.equal(app.calls.at(-1).args.p_search,'Tutor');
 d.getElementById('people').onclick({target:d.querySelector('[data-person]')});await flush();assert.equal(app.calls.at(-1).name,'admin_analytics_person');assert.equal(d.querySelectorAll('#person-body img').length,0);
 d.getElementById('close-person').onclick();assert.equal(d.getElementById('person').open,false);
 const count=app.calls.length;d.getElementById('from').value='2026-10-02';d.getElementById('to').value='2026-10-01';d.getElementById('filters').onsubmit({preventDefault(){}});await flush();assert.equal(app.calls.length,count);
 app=await setup('student');assert.equal(app.calls.length,0);assert.equal(app.document.getElementById('report').hidden,true);
 app=await setup('guest');assert.ok(app.redirects[0].startsWith('login.html'));assert.equal(app.calls.length,0);
 app=await setup('admin',true);assert.equal(app.document.getElementById('report').hidden,true);assert.ok(app.document.getElementById('status').textContent.includes('setup is required'));
 console.log('PASS analytics UI: loading, safe rendering, pagination, report tabs, search, timelines, invalid dates, role gates and missing migration.');
})().catch(e=>{console.error(e);process.exitCode=1;});
