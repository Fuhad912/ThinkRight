const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;create table user_profiles(id uuid primary key,username text,created_at timestamptz default now());`);
 await db.exec(readFileSync('supabase/cohorts_schema.sql','utf8'));
 await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
 for(const file of ['teacher_workspace.sql','teacher_document_upload.sql','subject_course_enrollment.sql','admin_console.sql','test_results.sql','admin_analytics.sql','admin_analytics.sql']) await db.exec(readFileSync('supabase/'+file,'utf8'));
 const admin='10000000-0000-4000-8000-000000000001',student='10000000-0000-4000-8000-000000000002',teacher='10000000-0000-4000-8000-000000000003';
 await db.query('insert into auth.users(id) values($1),($2),($3)',[admin,student,teacher]);
 await db.query("insert into workspace_roles values($1,'admin'),($2,'teacher')",[admin,teacher]);
 await db.query("insert into user_profiles(id,username,created_at) values($1,'Student <script>','2026-10-01'),($2,'Teacher','2026-10-01')",[student,teacher]);
 await db.query("insert into tutors(id,display_name,status,subjects) values($1,'Tutor','active',array['physics'])",[teacher]);
 await db.query(`insert into test_results(client_ref,user_id,subject,score_percentage,correct_count,wrong_count,total_questions,completed_at) values
 ('before',$1,'physics',20,2,8,10,'2026-09-30T22:59:59Z'),
 ('boundary',$1,'physics',80,8,2,10,'2026-09-30T23:00:00Z'),
 ('last',$1,'physics',100,10,0,10,'2026-10-01T22:59:59Z'),
 ('after',$1,'physics',0,0,10,10,'2026-10-01T23:00:00Z'),
 ('teacher',$2,'physics',0,0,10,10,'2026-10-01T10:00:00Z')`,[student,teacher]);
 async function as(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
 const report=async(kind='student',subject='')=>(await db.query("select admin_analytics_report('2026-10-01','2026-10-01',$1,0,'',$2) as data",[kind,subject])).rows[0].data;
 for(const id of [student,teacher]){await as(id);await assert.rejects(()=>report(),/Admin access/);await assert.rejects(()=>db.query("select admin_analytics_person($1,'2026-10-01','2026-10-01')",[student]),/Admin access/);await assert.rejects(()=>db.query('select * from admin_learning_events'),/permission denied/);}
 await as('','anon');await assert.rejects(()=>report(),/permission denied/);
 await as(admin);let r=await report();assert.equal(r.current.tests,2);assert.equal(r.previous.tests,1);assert.equal(r.current.active_learners,1);assert.equal(r.current.average_score,90);assert.equal(r.current.new_students,1);assert.equal(r.people_count,1);assert.equal(r.daily[0].tests,2);assert.equal(r.people[0].tests,2);
 assert.equal((await report('student','chemistry')).current.tests,0);
 assert.equal((await report('teacher')).people[0].name,'Tutor');
 assert.equal((await report()).attention.teachers_without_classes,1);
 // Exercise lesson, course and verified financial aggregates with real relationships.
 await db.exec('reset role');
 const cid=(await db.query("insert into cohorts(tutor_id,subject_id,title,start_date,published) values($1,'physics','Mechanics','2026-10-01',true) returning id",[teacher])).rows[0].id;
 const lid=(await db.query("insert into lessons(cohort_id,title,video_url) values($1,'Forces','https://example.com/video') returning id",[cid])).rows[0].id;
 await db.query("insert into lesson_progress(user_id,lesson_id,completed_at) values($1,$2,'2026-10-01T10:00:00Z')",[student,lid]);
 const eid=(await db.query("insert into enrollments(user_id,cohort_id,paid_amount) values($1,$2,1000) returning id",[student,cid])).rows[0].id;
 await db.query("insert into subject_course_enrollments(user_id,tutor_id,subject_id,enrollment_id,created_at) values($1,$2,'physics',$3,'2026-10-01T10:00:00Z')",[student,teacher,eid]);
 await db.query("insert into teacher_earnings(tutor_id,enrollment_id,cohort_id,gross_kobo,teacher_kobo,reference,source,created_at) values($1,$2,$3,100000,70000,'TEST-VERIFIED','verified_payment','2026-10-01T10:00:00Z')",[teacher,eid,cid]);
 await as(admin);r=await report();assert.equal(r.current.lessons,1);assert.equal(r.current.active_learners,1);assert.equal(r.current.enrollments,1);assert.equal(r.current.revenue_kobo,100000);
 const tr=(await report('teacher')).people[0];assert.equal(tr.classes,1);assert.equal(tr.lessons,1);assert.equal(tr.enrollments,1);assert.equal(tr.earnings_kobo,70000);
 assert.equal((await report('student','chemistry')).current.revenue_kobo,0);
 const details=(await db.query("select admin_analytics_person($1,'2026-10-01','2026-10-01') as d",[student])).rows[0].d;assert.equal(details.events.length,4);
 await assert.rejects(()=>db.query("select admin_analytics_report('2026-10-02','2026-10-01')"),/Invalid/);
 await assert.rejects(()=>db.query("select admin_analytics_report('2020-01-01','2026-10-01')"),/Invalid/);
 console.log('PASS analytics: repeatable migration, admin isolation, Lagos boundaries, comparisons, subject filters, people and timelines.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
