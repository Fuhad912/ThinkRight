const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
async function main(){
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table user_profiles(id uuid primary key,username text);grant usage on schema auth,public to authenticated,anon,service_role;");
 for(const f of ['cohorts_schema','teacher_workspace','subject_course_enrollment','class_specific_enrollment'])await db.exec(readFileSync('supabase/'+f+'.sql','utf8'));
 await db.exec("create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;");
 for(const f of ['class_thumbnails','lesson_videos','teacher_revenue_share_90','course_studio','course_studio','class_removal','class_removal'])await db.exec(readFileSync('supabase/'+f+'.sql','utf8'));
 const ids={teacher:'10000000-0000-4000-8000-000000000001',other:'10000000-0000-4000-8000-000000000002',student:'10000000-0000-4000-8000-000000000003',admin:'10000000-0000-4000-8000-000000000004'};
 for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users values($1,$2)',[id,{role:['teacher','other'].includes(name)?'teacher':'student',username:name}]);
 await db.exec("update tutors set status='active',subjects=array['physics']");
 await db.query("insert into workspace_roles values($1,'admin')",[ids.admin]);
 const lid='20000000-0000-4000-8000-000000000001', asset='30000000-0000-4000-8000-000000000001';
 const cover=ids.teacher+'/40000000-0000-4000-8000-000000000001.jpg';
 await db.exec('alter table storage.objects add column owner_id text');
 await db.query("insert into storage.objects(bucket_id,name) values('class-thumbnails',$1)",[cover]);
 // Reproduce the installed trigger against Supabase's real owner_id column.
 const definition=(await db.query("select pg_get_functiondef('public.course_revision_validate()'::regprocedure) body")).rows[0].body;
 await db.exec(definition.replaceAll('v_course_owner_id','owner_id'));
 await db.exec(readFileSync('supabase/fix_course_review_owner_id.sql','utf8'));
 await db.exec(readFileSync('supabase/fix_course_review_owner_id.sql','utf8'));
 const body={title:'Mechanics',description:'Learn motion with worked exam examples.',course_type:'topic',focused_topics:'Motion',outcomes:'Calculate acceleration',subject_id:'physics',proposed_price:3000,start_date:'2026-11-07',lessons:[{id:lid,title:'Motion',syllabus_topic:'Motion',video_url:''}]};
 async function as(name){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]||'']);await db.exec('set role authenticated');}
 async function action(op,p){return (await db.query('select workspace_action($1,$2) x',[op,p])).rows[0].x;}
 async function revision(id){return (await db.query('select workspace_snapshot() x')).rows[0].x.revisions.find(r=>r.cohort_id===id);}
 await as('teacher');const {id}=await action('save_class',{body});
 await assert.rejects(()=>action('submit_class',{id}),/course cover/);
 await db.exec('reset role');await db.query("insert into video_assets(id,teacher_id,cohort_id,lesson_id,object_key,filename,fingerprint,size_bytes,state) values($1,$2,$3,$4,'video.mp4','video.mp4','hash',100,'ready')",[asset,ids.teacher,id,lid]);
 body.thumbnail_path=cover;body.lessons[0].video_asset_id=asset;
 await as('teacher');await action('save_class',{id,version:(await revision(id)).version,body});await action('submit_class',{id});
 await as('other');await assert.rejects(()=>action('accept_course_price',{id,version:3}),/unavailable/);
 await as('teacher');await assert.rejects(()=>action('class_review',{id,decision:'approve'}),/Administrator/);
 await assert.rejects(()=>db.query('select course_publish($1,3000)',[id]),/permission denied/);
 await assert.rejects(()=>db.query("select workspace_action_before_course('class_review',$1)",[{id,decision:'approve'}]),/permission denied/);
 await as('admin');await action('class_review',{id,decision:'approve',approved_price:2500,feedback:'Suggested price for this focused topic.'});
 let r=await revision(id);assert.equal(r.state,'in_review');assert.equal(Number(r.suggested_price),2500);
 await db.exec('reset role');assert.equal((await db.query('select published from cohorts where id=$1',[id])).rows[0].published,false);
 await as('teacher');await assert.rejects(()=>action('accept_course_price',{id,version:r.version-1}),/offer changed/);
 await action('request_course_price',{id,version:r.version,price:3000,reason:'The worked examples justify the original price.'});r=await revision(id);assert.equal(r.suggested_price,null);assert.match(r.feedback,/Teacher price request/);
 await as('admin');await action('class_review',{id,decision:'approve',approved_price:2500,feedback:'Please retain this price for accessibility.'});r=await revision(id);await as('teacher');
 await action('accept_course_price',{id,version:r.version});r=await revision(id);assert.equal(r.state,'published');
 await as('admin');await action('price',{subject_id:'physics',price:9999});
 await db.exec('reset role');assert.equal(Number((await db.query('select price from cohorts where id=$1',[id])).rows[0].price),2500);
 await as('student');const order=(await db.query('select class_order_create($1) x',[id])).rows[0].x;assert.equal(Number(order.amount_kobo),250000);
 await assert.rejects(()=>db.query('select course_message_send($1,$2)',[id,'Hello']),/enrollment required/);
 await assert.rejects(()=>db.query('select course_messages($1)',[id]),/enrollment required/);
 await require('./payment-handler-fixture.cjs')(db,{student:ids.student,other:ids.other,course:id,reference:order.reference,amountKobo:Number(order.amount_kobo)});
 await db.exec('reset role');assert.equal(Number((await db.query('select teacher_kobo from teacher_earnings')).rows[0].teacher_kobo),225000);
 await as('student');await db.query('select course_message_send($1,$2)',[id,'How does acceleration work?']);
 await as('teacher');await db.query('select course_message_send($1,$2)',[id,'It is the change in velocity over time.']);assert.equal((await db.query('select course_messages($1) x',[id])).rows[0].x.length,2);
 // Draft revisions keep published price, media and paid access intact.
 body.proposed_price=3500;await action('save_class',{id,version:r.version,body});await action('submit_class',{id});
 await as('student');assert.equal((await db.query('select video_playback_allowed($1) x',[asset])).rows[0].x,true);
 await as('admin');await action('class_review',{id,decision:'approve',approved_price:3500});
 await db.exec('reset role');assert.equal(Number((await db.query('select price from cohorts where id=$1',[id])).rows[0].price),3500);assert.equal((await db.query('select expires_at from enrollments where cohort_id=$1',[id])).rows[0].expires_at,null);
 const remove=(decision,reason='')=>db.query('select class_removal($1,$2,$3)',[id,decision,reason]);
 await as('other');await assert.rejects(()=>remove('delete'),/unavailable/);
 await as('teacher');await assert.rejects(()=>remove('delete'),/records/);
 await remove('request','I can no longer maintain this class.');
 await assert.rejects(()=>remove('approve','Please retire this class.'),/Administrator/);
 await as('admin');await remove('reject','Please keep supporting enrolled students.');
 await as('teacher');await remove('request','Please close this class to new students.');
 await as('admin');await remove('approve','Retire while preserving existing student access.');
 await as('student');assert.equal((await db.query('select video_playback_allowed($1) x',[asset])).rows[0].x,true);
 await as('teacher');await assert.rejects(()=>action('availability',{id,status:'open'}),/removed/);
 const unused=await action('save_class',{body:{...body,title:'Unused draft',lessons:[]}});
 await db.query("select class_removal($1,'delete','')",[unused.id]);
 await assert.rejects(()=>action('submit_class',{id:unused.id}),/removed/);
 await db.exec('reset role');assert.ok((await db.query('select deleted_at from cohorts where id=$1',[unused.id])).rows[0].deleted_at);
 assert.equal(Number((await db.query('select teacher_kobo from teacher_earnings')).rows[0].teacher_kobo),225000);
 await db.close();console.log('PASS course studio and class removal: ownership, requests, retirement, draft deletion, earnings and paid video access.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
