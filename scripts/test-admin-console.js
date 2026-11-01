const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;create table user_profiles(id uuid primary key,username text);`);
 await db.exec(readFileSync('supabase/cohorts_schema.sql','utf8'));
 await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
 for(const file of ['teacher_workspace.sql','teacher_document_upload.sql','subject_course_enrollment.sql','admin_console.sql','admin_console.sql'])await db.exec(readFileSync('supabase/'+file,'utf8'));
 const admin='10000000-0000-4000-8000-000000000001',student='10000000-0000-4000-8000-000000000002';
 await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);
 await db.query("insert into workspace_roles values($1,'admin')",[admin]);
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
 async function save(book){return(await db.query('select admin_textbook_save($1) as b',[book])).rows[0].b;}
 await as(student);
 await assert.rejects(()=>db.query('select admin_console_snapshot()'),/Admin access/);
 await assert.rejects(()=>save({}),/Admin access/);
 await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('textbooks','test.pdf')"),/row-level security/);
 await as(admin);
 assert.equal((await db.query('select admin_console_snapshot() as s')).rows[0].s.order_count,0);
 await db.query("insert into storage.objects(bucket_id,name) values('textbooks','test.pdf')");
 const body={title:'Physics Workbook',subject_id:'physics',file_path:'test.pdf',image_url:'https://example.com/cover.jpg',published:false};
 await assert.rejects(()=>save({...body,file_path:'missing.pdf'}),/Upload this PDF/);
 await assert.rejects(()=>save({...body,image_url:'javascript:alert(1)'}),/HTTPS/);
 let book=await save(body);
 await as(student);
 assert.equal((await db.query("select * from textbooks where file_path='test.pdf'")).rows.length,0);
 assert.equal((await db.query("select * from storage.objects where name='test.pdf'")).rows.length,0);
 await as(admin);book=await save({...book,published:true});
 await assert.rejects(()=>save({...book,updated_at:'2020-01-01T00:00:00Z'}),/changed/);
 await as(student);
 assert.equal((await db.query("select * from textbooks where file_path='test.pdf'")).rows.length,1);
 assert.equal((await db.query("select * from storage.objects where name='test.pdf'")).rows.length,1);
 await as(admin);await save({...book,published:false});
 await as(student);assert.equal((await db.query("select * from storage.objects where name='test.pdf'")).rows.length,0);
 await db.close();console.log('Admin console: authorization, migration repeatability, catalog visibility, uploads, validation and concurrent edits passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
