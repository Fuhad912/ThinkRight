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

  const application={legal_name:'Ada Teacher',location:'Lagos, Nigeria',qualification:'BSc Physics',institution:'Example University',qualification_year:'2020',experience_years:'3',credential_path:ids.teacher+'/11111111-1111-4111-8111-111111111111.pdf',credential_name:'certificate.pdf',weekly_hours:'6',equipment:'Laptop, microphone and broadband internet',jamb_experience:'I have taught JAMB physics to candidates for three years using the official syllabus.',teaching_plan:'For motion, students will learn to distinguish speed from velocity. I explain displacement with a worked example, then ask students to calculate velocity for a return journey and explain their answer.',declaration:'true'};
  const profile={display_name:'Ada Teacher',whatsapp_number:'+2348012345678',bio:'Experienced physics teacher helping JAMB candidates.',sample_video_url:'https://example.com/video',subjects:['physics'],application};
  await db.query("insert into storage.objects(bucket_id,name) values('teacher-credentials',$1)",[application.credential_path]);
  await as('teacher');
  await fails(()=>action('profile',{...profile,application:{...application,declaration:'false'}}),/declaration/);
  await fails(()=>action('profile',{...profile,application:{...application,credential_path:ids.other+'/11111111-1111-4111-8111-111111111111.pdf'}}),/Upload your certificate/);
  await action('profile',profile);
  assert.equal((await db.query('select * from storage.objects')).rows.length,1);
  assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[application.credential_path])).rows.length,0,'Submitted evidence cannot be deleted');
  assert.equal((await db.query('update storage.objects set name=name where name=$1 returning name',[application.credential_path])).rows.length,0,'Submitted evidence cannot be overwritten');

  assert.equal((await db.query('select workspace_identity() as i')).rows[0].i.status,'pending');
  assert.equal((await db.query('select * from teacher_applications')).rows.length,1);
  const snapshot=(await db.query('select workspace_snapshot() as s')).rows[0].s;
  assert.equal(snapshot.tutors.find(t=>t.id===ids.teacher).application.legal_name,'Ada Teacher');
  await fails(()=>action('teacher_review',{id:ids.teacher,status:'active'}),/Administrator/);
  await as('other');
  assert.equal((await db.query('select * from storage.objects')).rows.length,0,'Other teachers cannot read evidence');
  await fails(()=>db.query("insert into storage.objects(bucket_id,name) values('teacher-credentials',$1)",[ids.teacher+'/22222222-2222-4222-8222-222222222222.pdf']),/row-level security/);

  assert.equal((await db.query('select * from teacher_applications')).rows.length,0);
  await fails(()=>db.query('insert into teacher_applications(tutor_id,details) values($1,$2)',[ids.other,application]),/permission denied/);
  await as('student');
  assert.equal((await db.query('select * from teacher_applications')).rows.length,0);
  await as('admin');
  assert.equal((await db.query('select * from teacher_applications')).rows.length,1);
  await fails(()=>action('teacher_review',{id:ids.teacher,status:'active'}),/review decision/);
  const review={id:ids.teacher,status:'active',feedback:'Credentials verified and sample lesson demonstrates clear, accurate teaching.'};
  await fails(()=>action('teacher_review',review),/Confirm credentials/);
  await action('teacher_review',{...review,credentials_checked:'on',lesson_checked:'on',experience_checked:'on'});
  const reviewed=(await db.query('select * from teacher_applications')).rows[0];
  assert.equal(reviewed.reviewed_by,ids.admin);assert.ok(reviewed.reviewed_at);
  // Existing deployments can apply the focused upgrade repeatedly.
  await db.exec('reset role');
  await db.exec(readFileSync('supabase/teacher_application_upgrade.sql','utf8'));
  await db.exec(readFileSync('supabase/teacher_application_upgrade.sql','utf8'));
  await db.exec(readFileSync('supabase/teacher_document_upload.sql','utf8'));
  await db.exec(readFileSync('supabase/teacher_document_upload.sql','utf8'));
  const bucket=(await db.query("select * from storage.buckets where id='teacher-credentials'")).rows[0];assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),5242880);
  await db.close();
  console.log('PASS: private application evidence, required fields, pending submission, admin-only approval, review checklist, decision audit and repeatable upgrade');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
