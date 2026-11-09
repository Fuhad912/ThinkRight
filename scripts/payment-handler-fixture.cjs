/* Run the production payment handler against real local SQL. Only provider traffic is mocked. */
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {webcrypto}=require('node:crypto');
const ts=require('typescript'),assert=require('node:assert/strict');
module.exports=async function exercisePayment(db,{student,other,course,reference,amountKobo}){
 const env={SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',FLUTTERWAVE_SECRET_KEY:'provider-secret',FLUTTERWAVE_SECRET_HASH:'webhook-secret',SITE_URL:'https://thinkright.com.ng'};
 let handler,status='pending',amount=amountKobo/100,currency='NGN',owner=student,paidAt=new Date().toISOString(),checkoutCalls=0;
 const json=(body,code=200)=>new Response(JSON.stringify(body),{status:code,headers:{'content-type':'application/json'}});
 async function fetch(url,options={}){
  const token=options.headers.authorization?.replace('Bearer ','');
  if(url.endsWith('/auth/v1/user'))return ['student','other'].includes(token)?json({id:token==='student'?student:other,email:'student@example.test'}):json({error:'unauthorized'},401);
  if(url.includes('/rpc/')){
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[token==='student'?student:token==='other'?other:'']);await db.exec('set role '+(token==='service'?'service_role':'authenticated'));
   const args=JSON.parse(options.body);
   try{
    if(url.endsWith('/class_order_create'))return json((await db.query('select class_order_create($1) result',[args.p_cohort])).rows[0].result);
    if(url.endsWith('/class_order_settle'))return json((await db.query('select class_order_settle($1,$2,$3,$4,$5) result',[args.p_reference,args.p_amount,args.p_currency,args.p_paid_at,args.p_user])).rows[0].result);
    throw Error('Unexpected RPC');
   }catch(e){return json({message:e.message},400);}
  }
  if(url.endsWith('/v3/payments')){checkoutCalls++;const body=JSON.parse(options.body);assert.equal(body.tx_ref,reference);assert.equal(body.amount,amountKobo/100);assert.ok(body.configurations.session_duration>=1&&body.configurations.session_duration<=15);return json({status:'success',data:{link:'https://checkout.flutterwave.com/test'}});}
  if(url.includes('/verify_by_reference'))return json({status:'success',data:{tx_ref:reference,status,amount,currency,created_at:paidAt,meta:{user_id:owner}}});
  throw Error('Unexpected request');
 }
 const code=ts.transpileModule(readFileSync('supabase/functions/class-checkout/index.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 runInNewContext(code,{Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},fetch,crypto:webcrypto,TextEncoder,Uint8Array,URL,Request,Response,AbortSignal,console});
 const request=(body,token='student',webhook=false)=>handler(new Request('https://database.test/functions/v1/class-checkout',{method:'POST',headers:webhook?{'verif-hash':token}:{authorization:'Bearer '+token,origin:env.SITE_URL},body:JSON.stringify(body)}));
 const verify=()=>request({action:'verify',reference});
 assert.equal((await request({action:'initialize',cohort_id:course,amount:1})).status,200);
 assert.equal((await verify()).status,400,'pending payment cannot unlock');
 status='successful';amount=1;assert.equal((await verify()).status,400,'wrong amount rejected');amount=amountKobo/100;
 currency='USD';assert.equal((await verify()).status,400,'wrong currency rejected');currency='NGN';
 owner=other;assert.equal((await verify()).status,400,'wrong owner rejected');owner=student;
 assert.equal((await request({action:'verify',reference},'other')).status,400);
 const validTime=paidAt;paidAt='2099-01-01T00:00:00Z';assert.equal((await verify()).status,400,'out-of-window payment rejected');paidAt=validTime;
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from enrollments where cohort_id=$1 and user_id=$2',[course,student])).rows[0].n,0);
 const event={event:'charge.completed',data:{status:'successful',tx_ref:reference}};
 assert.equal((await request(event,'bad-hash',true)).status,401);
 assert.equal((await request(event,'webhook-secret',true)).status,200,'webhook unlocks without browser return');
 assert.equal((await verify()).status,200,'browser return after webhook succeeds');
 assert.equal((await request(event,'webhook-secret',true)).status,200,'duplicate webhook succeeds');
 const existing=await request({action:'initialize',cohort_id:course});assert.equal((await existing.json()).enrolled,true);assert.equal(checkoutCalls,1,'already enrolled does not start a second charge');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from teacher_earnings where reference=$1',[reference])).rows[0].n,1);
 console.log('PASS real handler → SQL payment integration: failed payments locked; verified webhook unlocks; callback/repeated webhook are idempotent; no second checkout.');
};
