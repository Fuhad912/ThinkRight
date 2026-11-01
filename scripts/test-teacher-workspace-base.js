/* Local PostgreSQL tests. Never connects to live Supabase. */
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon,service_role;
    create table public.user_profiles(id uuid primary key, username text);`);
  await db.exec(readFileSync('supabase/cohorts_schema.sql','utf8'));
  await db.exec('grant all on all tables in schema public to anon,authenticated,service_role');
  await db.exec(`create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;`);
  await db.exec(readFileSync('supabase/teacher_workspace.sql','utf8'));
  await db.exec(readFileSync('supabase/teacher_document_upload.sql','utf8'));

  const ids = {
    teacher:'10000000-0000-4000-8000-000000000001',
    other:'10000000-0000-4000-8000-000000000002',
    admin:'10000000-0000-4000-8000-000000000003',
    student:'10000000-0000-4000-8000-000000000004'
  };
  for (const [role,id] of Object.entries(ids)) {
    await db.query('insert into auth.users values($1,$2)',[id,{role:role==='teacher'||role==='other'?'teacher':'student',username:role}]);
  }
  await db.query("insert into workspace_roles values($1,'admin')",[ids.admin]);

  async function as(role) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]||'']);
    await db.exec('set role authenticated');
  }
  async function action(name,payload={}) {
    return (await db.query('select workspace_action($1,$2) as value',[name,payload])).rows[0].value;
  }
  async function fails(fn,pattern) { await assert.rejects(fn,pattern); }

  const body={
    title:'Physics with purpose',description:'Learn core physics concepts with guided examples.',
    subject_id:'physics',start_date:'2026-10-05',
    lessons:[
      {id:'20000000-0000-4000-8000-000000000001',title:'Motion',syllabus_topic:'Mechanics',video_url:'https://example.com/lesson'},
      {id:'20000000-0000-4000-8000-000000000002',title:'Waves',syllabus_topic:'Waves',video_url:'https://example.com/waves'}
    ]
  };

  async function approveReviewedTeacher(role) {
    await db.exec('reset role');
    const credentialPath=ids[role]+'/11111111-1111-4111-8111-111111111111.pdf';
    await db.query("insert into storage.objects(bucket_id,name) values('teacher-credentials',$1)",[credentialPath]);
    await as(role);
    await action('profile',{display_name:'Test educator',whatsapp_number:'+2348012345678',bio:'Experienced teacher preparing JAMB candidates.',sample_video_url:'https://example.com/lesson',subjects:['physics'],application:{legal_name:'Test Educator',location:'Lagos',qualification:'BSc Physics',institution:'Example University',qualification_year:'2020',experience_years:'3',credential_path:credentialPath,credential_name:'certificate.pdf',weekly_hours:'6',equipment:'Laptop and reliable internet',jamb_experience:'Three years teaching JAMB physics with syllabus-based exercises and assessments.',teaching_plan:'Introduce motion by comparing distance and displacement. Work through a return journey example, ask learners to calculate speed and velocity, then check their explanations for common misconceptions.',declaration:'true'}});
    await as('admin');
    return action('teacher_review',{id:ids[role],status:'active',feedback:'Verified credentials and reviewed an accurate, clearly explained sample lesson.',credentials_checked:'on',lesson_checked:'on',experience_checked:'on'});
  }
  await as('teacher');
  assert.equal((await db.query('select workspace_identity() as i')).rows[0].i.status,'pending');
  await fails(()=>db.exec("update tutors set status='active'"),/permission denied/);
  await fails(()=>action('price',{subject_id:'physics',price:100}),/Administrator|under review/);
  await fails(()=>action('save_class',{body}),/under review/);
  await fails(()=>action('submit_class',{}),/under review/);
  await approveReviewedTeacher('teacher');
  await as('teacher');
  const {id:cid}=await action('save_class',{body});

  await as('student');
  assert.equal((await db.query('select * from cohorts where id=$1',[cid])).rows.length,0);
  await fails(()=>db.query('insert into enrollments(user_id,cohort_id) values($1,$2)',[ids.student,cid]),/permission denied/);
  await fails(()=>db.exec('select workspace_snapshot()'),/Teacher access/);

  await as('other');
  await fails(()=>action('save_class',{id:cid,body,version:1}),/unavailable|under review/);
  await as('admin');
  await action('price',{subject_id:'physics',price:1000});
  await as('teacher');
  await action('submit_class',{id:cid});
  await fails(()=>action('save_class',{id:cid,body,version:2}),/Withdraw/);
  await as('admin');
  await action('class_review',{id:cid,decision:'approve'});

  await as('teacher');
  await action('save_class',{id:cid,body:{...body,title:'Unpublished revision'},version:3});
  await fails(()=>action('save_class',{id:cid,body,version:3}),/changed/);
  await as('student');
  assert.equal((await db.query('select title from cohorts where id=$1',[cid])).rows[0].title,body.title);
  assert.equal((await db.query('select * from lessons where cohort_id=$1',[cid])).rows.length,0,'Topics stay locked before course payment');

  const order=(await db.query('select class_order_create($1) as o',[cid])).rows[0].o;
  assert.equal(order.amount_kobo,100000);
  assert.equal(order.subject_id,'physics');
  assert.equal(order.tutor_id,ids.teacher);
  assert.equal(order.access_scope,'subject_course');
  await fails(()=>db.query('select class_order_settle($1,$2,$3,now(),$4)',[order.reference,100000,'NGN',ids.student]),/permission denied/);

  await as('admin');
  await action('price',{subject_id:'physics',price:2000});
  await db.exec('reset role; set role service_role');
  await fails(()=>db.query('select class_order_settle($1,$2,$3,now(),$4)',[order.reference,1,'NGN',ids.student]),/does not match/);
  await fails(()=>db.query('select class_order_settle($1,$2,$3,now(),$4)',[order.reference,100000,null,ids.student]),/does not match/);
  for(let i=0;i<2;i++) await db.query('select class_order_settle($1,$2,$3,now(),$4)',[order.reference,100000,'NGN',ids.student]);

  const otherCourse='30000000-0000-4000-8000-000000000001';
  await db.exec('reset role');
  await db.query("insert into cohorts(id,tutor_id,subject_id,title,start_date,price,status,published) values($1,$2,'physics','Another teacher Physics','2026-10-05',2000,'open',true)",[otherCourse,ids.other]);
  await db.query("insert into lessons(cohort_id,title,syllabus_topic,video_url,order_index) values($1,'Optics','Optics','https://example.com/optics',1)",[otherCourse]);

  await as('student');
  assert.equal((await db.query('select * from lessons where cohort_id=$1 order by order_index',[cid])).rows.length,2,'One course payment unlocks every topic in the selected course');
  assert.equal((await db.query('select * from lessons where cohort_id=$1',[otherCourse])).rows.length,0,'Payment does not unlock another teacher’s course in the same subject');
  assert.equal((await db.query('select workspace_enrolled($1) as allowed',[cid])).rows[0].allowed,true);

  await as('teacher');
  let snap=(await db.query('select workspace_snapshot() as s')).rows[0].s;
  assert.equal(snap.earnings.length,1);
  assert.equal(snap.earnings[0].teacher_kobo,70000);
  assert.equal(Number(snap.enrollments[0].paid_amount),1000);
  await action('bank',{bank:'Example bank',account_number:'0123456789',account_name:'Teacher'});
  await as('admin');
  await fails(()=>action('payout',{id:ids.teacher,amount_kobo:70000,reference:'PAY-1',paid_at:new Date().toISOString()}),/Review the bank/);
  await action('bank_review',{id:ids.teacher});
  await action('payout',{id:ids.teacher,amount_kobo:70000,reference:'PAY-1',paid_at:new Date(Date.now()-1000).toISOString()});
  await fails(()=>action('payout',{id:ids.teacher,amount_kobo:1,reference:'PAY-2',paid_at:new Date().toISOString()}),/exceeds/);
  snap=(await db.query('select workspace_snapshot() as s')).rows[0].s;
  await action('reverse_payout',{id:snap.payouts[0].id,reason:'Incorrect transfer record'});
  await as('teacher');
  await action('bank',{bank:'Another bank',account_number:'9876543210',account_name:'Teacher'});
  snap=(await db.query('select workspace_snapshot() as s')).rows[0].s;
  assert.equal(snap.banks[0].reviewed,false);
  assert.equal(snap.payouts[0].bank_snapshot.account_number,'0123456789');

  await db.close();
  console.log('PASS: role isolation, approval, drafts, subject-course pricing, all-topic access, payment validation/idempotency, earnings and payout safeguards.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
