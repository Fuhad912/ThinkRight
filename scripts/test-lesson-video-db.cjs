/* Local database only. No credentials or live services. */
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
async function main() {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 create table public.user_profiles(id uuid primary key,username text);`);
 await db.exec(readFileSync('supabase/cohorts_schema.sql','utf8'));
 await db.exec('grant all on all tables in schema public to anon,authenticated,service_role');
 for(const path of ['teacher_workspace','subject_course_enrollment','class_specific_enrollment']) await db.exec(readFileSync(`supabase/${path}.sql`,'utf8'));
 const ids = {teacher:'10000000-0000-4000-8000-000000000001',other:'10000000-0000-4000-8000-000000000002',student:'10000000-0000-4000-8000-000000000003',admin:'10000000-0000-4000-8000-000000000004'};
 for(const [role,id] of Object.entries(ids)) await db.query('insert into auth.users values($1,$2)',[id,{role:['teacher','other'].includes(role)?'teacher':'student',username:role}]);
 await db.query("update tutors set status='active',subjects=array['physics'] where id in ($1,$2)",[ids.teacher,ids.other]);
 await db.query("insert into workspace_roles values($1,'admin')",[ids.admin]);
 await db.exec("update subjects set enrollment_price=1000 where id='physics'");
 async function as(role){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]||'']);await db.exec('set role authenticated');}
 async function action(op,payload){return (await db.query('select workspace_action($1,$2) as result',[op,payload])).rows[0].result;}
 const lid='20000000-0000-4000-8000-000000000001',asset='30000000-0000-4000-8000-000000000001';
 const body={title:'Physics lessons',description:'Understand motion through worked examples.',subject_id:'physics',start_date:'2026-10-01',lessons:[{id:lid,title:'Motion',syllabus_topic:'Mechanics',video_url:'https://www.youtube.com/watch?v=old'}]};
 await as('teacher');const {id:cid}=await action('save_class',{body});await action('submit_class',{id:cid});
 await as('admin');await action('class_review',{id:cid,decision:'approve'});
 await as('student');const order=(await db.query('select class_order_create($1) as x',[cid])).rows[0].x;
 await db.exec('reset role');
 await db.exec(readFileSync('supabase/lesson_videos.sql','utf8'));
 assert.equal((await db.query('select video_migration_required as x from cohorts where id=$1',[cid])).rows[0].x,true);
 await as('student');await assert.rejects(()=>db.query('select class_order_create($1)',[cid]),/updating its videos/);
 // An already pending payment still settles after the migration gate is applied.
 await db.exec('reset role;set role service_role');
 await db.query("select class_order_settle($1,$2,'NGN',now(),$3)",[order.reference,order.amount_kobo,ids.student]);
 await as('student');assert.equal((await db.query('select workspace_enrolled($1) as x',[cid])).rows[0].x,true);
 assert.equal((await db.query('select video_url from lessons where id=$1',[lid])).rows[0].video_url,body.lessons[0].video_url);
 await as('teacher');await action('save_class',{id:cid,version:3,body});
 await assert.rejects(()=>action('submit_class',{id:cid}),/Replace every lesson/);
 assert.equal((await db.query('select video_upload_allowed($1,$2) as x',[cid,lid])).rows[0].x,true);
 await as('other');assert.equal((await db.query('select video_upload_allowed($1,$2) as x',[cid,lid])).rows[0].x,false);
 await assert.rejects(()=>db.exec('select * from video_assets'),/permission denied/);
 await db.exec('reset role');
 await db.query("insert into video_assets(id,teacher_id,cohort_id,lesson_id,object_key,filename,fingerprint,size_bytes,state) values($1,$2,$3,$4,'private/video.mp4','motion.mp4',repeat('a',64),100,'uploading')",[asset,ids.teacher,cid,lid]);
 const replacement={...body,lessons:[{...body.lessons[0],video_asset_id:asset,video_url:''}]};
 await as('teacher');await assert.rejects(()=>action('save_class',{id:cid,version:4,body:replacement}),/ready video/);
 await db.exec('reset role');await db.query("update video_assets set state='ready' where id=$1",[asset]);
 await as('other');await assert.rejects(()=>action('save_class',{id:cid,version:4,body:replacement}),/unavailable/);
 await as('teacher');await action('save_class',{id:cid,version:4,body:replacement});
 assert.equal((await db.query('select video_playback_allowed($1) as x',[asset])).rows[0].x,true);
 await as('student');assert.equal((await db.query('select video_playback_allowed($1) as x',[asset])).rows[0].x,false);
 await as('admin');assert.equal((await db.query('select video_playback_allowed($1) as x',[asset])).rows[0].x,true);
 await as('teacher');await action('submit_class',{id:cid});
 assert.equal((await db.query('select video_upload_allowed($1,$2) as x',[cid,lid])).rows[0].x,false);
 await as('admin');await action('class_review',{id:cid,decision:'approve'});
 await as('student');assert.equal((await db.query('select video_playback_allowed($1) as x',[asset])).rows[0].x,true);
 assert.equal((await db.query('select video_asset_id from lessons where id=$1',[lid])).rows[0].video_asset_id,asset);
 await db.exec('reset role');
 assert.equal((await db.query('select video_migration_required as x from cohorts where id=$1',[cid])).rows[0].x,false);
 await db.query("update video_assets set expires_at=now()-interval '1 day' where id=$1",[asset]);
 assert.equal((await db.query('select * from video_cleanup_claim()')).rows.length,0,'published and revision references protect assets');
 await db.query("insert into video_assets(teacher_id,cohort_id,lesson_id,object_key,filename,fingerprint,size_bytes,expires_at) values($1,$2,$3,'orphan.mp4','orphan.mp4','x',100,now()-interval '1 day')",[ids.teacher,cid,lid]);
 assert.equal((await db.query('select * from video_cleanup_claim()')).rows[0].state,'deleting');
 await as('other');assert.equal((await db.query('select video_playback_allowed($1) as x',[asset])).rows[0].x,false);
 await db.exec('reset role');await db.query("update enrollments set status='canceled' where cohort_id=$1",[cid]);
 await as('student');assert.equal((await db.query('select video_playback_allowed($1) as x',[asset])).rows[0].x,false);
 await db.close();console.log('Lesson video database permissions, migration, review and cleanup checks passed');
}
main().catch(error=>{console.error(error);process.exit(1);});
