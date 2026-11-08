const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table user_profiles(id uuid primary key,username text);`);
    for (const file of ['cohorts_schema.sql','teacher_workspace.sql','subject_course_enrollment.sql','class_specific_enrollment.sql']) {
      await db.exec(readFileSync('supabase/' + file, 'utf8'));
    }
    // Reconstruct an installed 70% settlement function and its historical defaults.
    await db.exec(readFileSync('supabase/class_specific_enrollment.sql', 'utf8').replaceAll('*0.9', '*0.7'));
    await db.exec('alter table teacher_earnings alter column share_pct set default 70');
    const teacher = '10000000-0000-4000-8000-000000000001';
    const student = '10000000-0000-4000-8000-000000000002';
    for (const id of [teacher, student]) await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query("insert into tutors(id,display_name,status,revenue_share_pct) values($1,'Teacher','active',70)", [teacher]);
    await db.exec("update subjects set enrollment_price=1000.01 where id='physics'");
    const classes = [];
    for (let i = 0; i < 2; i++) {
      const result = await db.query("insert into cohorts(tutor_id,subject_id,title,start_date,published,status) values($1,'physics','Physics',current_date,true,'open') returning id", [teacher]);
      classes.push(result.rows[0].id);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [student]);
    const order = async id => (await db.query('select class_order_create($1) as order_data', [id])).rows[0].order_data;
    const settle = order => db.query("select class_order_settle($1,$2,'NGN',now(),$3)", [order.reference,order.amount_kobo,student]);
    const oldOrder = await order(classes[0]);
    await settle(oldOrder);
    const before = (await db.query('select * from teacher_earnings')).rows[0];
    assert.equal(Number(before.teacher_kobo), 70001);
    assert.equal(Number(before.share_pct), 70);
    const upgrade = readFileSync('supabase/teacher_revenue_share_90.sql', 'utf8');
    await db.exec(upgrade);
    await db.exec(upgrade);
    await settle(oldOrder);
    assert.equal(Number((await db.query('select revenue_share_pct from tutors where id=$1', [teacher])).rows[0].revenue_share_pct), 90);
    const newOrder = await order(classes[1]);
    await settle(newOrder);
    await settle(newOrder);
    const entries = (await db.query('select * from teacher_earnings order by created_at')).rows;
    assert.equal(entries.length, 2);
    const historical = entries.find(entry => entry.reference === oldOrder.reference);
    assert.equal(Number(historical.teacher_kobo), 70001);
    assert.equal(Number(historical.share_pct), 70);
    const current = entries.find(entry => entry.reference === newOrder.reference);
    assert.equal(Number(current.teacher_kobo), 90001);
    assert.equal(Number(current.share_pct), 90);
    assert.equal(Number(current.gross_kobo) - Number(current.teacher_kobo), 10000);
    console.log('PASS: 90% upgrade, historical earnings, kobo rounding and idempotent settlement');
  } finally {
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
