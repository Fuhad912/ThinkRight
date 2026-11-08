/* Isolated database, UI and endpoint checks. No live account changes. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const {parseHTML}=require('linkedom');
const ts=require('typescript');
async function database(){
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create table public.subjects(id text primary key);
 create table public.tutors(id uuid primary key,status text,display_name text,subjects text[],bio text,updated_at timestamptz);
 insert into subjects values('physics'),('math');
 insert into auth.users values('10000000-0000-4000-8000-000000000001','{"role":"teacher"}');
 insert into tutors values('10000000-0000-4000-8000-000000000001','active','Teacher',array['physics'],'Original bio',now());`);
 const migration=fs.readFileSync('supabase/teacher_settings.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec(`select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);set role authenticated;`);
 await db.query('select teacher_settings_update($1,null)',['New name']);
 await db.query('select teacher_settings_update(null,$1)',[['math','math']]);
 await assert.rejects(()=>db.query('select teacher_settings_update(null,$1)',[[]]),/valid teaching subject/);
 await assert.rejects(()=>db.query('select teacher_settings_update(null,$1)',[['invalid']]),/valid teaching subject/);
 await db.exec('reset role');
 const teacher=(await db.query('select * from tutors')).rows[0];assert.equal(teacher.display_name,'New name');assert.deepEqual(teacher.subjects,['math']);assert.equal(teacher.bio,'Original bio');assert.equal(teacher.status,'active');
 const metadata=(await db.query('select raw_user_meta_data from auth.users')).rows[0].raw_user_meta_data;assert.equal(metadata.full_name,'New name');assert.equal(metadata.role,'teacher');
 await db.exec(`update tutors set status='suspended';set role authenticated;`);
 await assert.rejects(()=>db.query('select teacher_settings_update($1,null)',['Blocked']),/Teacher access/);
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);set role authenticated;`);
 await assert.rejects(()=>db.query('select teacher_settings_update($1,null)',['Other user']),/Teacher access/);
 }finally{await db.close();}
}
async function endpoint(){
 const js=ts.transpileModule(fs.readFileSync('supabase/functions/delete-teacher-account/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let callback,role='teacher',stale=false,calls=[];
 vm.runInNewContext(js,{exports:{},Request,Response,Date,JSON,AbortSignal,encodeURIComponent,Deno:{env:{get:key=>({SUPABASE_URL:'https://backend.example',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[key]},serve:fn=>callback=fn},fetch:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'current-user',last_sign_in_at:new Date(Date.now()-(stale?3600000:1000)).toISOString()});
  if(url.includes('workspace_identity'))return Response.json({role});
  return Response.json({});
 }});
 const request=(body={confirmation:'DELETE'},auth=true,origin='https://thinkright.com.ng')=>new Request('https://backend.example/functions/v1/delete-teacher-account',{method:'POST',headers:{origin,'content-type':'application/json',...(auth?{authorization:'Bearer session'}:{})},body:JSON.stringify(body)});
 assert.equal((await callback(request({},false))).status,401);
 assert.equal((await callback(request({confirmation:'no'}))).status,400);
 assert.equal((await callback(request(undefined,true,'https://evil.example'))).status,403);
 assert.equal(calls.length,0);
 stale=true;assert.equal((await callback(request())).status,403);assert.equal(calls.some(call=>call.options.method==='DELETE'),false);
 stale=false;role='admin';assert.equal((await callback(request())).status,403);
 role='teacher';calls=[];assert.equal((await callback(request({confirmation:'DELETE',user_id:'victim'}))).status,200);
 const deletion=calls.find(call=>call.options.method==='DELETE');assert.ok(deletion.url.endsWith('/current-user'));assert.equal(JSON.parse(deletion.options.body).should_soft_delete,true);
}
async function ui(){
 const {window}=parseHTML('<html><body><main></main><dialog id="workspace-dialog"></dialog></body></html>');const document=window.document;
 const data={tutors:[{id:'teacher',display_name:'Teacher',subjects:['physics']}],subjects:[{id:'physics',name:'Physics'},{id:'math',name:'Math'}]};
 let calls=[],passwordCalls=0;
 Object.assign(window,{supabase:{rpc:async(name,payload)=>{calls.push({name,payload});return{};},auth:{resetPasswordForEmail:async(email,options)=>{passwordCalls++;assert.equal(email,'teacher@example.test');assert.equal(options.redirectTo,'https://thinkright.com.ng/reset-password.html');return{};}}}});
 class FormData{constructor(form){this.values=[...form.querySelectorAll('input')].filter(input=>input.type!=='checkbox'||input.hasAttribute('checked')).map(input=>[input.name,input.value]);}get(key){return this.values.find(([name])=>name===key)?.[1];}getAll(key){return this.values.filter(([name])=>name===key).map(([,value])=>value);}}
 vm.runInNewContext(fs.readFileSync('js/teacher-settings.js','utf8'),{window,document,FormData,localStorage:{setItem(){}}});
 function render(){document.querySelector('main').innerHTML=window.ThinkRightTeacherSettings.render(data,{id:'teacher',email:'teacher@example.test'},async()=>render());}render();
 assert.equal(document.querySelector('.tw-settings-heading .tw-settings-back').textContent.trim(),'');
 const toggle=document.querySelector('.tw-subjects-toggle');assert.equal(toggle.getAttribute('aria-expanded'),'false');toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');
 async function submit(kind){document.querySelector(`[data-settings-form="${kind}"]`).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setImmediate(resolve));}
 document.querySelector('[name="display_name"]').value='Updated name';await submit('name');assert.equal(calls[0].payload.p_name,'Updated name');
 await submit('subjects');assert.deepEqual(Array.from(calls[1].payload.p_subjects),['physics']);
 await submit('password');assert.equal(passwordCalls,1);
 document.getElementById('workspace-dialog').showModal=function(){this.open=true;};document.querySelector('[data-settings-action="delete"]').click();assert.equal(document.getElementById('workspace-dialog').open,true);
 assert.ok(document.querySelector('[name="confirmation"]'));
}
(async()=>{await database();await endpoint();await ui();console.log('PASS: teacher settings ownership, name/subject validation, approval preservation, password reset, deletion confirmation, recent sign-in and server-only self-deletion');})().catch(error=>{console.error(error);process.exitCode=1;});
