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
  await db.exec(readFileSync('supabase/teacher_workspace.sql','utf8'));
  const ids = { teacher:'10000000-0000-4000-8000-000000000001', other:'10000000-0000-4000-8000-000000000002', admin:'10000000-0000-4000-8000-000000000003', student:'10000000-0000-4000-8000-000000000004' };
  for(const [role,id] of Object.entries(ids)) await db.query('insert into auth.users values($1,$2)',[id,{role:role==='teacher'||role==='other'?'teacher':'student',username:role}]);
  await db.query("insert into workspace_roles values($1,'admin')",[ids.admin]);
  async function as(role){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]||'']);await db.exec('set role authenticated');}
  async function action(name,payload={}){return (await db.query('select workspace_action($1,$2) as value',[name,payload])).rows[0].value;}
  async function fails(fn,pattern){await assert.rejects(fn,pattern);}
  await as('teacher');
  assert.equal((await db.query('select workspace_identity() as i')).rows[0].i.status,'pending');
  await fails(()=>db.exec("update tutors set status='active'"),/permission denied/);
  await fails(()=>action('price',{subject_id:'physics',price:100}),/Administrator/);
  const body={title:'Physics with purpose',description:'Learn core physics concepts with guided examples.',subject_id:'physics',start_date:'2026-10-05',lessons:[{id:'20000000-0000-4000-8000-000000000001',title:'Motion',syllabus_topic:'Mechanics',video_url:'https://example.com/lesson'}]};
  const {id:cid}=await action('save_class',{body});
  await fails(()=>action('submit_class',{id:cid}),/approval/);
  await as('student');
  assert.equal((await db.query('select * from cohorts where id=$1',[cid])).rows.length,0);
  await fails(()=>db.query('insert into enrollments(user_id,cohort_id) values($1,$2)',[ids.student,cid]),/permission denied/);
  await fails(()=>db.exec('select workspace_snapshot()'),/Teacher access/);
  await as('other');await fails(()=>action('save_class',{id:cid,body,version:1}),/unavailable/);
  await as('admin');await action('teacher_review',{id:ids.teacher,status:'active'});await action('price',{subject_id:'physics',price:1000});
  await as('teacher');await action('submit_class',{id:cid});
  await fails(()=>action('save_class',{id:cid,body,version:2}),/Withdraw/);
  await as('admin');await action('class_review',{id:cid,decision:'approve'});
  await as('teacher');await action('save_class',{id:cid,body:{...body,title:'Unpublished revision'},version:3});
  await fails(()=>action('save_class',{id:cid,body,version:3}),/changed/);
  await as('student');
  assert.equal((await db.query('select title from cohorts where id=$1',[cid])).rows[0].title,body.title);
  const order=(await db.query('select class_order_create($1) as o',[cid])).rows[0].o;
  assert.equal(order.amount_kobo,100000);
  await fails(()=>db.query('select class_order_settle($1,$2,$3,now(),$4)',[order.reference,100000,'NGN',ids.student]),/permission denied/);
  await as('admin');await action('price',{subject_id:'physics',price:2000});
  await db.exec('reset role; set role service_role');
  await fails(()=>db.query('select class_order_settle($1,$2,$3,now(),$4)',[order.reference,1,'NGN',ids.student]),/does not match/);
  await fails(()=>db.query('select class_order_settle($1,$2,$3,now(),$4)',[order.reference,100000,null,ids.student]),/does not match/);
  for(let i=0;i<2;i++)await db.query('select class_order_settle($1,$2,$3,now(),$4)',[order.reference,100000,'NGN',ids.student]);
  await as('teacher');
  let snap=(await db.query('select workspace_snapshot() as s')).rows[0].s;
  assert.equal(snap.earnings.length,1);assert.equal(snap.earnings[0].teacher_kobo,70000);assert.equal(Number(snap.enrollments[0].paid_amount),1000);
  await action('bank',{bank:'Example bank',account_number:'0123456789',account_name:'Teacher'});
  await as('admin');await fails(()=>action('payout',{id:ids.teacher,amount_kobo:70000,reference:'PAY-1',paid_at:new Date().toISOString()}),/Review the bank/);
  await action('bank_review',{id:ids.teacher});
  await action('payout',{id:ids.teacher,amount_kobo:70000,reference:'PAY-1',paid_at:new Date(Date.now()-1000).toISOString()});
  await fails(()=>action('payout',{id:ids.teacher,amount_kobo:1,reference:'PAY-2',paid_at:new Date().toISOString()}),/exceeds/);
  snap=(await db.query('select workspace_snapshot() as s')).rows[0].s;
  await action('reverse_payout',{id:snap.payouts[0].id,reason:'Incorrect transfer record'});
  await as('teacher');await action('bank',{bank:'Another bank',account_number:'9876543210',account_name:'Teacher'});
  snap=(await db.query('select workspace_snapshot() as s')).rows[0].s;
  assert.equal(snap.banks[0].reviewed,false);assert.equal(snap.payouts[0].bank_snapshot.account_number,'0123456789');
  await fails(()=>db.query('select class_order_create($1)',[cid]),/Student sign-in/);
  await as('other');await fails(()=>db.query('insert into lesson_progress(user_id,lesson_id) values($1,$2)',[ids.other,body.lessons[0].id]),/row-level security/);
  await as('student');await db.query('insert into lesson_progress(user_id,lesson_id) values($1,$2)',[ids.student,body.lessons[0].id]);
  const curriculum=(await db.query('select class_curriculum($1) as c',[cid])).rows[0].c;
  assert.equal(curriculum[0].title,'Motion');assert.equal('video_url' in curriculum[0],false);
  await as('teacher');await action('save_class',{id:cid,version:4,body:{...body,lessons:[{...body.lessons[0],id:'20000000-0000-4000-8000-000000000002'}]}});await action('submit_class',{id:cid});
  await as('admin');await action('class_review',{id:cid,decision:'approve'});
  await db.exec('reset role');assert.equal((await db.query('select * from lesson_progress')).rows.length,1,'Archived lesson progress is retained');
  await as('teacher');await action('availability',{id:cid,status:'closed'});
  await as('student');assert.equal((await db.query('select * from cohorts where id=$1',[cid])).rows.length,1,'Closed classes remain available to enrolled students');
  assert.equal((await db.query('select * from lessons where cohort_id=$1',[cid])).rows.length,1,'Only current lessons are visible');
  await as('other');snap=(await db.query('select workspace_snapshot() as s')).rows[0].s;
  assert.equal(snap.classes.length,0);assert.equal(snap.banks.length,0);assert.equal(snap.earnings.length,0);
  await db.close();
  console.log('PASS: role isolation, signup, approval, drafts, optimistic locking, server pricing, payment validation/idempotency, earnings and payout safeguards.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
