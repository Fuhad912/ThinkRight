const {parseHTML}=require('linkedom');
const {readFileSync,existsSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const assert=require('node:assert/strict');
const pages=['tutor-dashboard','tutor-classes','tutor-class','tutor-students','tutor-discussions','tutor-payouts','tutor-onboarding','admin'];
async function check(page,width,populated=false,homeState=''){
 const {window}=parseHTML(readFileSync(page+'.html','utf8')),document=window.document;
 const identity={role:page==='admin'?'admin':'teacher',status:'active',name:'Educator'};
 const data={identity,subjects:[{id:'physics',name:'Physics',enrollment_price:1000}],tutors:[],classes:[],revisions:[],students:[],enrollments:[],progress:[],lessons:[],posts:[],banks:[],earnings:[],payouts:[],audit:[]};
 if(populated){
  const now=new Date().toISOString(),body={title:'Physics <script>unsafe</script>',subject_id:'physics',description:'Learn motion through clear practical examples.',start_date:'2026-10-05',lessons:[{id:'lesson',title:'Motion',syllabus_topic:'Mechanics',video_url:'https://example.com/video'}]};
  data.tutors=[{id:'teacher',display_name:'Ada',subjects:['physics'],status:'active'}];
  data.classes=[{id:'class',tutor_id:'teacher',subject_id:'physics',title:body.title,published:true,status:'open',start_date:body.start_date}];
  data.revisions=[{cohort_id:'class',body,state:page==='admin'?'in_review':'published',version:3}];data.lessons=[{...body.lessons[0],cohort_id:'class'}];
  data.students=[{id:'student',username:'Student'}];data.enrollments=[{id:'enrollment',user_id:'student',cohort_id:'class',status:'active',enrolled_at:now,paid_amount:1000}];data.progress=[{user_id:'student',lesson_id:'lesson'}];
  data.posts=[{id:'post',cohort_id:'class',author_id:'student',body:'Explain velocity?',created_at:now}];data.earnings=[{enrollment_id:'enrollment',tutor_id:'teacher',cohort_id:'class',teacher_kobo:70000,gross_kobo:100000,created_at:now,reference:'TR-test'}];
 }
 if(homeState){
  Object.assign(data.tutors[0],{bio:'Physics teacher',whatsapp_number:'08012345678',sample_video_url:'https://example.com/lesson'});
  data.banks=[{tutor_id:'teacher'}];
  if(homeState==='changes')data.revisions[0].state='changes_requested';
  if(homeState==='caught-up')data.posts[0].resolved=true;
  if(homeState==='pending'||homeState==='suspended')identity.status=homeState;
  if(homeState==='first-class'){data.classes=[];data.revisions=[];data.posts=[];}
 }
 const location={pathname:'/'+page+'.html',search:'',hash:'',replace:v=>{throw Error('Unexpected redirect '+v);}};
 if(page==='tutor-class'&&populated)location.search='?id=class';
 const localStorage={getItem:()=>null,setItem(){}};
 const matchMedia=query=>({matches:query.includes('639')?width<=639:width<=1023});
 Object.assign(window,{location,localStorage,matchMedia,authInitialized:true,resolveWorkspaceIdentity:async()=>identity,supabase:{auth:{getUser:async()=>({data:{user:{id:'teacher',email:'test@example.com'}}})},rpc:async()=>({data,error:null})}});
 runInNewContext(readFileSync('js/teacher-workspace.js','utf8'),{window,document,location,localStorage,history:{replaceState(){}},URLSearchParams,URL,Intl,Date,structuredClone,console,confirm:()=>true,setTimeout:()=>1,clearTimeout(){},matchMedia});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(document.querySelector('#workspace-main h1'),page+': '+document.body.textContent);
 assert.equal(document.querySelector('#workspace-main script'),null,'Untrusted titles must be escaped');
 if(page!=='admin'){
  const desktop=document.querySelector('.tr-navbar__nav');
  assert.equal(desktop.querySelectorAll('a[href="tutor-dashboard.html"]').length,1,'Teacher Home should not be duplicated');
  assert.equal(desktop.querySelector('a[href="tutor-dashboard.html"]').textContent.trim(),'Home');
  assert.equal(desktop.querySelector('a[href="tutor-analytics.html"]'),null,'Teacher Dashboard is merged into Home');
  const mobile=[...document.querySelectorAll('.tw-bottom-nav a')];
  assert.deepEqual(mobile.map(a=>a.textContent.trim()),['Home','My classes','Earnings']);
  assert.equal(mobile[2].getAttribute('href'),'tutor-payouts.html');
  assert.ok(mobile[2].querySelector('.fa-wallet'),'Mobile Earnings should have a Font Awesome icon');
 }
 if(page==='tutor-dashboard'){
  const home=document.querySelector('.tw-teacher-home');
  assert.ok(home,'Teacher home should render');
  assert.ok(home.querySelector('.tw-teacher-home-hero .tw-teacher-home-cta'),'Next action should lead the dashboard');
  assert.equal(home.querySelectorAll('.tw-teacher-home-shortcuts,canvas').length,0,'Home stays focused: no charts or duplicate shortcuts');
  assert.ok(home.querySelector('.tw-teacher-home-intro .fa-hand'),'Teacher greeting should use Font Awesome');
  assert.equal(home.querySelectorAll('.tw-dash-spotlight,.tw-dash-today').length,0,'Old dashboard sections should not render');
  const metrics=[...home.querySelectorAll('.tw-home-metric')];
  assert.deepEqual(metrics.map(a=>a.getAttribute('href')),['tutor-students.html','tutor-classes.html','tutor-payouts.html','tutor-analytics.html']);
  assert.equal(metrics[0].querySelector('strong').textContent,populated?'1':'0','Student count should match active enrollments');
  assert.equal(metrics[3].querySelector('strong').textContent,populated?'100%':'—','Completion should use lesson progress');
  const setup=home.querySelector('.tw-home-setup');
  if(setup)assert.equal(setup.hasAttribute('open'),false,'Setup should start collapsed');
  if(homeState){
   const next=home.querySelector('.tw-teacher-home-cta');
   const expected={questions:'tutor-discussions.html',changes:'tutor-class.html?id=class','caught-up':'tutor-classes.html',pending:'tutor-discussions.html',suspended:'mailto:thinkright912@gmail.com','first-class':'tutor-class.html'};
   assert.equal(next.getAttribute('href'),expected[homeState],'Next step should reflect the teacher state');
   if(homeState==='first-class')assert.equal(setup.querySelectorAll('.tw-home-setup-steps a').length,2,'Only unfinished setup steps should appear');
   else assert.equal(setup,null,'Completed or suspended accounts should not show setup');
   if(homeState==='pending')assert.ok(home.querySelector('.tw-home-account-note'),'Pending teachers must see their review status');
   if(homeState==='caught-up')assert.equal(home.querySelector('.tw-question-item'),null,'Resolved questions should leave the inbox');
  }
 }
 for(const a of document.querySelectorAll('a[href]')){const href=a.getAttribute('href').split(/[?#]/)[0];if(href.endsWith('.html'))assert.ok(existsSync(href),href);}
 document.querySelector('[data-action="menu"]').click();assert.ok(document.querySelector('.tw-sidebar.open'));
 document.querySelector('[data-action="close-menu"]').click();assert.equal(document.querySelector('.tw-sidebar.open'),null);
 if(width<=639){
  const more=document.querySelector('.tw-bottom-nav [data-action="menu"]');
  more.click();assert.ok(document.querySelector('.tw-sidebar.open'));
  assert.equal(more.getAttribute('aria-expanded'),'true');
  document.querySelector('[data-action="close-menu"]').click();
  assert.equal(more.getAttribute('aria-expanded'),'false');
 }
 if(page==='admin')for(const tab of ['teachers','pricing','payouts','reconcile','audit','reviews'])document.querySelector(`[data-tab="${tab}"]`).click();
 if(page==='tutor-class'){
  for(const step of ['1','2','0']){document.querySelector(`[data-action="step"][data-step="${step}"]`).click();assert.ok(document.querySelector('#class-editor'));}
  const dialog=document.querySelector('dialog');dialog.showModal=()=>dialog.open=true;document.querySelector('[data-action="preview"]').click();assert.equal(dialog.open,true);
 }
}
(async()=>{for(const page of pages)for(const width of [320,375,768,1440])for(const populated of [false,true])await check(page,width,populated);for(const state of ['questions','changes','caught-up','pending','suspended','first-class'])for(const width of [375,1440])await check('tutor-dashboard',width,true,state);console.log('PASS: 64 populated/empty page/media-state DOM checks plus 12 teacher Home state checks, navigation, links, safe titles, editor and admin flows. Real-browser visual QA still required.');})().catch(error=>{console.error(error);process.exitCode=1;});
