/* Edge handler unit tests: all Flutterwave provider and Supabase requests are mocked. */
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {webcrypto}=require('node:crypto');
const ts=require('typescript');
const assert=require('node:assert/strict');
async function main(){
 const env={SUPABASE_URL:'https://database.example',SUPABASE_ANON_KEY:'test-anon',SUPABASE_SERVICE_ROLE_KEY:'test-service',FLUTTERWAVE_SECRET_KEY:'test-secret',FLUTTERWAVE_SECRET_HASH:'test-hash',SITE_URL:'https://app.example'};
 const ref='TR-10000000-0000-4000-8000-000000000001';let handler,initialization,settlement,orderArgs,alreadyEnrolled=false,owner='student',checkoutURL='https://checkout.flutterwave.com/test',currency='NGN',paidAt=new Date().toISOString(),paymentStatus='successful';
 const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 async function fetch(url,options){
  if(url.endsWith('/auth/v1/user'))return json({id:'student',email:'test@example.com'});
  if(url.endsWith('/rpc/class_order_create')){orderArgs=JSON.parse(options.body);return json({enrolled:alreadyEnrolled,amount_kobo:100000,cohort_id:'class',subject_id:'physics',tutor_id:'teacher',access_scope:'subject_course',reference:ref});}
  if(url.includes('/payments')){initialization=JSON.parse(options.body);return json({status:'success',data:{link:checkoutURL}});}
  if(url.includes('/transactions/verify_by_reference'))return json({status:'success',data:{status:paymentStatus,tx_ref:ref,amount:1000,currency,created_at:paidAt,meta:{user_id:owner}}});
  if(url.endsWith('/rpc/class_order_settle')){settlement=JSON.parse(options.body);assert.equal(options.headers.authorization,'Bearer test-service');return json('class');}
  throw Error('Unexpected request '+url);
 }
 const source=ts.transpileModule(readFileSync('supabase/functions/class-checkout/index.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},reportDiagnostics:true});
 assert.equal(source.diagnostics.length,0);
 runInNewContext(source.outputText,{Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},crypto:webcrypto,TextEncoder,Uint8Array,URL,Request,Response,AbortSignal,fetch,console});
 const request=(body,headers={authorization:'Bearer valid',origin:env.SITE_URL})=>handler(new Request('https://database.example/functions/v1/class-checkout',{method:'POST',headers,body:JSON.stringify(body)}));
 assert.equal((await request({action:'initialize',cohort_id:'class',amount:1,topic_id:'motion',subject_id:'chemistry',tutor_id:'other'})).status,200);
 assert.deepEqual(orderArgs,{p_cohort:'class'},'Client overrides cannot change the subject course or price');
 assert.equal(initialization.amount,1000,'Server converts kobo to Naira');assert.equal(initialization.meta.user_id,'student');
 assert.equal(initialization.meta.cohort_id,'class','Checkout is tied to the selected teacher course');
 assert.equal(initialization.meta.subject_id,'physics','Subject is resolved by the backend');
 assert.equal(initialization.meta.tutor_id,'teacher','Teacher is resolved by the backend');
 assert.equal(initialization.meta.access_scope,'subject_course','Payment covers the whole subject course');
 alreadyEnrolled=true;initialization=null;
 const existing=await request({action:'initialize',cohort_id:'topic-class'});
 assert.equal(existing.status,200);assert.equal((await existing.json()).enrolled,true);assert.equal(initialization,null,'An unlocked course must not request another payment');alreadyEnrolled=false;
 assert.equal((await request({action:'initialize'},{})).status,401);
 assert.equal((await request({action:'initialize'},{authorization:'Bearer valid',origin:'https://untrusted.example'})).status,403);
 assert.equal((await request({action:'verify',reference:'invalid'})).status,400);
 assert.equal((await request({action:'verify',reference:ref})).status,200);assert.equal(settlement.p_amount,100000);assert.equal(settlement.p_user,'student');
 owner='other';settlement=null;assert.equal((await request({action:'verify',reference:ref})).status,400);assert.equal(settlement,null);owner='student';
 const event={event:'charge.completed',data:{status:'successful',tx_ref:ref}};
 assert.equal((await request(event,{'verif-hash':'invalid'})).status,401);
 assert.equal((await request(event,{'verif-hash':env.FLUTTERWAVE_SECRET_HASH})).status,200);assert.equal(settlement.p_reference,ref);
 checkoutURL='https://flutterwave.com.attacker.example/checkout';assert.equal((await request({action:'initialize',cohort_id:'class'})).status,400);
 checkoutURL='https://attacker@checkout.flutterwave.com/test';assert.equal((await request({action:'initialize',cohort_id:'class'})).status,400);checkoutURL='https://checkout.flutterwave.com/test';
 currency='';settlement=null;assert.equal((await request({action:'verify',reference:ref})).status,400);assert.equal(settlement,null);currency='NGN';
 paidAt='';assert.equal((await request({action:'verify',reference:ref})).status,400);paidAt=new Date().toISOString();
 paymentStatus='pending';assert.equal((await request({action:'verify',reference:ref})).status,400);paymentStatus='successful';
 settlement=null;assert.equal((await request({event:'charge.completed',data:{status:'failed',tx_ref:ref}},{'verif-hash':env.FLUTTERWAVE_SECRET_HASH})).status,200);assert.equal(settlement,null);
 const missingHashEnv={...env,FLUTTERWAVE_SECRET_HASH:''};
 runInNewContext(source.outputText,{Deno:{env:{get:key=>missingHashEnv[key]},serve:fn=>handler=fn},crypto:webcrypto,TextEncoder,Uint8Array,URL,Request,Response,AbortSignal,fetch,console});
 assert.equal((await request(event,{'verif-hash':'any-hash'})).status,401);assert.equal(settlement,null);
 console.log('PASS: Flutterwave edge checkout server amount, authentication requirement, CORS, payment ownership, signed webhooks and privileged settlement. No live requests.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
